# Fictionary

A bluffing word game for phones and browsers. One player picks an obscure word; everyone else invents a definition for it; then everybody votes for the one they think is real. Built with React + Vite, with a Socket.IO server for online rooms. Meant to live at **https://games.azedlabs.com/fictionary/**.

Rules follow the "Fictionary" section of the *Game night games* house rules doc. Same architecture as its siblings [Blank Slate](https://github.com/KingAbdulAx/blank-slate) and [Renga](https://github.com/KingAbdulAx/shiritori-web).

---

## How to play

1. **3 to 10 players.** Players take turns being the **picker**, in a fixed order, so everyone gets a turn.
2. The picker is shown three words with their real definitions and chooses one. Everyone sees the word and its part of speech.
3. Everyone except the picker writes a made-up definition that might pass for the real one. The picker knows the answer, so they keep a straight face.
4. All the definitions, real one included, are shown as a numbered list, in the same order on every phone. Everyone except the picker votes for the one they think is real. You can't vote for your own.
5. The reveal stamps the real definition and names the author of every fake and who fell for it.

| What happened | Points |
| ------------- | ------ |
| You voted for the real definition | **1 point** |
| Someone voted for your made-up definition | **1 point per vote** |

6. The game ends when every player has picked the word `turns` times (the host chooses 1, 2 or 3 turns each). Most points wins; a tie is a shared win. "Best bluffer" and "Sharpest eye" awards are shown at the end, for fun only.

**Two ways to play**

| Mode | How it works |
| ---- | ------------ |
| **Online** | One player creates a room and shares the 6-character code or an invite link (`?room=CODE`). Everyone plays on their own phone. The host sets turns each, a writing timer (60, 90 or 120 seconds, or no timer; voting gets 60 seconds when the timer is on) and whether writers see a style hint. The host can end writing or voting early, and can pick a word for a picker who has gone offline. |
| **One device** | Add the players' names and pass one phone around. The picker chooses in private, then each writer writes in private, then each voter votes in private (each on a "pass the phone to Ben" screen). The reveal is shared. No timers. |

**Reconnecting.** Each online player has a private token in sessionStorage. Reload or lose signal and you take your seat back in whatever phase the room is in, with your definition and vote intact. A dropped player keeps their seat for 60 seconds.

## Run it locally

```bash
npm install
(cd server && npm install)
npm run dev:all        # game server on :3001 and Vite on :5173
```

Open http://localhost:5173. To try online play alone, open a few private windows (each has its own sessionStorage, so each is its own player).

| Script | What it does |
| ------ | ------------ |
| `npm run dev` / `npm run server` | Vite only / the game server only |
| `npm run lint` | ESLint |
| `npm test` | Unit and socket tests (`node --test server/test/*.test.js`) |
| `npm run test:e2e` | Playwright, against a `/fictionary/` build and a real server |
| `npm run build` | Checks the word bank, then builds to `dist/` |
| `npm run build:hub` | Same with `VITE_BASE=/fictionary/` |
| `npm run words` / `npm run check:words` | Rebuild / check the word bank (see below) |

### End-to-end tests

`npm run test:e2e` builds the app with `VITE_BASE=/fictionary/`, serves it with `scripts/serve-vercel.mjs` (which applies the `vercel.json` rewrites, so the hosting contract is tested for real), and starts the game server with `ALLOWED_ORIGINS=http://localhost:4173` and `TIMER_SECOND_MS=100` (a "60-second" timer lasts 6 seconds). The specs cover: both hosting paths, fonts and favicon, the invite link, storage key prefixes, a three-player online round with points checked, a reload in every phase (choosing, writing, voting, reveal) landing back in the same seat, the writing timer running out, and a full one-device round.

Chromium for Playwright must be installed (`npx playwright install chromium`) unless your machine already has it.

## Environment variables

**Frontend (Vite, baked in at build time; set in Vercel):**

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `VITE_SERVER_URL` | `http://localhost:3001` in dev; **required** in production | The Socket.IO game server, no trailing slash. A production build without it disables online play and logs why in the console (one-device play still works). |
| `VITE_BASE` | `/` | Public base path. `/fictionary/` for the hub. |
| `VITE_SOCKET_PATH` | `/socket.io` | Socket.IO path on the server. |

**Game server (set on the server, e.g. in Coolify):**

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `ALLOWED_ORIGINS` | any origin | Comma-separated browser origins allowed to connect, WebSocket upgrades included. Production: `https://games.azedlabs.com`. |
| `PORT` | `3001` | Listen port. |
| `TIMER_SECOND_MS` | `1000` | Test only: milliseconds per timer second. Leave unset in production. |

See `.env.example`.

## Hosting contract

Served at `https://games.azedlabs.com/fictionary/`. One repo per game, each its own Vercel project, with the hub forwarding the path. (Deployment itself is done outside this repo.)

- **Slug:** `fictionary`. Build with `VITE_BASE=/fictionary/` (`npm run build:hub`).
- **`vercel.json`** is in this repo, exactly:
  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "rewrites": [
      { "source": "/fictionary", "destination": "/index.html" },
      { "source": "/fictionary/", "destination": "/index.html" },
      { "source": "/fictionary/:path+", "destination": "/:path+" }
    ]
  }
  ```
- **Storage keys** are all prefixed `fictionary.`: `fictionary.session` (sessionStorage, the online seat) and `fictionary.name` (localStorage, the last name used). Every game shares one origin.
- **Backend:** Node + Socket.IO in `server/` (base directory `server/`, port `3001`, `npm start`). `server/Dockerfile` is a fallback build that copies `words.json` along with the code. Browsers do not apply CORS to WebSocket upgrades, so `allowRequest` in `server/app.js` checks the `Origin` header itself (covered by `server/test/server.test.js`).
- **Invite links** are `https://games.azedlabs.com/fictionary/?room=CODE`.
- **Health check:** `GET /health` returns `{ status, game, rooms, words }`.

