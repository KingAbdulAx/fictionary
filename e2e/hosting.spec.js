import { test, expect } from '@playwright/test';
import { newPlayer, createRoom, APP } from './helpers.js';

// The deployed shape: built with VITE_BASE=/fictionary/ and served through the vercel.json rewrites.

test('serves on /fictionary and /fictionary/', async ({ request }) => {
  for (const path of ['/fictionary', '/fictionary/']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
    expect(await res.text()).toContain('<div id="root">');
  }
  const icon = await request.get('/fictionary/favicon.svg');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toContain('svg');
});

test('every asset, fonts and favicon included, loads from under /fictionary/', async ({ page }) => {
  const seen = [];
  page.on('response', (r) => seen.push({ url: new URL(r.url()).pathname, status: r.status() }));
  await page.goto(APP);
  await page.getByRole('button', { name: /Play online/ }).waitFor();
  await page.evaluate(() => document.fonts.ready);

  const assets = seen.filter((r) => r.url.startsWith(APP));
  expect(assets.some((r) => r.url.endsWith('.js'))).toBe(true);
  expect(assets.some((r) => r.url.endsWith('.css'))).toBe(true);
  const iconHref = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(iconHref).toBe('/fictionary/favicon.svg');
  expect((await page.request.get(iconHref)).status()).toBe(200);
  const fonts = assets.filter((r) => r.url.endsWith('.woff2'));
  expect(fonts.length).toBeGreaterThanOrEqual(2); // Montserrat and Inter, latin subsets
  expect(seen.filter((r) => r.status >= 400)).toEqual([]);

  const families = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
  expect(families.join(' ')).toMatch(/Montserrat/);
  expect(families.join(' ')).toMatch(/Inter/);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.home__title')).fontWeight)).toBe('800');
  await expect(page.getByText('Definitions from WordNet, Princeton University')).toBeVisible();
});

test('the socket connects from the allowed origin and the invite link carries /fictionary/', async ({ browser }) => {
  const { context, page } = await newPlayer(browser);
  const { code, link } = await createRoom(page, 'Ada');
  expect(link).toBe(`http://localhost:4173/fictionary/?room=${code}`);
  await context.close();
});

test('every storage key is prefixed fictionary.', async ({ browser }) => {
  const { context, page } = await newPlayer(browser);
  await createRoom(page, 'Ada');
  const keys = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.filter((k) => !k.startsWith('fictionary.'))).toEqual([]);
  await context.close();
});
