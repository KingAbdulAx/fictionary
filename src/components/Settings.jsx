import { TURN_CHOICES, TIMER_CHOICES } from '../../server/room.js';
import { turnsLabel, timerLabel } from '../labels';

function Chips({ legend, name, options, value, onChange }) {
  return (
    <fieldset className="setting">
      <legend className="field__label">{legend}</legend>
      <div className="chips">
        {options.map(([v, label]) => (
          <label className="chip" key={String(v)}>
            <input className="sr-only" type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Host settings: how many times each player picks the word, the writing timer, and style hints.
// Guests see a one-line summary. One-device play has no timer, so it is not offered there.
export default function Settings({ settings, players, editable, onChange, idPrefix, showTimer = true }) {
  const words = players * settings.turns;
  const summary = [turnsLabel(settings.turns), showTimer ? timerLabel(settings.timer) : null, settings.hints ? 'style hints on' : 'no style hints']
    .filter(Boolean)
    .join(', ');

  if (!editable) {
    return (
      <div className="stack stack--tight">
        <h2 className="section-title">Settings</h2>
        <p className="muted">{summary.charAt(0).toUpperCase() + summary.slice(1)}. The host chooses.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <h2 className="section-title">Settings</h2>
      <Chips
        legend="Turns each"
        name={`${idPrefix}-turns`}
        options={TURN_CHOICES.map((n) => [n, String(n)])}
        value={settings.turns}
        onChange={(turns) => onChange({ turns })}
      />
      {showTimer && (
        <Chips
          legend="Writing timer"
          name={`${idPrefix}-timer`}
          options={TIMER_CHOICES.map((t) => [t, t ? `${t}s` : 'No timer'])}
          value={settings.timer}
          onChange={(timer) => onChange({ timer })}
        />
      )}
      <Chips
        legend="Style hints for writers"
        name={`${idPrefix}-hints`}
        options={[[true, 'On'], [false, 'Off']]}
        value={settings.hints}
        onChange={(hints) => onChange({ hints })}
      />
      <p className="muted small">
        Everyone picks the word {settings.turns === 1 ? 'once' : `${settings.turns} times`}
        {players >= 3 ? `, so ${words} words with ${players} players.` : '.'}
      </p>
    </div>
  );
}
