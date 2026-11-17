import { useState } from 'react';

// The ballot: every definition, numbered like dictionary senses, in the same order on every phone.
// A voter picks one (never their own) and confirms. The picker sees the list but sits the vote out.
export default function Voting({ ballot, myEntry, myVote, canVote, onVote }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const voted = !!myVote;

  if (!canVote) {
    return (
      <div className="stack">
        <ol className="entries" aria-label="The definitions">
          {ballot.map((e) => (
            <li className="entry" key={e.id}>
              <span className="entry__n">{e.n}.</span>
              <p className="entry__text">{e.text}</p>
            </li>
          ))}
        </ol>
        <p className="muted">You picked this word, so you sit the vote out. Watch who falls for what.</p>
      </div>
    );
  }

  const chosen = ballot.find((e) => e.id === selected);

  const vote = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    const res = await onVote(chosen.id);
    setBusy(false);
    if (!res?.ok) setError(res?.message || 'That did not go through. Try again.');
  };

  return (
    <div className="stack">
      <fieldset className="entries entries--vote" disabled={voted}>
        <legend className="section-title">{voted ? 'Your vote is in' : 'Which one is real?'}</legend>
        {ballot.map((e) => {
          const own = e.id === myEntry;
          const mine = e.id === myVote;
          return (
            <label key={e.id} className={`entry entry--pick ${selected === e.id || mine ? 'is-selected' : ''} ${own ? 'entry--own' : ''}`}>
              <input
                className="sr-only"
                type="radio"
                name="vote"
                value={e.id}
                checked={voted ? mine : selected === e.id}
                disabled={own || voted}
                onChange={() => {
                  setSelected(e.id);
                  setError('');
                }}
              />
              <span className="entry__n">{e.n}.</span>
              <span className="entry__text">{e.text}</span>
              {own && <span className="tag tag--plain entry__tag">yours</span>}
              {mine && <span className="tag entry__tag">your vote</span>}
            </label>
          );
        })}
      </fieldset>
      {!voted && (
        <div className="bar">
          <button className="btn btn--block" type="button" onClick={vote} disabled={!chosen || busy}>
            {chosen ? `Vote for number ${chosen.n}` : 'Pick the one you think is real'}
          </button>
          <p className="notice center" role="alert">{error}</p>
        </div>
      )}
    </div>
  );
}
