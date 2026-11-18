import { defineConfig } from '@playwright/test';

// The e2e run uses a production build under /fictionary/, served with the vercel.json rewrites,
// talking to a real game server that only accepts that origin. That is the deployed shape.
// TIMER_SECOND_MS=100 makes a 60-second timer last 6 seconds.
const WEB = 4173;
const API = 3101;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB}`,
    trace: 'off',
    viewport: { width: 390, height: 844 },
  },
  webServer: [
    {
      command: 'node server/index.js',
      url: `http://localhost:${API}/health`,
      env: { PORT: String(API), ALLOWED_ORIGINS: `http://localhost:${WEB}`, TIMER_SECOND_MS: '100' },
      reuseExistingServer: false,
    },
    {
      command: `npx vite build --outDir dist-e2e --emptyOutDir && node scripts/serve-vercel.mjs dist-e2e ${WEB}`,
      url: `http://localhost:${WEB}/fictionary/`,
      env: { VITE_BASE: '/fictionary/', VITE_SERVER_URL: `http://localhost:${API}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
