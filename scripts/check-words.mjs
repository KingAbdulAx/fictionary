// Build-time check of the word bank. Fails the build if server/words.json is not valid.
import { readFileSync } from 'node:fs';
import { validateWords } from '../server/words.js';

const words = JSON.parse(readFileSync(new URL('../server/words.json', import.meta.url), 'utf8'));
const problems = validateWords(words);
if (problems.length) {
  console.error(`server/words.json has ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`server/words.json: ${words.length} words, all valid`);
