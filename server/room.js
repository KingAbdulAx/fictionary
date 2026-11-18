// One Fictionary room: players, the turn order, the word, secret definitions, votes, the reveal.
// No sockets in here. The server wires it to Socket.IO; the browser runs the same class for
// one-device play.
//
// Phases:  lobby -> choosing -> writing -> voting -> reveal -> (choosing ...)* -> gameOver -> lobby
//
//   choosing  the round's picker (players take turns, as in the house rules) chooses one of three
//             words. Only they see the words and the real definitions.
//   writing   everyone else writes a made-up definition. Only the picker knows the real one.
//   voting    everyone but the picker votes for the definition they think is real. The ballot is
//             shuffled once for the room and carries no authorship and no "real" flag.
//   reveal    the real definition is stamped, every fake is named, points are added.
//
// Secrecy: definitions, authorship and the answer leave the room only through state(), which
// shows each viewer their own text and nothing of anybody else's until the reveal.

import { checkDefinition, normalize, buildBallot, publicBallot, checkVote, scoreRound, shuffle, winnersOf, awardsFor } from './rules.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const OFFER_SIZE = 3;
export const TURN_CHOICES = [1, 2, 3]; // how many times each player picks the word
export const TIMER_CHOICES = [60, 90, 120, 0]; // seconds to write; 0 = no timer, the host moves on
export const VOTE_SECONDS = 60; // voting time when the timer is on

const DEFAULT_SETTINGS = { turns: 1, timer: 90, hints: true };

const DEFAULT_TIMING = {
  grace: 60000, // how long a dropped player keeps their seat
  secondMs: 1000, // length of one timer "second"; tests and e2e shrink it so timers run out quickly
};

const noop = () => {};

const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/\s+/g, ' ').trim().slice(0, 20);
}

const PLAYING = ['choosing', 'writing', 'voting', 'reveal'];

export class Room {
  /**
   * opts: code, words (the bank, see words.js), rng, clock, timing, settings,
   *       handoff (one-device play: no timers, everyone is at the table), minPlayers, maxPlayers,
   *       onChange(room), onEmpty(room)
   */
  constructor(opts = {}) {
    this.code = opts.code || 'LOCAL';
    this.words = opts.words || [];
    this.rng = opts.rng || Math.random;
    this.clock = opts.clock || realClock;
    this.timing = { ...DEFAULT_TIMING, ...opts.timing };
    this.handoff = !!opts.handoff;
    this.minPlayers = opts.minPlayers ?? MIN_PLAYERS;
    this.maxPlayers = opts.maxPlayers ?? MAX_PLAYERS;
    this.hooks = { change: opts.onChange || noop, empty: opts.onEmpty || noop };
    this.listeners = new Set();

    this.players = [];
    this.hostId = null;
    this.settings = { ...DEFAULT_SETTINGS, ...opts.settings };
    this.phase = 'lobby';
    this.roundNo = 0;
    this.order = []; // player ids in picking order, fixed when the game starts
    this.deck = []; // words not yet offered this game
    this.round = null;
    this.final = false;
    this.winners = [];
    this.awards = [];
    this.timer = null;
    this.events = [];
    this.destroyed = false;
    this._eventId = 1;
  }

  // ── Players ────────────────────────────────────────────────

  addPlayer(name) {
    if (this.phase !== 'lobby') return { ok: false, error: 'This game has already started.' };
    if (this.players.length >= this.maxPlayers) {
      return { ok: false, error: `This room is full (${this.maxPlayers} players).` };
    }
    const clean = cleanName(name);
    if (!clean) return { ok: false, error: 'Add a name first.' };
    if (this.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, error: 'That name is taken in this room.' };
    }

    const player = {
      id: makeId(),
      token: makeId(),
      name: clean,
      score: 0,
      guessed: 0, // rounds in which this player found the real definition
      fooled: 0, // votes this player's fakes have drawn, all game
      picks: 0, // rounds this player has picked the word
      lastPoints: 0,
      connected: true,
      graceTimer: null,
      socketId: null,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    this._event(this.players.length === 1 ? `${clean} opened the room.` : `${clean} joined.`);
    this._changed();
    return { ok: true, player };
  }

