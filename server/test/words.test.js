import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateWords, dictionaryStyle, MIN_WORDS } from '../words.js';

const bank = JSON.parse(readFileSync(new URL('../words.json', import.meta.url), 'utf8'));

test('the shipped bank is valid and big enough', () => {
  assert.deepEqual(validateWords(bank), []);
  assert.ok(bank.length >= MIN_WORDS, `${bank.length} words`);
});

test('dictionaryStyle capitalises and ends with one full stop', () => {
  assert.equal(dictionaryStyle('  a small   boat '), 'A small boat.');
  assert.equal(dictionaryStyle('a small boat...'), 'A small boat.');
  assert.equal(dictionaryStyle('what a boat!'), 'What a boat!');
  assert.equal(dictionaryStyle(''), '');
});

test('validateWords catches the usual mistakes', () => {
  const good = { word: 'zarf', pos: 'n', definition: 'An ornamental holder for a coffee cup.' };
  const name = (i) => { let s = ''; do { s = String.fromCharCode(97 + (i % 26)) + s; i = Math.floor(i / 26); } while (i > 0); return `w${s}`; };
  const many = (entry) => Array.from({ length: MIN_WORDS }, (_, i) => ({ ...good, word: name(i) })).concat(entry ? [entry] : []);
  assert.deepEqual(validateWords(many()), []);
  const problems = (entry) => validateWords(many(entry)).join('\n');
  assert.match(validateWords([good]).join(), /at least/);
  assert.match(problems({ ...good, word: 'Zarf2' }), /lower-case/);
  assert.match(problems({ ...good, pos: 'x', word: 'zz' }), /part of speech/);
  assert.match(problems({ ...good, word: 'zy', definition: 'an ornamental holder' }), /dictionary style/);
  assert.match(problems({ ...good, word: 'zx', definition: 'A holder. A cup.' }), /one sentence/);
  assert.match(problems({ ...good, word: 'zw', definition: 'A zw that holds a cup.' }), /word itself/);
  assert.match(problems({ ...good, word: 'zv', definition: `A ${'very '.repeat(30)}long one.` }), /characters/);
  assert.match(problems({ ...good, word: 'zu', definition: 'A sexy cup holder.' }), /sensitive/);
});
