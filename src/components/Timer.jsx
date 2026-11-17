import { useEffect, useState } from 'react';

const fmt = (ms) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// Counts down to `deadline` (a wall-clock time from the server's deadlineInMs). Nothing when there is no timer.
export default function Timer({ deadline, label = 'Time left' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  const left = Math.max(0, deadline - now);
  return (
    <p className={`timer ${left <= 10000 ? 'timer--low' : ''}`} role="timer" aria-label={`${label}: ${Math.ceil(left / 1000)} seconds`}>
      <span className="timer__label">{label}</span>
      <span className="timer__value" aria-hidden="true">{fmt(left)}</span>
    </p>
  );
}
