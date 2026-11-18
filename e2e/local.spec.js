import { test, expect } from '@playwright/test';
import { APP, chooseFirstWord, writeDefinition, voteFor, scoreOf } from './helpers.js';

const pass = async (page, name) => {
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `I'm ${name}` }).click();
};

test('one device: a full round passed around the table', async ({ page }) => {
  await page.goto(APP);
  await page.getByRole('button', { name: /One device/ }).click();
  for (const name of ['Ada', 'Ben', 'Chi']) {
    await page.getByLabel('Add a player').fill(name);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await expect(page.getByRole('group', { name: 'Writing timer' })).toHaveCount(0); // no timers on one device
  await page.getByRole('button', { name: 'Start the game' }).click();

  // Ada picks in private.
  await expect(page.getByText('Ada picks the word. Only they should look.')).toBeVisible();
  await expect(page.locator('.offer__card')).toHaveCount(0);
  await pass(page, 'Ada');
  const { word, definition } = await chooseFirstWord(page);

  // Ben and Chi write in private; nothing written shows on the pass screens.
  await pass(page, 'Ben');
  await expect(page.getByRole('heading', { name: word, exact: true })).toBeVisible();
  await writeDefinition(page, 'a small brass hook for hanging lanterns');
  await expect(page.getByText('1 of 2 definitions in')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/brass hook/);
  await pass(page, 'Chi');
  await writeDefinition(page, 'To mutter crossly while doing the washing up');

  // Each votes in private; their own entry is locked.
  await pass(page, 'Ben');
  await expect(page.locator('label.entry--own')).toContainText('brass hook');
  await voteFor(page, 'mutter crossly');
  await pass(page, 'Chi');
  await expect(page.locator('label.entry--own')).toContainText('mutter crossly');
  await voteFor(page, definition);

  // Shared reveal.
  await expect(page.getByRole('heading', { name: 'Every vote is in' })).toBeVisible();
  await page.getByRole('button', { name: 'Reveal the answer' }).click();
  await expect(page.locator('.entry--real')).toContainText(definition);
  await expect(page.locator('.entry--real .stamp')).toBeVisible();
  await expect(scoreOf(page, 'Chi')).toHaveText('2');
  await expect(scoreOf(page, 'Ben')).toHaveText('0');
  await expect(scoreOf(page, 'Ada')).toHaveText('0');

  // Next word: Ben's turn to pick.
  await page.getByRole('button', { name: 'Next word' }).click();
  await expect(page.getByText('Ben picks the word. Only they should look.')).toBeVisible();
  const keys = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
  expect(keys.filter((k) => !k.startsWith('fictionary.'))).toEqual([]);
});
