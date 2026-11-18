// The ink stamp on the real definition at the reveal. It lands with a short scale and turn
// (static under prefers-reduced-motion: the resting state is the final state).
export default function Stamp({ delay = 0 }) {
  return (
    <span className="stamp" style={{ '--d': `${delay}ms` }}>
      <span className="sr-only">This is the </span>Real<span className="sr-only"> definition</span>
    </span>
  );
}