  removePlayer(pid) {
    const idx = this.players.findIndex((p) => p.id === pid);
    if (idx === -1) return { ok: false, error: 'Player not found.' };
    const [gone] = this.players.splice(idx, 1);
    this.clock.clearTimeout(gone.graceTimer);
    this._event(`${gone.name} left.`);

    if (this.players.length === 0) {
      this.destroy();
      this.hooks.empty(this);
      return { ok: true };
    }

    if (this.hostId === pid) {
      const next = this.players.find((p) => p.connected) || this.players[0];
      this.hostId = next.id;
      this._event(`${next.name} is the host now.`);
    }

    if (PLAYING.includes(this.phase) && this.players.length < this.minPlayers) {
      this._finish(`Fewer than ${this.minPlayers} players are left, so the game ends here.`);
      return { ok: true };
    }

    const r = this.round;
    if (this.phase === 'choosing' && r.pickerId === pid) {
      // The picker left before choosing: their offer goes back in the deck and the next player picks.
      this.deck.push(...r.offer);
      this.roundNo -= 1;
      this._beginRound();
      return { ok: true };
    }
    if (this.phase === 'writing') {
      r.fakes.delete(pid);
      if (this._closeWritingIfEveryoneIn()) return { ok: true };
    }
    if (this.phase === 'voting') {
      r.votes.delete(pid);
      if (this._revealIfEveryoneVoted()) return { ok: true };
    }
    this._changed();
    return { ok: true };
  }

  /** The connection dropped. The player keeps their seat for the grace period. */
  markDisconnected(pid) {
    const p = this._player(pid);
    if (!p || !p.connected) return;
    p.connected = false;
    this._event(`${p.name} lost connection.`);
    this.clock.clearTimeout(p.graceTimer);
    p.graceTimer = this.clock.setTimeout(() => this.removePlayer(pid), this.timing.grace);
    this._changed();
  }

  /** A returning player presents their private token and gets their seat back, in whatever phase. */
  reconnect(token) {
    const p = typeof token === 'string' ? this.players.find((x) => x.token === token) : null;
    if (!p) return { ok: false, error: 'Session expired.' };
    this.clock.clearTimeout(p.graceTimer);
    p.graceTimer = null;
    if (!p.connected) {
      p.connected = true;
      this._event(`${p.name} is back.`);
    }
    this._changed();
    return { ok: true, player: p };
  }

  // ── Host actions ───────────────────────────────────────────

  setSettings(pid, next = {}) {
    if (pid !== this.hostId) return { ok: false, error: 'Only the host can change the settings.' };
    if (this.phase !== 'lobby') return { ok: false, error: 'Settings can only change in the lobby.' };
    const merged = { ...this.settings };
    if (next.turns !== undefined) {
      if (!TURN_CHOICES.includes(next.turns)) return { ok: false, error: 'Pick 1, 2 or 3 turns each.' };
      merged.turns = next.turns;
    }
    if (next.timer !== undefined) {
      if (!TIMER_CHOICES.includes(next.timer)) return { ok: false, error: 'Unknown timer.' };
      merged.timer = next.timer;
    }
    if (next.hints !== undefined) {
      if (typeof next.hints !== 'boolean') return { ok: false, error: 'Unknown hint setting.' };
      merged.hints = next.hints;
    }
    this.settings = merged;
    this._changed();
    return { ok: true };
  }

  start(pid) {
    if (pid !== this.hostId) return { ok: false, error: 'Only the host can start.' };
    if (this.phase !== 'lobby') return { ok: false, error: 'The game has already started.' };
    if (this.players.length < this.minPlayers) {
      const more = this.minPlayers - this.players.length;
      return { ok: false, error: `Fictionary needs ${this.minPlayers} players. ${more} more to go.` };
    }
    if (this.words.length < OFFER_SIZE) return { ok: false, error: 'No words are loaded.' };

    for (const p of this.players) Object.assign(p, { score: 0, guessed: 0, fooled: 0, picks: 0, lastPoints: 0 });
    this.deck = shuffle(this.words, this.rng);
    this.order = this.players.map((p) => p.id);
    this.roundNo = 0;
    this.winners = [];
    this.awards = [];
    this.final = false;
    this.round = null;
    this._event('The game has started.');
    this._beginRound();
    return { ok: true };
  }

