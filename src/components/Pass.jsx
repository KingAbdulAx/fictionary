import Headword from './Headword';

// One-device play: hand the phone to the next person before showing anything private.
export default function Pass({ label, name, note, word, onReady, readyLabel }) {
  return (
    <section className="stack stack--loose center pass">
      <span className="tag tag--plain">{label}</span>
      {word && <Headword word={word} as="p" size="small" />}
      <div className="stack">
        <p className="muted">Pass the phone to</p>
        <h1 className="pass__name">{name}</h1>
      </div>
      <button className="btn btn--block" type="button" onClick={onReady}>{readyLabel || `I'm ${name}`}</button>
      {note && <p className="muted" aria-live="polite">{note}</p>}
    </section>
  );
}
