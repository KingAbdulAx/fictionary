import { useState } from 'react';
import { DEF_MAX_CHARS } from '../../server/rules.js';
import { dictionaryStyle } from '../../server/words.js';
import { styleHint } from '../labels';

// A writer's made-up definition. `onSubmit(text)` resolves (or returns) { ok, message }.
export function DefinitionForm({ word, hints, lockedText, onSubmit }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (lockedText) {
    return (
      <div className="paper card stack stack--tight">
        <p className="field__label">Your definition is in</p>
        <p className="entry__text">{dictionaryStyle(lockedText)}</p>
        <p className="muted small">Shown to everyone in dictionary style, so the real one can&apos;t be spotted by its full stop.</p>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    const res = await onSubmit(text);
    setBusy(false);
    if (!res?.ok) setError(res?.message || 'That did not go through. Try again.');
  };

  const onKeyDown = (e) => {
    // Enter sends (a definition is one sentence); Shift+Enter still makes a new line.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form.requestSubmit();
    }
  };

  const length = text.length;

  return (
    <form className="paper card stack" onSubmit={submit} noValidate>
      <label className="field">
        <span className="field__label">Your made-up definition of {word.word}</span>
        <textarea
          className="input textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={onKeyDown}
          maxLength={DEF_MAX_CHARS}
          rows={3}
          autoComplete="off"
          enterKeyHint="send"
          aria-describedby="def-count def-hint"
          autoFocus
        />
      </label>
      <div className="def__meta">
        <p id="def-hint" className="muted small">{hints ? styleHint(word.pos) : 'Make it sound real.'}</p>
        <p id="def-count" className={`def__count ${length >= DEF_MAX_CHARS - 10 ? 'def__count--near' : ''}`}>
          {length}/{DEF_MAX_CHARS}<span className="sr-only"> characters</span>
        </p>
      </div>
      <button className="btn btn--block" type="submit" disabled={busy || !text.trim()}>
        {busy ? 'One moment' : 'Submit my definition'}
      </button>
      <p className="notice" role="alert">{error}</p>
    </form>
  );
}

// The picker during writing: they know the answer, so they just watch.
export function PickerWatch({ answer }) {
  return (
    <div className="stack">
      <div className="paper card stack stack--tight">
        <p className="field__label">The real definition. Only you can see it.</p>
        <p className="entry__text">{answer}</p>
      </div>
      <h2 className="straight">Keep a straight face.</h2>
      <p className="muted">Everyone else is writing a definition to pass off as this one.</p>
    </div>
  );
}
