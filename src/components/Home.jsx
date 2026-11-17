import Headword from './Headword';
import Stamp from './Stamp';

// A made-up example on purpose: the word is not in the game's bank, so nothing here spoils a round.
const EXAMPLE = [
  { n: 1, text: 'A cupboard for drying wet boots.' },
  { n: 2, text: 'A wooden toy figure that jerks its limbs when a string is pulled.', real: true },
  { n: 3, text: 'To quarrel loudly over a small debt.' },
];

export default function Home({ onSelectMode }) {
  return (
    <section className="stack stack--loose home">
      <div className="stack">
        <h1 className="home__title">Fictionary</h1>
        <p className="home__sub">
          One player picks an obscure word. Everyone else invents a definition for it. Then you all vote for the real one.
        </p>
      </div>

      <div className="modes">
        <button className="mode paper" type="button" onClick={() => onSelectMode('online')}>
          <span className="mode__title">Play online</span>
          <span className="mode__text">Everyone on their own phone. Share a room code or a link.</span>
          <span className="tag">3 to 10 players</span>
        </button>
        <button className="mode paper" type="button" onClick={() => onSelectMode('local')}>
          <span className="mode__title">One device</span>
          <span className="mode__text">Pass one phone around. Each person writes and votes in private.</span>
          <span className="tag">3 to 10 players</span>
        </button>
      </div>

      <section className="stack legend" aria-labelledby="legend-title">
        <h2 id="legend-title" className="section-title">How it scores</h2>
        <div className="paper card stack">
          <Headword word={{ word: 'quockerwodger', pos: 'n' }} as="p" size="small" />
          <ol className="entries entries--quiet" aria-label="Three definitions, one of them real">
            {EXAMPLE.map((e) => (
              <li className={`entry ${e.real ? 'entry--real' : ''}`} key={e.n}>
                <span className="entry__n">{e.n}.</span>
                <p className="entry__text">{e.text}</p>
                {e.real && <Stamp />}
              </li>
            ))}
          </ol>
        </div>
        <ul className="legend__list">
          <li><p><strong>1 point</strong> for voting for the real definition.</p></li>
          <li><p><strong>1 point</strong> for every vote your made-up definition gets.</p></li>
          <li><p>Whoever picked the word knows the answer, so they sit that round out. Everyone takes a turn picking.</p></li>
        </ul>
      </section>
    </section>
  );
}
