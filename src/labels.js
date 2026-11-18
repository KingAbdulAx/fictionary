import { POS_LABELS } from '../server/words.js';

/** "noun", "verb", ... from WordNet's one-letter part of speech. */
export const posLabel = (pos) => POS_LABELS[pos] || '';

/** "Word 2 of 6". `totalRounds` comes from the room and shrinks if a picker leaves. */
export function roundLabel(state) {
  return state.totalRounds ? `Word ${state.round} of ${state.totalRounds}` : `Word ${state.round}`;
}

/** "1 turn each" / "2 turns each". */
export const turnsLabel = (turns) => `${turns} ${turns === 1 ? 'turn' : 'turns'} each`;

/** "90 seconds to write" or "No timer". */
export const timerLabel = (timer) => (timer ? `${timer} seconds to write` : 'No timer');

/** "Ada", "Ada and Ben", "Ada, Ben and Chi". */
export function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** A nudge towards dictionary style, by part of speech. Shown when the host leaves hints on. */
export function styleHint(pos) {
  switch (pos) {
    case 'v':
      return 'Write it like a dictionary: “To …”, plain and short.';
    case 'a':
      return 'Write it like a dictionary: “Having …”, “Relating to …” or “Like …”.';
    case 'r':
      return 'Write it like a dictionary: “In a … manner”.';
    default:
      return 'Write it like a dictionary: “A small …”, “Someone who …”.';
  }
}

export const nameOf = (state, id) => state.players.find((p) => p.id === id)?.name ?? 'Someone who left';
