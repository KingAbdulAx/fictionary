import { useState } from 'react';
import Settings from './Settings';
import { inviteLink, CONFIG_PROBLEM } from '../config';
import { loadName, saveName } from '../storage';

const needLine = (have, min) =>
  have >= min ? 'Ready when you are.' : `Fictionary needs ${min} players. ${min - have} more to go.`;

// ── Online: create or join ───────────────────────────────────

export function JoinPanel({ initialCode, error, onClearError, onCreate, onJoin }) {
  const [tab, setTab] = useState(initialCode ? 'join' : 'create');
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(initialCode || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    saveName(name.trim());
    try {
      if (tab === 'create') await onCreate(name);
      else await onJoin(code, name);
    } catch {
      // the hook already put the reason in `error`
    }
    setBusy(false);
  };

  const unavailable = !!CONFIG_PROBLEM;
  const joining = tab === 'join';

  return (
    <section className="stack stack--loose">
      <h1 className="page-title">{joining ? 'Join a room' : 'Play online'}</h1>

      <form className="paper card stack" onSubmit={submit} noValidate>
        <fieldset className="chips" aria-label="Create or join">
          {[['create', 'Create a room'], ['join', 'Join a room']].map(([value, label]) => (
            <label className="chip" key={value}>
              <input
                className="sr-only"
                type="radio"
                name="join-tab"
                checked={tab === value}
                onChange={() => {
                  setTab(value);
                  onClearError();
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span className="field__label">Your name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            enterKeyHint={joining ? 'next' : 'go'}
            autoFocus={!joining || !!initialCode}
          />
        </label>

        {joining && (
          <label className="field">
            <span className="field__label">Room code</span>
            <input
              className="input input--code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="go"
              autoFocus={!initialCode}
            />
          </label>
        )}

        <button className="btn btn--block" type="submit" disabled={busy || unavailable || !name.trim() || (joining && !code.trim())}>
          {busy ? 'One moment' : joining ? 'Join the room' : 'Create the room'}
        </button>
        <p className="notice" role="alert">
          {unavailable ? "Online play isn't available right now. You can still play on one device." : error}
        </p>
      </form>
    </section>
  );
}

// ── Online: waiting room ─────────────────────────────────────

export function RoomLobby({ state, myId, isHost, error, onSetSettings, onStart }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(state.code);
  const hostName = state.players.find((p) => p.id === state.hostId)?.name;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      document.getElementById('invite-link')?.select();
    }
  };

  const share = () => navigator.share({ title: 'Fictionary', text: `Join my Fictionary room: ${state.code}`, url: link }).catch(() => {});

  return (
    <section className="stack stack--loose">
      <div className="stack">
        <h1 className="page-title">Waiting for players</h1>
        <div className="paper card stack invite">
          <div>
            <p className="field__label">Room code</p>
            <p className="invite__code" aria-label={state.code.split('').join(' ')}>{state.code}</p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="invite-link">Invite link</label>
            <input id="invite-link" className="input input--link" readOnly value={link} onFocus={(e) => e.target.select()} />
          </div>
          <div className="row">
            <button className="btn btn--ghost" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
            {canShare && <button className="btn btn--ghost" type="button" onClick={share}>Share</button>}
          </div>
        </div>
      </div>

      <div className="stack stack--tight">
        <h2 className="section-title">Players ({state.players.length} of {state.limits.max})</h2>
        <ul className="roster">
          {state.players.map((p) => (
            <li className="roster__row" key={p.id}>
              <span className="roster__name">{p.name}{p.id === myId ? ' (you)' : ''}</span>
              {p.id === state.hostId && <span className="tag">Host</span>}
              {!p.connected && <span className="tag tag--plain">Offline</span>}
            </li>
          ))}
        </ul>
      </div>

      <Settings settings={state.settings} players={state.players.length} editable={isHost} onChange={onSetSettings} idPrefix="online" />

      <div className="stack stack--tight">
        {isHost ? (
          <>
            <button className="btn btn--block" type="button" onClick={onStart} disabled={state.players.length < state.limits.min}>
              Start the game
            </button>
            <p className="muted center" aria-live="polite">{needLine(state.players.length, state.limits.min)}</p>
          </>
        ) : (
          <p className="muted center" aria-live="polite">
            {state.players.length < state.limits.min ? needLine(state.players.length, state.limits.min) : `Waiting for ${hostName} to start.`}
          </p>
        )}
        <p className="notice center" role="alert">{error}</p>
      </div>
    </section>
  );
}

// ── One device: add the players ──────────────────────────────

export function LocalLobby({ state, error, onAdd, onRemove, onSetSettings, onStart }) {
  const [name, setName] = useState('');
  const full = state.players.length >= state.limits.max;

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const res = onAdd(name);
    if (res.ok) setName('');
  };

  return (
    <section className="stack stack--loose">
      <h1 className="page-title">Who&apos;s playing?</h1>

      <div className="stack stack--tight">
        <form className="add" onSubmit={add} noValidate>
          <label className="field">
            <span className="field__label">Add a player</span>
            <span className="add__row">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                autoComplete="off"
                enterKeyHint="done"
                disabled={full}
                autoFocus
              />
              <button className="btn" type="submit" disabled={full || !name.trim()}>Add</button>
            </span>
          </label>
        </form>
        <p className="notice" role="alert">{error}</p>
      </div>

      {state.players.length > 0 && (
        <div className="stack stack--tight">
          <h2 className="section-title">Players ({state.players.length} of {state.limits.max})</h2>
          <ul className="roster">
            {state.players.map((p) => (
              <li className="roster__row" key={p.id}>
                <span className="roster__name">{p.name}</span>
                <button className="link-btn" type="button" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Settings settings={state.settings} players={state.players.length} editable onChange={onSetSettings} idPrefix="local" showTimer={false} />

      <div className="stack stack--tight">
        <button className="btn btn--block" type="button" onClick={onStart} disabled={state.players.length < state.limits.min}>
          Start the game
        </button>
        <p className="muted center" aria-live="polite">{needLine(state.players.length, state.limits.min)}</p>
      </div>
    </section>
  );
}
