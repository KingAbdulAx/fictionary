import { expect } from '@playwright/test';

export const APP = '/fictionary/';

/** A new player in their own browser context (their own storage, like their own phone). */
export async function newPlayer(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  return { context, page };
}

export async function createRoom(page, name) {
  await page.goto(APP);
  await page.getByRole('button', { name: /Play online/ }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create the room' }).click();
  await expect(page.getByRole('heading', { name: 'Waiting for players' })).toBeVisible();
  const code = (await page.locator('.invite__code').textContent()).trim();
  const link = await page.locator('#invite-link').inputValue();
  return { code, link };
}

export async function joinByLink(page, link, name) {
  await page.goto(link);
  await expect(page.getByLabel('Room code')).toHaveValue(/^[A-Z0-9]{6}$/);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join the room' }).click();
  await expect(page.getByRole('heading', { name: 'Waiting for players' })).toBeVisible();
}

/** Ada hosts, everyone else joins by the invite link. */
export async function table(browser, names = ['Ada', 'Ben', 'Chi']) {
  const players = [];
  for (const name of names) players.push({ name, ...(await newPlayer(browser)) });
  const { link, code } = await createRoom(players[0].page, names[0]);
  for (const p of players.slice(1)) await joinByLink(p.page, link, p.name);
  return { players, link, code };
}

export const closeAll = (players) => Promise.all(players.map((p) => p.context.close()));

/** Host settings are radio chips inside labels. */
export const pickSetting = (page, legend, label) =>
  page.getByRole('group', { name: legend }).locator('label.chip').filter({ hasText: new RegExp(`^${label}$`) }).click();

/** The picker chooses the first offered word. Returns { word, definition }. */
export async function chooseFirstWord(page) {
  await expect(page.getByRole('heading', { name: 'Pick a word' })).toBeVisible();
  const card = page.locator('.offer__card').first();
  const word = (await card.locator('.offer__word').textContent()).trim();
  const definition = (await card.locator('.offer__def').textContent()).trim();
  await card.click();
  return { word, definition };
}

export async function writeDefinition(page, text) {
  await page.getByLabel(/^Your made-up definition of/).fill(text);
  await page.getByRole('button', { name: 'Submit my definition' }).click();
}

/** Votes for the entry whose text contains `text`. */
export async function voteFor(page, text) {
  await page.locator('label.entry--pick', { hasText: text }).click();
  await page.getByRole('button', { name: /^Vote for number \d+$/ }).click();
}

export const scoreOf = (page, name) => page.locator('.standings__row', { hasText: name }).locator('.standings__score');
