// Online play: connects to the Socket.IO server, keeps the seat across reloads and dropped
// connections, and exposes the room state the server sends (each player's own copy).
import { useState, useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { SERVER_URL, SOCKET_PATH, CONFIG_PROBLEM } from './config';
import { loadSession, saveSession, clearSession } from './storage';

const MSG_UNREACHABLE = "Can't reach the game server. Check your connection and try again.";
const MSG_UNAVAILABLE = "Online play isn't available right now.";
const MSG_SESSION_LOST = 'You were away for too long, so your seat was given up. Create or join a room to play again.';
const ACK_TIMEOUT_MS = 10000;

// Resolves once the socket is connected, rejects if it isn't within `ms`.
function whenConnected(socket, ms = 12000) {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const onConnect = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      socket.off('connect', onConnect);
      reject(new Error(MSG_UNREACHABLE));
    }, ms);
    socket.once('connect', onConnect);
  });
}

export default function useOnlineGame() {
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // disconnected | connecting | connected
  const [state, setState] = useState(null); // what the server last sent us
  const [deadline, setDeadline] = useState(null); // wall-clock time the current timer runs out
  const [myPlayerId, setMyPlayerId] = useState(null);
  // True while we are taking our seat back after a reload (a saved session exists).
  const [resuming, setResuming] = useState(() => !!loadSession());
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]); // things that happened to the room: joins, leaves, new host

  const socketRef = useRef(null);
  const seenEvent = useRef(null); // highest room event id already handled

  const resetRoomState = useCallback(() => {
    setState(null);
    setDeadline(null);
    setToasts([]);
    seenEvent.current = null;
  }, []);

  // The first state we get is history, not news. After that, anything newer becomes a toast.
  const noteEvents = useCallback((events) => {
    const latest = events.at(-1)?.id ?? 0;
    if (seenEvent.current === null) {
      seenEvent.current = latest;
      return;
    }
    const fresh = events.filter((e) => e.id > seenEvent.current);
    seenEvent.current = Math.max(seenEvent.current, latest);
    if (!fresh.length) return;
    setToasts((prev) => [...prev, ...fresh].slice(-2));
    setTimeout(() => setToasts((prev) => prev.filter((t) => !fresh.includes(t))), 3800);
  }, []);

  // ── Connect to server ──────────────────────────────────
  const connect = useCallback(() => {
    // Reuse the socket even while it is reconnecting; creating a second one leaks.
    if (socketRef.current) return socketRef.current;

    if (CONFIG_PROBLEM) {
      console.error(`[fictionary] ${CONFIG_PROBLEM}`);
      setError(MSG_UNAVAILABLE);
      setResuming(false);
      return null;
    }

    setConnectionStatus('connecting');
    const s = io(SERVER_URL, {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling'],
      timeout: 10000,
    });

    // Take our seat back, after a reload or after the connection dropped.
    const rejoin = () => {
      const saved = loadSession();
      if (!saved) {
        setResuming(false);
        return;
      }
      s.timeout(ACK_TIMEOUT_MS).emit('rejoinRoom', { code: saved.code, token: saved.token }, (err, res) => {
        if (err) {
          // No answer: keep the saved seat and try again on the next connect.
          setError(MSG_UNREACHABLE);
        } else if (res?.success) {
          setMyPlayerId(res.playerId);
          setError(null);
        } else {
          // The room is gone (server restarted, or we were away too long).
          clearSession();
          resetRoomState();
          setMyPlayerId(null);
          setError(MSG_SESSION_LOST);
        }
        setResuming(false);
      });
    };

    s.on('connect', () => {
      setConnectionStatus('connected');
      setError((prev) => (prev === MSG_UNREACHABLE ? null : prev));
      rejoin();
    });

    s.on('disconnect', () => setConnectionStatus('disconnected'));

    s.on('connect_error', () => {
      // socket.io keeps retrying on its own
      setConnectionStatus('connecting');
      setError(MSG_UNREACHABLE);
      setResuming(false);
    });

    s.on('gameState', (next) => {
      setState(next);
      setDeadline(typeof next.deadlineInMs === 'number' ? Date.now() + next.deadlineInMs : null);
      noteEvents(next.events);
      setError(null);
    });

    socketRef.current = s;
    return s;
  }, [resetRoomState, noteEvents]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    resetRoomState();
    setConnectionStatus('disconnected');
    setMyPlayerId(null);
    setError(null);
  }, [resetRoomState]);

  // Reloaded in the middle of a game: reconnect and take the seat back.
  useEffect(() => {
    // Deferred so the connect-time state updates do not run inside the effect body.
    const start = setTimeout(() => {
      if (loadSession()) connect();
    }, 0);
    // Phones suspend sockets in the background. Nudge the connection when the page comes back.
    const onVisible = () => {
      const s = socketRef.current;
      if (document.visibilityState === 'visible' && s && !s.connected) s.connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(start);
      document.removeEventListener('visibilitychange', onVisible);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connect]);

  // ── Room actions ───────────────────────────────────────
  const roomRequest = useCallback(
    (event, payload) =>
      new Promise((resolve, reject) => {
        const s = socketRef.current || connect();
        if (!s) {
          reject(MSG_UNAVAILABLE);
          return;
        }
        whenConnected(s)
          .then(() => {
            s.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err, response) => {
              if (err) {
                setError(MSG_UNREACHABLE);
                reject(MSG_UNREACHABLE);
              } else if (response?.error) {
                setError(response.error);
                reject(response.error);
              } else {
                saveSession({ code: response.roomCode, token: response.token });
                setMyPlayerId(response.playerId);
                setError(null);
                resolve(response.roomCode);
              }
            });
          })
          .catch((e) => {
            const message = e?.message || MSG_UNREACHABLE;
            setError(message);
            reject(message);
          });
      }),
    [connect],
  );

  const createRoom = useCallback((name) => roomRequest('createRoom', { name }), [roomRequest]);
  const joinRoom = useCallback((code, name) => roomRequest('joinRoom', { code: code.toUpperCase(), name }), [roomRequest]);

  // ── Game actions ───────────────────────────────────────
  const simple = useCallback((event, payload = {}) => {
    socketRef.current?.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err, response) => {
      if (err) setError(MSG_UNREACHABLE);
      else if (response?.error) setError(response.error);
    });
  }, []);

  const setSettings = useCallback((next) => simple('setSettings', next), [simple]);
  const startGame = useCallback(() => simple('startGame'), [simple]);
  const chooseWord = useCallback((index) => simple('chooseWord', { index }), [simple]);
  const pickForPicker = useCallback(() => simple('pickForPicker'), [simple]);
  const endWriting = useCallback(() => simple('endWriting'), [simple]);
  const endVoting = useCallback(() => simple('endVoting'), [simple]);
  const nextRound = useCallback(() => simple('nextRound'), [simple]);
  const endGame = useCallback(() => simple('endGame'), [simple]);
  const resetGame = useCallback(() => simple('resetGame'), [simple]);

  // Resolves with { ok, message } so the screen can show what went wrong and keep what was typed.
  const request = useCallback(
    (event, payload) =>
      new Promise((resolve) => {
        const s = socketRef.current;
        if (!s) {
          resolve({ ok: false, message: MSG_UNREACHABLE });
          return;
        }
        s.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err, res) => {
          if (err) resolve({ ok: false, message: MSG_UNREACHABLE });
          else if (res?.success) resolve({ ok: true });
          else resolve({ ok: false, message: res?.error || 'That did not go through. Try again.', reason: res?.reason });
        });
      }),
    [],
  );

  const submitDefinition = useCallback((text) => request('submitDefinition', { text }), [request]);
  const castVote = useCallback((entryId) => request('castVote', { entryId }), [request]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('leaveRoom', {}, () => {});
    clearSession();
    disconnect();
  }, [disconnect]);

  const clearError = useCallback(() => setError(null), []);

  return {
    connectionStatus,
    state,
    toasts,
    deadline,
    myPlayerId,
    isHost: !!myPlayerId && state?.hostId === myPlayerId,
    resuming,
    error,
    clearError,
    createRoom,
    joinRoom,
    leaveRoom,
    setSettings,
    startGame,
    chooseWord,
    pickForPicker,
    submitDefinition,
    castVote,
    endWriting,
    endVoting,
    nextRound,
    endGame,
    resetGame,
  };
}
