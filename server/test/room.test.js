import test from 'node:test';
import assert from 'node:assert/strict';

import { Room, VOTE_SECONDS } from '../room.js';

const WORDS = Array.from({ length: 30 }, (_, i) => ({
  word: `word${String.fromCharCode(97 + i)}`,
  pos: 'n',
  definition: `The real meaning number ${i + 1}.`,
}));

/** A clock you move by hand, with timers that fire when you pass them. */
function fakeClock() {
  let now = 1_000_000;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now && timers.has(id)) {
          timers.delete(id);
          t.fn();
        }
      }
    },
  };
}

function setup({ names = ['Ada', 'Ben', 'Chi'], settings, handoff = false } = {}) {
  const clock = fakeClock();
  const room = new Room({ words: WORDS, clock, rng: () => 0.42, settings, handoff });
  const ids = {};
  for (const n of names) ids[n] = room.addPlayer(n).player.id;
  return { room, clock, ids, host: ids[names[0]] };
}

/** Plays one round: the picker takes the first word, everyone else writes, then votes as told. */
function playRound(room, { write = {}, votes = {} } = {}) {
  const picker = room.round.pickerId;
  assert.equal(room.choose(picker, 0).ok, true);
  for (const p of room.players) {
    if (p.id === picker) continue;
    const text = write[p.name] ?? `${p.name}'s made-up meaning for round ${room.roundNo}`;
    assert.equal(room.submit(p.id, text).ok, true, `${p.name} submits`);
  }
  if (room.phase !== 'voting') return;
  for (const p of room.players) {
    if (p.id === picker) continue;
    const choice = votes[p.name];
    const entry = choice === 'real' ? room.round.ballot.find((e) => e.real) : room.round.ballot.find((e) => e.pid === room.players.find((x) => x.name === choice)?.id);
    assert.equal(room.vote(p.id, entry.id).ok, true, `${p.name} votes`);
  }
}

// ── Lobby ──────────────────────────────────────────────────

test('needs three players, refuses an eleventh, refuses duplicate names', () => {
  const { room, host } = setup({ names: ['Ada', 'Ben'] });
  assert.match(room.start(host).error, /needs 3 players/);
  assert.match(room.addPlayer('ada').error, /taken/);
  for (let i = 0; i < 8; i++) room.addPlayer(`P${i}`);
  assert.match(room.addPlayer('Late').error, /full/);
});

test('only the host changes settings, only to allowed values', () => {
  const { room, host, ids } = setup();
  assert.equal(room.setSettings(ids.Ben, { turns: 2 }).ok, false);
  assert.equal(room.setSettings(host, { turns: 5 }).ok, false);
  assert.equal(room.setSettings(host, { timer: 45 }).ok, false);
  assert.equal(room.setSettings(host, { turns: 2, timer: 0, hints: false }).ok, true);
  assert.deepEqual(room.settings, { turns: 2, timer: 0, hints: false });
});

// ── The state machine ──────────────────────────────────────

test('a full round: choose, write, vote, reveal, with the doc scoring', () => {
  const { room, host, ids } = setup();
  room.start(host);
  assert.equal(room.phase, 'choosing');
  assert.equal(room.round.pickerId, ids.Ada); // the turn order is the seating order
  assert.equal(room.choose(ids.Ben, 0).ok, false); // not Ben's turn

  room.choose(ids.Ada, 1);
  assert.equal(room.phase, 'writing');
  assert.equal(room.submit(ids.Ada, 'anything').reason, 'picker');
  room.submit(ids.Ben, 'A kind of hat.');
  assert.equal(room.phase, 'writing');
  room.submit(ids.Chi, 'To hum quietly.');
  assert.equal(room.phase, 'voting');
  assert.equal(room.round.ballot.length, 3);

  const benEntry = room.round.ballot.find((e) => e.pid === ids.Ben);
  const real = room.round.ballot.find((e) => e.real);
  assert.equal(room.vote(ids.Ben, benEntry.id).reason, 'own');
  assert.equal(room.vote(ids.Ada, real.id).reason, 'picker');
  room.vote(ids.Ben, real.id);
  assert.equal(room.vote(ids.Ben, real.id).reason, 'twice');
  room.vote(ids.Chi, benEntry.id);

  assert.equal(room.phase, 'reveal');
  const score = Object.fromEntries(room.players.map((p) => [p.name, p.score]));
  assert.deepEqual(score, { Ada: 0, Ben: 2, Chi: 0 }); // Ben: 1 for the real one + 1 for fooling Chi
});

