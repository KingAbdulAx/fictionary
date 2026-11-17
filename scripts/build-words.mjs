// Rebuilds server/words.json from data/candidates.txt, using WordNet for every definition.
//   npm run words
//
// Each candidate is looked up in WordNet 3.1 (the wordnet-db dev dependency). The first sense of the
// chosen part of speech is used unless the candidate names another. The gloss is trimmed to its
// first clause and written in dictionary style: capital first letter, full stop at the end.
// data/overrides.txt can replace a gloss by hand (keep it a faithful paraphrase of WordNet).
// The result is checked with the same validator the server and tests use.
import { readFileSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { validateWords, dictionaryStyle } from '../server/words.js';

const require = createRequire(import.meta.url);
const DICT = require('wordnet-db').path;

const POS_FILES = { n: 'noun', v: 'verb', a: 'adj', r: 'adv' };
const POS_ORDER = ['n', 'v', 'a', 'r'];

const indexes = {};
function index(pos) {
  if (!indexes[pos]) {
    const map = new Map();
    for (const line of readFileSync(join(DICT, `index.${POS_FILES[pos]}`), 'utf8').split('\n')) {
      if (!line || line.startsWith(' ')) continue;
      const parts = line.trim().split(' ');
      const lemma = parts[0];
      const synsetCount = Number(parts[2]);
      map.set(lemma, parts.slice(parts.length - synsetCount));
    }
    indexes[pos] = map;
  }
  return indexes[pos];
}

const fds = {};
function glossAt(pos, offset) {
  const file = join(DICT, `data.${POS_FILES[pos]}`);
  fds[pos] ??= openSync(file, 'r');
  const buf = Buffer.alloc(4096);
  const n = readSync(fds[pos], buf, 0, buf.length, Number(offset));
  const line = buf.subarray(0, n).toString('utf8').split('\n')[0];
  return line.slice(line.indexOf(' | ') + 3).trim();
}

/** "a person who ...; a beginner; \"he was a tyro\"" -> "a person who ..." */
export function firstClause(gloss) {
  return gloss
    .split(/;\s*"|;\s+/)[0]
    .replace(/\s*\([^)]*\)/g, '') // asides like "(especially dictation)" read like a dictionary tell
    .replace(/`|'(?=\s|$)|"/g, '')
    .replace(/,?\s+etc\.?$/, '')
    .trim();
}

function parseLines(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean)
    .map((l) => l.split('|').map((s) => s.trim()));
}

const overrides = new Map(parseLines(readFileSync('data/overrides.txt', 'utf8')).map(([w, d]) => [w, d]));
const out = [];
const missing = [];
const seen = new Set();

for (const [word, wantPos, wantSense] of parseLines(readFileSync('data/candidates.txt', 'utf8'))) {
  if (seen.has(word)) continue;
  seen.add(word);
  const lemma = word.toLowerCase().replace(/ /g, '_');
  const posList = wantPos ? [wantPos] : POS_ORDER;
  const pos = posList.find((p) => index(p).has(lemma));
  if (!pos) {
    missing.push(word);
    continue;
  }
  const offsets = index(pos).get(lemma);
  const sense = Math.min(Number(wantSense) || 1, offsets.length);
  const gloss = overrides.get(word) ?? firstClause(glossAt(pos, offsets[sense - 1]));
  out.push({ word, pos, definition: dictionaryStyle(gloss) });
}

for (const fd of Object.values(fds)) closeSync(fd);
out.sort((a, b) => a.word.localeCompare(b.word));

// `npm run words -- --review` prints every entry for proof-reading instead of writing the file.
if (process.argv.includes('--review')) {
  for (const e of out) console.log(`${e.word} (${e.pos}): ${e.definition}`);
}

const problems = validateWords(out);
if (missing.length) console.warn(`Not in WordNet, skipped (${missing.length}): ${missing.join(', ')}`);
if (problems.length) {
  console.error(`words.json would have ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
writeFileSync('server/words.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(`server/words.json: ${out.length} words`);
