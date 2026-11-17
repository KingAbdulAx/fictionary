// One-device play. The same Room class the server uses runs here in the browser, with handoff on:
// no timers, and each player's private view comes from room.state(theirId) while they hold the phone.
import { useState, useEffect, useCallback } from 'react';
import { Room } from '../server/room.js';
import WORDS from '../server/words.json';

export default function useGame() {
  const [room] = useState(() => new Room({ code: 'LOCAL', words: WORDS, handoff: true, settings: { timer: 0 } }));
  const [state, setState] = useState(() => room.state());
  const [lobbyError, setLobbyError] = useState(null);

  useEffect(() => {
    // Only unsubscribe on cleanup. Destroying the room here would silence it for good when React
    // StrictMode re-runs the effect in development. A one-device room has no timers to stop.
    return room.subscribe((r) => setState(r.state()));
  }, [room]);

  // Lobby actions report their error (if any) so the form can show it.
  const run = useCallback((fn) => {
    const res = fn();
    setLobbyError(res && !res.ok ? res.error : null);
    return res;
  }, []);

  const addPlayer = useCallback((name) => run(() => room.addPlayer(name)), [room, run]);
  const removePlayer = useCallback((pid) => run(() => room.removePlayer(pid)), [room, run]);
  const setSettings = useCallback((next) => run(() => room.setSettings(room.hostId, next)), [room, run]);
  const startGame = useCallback(() => run(() => room.start(room.hostId)), [room, run]);
  const nextRound = useCallback(() => room.nextRound(room.hostId), [room]);
  const endGame = useCallback(() => room.endGame(room.hostId), [room]);
  const playAgain = useCallback(() => room.reset(room.hostId), [room]);

  // Private actions, done by whoever holds the phone.
  const chooseWord = useCallback((pid, index) => room.choose(pid, index), [room]);
  const submitDefinition = useCallback((pid, text) => room.submit(pid, text), [room]);
  const castVote = useCallback((pid, entryId) => room.vote(pid, entryId), [room]);
  // What one player may see right now (call it during render; `state` changing re-renders).
  const viewFor = (pid) => room.state(pid);

  return {
    state,
    lobbyError,
    viewFor,
    addPlayer,
    removePlayer,
    setSettings,
    startGame,
    chooseWord,
    submitDefinition,
    castVote,
    nextRound,
    endGame,
    playAgain,
  };
}
