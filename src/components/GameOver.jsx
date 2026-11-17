import Standings from './Standings';
import { joinNames } from '../labels';

export default function GameOver({ state, myId, onPlayAgain, onLeave, leaveLabel = 'Leave', waitingFor }) {
  const winners = state.players.filter((p) => state.winners.includes(p.id));
  const names = joinNames(winners.map((p) => p.name));
  const headline = winners.length === 0 ? 'Game over' : winners.length === 1 ? `${names} wins` : `${names} share the win`;
  const nameList = (ids) => joinNames(ids.map((id) => state.players.find((p) => p.id === id)?.name).filter(Boolean));
  const words = state.round;

  return (
    <section className="stack stack--loose">
      <div className="stack">
        <span className="tag tag--plain">Final scores</span>
        <h1 className="page-title page-title--big">{headline}</h1>
        <p className="muted">{words} {words === 1 ? 'word' : 'words'} played.</p>
      </div>

      <Standings players={state.players} myId={myId} showDetail />

      {state.awards.length > 0 && (
        <div className="stack stack--tight">
          <h2 className="section-title">Awards</h2>
          <ul className="awards">
            {state.awards.map((a) => (
              <li className="awards__row" key={a.id}>
                <span className="tag tag--sage">{a.title}</span>
                <span>
                  <strong>{nameList(a.ids)}</strong>
                  <span className="muted">
                    {a.id === 'bluffer'
                      ? `, fooled ${a.value} ${a.value === 1 ? 'voter' : 'voters'}`
                      : `, found the real one ${a.value === 1 ? 'once' : `${a.value} times`}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Just for show: awards don&apos;t change the score.</p>
        </div>
      )}

      <div className="stack stack--tight">
        {onPlayAgain ? (
          <button className="btn btn--block" type="button" onClick={onPlayAgain}>Play again</button>
        ) : (
          waitingFor && <p className="muted center">Waiting for {waitingFor} to start another game.</p>
        )}
        <button className="btn btn--ghost btn--block" type="button" onClick={onLeave}>{leaveLabel}</button>
      </div>
    </section>
  );
}
