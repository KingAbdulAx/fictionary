// The Socket.IO game server, built as a function so tests can start one on any port.
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';

import { Room } from './room.js';

const MAX_ROOMS = 500;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000;

/** "https://a.com, https://b.com" -> ['https://a.com', 'https://b.com'] */
export function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Browsers send an Origin header on WebSocket upgrades, but CORS headers do not apply to them,
 * so the allow-list has to be checked by hand. Requests with no Origin are not browsers (scripts,
 * health checks, tests) and are let through. An empty allow-list means "any origin".
 */
export function originAllowed(allowed, origin) {
  return !allowed.length || !origin || allowed.includes(origin);
}

export function createGameServer({ words, allowedOrigins = [], timing, name = 'Fictionary' } = {}) {
  const corsOrigin = allowedOrigins.length ? allowedOrigins : '*';
  const rooms = new Map();

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin }));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 1e4,
    allowRequest: (req, callback) => callback(null, originAllowed(allowedOrigins, req.headers.origin)),
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', game: name, rooms: rooms.size, words: words.length });
  });

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (rooms.has(code));
    return code;
  }

  // Each player gets their own copy of the state: it carries their own answer, never anyone else's.
  function broadcast(room) {
    for (const p of room.players) {
      if (p.socketId) io.to(p.socketId).emit('gameState', room.state(p.id));
    }
  }

  function makeRoom() {
    const code = generateRoomCode();
    const room = new Room({
      code,
      words,
      timing,
      onChange: broadcast,
      onEmpty: () => rooms.delete(code),
    });
    room.lastActive = Date.now();
    rooms.set(code, room);
    return room;
  }

  // Rooms nobody has touched for hours are dropped.
  const sweeper = setInterval(() => {
    for (const [code, room] of rooms) {
      if (Date.now() - room.lastActive > ROOM_IDLE_MS) {
        room.destroy();
        rooms.delete(code);
      }
    }
  }, 15 * 60 * 1000);
  sweeper.unref();

  io.on('connection', (socket) => {
    let session = null; // { room, pid }

    const body = (data) => (data && typeof data === 'object' ? data : {});

    const attach = (room, player) => {
      player.socketId = socket.id;
      session = { room, pid: player.id };
      socket.join(room.code);
      room.lastActive = Date.now();
      socket.emit('gameState', room.state(player.id));
    };

    // Runs a player or host action on the current room and acks with the result.
    const act = (callback, fn) => {
      if (!session || !rooms.has(session.room.code)) return callback?.({ error: 'Room not found.' });
      session.room.lastActive = Date.now();
      const result = fn(session.room, session.pid);
      if (result.ok === false) callback?.({ error: result.error || result.message, reason: result.reason });
      else callback?.({ success: true });
    };

    socket.on('createRoom', (data, callback) => {
      if (session) return callback?.({ error: 'Already in a room.' });
      if (rooms.size >= MAX_ROOMS) return callback?.({ error: 'The server is busy. Try again in a few minutes.' });
      const room = makeRoom();
      const added = room.addPlayer(body(data).name);
      if (!added.ok) {
        room.destroy();
        rooms.delete(room.code);
        return callback?.({ error: added.error });
      }
      attach(room, added.player);
      callback?.({ success: true, roomCode: room.code, playerId: added.player.id, token: added.player.token });
    });

    socket.on('joinRoom', (data, callback) => {
      if (session) return callback?.({ error: 'Already in a room.' });
      const { code, name: playerName } = body(data);
      if (typeof code !== 'string' || !code.trim() || typeof playerName !== 'string' || !playerName.trim()) {
        return callback?.({ error: 'A room code and a name are both needed.' });
      }
      const room = rooms.get(code.trim().toUpperCase());
      if (!room) return callback?.({ error: "That room doesn't exist. Check the code." });
      const added = room.addPlayer(playerName);
      if (!added.ok) return callback?.({ error: added.error });
      attach(room, added.player);
      callback?.({ success: true, roomCode: room.code, playerId: added.player.id, token: added.player.token });
    });

    // A returning player (reload or dropped connection) takes their seat back.
    socket.on('rejoinRoom', (data, callback) => {
      const { code, token } = body(data);
      const room = typeof code === 'string' ? rooms.get(code.trim().toUpperCase()) : null;
      if (!room || typeof token !== 'string') return callback?.({ error: 'Room not found.' });
      const back = room.reconnect(token);
      if (!back.ok) return callback?.({ error: back.error });
      attach(room, back.player);
      callback?.({ success: true, roomCode: room.code, playerId: back.player.id });
    });

    socket.on('setSettings', (data, callback) => {
      const { turns, timer, hints } = body(data);
      act(callback, (room, pid) => room.setSettings(pid, { turns, timer, hints }));
    });
    socket.on('startGame', (data, callback) => act(callback, (room, pid) => room.start(pid)));
    socket.on('chooseWord', (data, callback) => act(callback, (room, pid) => room.choose(pid, body(data).index)));
    socket.on('pickForPicker', (data, callback) => act(callback, (room, pid) => room.pickForPicker(pid)));
    socket.on('submitDefinition', (data, callback) => {
      const { text } = body(data);
      act(callback, (room, pid) => room.submit(pid, typeof text === 'string' ? text.slice(0, 400) : ''));
    });
    socket.on('castVote', (data, callback) => {
      const { entryId } = body(data);
      act(callback, (room, pid) => room.vote(pid, typeof entryId === 'string' ? entryId : ''));
    });
    socket.on('endWriting', (data, callback) => act(callback, (room, pid) => room.endWriting(pid)));
    socket.on('endVoting', (data, callback) => act(callback, (room, pid) => room.endVoting(pid)));
    socket.on('nextRound', (data, callback) => act(callback, (room, pid) => room.nextRound(pid)));
    socket.on('endGame', (data, callback) => act(callback, (room, pid) => room.endGame(pid)));
    socket.on('resetGame', (data, callback) => act(callback, (room, pid) => room.reset(pid)));

    socket.on('leaveRoom', (data, callback) => {
      if (!session) return callback?.({ error: 'Not in a room.' });
      const { room, pid } = session;
      session = null;
      socket.leave(room.code);
      room.removePlayer(pid);
      callback?.({ success: true });
    });

    socket.on('disconnect', () => {
      if (!session) return;
      const { room, pid } = session;
      const player = room.players.find((p) => p.id === pid);
      // Ignore if the player has already come back on a newer socket.
      if (player && player.socketId === socket.id) room.markDisconnected(pid);
    });
  });

  return {
    app,
    httpServer,
    io,
    rooms,
    listen: (port) => new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port))),
    close: () =>
      new Promise((resolve) => {
        clearInterval(sweeper);
        for (const room of rooms.values()) room.destroy();
        io.close(() => resolve());
      }),
  };
}
