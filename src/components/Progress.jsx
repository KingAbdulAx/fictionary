// Who is done with this step. The picker is left out: they neither write nor vote.
export default function Progress({ state, myId, verb }) {
  const people = state.players.filter((p) => p.id !== state.pickerId);
  const done = people.filter((p) => p.done).length;
  return (
    <div className="tray">
      <p className="tray__count" aria-live="polite">{done} of {people.length} {verb}</p>
      <ul className="tray__list">
        {people.map((p) => (
          <li key={p.id} className={`pip ${p.done ? 'pip--in' : ''} ${p.connected ? '' : 'pip--off'}`}>
            {p.name}{p.id === myId ? ' (you)' : ''}
            {!p.connected && <span className="pip__off">offline</span>}
            <span className="sr-only">{p.done ? ', done' : ', not yet'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
