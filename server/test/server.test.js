import test from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';

import { createGameServer, originAllowed, parseOrigins } from '../app.js';

const WORDS = Array.from({ length: 12 }, (_, i) => ({
  word: `testword${String.fromCharCode(97 + i)}`,
  pos: 'n',
  definition: `The genuine meaning number ${i + 1}.`,
}));

const ALLOWED = 'https://games.azedlabs.com';

async function boot(opts = {}) {
  const server = createGameServer({ words: WORDS, ...opts });
  const port = await server.listen(0);
  return { server, url: `http://127.0.0.1:${port}` };
}

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));
const ask = (socket, event, data) => new Promise((resolve) => socket.emit(event, data, resolve));
const settle = () => new Promise((r) => setTimeout(r, 60));

function client(url, opts = {}) {
  const socket = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true, ...opts });
  const states = [];
  socket.on('gameState', (s) => states.push(s));
  return { socket, states, last: () => states.at(-1) };
}

/** Ada creates a room, Ben and Chi join. Returns the three clients with their join replies. */
async function table(url, names = ['Ada', 'Ben', 'Chi']) {
  const players = [];
  let code = null;
  for (const name of names) {
    const c = client(url);
    await once(c.socket, 'connect');
    const res = code ? await ask(c.socket, 'joinRoom', { code, name }) : await ask(c.socket, 'createRoom', { name });
    assert.ok(res.success, res.error);
    code = res.roomCode;
    players.push({ name, ...c, id: res.playerId, token: res.token });
  }
  await settle();
  return { players, code };
}

// ── Origins ────────────────────────────────────────────────

test('parseOrigins and originAllowed', () => {
  assert.deepEqual(parseOrigins(' https://a.com/ , https://b.com,, '), ['https://a.com', 'https://b.com']);
  assert.deepEqual(parseOrigins(undefined), []);
  assert.equal(originAllowed([], 'https://anything.dev'), true); // unset: open
  assert.equal(originAllowed([ALLOWED], ALLOWED), true);
  assert.equal(originAllowed([ALLOWED], 'https://example.com'), false);
  assert.equal(originAllowed([ALLOWED], undefined), true); // not a browser
});

test('a websocket from https://example.com is refused; the allowed origin connects', async () => {
  const { server, url } = await boot({ allowedOrigins: [ALLOWED] });
  try {
    const bad = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { Origin: 'https://example.com' } });
    assert.ok(await once(bad, 'connect_error'));
    assert.equal(bad.connected, false);
    bad.close();

    const good = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { Origin: ALLOWED } });
    await once(good, 'connect');
    assert.equal(good.connected, true);
    good.close();
  } finally {
    await server.close();
  }
});

test('the polling handshake is refused too for a wrong origin', async () => {
  const { server, url } = await boot({ allowedOrigins: [ALLOWED] });
  try {
    const res = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: 'https://example.com' } });
    assert.equal(res.status, 403);
    const ok = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: ALLOWED } });
    assert.equal(ok.status, 200);
  } finally {
    await server.close();
  }
});

test('health reports the game and its word count', async () => {
  const { server, url } = await boot();
  try {
    const body = await (await fetch(`${url}/health`)).json();
    assert.equal(body.status, 'ok');
    assert.equal(body.game, 'Fictionary');
    assert.equal(body.words, WORDS.length);
  } finally {
    await server.close();
  }
});

// ── A whole round over real sockets ────────────────────────

