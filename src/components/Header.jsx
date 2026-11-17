import { useEffect, useState } from 'react';
import { BASE } from '../config';

// Wordmark left, room tools right. On the hub (served under a sub-path) the home screen links back to all games.
export default function Header({ onHome, code, connectionStatus, onLeave, confirmLeave = false }) {
  const [arming, setArming] = useState(false);

  useEffect(() => {
    if (!arming) return undefined;
    const t = setTimeout(() => setArming(false), 3500);
    return () => clearTimeout(t);
  }, [arming]);

  const leave = () => {
    if (confirmLeave && !arming) setArming(true);
    else onLeave();
  };

  const brand = (
    <>
      Fiction<span className="brand__accent">ary</span>
    </>
  );

  return (
    <header className="top">
      <div className="top__inner">
        {onHome ? (
          <button className="brand" type="button" onClick={onHome} aria-label="Fictionary, back to the start">{brand}</button>
        ) : (
          <span className="brand">{brand}</span>
        )}
        <div className="top__right">
          {code && (
            <span className="code-chip" aria-label={`Room code ${code.split('').join(' ')}`}>
              <span className={`dot dot--${connectionStatus || 'connected'}`} aria-hidden="true" />
              {code}
            </span>
          )}
          {onLeave && (
            <button className="link-btn" type="button" onClick={leave}>
              {arming ? 'Tap again to leave' : 'Leave'}
            </button>
          )}
          {!onLeave && !onHome && BASE !== '/' && (
            <a className="link-btn" href="/">All games</a>
          )}
        </div>
      </div>
    </header>
  );
}
