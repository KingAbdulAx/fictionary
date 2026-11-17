// Entry point for the game server (Coolify: base directory server/, port 3001).
import { readFileSync } from 'node:fs';

import { createGameServer, parseOrigins } from './app.js';
import { validateWords } from './words.js';

const PORT = Number(process.env.PORT) || 3001;
// Comma-separated list of allowed browser origins, e.g. https://games.azedlabs.com.
// Unset means any origin may connect. Enforced for WebSocket upgrades too (see app.js).
const ALLOWED_ORIGINS = parseOrigins(process.env.ALLOWED_ORIGINS);

const words = JSON.parse(readFileSync(new URL('./words.json', import.meta.url), 'utf8'));
const problems = validateWords(words);
if (problems.length) {
  console.error(`words.json has ${problems.length} problem(s):
  ${problems.join('
  ')}`);
  process.exit(1);
}

const server = createGameServer({ words, allowedOrigins: ALLOWED_ORIGINS });
const port = await server.listen(PORT);
console.log(`Fictionary server listening on port ${port} (${words.length} words, origins: ${ALLOWED_ORIGINS.join(', ') || 'any'})`);

// Coolify stops containers with SIGTERM: close cleanly so sockets get a proper goodbye.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close().then(() => process.exit(0)));
}
