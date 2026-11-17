import { posLabel } from '../labels';

// The picker's private view: three words with their real definitions. Choosing one starts the writing.
export function ChooseWord({ label, offer, onChoose }) {
  return (
    <section className="stack stack--loose">
      <div className="stack stack--tight">
        <span className="tag tag--plain">{label}</span>
        <h1 className="page-title">Pick a word</h1>
        <p className="muted">Only you can see these. Choose the one you think nobody knows. You sit this round out, so you won&apos;t write or vote.</p>
      </div>
      <ul className="offer">
        {offer.map((o, i) => (
          <li key={o.word}>
            <button className="offer__card paper" type="button" onClick={() => onChoose(i)} aria-label={`Choose ${o.word}`} aria-describedby={`offer-def-${i}`}>
              <span className="offer__head">
                <span className="offer__word">{o.word}</span> <i className="offer__pos">{posLabel(o.pos)}</i>
              </span>
              <span className="offer__def" id={`offer-def-${i}`}>{o.definition}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Everyone else while the picker chooses. The host can pick for a picker who has gone offline.
export function WaitForPicker({ label, pickerName, pickerOffline, isHost, onPickFor }) {
  return (
    <section className="stack stack--loose center pass">
      <span className="tag tag--plain">{label}</span>
      <div className="stack">
        <h1 className="page-title">{pickerName} is picking a word</h1>
        <p className="muted">Get ready to invent a definition for it.</p>
      </div>
      {pickerOffline && (
        <div className="stack stack--tight center">
          <p className="notice">{pickerName} is offline.</p>
          {isHost ? (
            <button className="btn btn--block" type="button" onClick={onPickFor}>Pick for them</button>
          ) : (
            <p className="muted">The host can pick a word for them.</p>
          )}
        </div>
      )}
    </section>
  );
}
