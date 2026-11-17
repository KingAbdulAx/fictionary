// The word bank: obscure but real English words with one-sentence definitions from WordNet.
// Pure functions only, so the server, the browser (one-device play), the build script and the tests
// all agree on what a valid bank looks like.

export const MIN_WORDS = 300;
export const DEF_MIN_CHARS = 12;
export const DEF_MAX_CHARS = 110;
export const POS_LABELS = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };

// Nothing in the bank should be about sex, bodies' private parts, slurs or similar. This is a
// backstop for the hand-picked list, not the main filter.
const SENSITIVE = /\b(sex|sexual\w*|sexy|penis|vagina|genital\w*|anus|anal|feces|faeces|excrement|urine|breasts?|nipple|prostitut\w*|rape|slur|negro|whore|bastard|damn|hell|god|jesus|christ|allah|suicide|murder\w*|corpse|drunk\w*)\b/i;

/**
 * Dictionary style: first letter capitalised, single spaces, exactly one full stop at the end.
 * Used for the real definitions and for players' definitions at display time, so the real one
 * cannot be spotted by its capital letter or its full stop.
 */
export function dictionaryStyle(raw) {
  let text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  text = text.replace(/[\s.,;:]+$/, '');
  if (!text) return '';
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return /[!?]$/.test(text) ? text : `${text}.`;
}

/** Checks a parsed bank. Returns a list of human-readable problems (empty when the bank is good). */
export function validateWords(list) {
  const problems = [];
  if (!Array.isArray(list)) return ['the bank is not a list'];
  if (list.length < MIN_WORDS) problems.push(`only ${list.length} words; at least ${MIN_WORDS} are needed`);
  const seen = new Set();
  list.forEach((entry, i) => {
    const where = `#${i + 1} ${entry?.word ?? '(no word)'}`;
    if (!entry || typeof entry !== 'object') return problems.push(`${where}: not an object`);
    const { word, pos, definition } = entry;
    if (typeof word !== 'string' || !/^[a-z]+(?:[- ][a-z]+)*$/.test(word)) problems.push(`${where}: word must be lower-case letters`);
    if (seen.has(word)) problems.push(`${where}: duplicate`);
    seen.add(word);
    if (!POS_LABELS[pos]) problems.push(`${where}: unknown part of speech "${pos}"`);
    if (typeof definition !== 'string') return problems.push(`${where}: no definition`);
    if (definition !== dictionaryStyle(definition)) problems.push(`${where}: definition is not in dictionary style`);
    if (definition.length < DEF_MIN_CHARS || definition.length > DEF_MAX_CHARS) {
      problems.push(`${where}: definition is ${definition.length} characters (keep it ${DEF_MIN_CHARS}-${DEF_MAX_CHARS})`);
    }
    if (/[;"]|\.\s|\?\s|!\s/.test(definition)) problems.push(`${where}: definition must be one sentence`);
    if (typeof word === 'string' && new RegExp(`\\b${word.replace(/[- ]/g, '.')}\\b`, 'i').test(definition)) {
      problems.push(`${where}: definition uses the word itself`);
    }
    if (SENSITIVE.test(`${word} ${definition}`)) problems.push(`${where}: sensitive wording`);
  });
  return problems;
}