  /** The host moves on from a reveal: to the next word, or to the final scores. */
  nextRound(pid) {
    if (pid !== this.hostId) return { ok: false, error: 'Only the host can move on.' };
    if (this.phase !== 'reveal') return { ok: false, error: 'Nothing to move on from yet.' };
    if (this.final) this._finish();
    else this._beginRound();
    return { ok: true };
  }

  /** The host closes writing without waiting for everyone. Needs at least one made-up definition. */
  endWriting(pid) {
    if (pid !== this.hostId) return { ok: false, error: 'Only the host can move on.' };
    if (this.phase !== 'writing') return { ok: false, error: 'Nobody is writing right now.' };
    if (this.round.fakes.size === 0) return { ok: false, error: 'Nobody has written a definition yet.' };
    this._closeWriting();
    return { ok: true };
  }

  /** The host closes voting without waiting for everyone. Needs at least one vote. */
  endVoting(pid) {
    if (pid !== this.hostId) return { ok: false, error: 'Only the host can move on.' };
    if (this.phase !== 'voting') return { ok: false, error: 'Nobody is voting right now.' };
    if (this.round.votes.size === 0) return { ok: false, error: 'Nobody has voted yet.' };
    this._reveal();
    return { ok: true };
  }

  /** The picker is offline: the host picks a word for them at random so the game can go on. */
  pickForPicker(pid) {
    if (pid !== this.hostId) return { ok: false, error: 'Only the host can do that.' };
    if (this.phase !== 'choosing') return { ok: false, error: 'Nobody is picking a word right now.' };
    const picker = this._player(this.round.pickerId);
    if (picker?.connected && !this.handoff) return { ok: false, error: `${picker.name} is still here to pick.` };
    return this._choose(Math.floor(this.rng() * this.round.offer.length));
  }

  endGame(pid) {
    if (pid !== this.hostId) return { ok: false, error: 'Only the host can end the game.' };
    if (!PLAYING.includes(this.phase)) return { ok: false, error: 'No game in progress.' };
    this._finish('The host ended the game.');
    return { ok: true };
  }

  /** Back to the lobby with the same players, for another game. */
  reset(pid) {
    if (pid !== this.hostId) return { ok: false, error: 'Only the host can start over.' };
    if (this.phase !== 'gameOver') return { ok: false, error: 'The game is not over yet.' };
    this.phase = 'lobby';
    this.roundNo = 0;
    this.round = null;
    this.deck = [];
    this.order = [];
    this.final = false;
    this.winners = [];
    this.awards = [];
    for (const p of this.players) Object.assign(p, { score: 0, guessed: 0, fooled: 0, picks: 0, lastPoints: 0 });
    this._event('Back in the lobby.');
    this._changed();
    return { ok: true };
  }

  // ── Player actions ─────────────────────────────────────────

  /** The picker chooses one of the offered words by its position in the offer. */
  choose(pid, index) {
    if (this.phase !== 'choosing') return { ok: false, error: 'Nobody is picking a word right now.' };
    if (pid !== this.round.pickerId) return { ok: false, error: 'It is not your turn to pick.' };
    if (!Number.isInteger(index) || index < 0 || index >= this.round.offer.length) {
      return { ok: false, error: 'Pick one of the words.' };
    }
    return this._choose(index);
  }

  /** A made-up definition. One per player per round, final once accepted. */
  submit(pid, raw) {
    const player = this._player(pid);
    if (!player) return { ok: false, reason: 'state', message: 'Player not found.' };
    if (this.phase !== 'writing') return { ok: false, reason: 'state', message: 'Nobody is writing right now.' };
    const r = this.round;
    if (pid === r.pickerId) return { ok: false, reason: 'picker', message: 'You picked the word, so you know the answer.' };
    if (r.fakes.has(pid)) return { ok: false, reason: 'twice', message: 'Your definition is already in.' };
    const taken = [normalize(r.word.definition), ...[...r.fakes.values()].map((f) => f.key)];
    const checked = checkDefinition(raw, taken);
    if (!checked.ok) return checked;
    r.fakes.set(pid, { pid, text: checked.text, key: checked.key, at: this.clock.now() });
    if (!this._closeWritingIfEveryoneIn()) this._changed();
    return { ok: true };
  }

