import Headword from './Headword';
import Stamp from './Stamp';
import Standings from './Standings';
import { joinNames, nameOf, roundLabel } from '../labels';

// The reveal: the real definition gets the stamp, every fake is named with whoever it fooled,
// and the table shows this round's points.
export default function Reveal({ state, myId, action }) {
  const names = (ids) => joinNames(ids.map((id) => (id === myId ? 'you' : nameOf(state, id))));
  const { result } = state;
  const notes = [];
  if (result.unwritten.length) notes.push(`${names(result.unwritten)} didn't write in time.`);
  if (result.unvoted.length) notes.push(`${names(result.unvoted)} didn't vote in time.`);

  return (
    <section className="stack stack--loose">
      <div className="stack stack--tight">
        <span className="tag tag--plain">{roundLabel(state)}</span>
        <Headword word={state.word} />
      </div>

      {result.noFakes && <p className="muted">Nobody wrote a definition this time, so here is the real one.</p>}

      <ol className="entries entries--reveal" aria-label="The definitions, revealed">
        {state.ballot.map((e, i) => {
          const fooled = e.voters.length;
          return (
            <li className={`entry ${e.real ? 'entry--real' : ''}`} key={e.id} style={{ '--d': `${i * 90}ms` }}>
              <span className="entry__n">{e.n}.</span>
              <div className="entry__body">
                <p className="entry__text">{e.text}</p>
                {e.real ? (
                  <p className="entry__meta">
                    {fooled ? <>Found by {names(e.voters)}, <strong>+1</strong> each.</> : 'Nobody found it.'}
                  </p>
                ) : (
                  <p className="entry__meta">
                    Made up by <strong>{e.authorId === myId ? 'you' : e.authorName}</strong>.{' '}
                    {fooled ? <>Fooled {names(e.voters)}, <strong>+{fooled}</strong>.</> : 'Fooled nobody.'}
                  </p>
                )}
              </div>
              {e.real && <Stamp delay={state.ballot.length * 90 + 250} />}
            </li>
          );
        })}
      </ol>

      {notes.length > 0 && <p className="muted small">{notes.join(' ')}</p>}

      <div className="stack stack--tight">
        <h2 className="section-title">{state.final ? 'Final round scores' : 'Scores'}</h2>
        <Standings players={state.players} myId={myId} showDelta />
      </div>

      <div className="bar">{action}</div>
    </section>
  );
}
