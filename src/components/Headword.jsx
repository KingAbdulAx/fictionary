import { posLabel } from '../labels';

// The signature: the word set like a dictionary headword, part of speech in italics.
export default function Headword({ word, as = 'h1', size = 'big' }) {
  if (!word) return null;
  const Tag = as;
  return (
    <div className={`headword headword--${size}`}>
      <Tag className="headword__word">{word.word}</Tag>
      <p className="headword__pos"><i>{posLabel(word.pos)}</i></p>
    </div>
  );
}