  vote(pid, entryId) {
    if (this.phase !== 'voting') return { ok: false, error: 'Nobody is voting right now.' };
    const r = this.round;
    const checked = checkVote(pid, entryId, r.ballot, this._voters(), r.votes);
    if (!checked.ok) return { ok: false, error: checked.message, reason: checked.reason };
    r.votes.set(pid, entryId);
    if (!this._revealIfEveryoneVoted()) this._changed();
    return { ok: true };
  }

  // ── Flow ───────────────────────────────────────────────────

  /** The next player in the turn order who still has picks left, or null when everyone is done. */
  _nextPicker() {
    const present = this.order.filter((id) => this._player(id));
    const lastIdx = this.round ? present.indexOf(this.round.pickerId) : -1;
    for (let step = 1; step <= present.length; step++) {
      const id = present[(lastIdx + step + present.length) % present.length];
      if (this._player(id).picks < this.settings.turns) return id;
    }
    return null;
  }

  /** Rounds left after this one: every present player's remaining picks. */
  _roundsLeft() {
    return this.players
      .filter((p) => this.order.includes(p.id))
      .reduce((n, p) => n + Math.max(0, this.settings.turns - p.picks), 0);
  }

  _beginRound() {
    this._clearTimer();
    const pickerId = this._nextPicker();
    if (!pickerId) {
      this._finish();
      return;
    }
    if (this.deck.length === 0) {
      this._finish('The words have run out.');
      return;
    }
    this.roundNo += 1;
    this.final = false;
    for (const p of this.players) p.lastPoints = 0;
    this.round = {
      pickerId,
      offer: this.deck.splice(-OFFER_SIZE).reverse(),
      word: null,
      fakes: new Map(),
      ballot: null,
      votes: new Map(),
      deadline: null,
      result: null,
    };
    this.phase = 'choosing';
    this._changed();
  }

  _choose(index) {
    const r = this.round;
    r.word = r.offer[index];
    // The words not chosen go back under the deck; a word is never played twice in a game.
    this.deck.unshift(...r.offer.filter((_, i) => i !== index));
    r.offer = [];
    const picker = this._player(r.pickerId);
    if (picker) picker.picks += 1;
    this.phase = 'writing';
    this._startTimer(this.settings.timer, () => this._closeWriting());
    this._changed();
    return { ok: true };
  }

  _writers() {
    return this.players.filter((p) => p.id !== this.round.pickerId).map((p) => p.id);
  }

  _voters() {
    return this._writers();
  }

  _closeWritingIfEveryoneIn() {
    if (this.phase !== 'writing') return false;
    if (!this._writers().every((id) => this.round.fakes.has(id))) return false;
    this._closeWriting();
    return true;
  }

  _closeWriting() {
    this._clearTimer();
    const r = this.round;
    const fakes = [...r.fakes.values()].sort((a, b) => a.at - b.at);
    r.ballot = buildBallot(r.word.definition, fakes, this.rng);
    if (fakes.length === 0) {
      // Nobody wrote anything: there is nothing to vote on, so show the answer and move on.
      this._reveal();
      return;
    }
    this.phase = 'voting';
    this._startTimer(this.settings.timer ? VOTE_SECONDS : 0, () => this._reveal());
    this._changed();
  }

  _revealIfEveryoneVoted() {
    if (this.phase !== 'voting') return false;
    if (!this._voters().every((id) => this.round.votes.has(id))) return false;
    this._reveal();
    return true;
  }

  _reveal() {
    this._clearTimer();
    const r = this.round;
    const { byPlayer, entries } = scoreRound(r.ballot, r.votes);
    for (const [pid, res] of byPlayer) {
      const p = this._player(pid);
      if (!p) continue; // left mid-round: their fake stays on the board, but nobody to give points to
      p.score += res.points;
      p.lastPoints = res.points;
      p.fooled += res.fooled;
      if (res.guessed) p.guessed += 1;
    }
    r.result = {
      entries,
      byPlayer: Object.fromEntries(byPlayer),
      noFakes: r.fakes.size === 0,
      unwritten: this._writers().filter((id) => !r.fakes.has(id)),
      unvoted: r.fakes.size === 0 ? [] : this._voters().filter((id) => !r.votes.has(id)),
    };
    this.phase = 'reveal';
    this.final = this._nextPicker() === null || this.deck.length === 0;
    this._changed();
  }

