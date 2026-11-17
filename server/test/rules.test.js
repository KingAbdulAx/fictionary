import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tidy, normalize, checkDefinition, buildBallot, publicBallot, checkVote, scoreRound,
  rankPlayers, winnersOf, awardsFor, shuffle, DEF_MAX_CHARS, POINTS_FOR_REAL, POINTS_PER_FOOLED,
} from '../rules.js';

// A predictable "random" source for shuffles.
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

// ── Normalisation and duplicates ───────────────────────────

test('tidy keeps the words as written and only fixes spacing', () => {
  assert.equal(tidy('  a  small\tboat \n'), 'a small boat');
  assert.equal(tidy(42), '');
});

test('normalize ignores case, accents, punctuation, spacing and a leading article', () => {
  assert.equal(normalize('A small boat.'), normalize('small   BOAT'));
  assert.equal(normalize('The café, by the sea!'), 'cafebythesea');
  assert.equal(normalize('An owl'), 'owl');
  assert.notEqual(normalize('a small boat'), normalize('a small goat'));
});

test('checkDefinition accepts a fresh definition and returns its tidy text', () => {
  const res = checkDefinition('  a  wooden spoon for stirring porridge ', []);
  assert.deepEqual(res, { ok: true, text: 'a wooden spoon for stirring porridge', key: 'woodenspoonforstirringporridge' });
});

test('checkDefinition rejects empty, too short and too long', () => {
  assert.equal(checkDefinition('', []).reason, 'empty');
  assert.equal(checkDefinition('   ', []).reason, 'empty');
  assert.equal(checkDefinition(undefined, []).reason, 'empty');
  assert.equal(checkDefinition('ox', []).reason, 'short');
  assert.equal(checkDefinition('x'.repeat(DEF_MAX_CHARS + 1), []).reason, 'long');
  assert.equal(checkDefinition('x'.repeat(DEF_MAX_CHARS), []).ok, true);
});

test('checkDefinition rejects a copy of the real definition or of another fake, without quoting it', () => {
  const real = 'A small boat used on rivers.';
  const taken = [normalize(real), normalize('a type of hat')];
  const sameAsReal = checkDefinition('a SMALL boat, used on rivers', taken);
  const sameAsFake = checkDefinition('The type of hat!', taken);
  for (const res of [sameAsReal, sameAsFake]) {
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'duplicate');
    assert.doesNotMatch(res.message, /\b(boat|hat)\b/i);
  }
  // Same wording either way, so the message never tells you that you matched the real one.
  assert.equal(sameAsReal.message, sameAsFake.message);
});

// ── Ballot ─────────────────────────────────────────────────

test('buildBallot holds the real one and every fake, numbered in shuffled order, in dictionary style', () => {
  const ballot = buildBallot('a small boat', [{ pid: 'p1', text: 'a kind of hat' }, { pid: 'p2', text: 'To sing loudly!' }], seq(0.1, 0.9));
  assert.equal(ballot.length, 3);
  assert.deepEqual(ballot.map((e) => e.n), [1, 2, 3]);
  assert.deepEqual(ballot.map((e) => e.id), ['d1', 'd2', 'd3']);
  assert.equal(ballot.filter((e) => e.real).length, 1);
  const texts = ballot.map((e) => e.text).sort();
  assert.deepEqual(texts, ['A kind of hat.', 'A small boat.', 'To sing loudly!']);
});

test('publicBallot carries no authorship and no real flag', () => {
  const ballot = buildBallot('a small boat', [{ pid: 'secret-pid', text: 'a hat' }]);
  const pub = publicBallot(ballot);
  for (const e of pub) assert.deepEqual(Object.keys(e).sort(), ['id', 'n', 'text']);
  assert.doesNotMatch(JSON.stringify(pub), /secret-pid|"real"|"pid"/);
});

test('the shuffle never touches its input', () => {
  const list = [1, 2, 3, 4];
  shuffle(list, () => 0);
  assert.deepEqual(list, [1, 2, 3, 4]);
});

// ── Votes ──────────────────────────────────────────────────

const ballot = [
  { id: 'd1', n: 1, text: 'A.', real: false, pid: 'ben' },
  { id: 'd2', n: 2, text: 'B.', real: true, pid: null },
  { id: 'd3', n: 3, text: 'C.', real: false, pid: 'chi' },
];

test('checkVote: a fair vote is accepted', () => {
  assert.deepEqual(checkVote('ben', 'd2', ballot, ['ben', 'chi'], new Map()), { ok: true });
  assert.deepEqual(checkVote('ben', 'd3', ballot, ['ben', 'chi'], new Map()), { ok: true });
});