Rooms live in memory, so run a single server instance. Idle rooms are swept after 3 hours.

## The word bank

`server/words.json` holds 412 obscure-but-real English words, each with a part of speech and a one-sentence definition. It is generated, never edited by hand:

- `data/candidates.txt`: the words to include, one per line (`word` or `word | pos` or `word | pos | sense`).
- `data/overrides.txt`: `word | definition` for the few cases where the WordNet gloss is jargon-heavy or picks an unhelpful sense. Each override must stay a faithful paraphrase of a WordNet sense.
- `npm run words` looks every candidate up in WordNet 3.1 (the `wordnet-db` dev dependency), trims the gloss to its first clause, removes parenthetical asides, writes it in dictionary style and validates the result.
- `npm run check:words` validates `server/words.json` (also run by `npm run build` and by the server at start-up): at least 300 words, no duplicates, 12 to 110 characters, one sentence, dictionary style, the definition never contains the word itself, and a backstop filter for sensitive wording.

**To add words:** add lines to `data/candidates.txt` (and an override if needed), run `npm run words`, then `npm run check:words` and `npm test`, and commit the regenerated `server/words.json`.

### Data source and licence

Definitions are from **WordNet 3.1**, Princeton University (https://wordnet.princeton.edu/), some lightly paraphrased via `data/overrides.txt`. The app footer credits it: "Definitions from WordNet, Princeton University". The full notice is in [`LICENSE-WORDNET.txt`](LICENSE-WORDNET.txt) and reproduced here, as the licence requires:

```
WordNet Release 3.1

This software and database is being provided to you, the LICENSEE, by
Princeton University under the following license.  By obtaining, using
and/or copying this software and database, you agree that you have
read, understood, and will comply with these terms and conditions.:

Permission to use, copy, modify and distribute this software and
database and its documentation for any purpose and without fee or
royalty is hereby granted, provided that you agree to comply with
the following copyright notice and statements, including the disclaimer,
and that the same appear on ALL copies of the software, database and
documentation, including modifications that you make for internal
use or for distribution.

WordNet 3.1 Copyright 2011 by Princeton University.  All rights reserved.

THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON
UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR
IMPLIED.  BY WAY OF EXAMPLE, BUT NOT LIMITATION, PRINCETON
UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF MERCHANT-
ABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE
OF THE LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT
INFRINGE ANY THIRD PARTY PATENTS, COPYRIGHTS, TRADEMARKS OR
OTHER RIGHTS.

The name of Princeton University or Princeton may not be used in
advertising or publicity pertaining to distribution of the software
and/or database.  Title to copyright in this software, database and
any associated documentation shall at all times remain with
Princeton University and LICENSEE agrees to preserve same.
```

## Decisions

- **Picker rotation, from the doc.** One player per round picks the word, in a fixed turn order, and sits out writing and voting because they know the answer. If a picker leaves before choosing, the next player picks instead.
- **The host picks turns each, not raw rounds.** "Everyone picks once / twice / three times" keeps the turns fair; the number of words follows from the number of players (shown in the lobby).
- **Fakes are shown in dictionary style.** Every definition, real or made up, is displayed with a capital first letter and one full stop, so punctuation and capitalisation aren't a tell. Players type freely; the styling is applied on display.
- **Real definitions are capped at 110 characters and parentheticals are stripped**, for the same reason: a long, precise gloss with "(especially in botany)" would give itself away. Players are held to the same 110-character limit.
- **Duplicate definitions are refused** after normalising case, punctuation and a leading "a/an/the", with the same message whether the clash is with the real one or another player's, so the message leaks nothing.
- **The ballot is shuffled once per round for the whole room**, so "number 3" means the same thing on every phone and players can talk about it out loud.
- **Votes and definitions are final once sent**, and the ballot sent to voters carries only number and text: no author, no "real" flag.
- **Awards are display-only.** "Best bluffer" (most votes drawn) and "Sharpest eye" (most real definitions found) never change the score.
- **No runtime dictionary API.** The bank is a checked-in, validated JSON file, so there is no network dependency, no rate limit and no surprise definitions mid-game.
- **Timers are optional.** With a timer, writing closes when it runs out (latecomers are skipped and named at the reveal) and voting gets 60 seconds. With "No timer", the host moves things on.

## Project structure

```
├── index.html
├── vercel.json                  # the hosting contract
├── LICENSE-WORDNET.txt          # WordNet copyright notice and licence
├── playwright.config.js         # e2e: sub-path build + real server
├── e2e/                         # Playwright specs
├── data/                        # word candidates and hand overrides
├── scripts/                     # build-words, check-words, serve-vercel (used by e2e)
├── server/                      # Node + Express + Socket.IO (deployed on its own)
│   ├── index.js                 # entry: env, word bank check, listen
│   ├── app.js                   # sockets, rooms, CORS and WebSocket origin check, health
│   ├── room.js                  # the game engine: phases, secrecy, timers, reconnects (no sockets)
│   ├── rules.js                 # pure: definition checks, ballot, votes, scoring, ranking, awards
│   ├── words.js, words.json     # the word bank and its validator
│   └── test/                    # node --test suites
└── src/
    ├── useGame.js               # one device: runs the same Room class in the browser
    ├── useOnlineGame.js         # online client: connect, rejoin, actions
    ├── config.js, storage.js    # build config; prefixed storage keys
    └── components/              # Home, Lobbies, Headword, Choosing, Writing, Voting, Reveal, ...
```

## Design

Azed Labs design DNA: cream and charcoal, slate / sage / amber, Montserrat 800 and Inter, capsule controls, paper surfaces with hairlines, dashed dividers. The signature is the dictionary page: the word set large as a headword with its part of speech in italics, candidate definitions as numbered entries, and at the reveal an ink **Real** stamp that lands on the true one (static under `prefers-reduced-motion`). Everything else stays quiet, and the next action is always the most prominent thing on screen. No Azed Labs logo files are used.

## Tech

React 19, Vite 7, vanilla CSS with tokens, Montserrat + Inter (self-hosted via Fontsource), Socket.IO, Playwright.

## Licence

Code: MIT. Word definitions: WordNet 3.1 licence (see above and `LICENSE-WORDNET.txt`).