  _finish(reason) {
    this._clearTimer();
    this.phase = 'gameOver';
    this.final = false;
    this.winners = winnersOf(this.players).map((p) => p.id);
    this.awards = awardsFor(this.players);
    if (reason) this._event(reason);
    this._changed();
  }

  // ── Timers ─────────────────────────────────────────────────

  _startTimer(seconds, onDone) {
    this._clearTimer();
    this.round.deadline = null;
    if (this.handoff || !seconds) return;
    const ms = seconds * this.timing.secondMs;
    this.round.deadline = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      onDone();
    }, ms);
  }

  _clearTimer() {
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  // ── Plumbing ───────────────────────────────────────────────

  _player(pid) {
    return this.players.find((p) => p.id === pid);
  }

  _event(text) {
    this.events.push({ id: this._eventId++, text });
    if (this.events.length > 12) this.events.splice(0, this.events.length - 12);
  }

  _changed() {
    if (this.destroyed) return;
    this.hooks.change(this);
    for (const fn of this.listeners) fn(this);
  }

  /** Call `fn(room)` after every change. Returns the function that stops listening. */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * What one viewer may see. Tokens and socket ids never leave the server. Before the reveal a
   * viewer sees only their own definition, the picker alone sees the offered words and the real
   * definition, and the ballot carries no authorship and no "real" flag.
   * With no viewer (one-device play, shared screen) you get the public view.
   */
  state(viewerPid = null) {
    const r = this.round;
    const phase = this.phase;
    const inRound = PLAYING.includes(phase) && !!r;
    const isPicker = inRound && viewerPid === r.pickerId;
    const mine = inRound && viewerPid ? r.fakes.get(viewerPid) : null;
    const reveal = phase === 'reveal' ? r.result : null;

    const done = (pid) => {
      if (phase === 'writing') return r.fakes.has(pid);
      if (phase === 'voting') return r.votes.has(pid);
      return false;
    };

    let ballot = null;
    if (phase === 'voting') ballot = publicBallot(r.ballot);
    if (reveal) {
      ballot = reveal.entries.map((e) => ({
        id: e.id,
        n: e.n,
        text: e.text,
        real: e.real,
        authorId: e.pid,
        authorName: e.pid ? this._player(e.pid)?.name ?? 'Someone who left' : null,
        voters: [...e.voters],
      }));
    }

    return {
      code: this.code,
      hostId: this.hostId,
      phase,
      settings: { ...this.settings },
      limits: { min: this.minPlayers, max: this.maxPlayers },
      handoff: this.handoff,
      round: this.roundNo,
      totalRounds: inRound ? this.roundNo + this._roundsLeft() - (phase === 'choosing' ? 1 : 0) : 0,
      pickerId: inRound ? r.pickerId : null,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        guessed: p.guessed,
        fooled: p.fooled,
        connected: p.connected,
        done: inRound ? done(p.id) : false,
        lastPoints: reveal ? p.lastPoints : 0,
      })),
      offer: phase === 'choosing' && isPicker ? r.offer.map(({ word, pos, definition }) => ({ word, pos, definition })) : null,
      word: inRound && r.word ? { word: r.word.word, pos: r.word.pos } : null,
      answer: (isPicker && r.word) || reveal ? r.word.definition : null,
      mine: mine ? { text: mine.text } : null,
      myEntry: phase === 'voting' && viewerPid ? (r.ballot.find((e) => e.pid === viewerPid)?.id ?? null) : null,
      myVote: phase === 'voting' && viewerPid ? (r.votes.get(viewerPid) ?? null) : null,
      ballot,
      result: reveal
        ? { byPlayer: structuredClone(reveal.byPlayer), noFakes: reveal.noFakes, unwritten: [...reveal.unwritten], unvoted: [...reveal.unvoted] }
        : null,
      deadlineInMs: inRound && r.deadline ? Math.max(0, r.deadline - this.clock.now()) : null,
      final: phase === 'reveal' && this.final,
      winners: phase === 'gameOver' ? [...this.winners] : [],
      awards: phase === 'gameOver' ? this.awards.map((a) => ({ ...a, ids: [...a.ids] })) : [],
      events: this.events.slice(-6),
    };
  }

  destroy() {
    this._clearTimer();
    this.destroyed = true;
    for (const p of this.players) this.clock.clearTimeout(p.graceTimer);
  }
}