test('checkVote: no voting for your own definition', () => {
  assert.equal(checkVote('ben', 'd1', ballot, ['ben', 'chi'], new Map()).reason, 'own');
});

test('checkVote: one vote each', () => {
  assert.equal(checkVote('ben', 'd2', ballot, ['ben', 'chi'], new Map([['ben', 'd3']])).reason, 'twice');
});

test('checkVote: the picker does not vote, and unknown entries are refused', () => {
  assert.equal(checkVote('ada', 'd2', ballot, ['ben', 'chi'], new Map()).reason, 'picker');
  assert.equal(checkVote('ben', 'd9', ballot, ['ben', 'chi'], new Map()).reason, 'unknown');
});

// ── Scoring ────────────────────────────────────────────────

test('scoring: 1 point for finding the real one', () => {
  const { byPlayer } = scoreRound(ballot, new Map([['ben', 'd2'], ['chi', 'd2']]));
  assert.deepEqual(byPlayer.get('ben'), { guessed: true, fooled: 0, points: POINTS_FOR_REAL });
  assert.deepEqual(byPlayer.get('chi'), { guessed: true, fooled: 0, points: POINTS_FOR_REAL });
});

test('scoring: 1 point for every player your fake fools', () => {
  const ballot4 = [...ballot, { id: 'd4', n: 4, text: 'D.', real: false, pid: 'dee' }];
  const votes = new Map([['ben', 'd3'], ['dee', 'd3'], ['chi', 'd1']]);
  const { byPlayer } = scoreRound(ballot4, votes);
  assert.deepEqual(byPlayer.get('chi'), { guessed: false, fooled: 2, points: 2 * POINTS_PER_FOOLED });
  assert.deepEqual(byPlayer.get('ben'), { guessed: false, fooled: 1, points: 1 });
  assert.deepEqual(byPlayer.get('dee'), { guessed: false, fooled: 0, points: 0 });
});

test('scoring: guessing right and fooling others add up', () => {
  const ballot4 = [...ballot, { id: 'd4', n: 4, text: 'D.', real: false, pid: 'dee' }];
  const { byPlayer } = scoreRound(ballot4, new Map([['ben', 'd2'], ['chi', 'd1'], ['dee', 'd1']]));
  assert.deepEqual(byPlayer.get('ben'), { guessed: true, fooled: 2, points: 3 });
});

test('scoring: nobody votes, nobody scores; a non-voter still gets a row as an author', () => {
  const { byPlayer, entries } = scoreRound(ballot, new Map());
  assert.equal(byPlayer.get('ben').points, 0);
  assert.equal(byPlayer.get('chi').points, 0);
  assert.deepEqual(entries.map((e) => e.voters), [[], [], []]);
});

test('scoring: a vote for an entry that is not on the ballot is ignored', () => {
  const { byPlayer } = scoreRound(ballot, new Map([['ben', 'd9']]));
  assert.equal(byPlayer.get('ben').points, 0);
});

test('scoring: entries list who voted for them', () => {
  const { entries } = scoreRound(ballot, new Map([['ben', 'd3'], ['chi', 'd2']]));
  assert.deepEqual(entries.find((e) => e.id === 'd3').voters, ['ben']);
  assert.deepEqual(entries.find((e) => e.id === 'd2').voters, ['chi']);
});

// ── Standings and awards ───────────────────────────────────

test('ties share a rank and share the win', () => {
  const players = [{ id: 'a', score: 3 }, { id: 'b', score: 5 }, { id: 'c', score: 5 }];
  assert.deepEqual(rankPlayers(players).map((p) => [p.id, p.rank]), [['b', 1], ['c', 1], ['a', 3]]);
  assert.deepEqual(winnersOf(players).map((p) => p.id), ['b', 'c']);
});

test('awards go to the top bluffer and the sharpest guesser, and are left out when nobody earned them', () => {
  const awards = awardsFor([{ id: 'a', fooled: 4, guessed: 1 }, { id: 'b', fooled: 1, guessed: 3 }, { id: 'c', fooled: 4, guessed: 0 }]);
  assert.deepEqual(awards.map((a) => [a.id, a.ids, a.value]), [['bluffer', ['a', 'c'], 4], ['sharp', ['b'], 3]]);
  assert.deepEqual(awardsFor([{ id: 'a', fooled: 0, guessed: 0 }]), []);
});