test('everyone picks once by default, in seating order, then the game ends', () => {
  const { room, host } = setup();
  room.start(host);
  const pickers = [];
  for (let i = 0; i < 3; i++) {
    pickers.push(room.players.find((p) => p.id === room.round.pickerId).name);
    assert.equal(room.state().totalRounds, 3);
    playRound(room, { votes: { Ada: 'real', Ben: 'real', Chi: 'real' } });
    assert.equal(room.phase, 'reveal');
    assert.equal(room.final, i === 2);
    room.nextRound(host);
  }
  assert.deepEqual(pickers, ['Ada', 'Ben', 'Chi']);
  assert.equal(room.phase, 'gameOver');
  // Two rounds each as a voter, all correct: 2 points each.
  assert.deepEqual(room.players.map((p) => p.score), [2, 2, 2]);
  assert.deepEqual(room.winners.length, 3);
});

test('two turns each means twice as many rounds', () => {
  const { room, host } = setup({ settings: { turns: 2 } });
  room.start(host);
  assert.equal(room.state().totalRounds, 6);
});

test('no word repeats within a game, and the unchosen words can come back later', () => {
  const { room, host } = setup({ settings: { turns: 3 } });
  room.start(host);
  const played = [];
  while (room.phase !== 'gameOver') {
    playRound(room, { votes: { Ada: 'real', Ben: 'real', Chi: 'real' } });
    played.push(room.round.word.word);
    room.nextRound(host);
  }
  assert.equal(played.length, 9);
  assert.equal(new Set(played).size, 9);
});

test('a duplicate of the real definition or of another fake is refused', () => {
  const { room, host, ids } = setup({ names: ['Ada', 'Ben', 'Chi', 'Dee'] });
  room.start(host);
  room.choose(ids.Ada, 0);
  const real = room.round.word.definition;
  assert.equal(room.submit(ids.Ben, real.toUpperCase()).reason, 'duplicate');
  assert.equal(room.submit(ids.Ben, 'a soft blue hat').ok, true);
  const dup = room.submit(ids.Chi, 'A soft, blue hat!');
  assert.equal(dup.reason, 'duplicate');
  assert.doesNotMatch(dup.message, /\bhat\b/);
  assert.equal(room.phase, 'writing');
});

// ── Secrecy ────────────────────────────────────────────────

