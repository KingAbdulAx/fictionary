// Pure rules for Fictionary: checking definitions, building the ballot, checking votes, scoring.
// No sockets, no clocks, no DOM. The server and the browser's one-device mode both import this file,
// so the two can never disagree about who scored what.
//
// Scoring, from the house rules ("Game night games", Fictionary):
//   - a player who votes for the real definition gets 1 point;
//   - a player whose made-up definition is voted for gets 1 point for every vote it receives.
// The player who picked the word knows the answer, so they neither write nor vote that round.

import { dictionaryStyle } from './words.js';

export const POINTS_FOR_REAL = 1;
export const POINTS_PER_FOOLED = 1;

export const DEF_MIN_CHARS = 3;
export const DEF_MAX_CHARS = 110;

/** A Fisher-Yates shuffle that never touches its input. */
export function shuffle(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Definitions ──────────────────────────────────────────────

/** What a player typed, tidied for storage: trimmed, single spaces. The words are left as written. */
export function tidy(raw) {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

/**
 * The comparison form of a definition: lower case, accents removed, everything that is not a letter
 * or digit dropped, and a leading "a", "an" or "the" ignored. "A small boat." and "small boat" match.
 */
export function normalize(raw) {
  return tidy(raw)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/^(a|an|the)\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Checks one made-up definition before it is accepted.
 *   taken: normalized forms that are already in play (the real definition and earlier fakes).
 * Returns { ok: true, text, key } or { ok: false, reason, message }. The message never quotes
 * anybody else's text, and it is the same whether the clash is with the real one or a player's.
 */
export function checkDefinition(raw, taken = []) {
  const text = tidy(raw);
  if (!text) return fail('empty', 'Write a definition first.');
  if (text.length > DEF_MAX_CHARS) return fail('long', `Keep it under ${DEF_MAX_CHARS} characters.`);
  const key = normalize(text);
  if (key.length < DEF_MIN_CHARS) return fail('short', 'That is too short to pass for a definition.');
  if (taken.includes(key)) {
    return fail('duplicate', 'Another definition already says exactly that. Put it in your own words.');
  }
  return { ok: true, text, key };
}

function fail(reason, message) {
  return { ok: false, reason, message };
}

// ── The ballot ───────────────────────────────────────────────

/**
 * Every definition for the round, real one included, shuffled once for the whole room so that
 * "number 3" means the same thing on every phone. Entries are numbered in display order.
 *   fakes: [{ pid, text }]
 * Returns [{ id, n, text, real, pid }]. `real` and `pid` are server-side only: see publicBallot.
 */
export function buildBallot(realDefinition, fakes, rng = Math.random) {
  const all = [
    { real: true, pid: null, text: dictionaryStyle(realDefinition) },
    ...fakes.map((f) => ({ real: false, pid: f.pid, text: dictionaryStyle(f.text) })),
  ];
  return shuffle(all, rng).map((e, i) => ({ id: `d${i + 1}`, n: i + 1, ...e }));
}

/** What voters may see: the number and the words, nothing about who wrote it or which is real. */
export function publicBallot(ballot) {
  return ballot.map(({ id, n, text }) => ({ id, n, text }));
}

// ── Votes ────────────────────────────────────────────────────

/**
 * Checks one vote.
 *   voterPid: who is voting. eligible: pids allowed to vote this round (everyone but the picker).
 *   votes: Map voterPid -> entryId already cast.
 * Returns { ok: true } or { ok: false, reason, message }.
 */
export function checkVote(voterPid, entryId, ballot, eligible, votes) {
  if (!eligible.includes(voterPid)) return fail('picker', 'You picked this word, so you sit this vote out.');
  if (votes.has(voterPid)) return fail('twice', 'You have already voted this round.');
  const entry = ballot.find((e) => e.id === entryId);
  if (!entry) return fail('unknown', 'Pick one of the definitions.');
  if (entry.pid === voterPid) return fail('own', 'That one is yours. Vote for the definition you think is real.');
  return { ok: true };
}

// ── Scoring ──────────────────────────────────────────────────

/**
 * Scores a round.
 *   ballot: from buildBallot. votes: Map voterPid -> entryId.
 * Returns { byPlayer: Map pid -> { guessed, fooled, points }, entries: [{ ...entry, voters: [pid] }] }.
 * `byPlayer` has a row for every voter and every author.
 */
export function scoreRound(ballot, votes) {
  const voters = new Map(ballot.map((e) => [e.id, []]));
  for (const [pid, entryId] of votes) voters.get(entryId)?.push(pid);

  const byPlayer = new Map();
  const row = (pid) => {
    if (!byPlayer.has(pid)) byPlayer.set(pid, { guessed: false, fooled: 0, points: 0 });
    return byPlayer.get(pid);
  };

  for (const e of ballot) {
    const got = voters.get(e.id);
    if (e.real) {
      for (const pid of got) {
        const r = row(pid);
        r.guessed = true;
        r.points += POINTS_FOR_REAL;
      }
    } else {
      const r = row(e.pid);
      r.fooled += got.length;
      r.points += got.length * POINTS_PER_FOOLED;
    }
  }
  for (const pid of votes.keys()) row(pid);

  return { byPlayer, entries: ballot.map((e) => ({ ...e, voters: [...voters.get(e.id)] })) };
}

// ── Standings ────────────────────────────────────────────────

/** Players with the same score share a rank (1, 1, 3). */
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let rank = 0;
  return sorted.map((p, i) => {
    if (i === 0 || p.score !== sorted[i - 1].score) rank = i + 1;
    return { ...p, rank };
  });
}

/** Everyone at the top of the table (more than one on a tie). */
export function winnersOf(players) {
  return rankPlayers(players).filter((p) => p.rank === 1);
}

/**
 * End-of-game awards, from per-player totals { id, fooled, guessed }. Display only: they never
 * change the score. An award with no clear holder (nobody fooled anyone, say) is left out; ties share it.
 */
export function awardsFor(players) {
  const best = (key) => {
    const top = Math.max(0, ...players.map((p) => p[key]));
    return top > 0 ? players.filter((p) => p[key] === top).map((p) => p.id) : [];
  };
  const awards = [];
  const bluffers = best('fooled');
  if (bluffers.length) awards.push({ id: 'bluffer', title: 'Best bluffer', ids: bluffers, value: Math.max(...players.map((p) => p.fooled)) });
  const sharp = best('guessed');
  if (sharp.length) awards.push({ id: 'sharp', title: 'Sharpest eye', ids: sharp, value: Math.max(...players.map((p) => p.guessed)) });
  return awards;
}