test('a round over sockets: secrets stay secret until the reveal, then the points add up', async () => {
  const { server, url } = await boot();
  const { players } = await table(url);
  const [ada, ben, chi] = players;
  try {
    assert.match((await ask(ben.socket, 'startGame')).error, /host/);
    assert.ok((await ask(ada.socket, 'startGame')).success);
    await settle();

    // Ada picks first. Only she sees the offer and the real definitions.
    assert.equal(ada.last().phase, 'choosing');
    assert.equal(ada.last().offer.length, 3);
    assert.equal(ben.last().offer, null);
    const realDefinition = ada.last().offer[0].definition;
    assert.ok(!JSON.stringify(ben.states).includes(realDefinition), 'Ben saw the real definition while choosing');
    assert.match((await ask(ben.socket, 'chooseWord', { index: 0 })).error, /not your turn/);
    assert.ok((await ask(ada.socket, 'chooseWord', { index: 0 })).success);
    await settle();

    assert.equal(ada.last().phase, 'writing');
    assert.equal(ada.last().answer, realDefinition);
    assert.equal(ben.last().answer, null);
    assert.equal(ben.last().word.word, ada.last().word.word);

    assert.equal((await ask(ada.socket, 'submitDefinition', { text: 'I know it' })).reason, 'picker');
    assert.equal((await ask(ben.socket, 'submitDefinition', { text: realDefinition })).reason, 'duplicate');
    assert.ok((await ask(ben.socket, 'submitDefinition', { text: 'a zzbenfakezz for sailors' })).success);
    await settle();
    // Chi has not written: Ben's text must not have reached Chi (or Ada) yet.
    assert.ok(!JSON.stringify(chi.states).includes('zzbenfakezz'), 'Chi saw Ben’s fake during writing');
    assert.ok(!JSON.stringify(ada.states).includes('zzbenfakezz'), 'Ada saw Ben’s fake during writing');
    assert.equal(ben.last().mine.text, 'a zzbenfakezz for sailors');
    assert.deepEqual(chi.last().players.map((p) => p.done), [false, true, false]);

    assert.ok((await ask(chi.socket, 'submitDefinition', { text: 'A zzchifakezz in the attic' })).success);
    await settle();

    // Voting: nothing in anyone's payload says who wrote what or which one is real.
    for (const p of players) {
      const s = p.last();
      assert.equal(s.phase, 'voting');
      assert.equal(s.ballot.length, 3);
      const json = JSON.stringify(s);
      assert.ok(!json.includes('"authorName"'), `${p.name} got authorName`);
      assert.ok(!json.includes('"authorId"'), `${p.name} got authorId`);
      assert.ok(!json.includes('"real"'), `${p.name} got a real flag`);
      for (const e of s.ballot) assert.deepEqual(Object.keys(e).sort(), ['id', 'n', 'text']);
      const others = players.filter((o) => o !== p).map((o) => o.id);
      const ballotJson = JSON.stringify(s.ballot);
      for (const id of others) assert.ok(!ballotJson.includes(id), `${p.name}'s ballot carries another player's id`);
      for (const tok of players.map((o) => o.token)) assert.ok(!json.includes(tok), 'a token leaked');
    }
    // Fakes are shown in dictionary style, and everybody sees the same order.
    assert.ok(ben.last().ballot.some((e) => e.text === 'A zzbenfakezz for sailors.'));
    assert.deepEqual(ben.last().ballot, chi.last().ballot);
    assert.equal(ada.last().myEntry, null);
    const benEntry = ben.last().myEntry;
    const chiEntry = chi.last().myEntry;
    assert.ok(benEntry && chiEntry && benEntry !== chiEntry);
    const realEntry = ben.last().ballot.find((e) => e.text === realDefinition).id;

    assert.match((await ask(ada.socket, 'castVote', { entryId: realEntry })).error, /sit this vote out/);
    assert.equal((await ask(ben.socket, 'castVote', { entryId: benEntry })).reason, 'own');
    assert.ok((await ask(ben.socket, 'castVote', { entryId: chiEntry })).success); // Chi fooled Ben
    assert.equal((await ask(ben.socket, 'castVote', { entryId: realEntry })).reason, 'twice');
    assert.ok((await ask(chi.socket, 'castVote', { entryId: realEntry })).success); // Chi found it
    await settle();

    for (const p of players) {
      const s = p.last();
      assert.equal(s.phase, 'reveal');
      assert.equal(s.answer, realDefinition);
      const real = s.ballot.find((e) => e.real);
      assert.equal(real.id, realEntry);
      assert.deepEqual(real.voters, [chi.id]);
      const chiFake = s.ballot.find((e) => e.authorId === chi.id);
      assert.equal(chiFake.authorName, 'Chi');
      assert.deepEqual(chiFake.voters, [ben.id]);
      assert.deepEqual(s.players.map((x) => x.score), [0, 0, 2]); // Chi: 1 for the real one, 1 for fooling Ben
      assert.deepEqual(s.players.map((x) => x.lastPoints), [0, 0, 2]);
    }
    assert.match((await ask(ben.socket, 'nextRound')).error, /host/);
    assert.ok((await ask(ada.socket, 'nextRound')).success);
    await settle();
    assert.equal(ben.last().phase, 'choosing');
    assert.equal(ben.last().pickerId, ben.id);
  } finally {
    for (const p of players) p.socket.close();
    await server.close();
  }
});

test('rejoin: a token takes the seat back on a new socket, a wrong token does not', async () => {
  const { server, url } = await boot();
  const { players, code } = await table(url);
  const [ada, ben] = players;
  const extra = [];
  try {
    await ask(ada.socket, 'startGame');
    await ask(ada.socket, 'chooseWord', { index: 1 });
    await ask(ben.socket, 'submitDefinition', { text: 'Remembered after a reload' });
    ben.socket.close(); // the phone drops
    await settle();
    assert.equal(ada.last().players[1].connected, false);

    const again = client(url);
    extra.push(again);
    await once(again.socket, 'connect');
    assert.ok((await ask(again.socket, 'rejoinRoom', { code, token: 'wrong' })).error);
    const back = await ask(again.socket, 'rejoinRoom', { code: code.toLowerCase(), token: ben.token });
    assert.ok(back.success);
    assert.equal(back.playerId, ben.id);
    await settle();
    assert.equal(again.last().phase, 'writing');
    assert.equal(again.last().mine.text, 'Remembered after a reload');
    assert.equal(ada.last().players[1].connected, true);
  } finally {
    for (const c of [...players, ...extra]) c.socket.close();
    await server.close();
  }
});

test('join errors are plain sentences: unknown room, taken name, missing fields', async () => {
  const { server, url } = await boot();
  const { players, code } = await table(url, ['Ada']);
  const b = client(url);
  try {
    await once(b.socket, 'connect');
    assert.match((await ask(b.socket, 'joinRoom', { code: 'NOPE22', name: 'Ben' })).error, /doesn't exist/);
    assert.match((await ask(b.socket, 'joinRoom', { code, name: 'ada' })).error, /taken/);
    assert.match((await ask(b.socket, 'joinRoom', {})).error, /needed/);
    assert.match((await ask(b.socket, 'joinRoom', 'garbage')).error, /needed/);
    assert.match((await ask(b.socket, 'startGame')).error, /Room not found/);
    assert.match((await ask(players[0].socket, 'createRoom', { name: 'Again' })).error, /Already/);
  } finally {
    b.socket.close();
    for (const p of players) p.socket.close();
    await server.close();
  }
});