test('nobody sees the answer, the offer or anybody else\'s text before the reveal', () => {
  const { room, host, ids } = setup();
  room.start(host);
  const offer = room.round.offer.map((w) => w.word);
  const benChoosing = JSON.stringify(room.state(ids.Ben));
  for (const w of offer) assert.doesNotMatch(benChoosing, new RegExp(w));
  assert.equal(room.state(ids.Ada).offer.length, 3);

  room.choose(ids.Ada, 0);
  const real = room.round.word.definition;
  assert.equal(room.state(ids.Ada).answer, real); // the picker knows
  assert.equal(room.state(ids.Ben).answer, null);
  assert.doesNotMatch(JSON.stringify(room.state(ids.Ben)), /real meaning/);

  room.submit(ids.Ben, 'A secret hat.');
  const chiWriting = JSON.stringify(room.state(ids.Chi));
  assert.doesNotMatch(chiWriting, /secret hat/);
  assert.equal(room.state(ids.Ben).mine.text, 'A secret hat.');

  room.submit(ids.Chi, 'A sneaky spoon.');
  assert.equal(room.phase, 'voting');
  for (const viewer of [ids.Ada, ids.Ben, ids.Chi, null]) {
    const s = room.state(viewer);
    const json = JSON.stringify(s.ballot);
    assert.doesNotMatch(json, /"real"|"pid"|"author|Ben|Chi/);
    for (const pid of Object.values(ids)) assert.ok(!json.includes(pid), 'no player id in the ballot');
    assert.equal(s.answer === null || viewer === ids.Ada, true);
    assert.equal(s.result, null);
  }
  // Every viewer sees the same order.
  assert.deepEqual(room.state(ids.Ben).ballot, room.state(ids.Chi).ballot);
  // The viewer learns only which entry is their own.
  assert.equal(room.state(ids.Ben).myEntry, room.round.ballot.find((e) => e.pid === ids.Ben).id);
  assert.equal(room.state(ids.Ada).myEntry, null);
});

test('the reveal names every author, stamps the real one and lists the voters', () => {
  const { room, host, ids } = setup();
  room.start(host);
  playRound(room, { write: { Ben: 'Ben wrote this', Chi: 'Chi wrote this' }, votes: { Ben: 'Chi', Chi: 'real' } });
  const s = room.state(ids.Ben);
  const real = s.ballot.find((e) => e.real);
  assert.equal(real.text, room.round.word.definition);
  assert.deepEqual(real.voters, [ids.Chi]);
  const chis = s.ballot.find((e) => e.authorId === ids.Chi);
  assert.equal(chis.authorName, 'Chi');
  assert.deepEqual(chis.voters, [ids.Ben]);
  assert.deepEqual(s.result.byPlayer[ids.Chi], { guessed: true, fooled: 1, points: 2 });
  assert.equal(s.answer, room.round.word.definition);
});

// ── Timers and stragglers ──────────────────────────────────

test('the writing timer closes writing without the stragglers; they are skipped', () => {
  const { room, clock, host, ids } = setup({ names: ['Ada', 'Ben', 'Chi', 'Dee'], settings: { timer: 60 } });
  room.start(host);
  room.choose(ids.Ada, 0);
  room.submit(ids.Ben, 'A thing Ben made up.');
  room.submit(ids.Chi, 'A thing Chi made up.');
  clock.advance(59_000);
  assert.equal(room.phase, 'writing');
  clock.advance(1_000);
  assert.equal(room.phase, 'voting');
  assert.equal(room.round.ballot.length, 3); // Dee never wrote
  // Dee can still vote.
  assert.equal(room.vote(ids.Dee, room.round.ballot.find((e) => e.real).id).ok, true);
  clock.advance(VOTE_SECONDS * 1000);
  assert.equal(room.phase, 'reveal');
  assert.deepEqual(room.round.result.unwritten, [ids.Dee]);
  assert.deepEqual(room.round.result.unvoted.sort(), [ids.Ben, ids.Chi].sort());
});

test('timing.secondMs shrinks the timers (used by the e2e run)', () => {
  const clock = fakeClock();
  const room = new Room({ words: WORDS, clock, rng: () => 0.42, settings: { timer: 60 }, timing: { secondMs: 10 } });
  const ids = ['Ada', 'Ben', 'Chi'].map((n) => room.addPlayer(n).player.id);
  room.start(ids[0]);
  room.choose(room.round.pickerId, 0);
  assert.equal(room.state(ids[0]).deadlineInMs, 600);
  room.submit(ids[1], 'A thing made up.');
  clock.advance(600);
  assert.equal(room.phase, 'voting');
  clock.advance(VOTE_SECONDS * 10);
  assert.equal(room.phase, 'reveal');
});

test('nobody writes before the timer: straight to the answer, nobody scores', () => {
  const { room, clock, host, ids } = setup();
  room.start(host);
  room.choose(ids.Ada, 0);
  clock.advance(90_000);
  assert.equal(room.phase, 'reveal');
  assert.equal(room.round.result.noFakes, true);
  assert.deepEqual(room.players.map((p) => p.score), [0, 0, 0]);
});

test('the host can end writing and voting early, but not before anyone has acted', () => {
  const { room, host, ids } = setup({ names: ['Ada', 'Ben', 'Chi', 'Dee'], settings: { timer: 0 } });
  room.start(host);
  room.choose(ids.Ada, 0);
  assert.match(room.endWriting(host).error, /Nobody has written/);
  room.submit(ids.Ben, 'Something Ben made up.');
  assert.equal(room.endWriting(ids.Ben).ok, false);
  assert.equal(room.endWriting(host).ok, true);
  assert.equal(room.phase, 'voting');
  assert.equal(room.round.deadline, null); // timer off: no deadline
  assert.match(room.endVoting(host).error, /Nobody has voted/);
  room.vote(ids.Chi, room.round.ballot.find((e) => e.real).id);
  assert.equal(room.endVoting(host).ok, true);
  assert.equal(room.phase, 'reveal');
});

// ── People leaving and coming back ─────────────────────────

test('a dropped player keeps their seat and comes back in the same phase', () => {
  const { room, clock, host, ids } = setup();
  room.start(host);
  room.choose(ids.Ada, 0);
  room.submit(ids.Ben, 'Ben was here.');
  room.markDisconnected(ids.Ben);
  clock.advance(30_000);
  const token = room.players.find((p) => p.id === ids.Ben).token;
  assert.equal(room.reconnect(token).ok, true);
  const s = room.state(ids.Ben);
  assert.equal(s.phase, 'writing');
  assert.equal(s.mine.text, 'Ben was here.');
  assert.equal(room.reconnect('nope').ok, false);
});

test('after the grace period a dropped player is removed and the round goes on', () => {
  const { room, clock, host, ids } = setup({ names: ['Ada', 'Ben', 'Chi', 'Dee'], settings: { timer: 0 } });
  room.start(host);
  room.choose(ids.Ada, 0);
  room.submit(ids.Ben, 'Ben was here.');
  room.submit(ids.Chi, 'Chi was here.');
  room.markDisconnected(ids.Dee);
  clock.advance(60_000);
  assert.equal(room.players.length, 3);
  assert.equal(room.phase, 'voting'); // Dee was the last writer: their leaving closed writing
});

test('the host leaving hands the room to the next player', () => {
  const { room, host, ids } = setup({ names: ['Ada', 'Ben', 'Chi', 'Dee'] });
  room.start(host);
  room.removePlayer(host);
  assert.equal(room.hostId, ids.Ben);
  assert.notEqual(room.phase, 'gameOver');
});

test('the picker leaving before choosing passes the turn on', () => {
  const { room, host, ids } = setup({ names: ['Ada', 'Ben', 'Chi', 'Dee'] });
  room.start(host);
  room.removePlayer(ids.Ada);
  assert.equal(room.phase, 'choosing');
  assert.equal(room.round.pickerId, ids.Ben);
  assert.equal(room.roundNo, 1);
});

test('the host can pick for an offline picker, not for one who is here', () => {
  const { room, host, ids } = setup({ names: ['Ada', 'Ben', 'Chi', 'Dee'] });
  room.start(host);
  room.nextRound(host); // no-op: not in reveal
  room.choose(ids.Ada, 0);
  room.submit(ids.Ben, 'b one');
  room.submit(ids.Chi, 'c one');
  room.submit(ids.Dee, 'd one');
  for (const p of ['Ben', 'Chi', 'Dee']) room.vote(ids[p], room.round.ballot.find((e) => e.real).id);
  room.nextRound(host);
  assert.equal(room.round.pickerId, ids.Ben);
  assert.match(room.pickForPicker(host).error, /still here/);
  room.markDisconnected(ids.Ben);
  assert.equal(room.pickForPicker(host).ok, true);
  assert.equal(room.phase, 'writing');
});

test('a writer leaving mid-vote keeps their fake on the board but scores nothing', () => {
  const { room, host, ids } = setup({ names: ['Ada', 'Ben', 'Chi', 'Dee'] });
  room.start(host);
  room.choose(ids.Ada, 0);
  room.submit(ids.Ben, 'b one');
  room.submit(ids.Chi, 'c one');
  room.submit(ids.Dee, 'd one');
  const deeEntry = room.round.ballot.find((e) => e.pid === ids.Dee);
  room.vote(ids.Ben, deeEntry.id);
  room.removePlayer(ids.Dee);
  room.vote(ids.Chi, deeEntry.id);
  assert.equal(room.phase, 'reveal');
  const s = room.state(ids.Ben);
  assert.equal(s.ballot.find((e) => e.id === deeEntry.id).authorName, 'Someone who left');
});

test('falling below three players ends the game', () => {
  const { room, host, ids } = setup();
  room.start(host);
  room.removePlayer(ids.Chi);
  assert.equal(room.phase, 'gameOver');
});

test('reset returns to the lobby with scores cleared', () => {
  const { room, host } = setup();
  room.start(host);
  room.endGame(host);
  assert.equal(room.reset(host).ok, true);
  assert.equal(room.phase, 'lobby');
  assert.ok(room.players.every((p) => p.score === 0));
});

test('one-device rooms never run timers', () => {
  const { room, clock, host, ids } = setup({ handoff: true, settings: { timer: 60 } });
  room.start(host);
  room.choose(ids.Ada, 0);
  clock.advance(600_000);
  assert.equal(room.phase, 'writing');
  assert.equal(room.state().deadlineInMs, null);
});
