import { rankPlayers } from '../../server/rules.js';

const times = (n) => (n === 1 ? 'once' : `${n} times`);

// The table. `showDelta` adds this round's points next to each score; `showDetail` adds the totals behind them.
export default function Standings({ players, myId, showDelta = false, showDetail = false }) {
  const ranked = rankPlayers(players);
  return (
    <ol className="standings">
      {ranked.map((p) => (
        <li className="standings__row" key={p.id}>
          <span className="standings__rank">{p.rank}</span>
          <span className="standings__who">
            <span className="standings__name">
              {p.name}
              {p.id === myId && <span className="standings__you"> (you)</span>}
            </span>
            {showDetail && (
              <span className="standings__sub">
                Found the real one {times(p.guessed)}. Fooled {p.fooled === 0 ? 'nobody' : p.fooled === 1 ? '1 voter' : `${p.fooled} voters`}.
              </span>
            )}
          </span>
          {showDelta && p.lastPoints > 0 && (
            <span className="tag" aria-label={`plus ${p.lastPoints} this round`}>+{p.lastPoints}</span>
          )}
          <span className="standings__score" aria-label={`${p.score} points`}>{p.score}</span>
        </li>
      ))}
    </ol>
  );
}
