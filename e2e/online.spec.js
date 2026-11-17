import { test, expect } from '@playwright/test';
import { table, newPlayer, joinByLink, closeAll, pickSetting, chooseFirstWord, writeDefinition, voteFor, scoreOf } from './helpers.js';

const BEN_FAKE = 'a small brass hook for hanging lanterns';
const CHI_FAKE = 'To mutter crossly while doing the washing up';

test('create, join by invite with three players, and play a full round', async ({ browser }) => {
  const { players } = await table(browser, ['Ada', 'Ben']);
  const [ada, ben] = players;
  // Two players cannot start.
  await expect(ada.page.getByRole('button', { name: 'Start the game' })).toBeDisabled();
  await expect(ada.page.getByText('1 more to go')).toBeVisible();
  const link = await ada.page.locator('#invite-link').inputValue();
  const chi = { name: 'Chi', ...(await newPlayer(browser)) };
  await joinByLink(chi.page, link, 'Chi');
  const all = [ada, ben, chi];

  // Guests see the settings but cannot change them. The host turns the timer off.
  await expect(ben.page.getByText(/^1 turn each, 90 seconds to write, style hints on\. The host chooses\.$/)).toBeVisible();
  await pickSetting(ada.page, 'Writing timer', 'No timer');
  await expect(ben.page.getByText(/No timer/)).toBeVisible();
  await ada.page.getByRole('button', { name: 'Start the game' }).click();

  // Choosing: Ada picks first; the others wait and see nothing of the offer.
  for (const p of [ben, chi]) await expect(p.page.getByRole('heading', { name: 'Ada is picking a word' })).toBeVisible();
  await expect(ada.page.getByText('Word 1 of 3')).toBeVisible();
  const { word, definition } = await chooseFirstWord(ada.page);
  await expect(ben.page.locator('body')).not.toContainText(definition);

  // Writing: Ada keeps a straight face; Ben and Chi write; the hint shows.
  for (const p of all) await expect(p.page.getByRole('heading', { name: word, exact: true })).toBeVisible();
  await expect(ada.page.getByText('Keep a straight face.')).toBeVisible();
  await expect(ada.page.getByText(definition)).toBeVisible();
  await expect(ben.page.getByText(/^Write it like a dictionary/)).toBeVisible();
  await ben.page.getByLabel(/^Your made-up definition of/).fill(BEN_FAKE);
  await expect(ben.page.getByText(`${BEN_FAKE.length}/110`)).toBeVisible();
  await ben.page.getByRole('button', { name: 'Submit my definition' }).click();
  await expect(ben.page.getByText('Your definition is in')).toBeVisible();
  await expect(chi.page.getByText('1 of 2 definitions in')).toBeVisible();
  await expect(chi.page.locator('body')).not.toContainText(/brass hook/);
  await expect(ada.page.locator('body')).not.toContainText(/brass hook/);
  await writeDefinition(chi.page, CHI_FAKE);

  // Voting: same numbered list everywhere, own entry disabled and marked, picker sits out.
  for (const p of all) await expect(p.page.locator('.entries .entry')).toHaveCount(3);
  const order = await ben.page.locator('.entry__text').allTextContents();
  expect(await chi.page.locator('.entry__text').allTextContents()).toEqual(order);
  expect(order).toContain('A small brass hook for hanging lanterns.'); // dictionary style
  const own = ben.page.locator('label.entry--own');
  await expect(own).toContainText('brass hook');
  await expect(own).toContainText('yours');
  await expect(own.locator('input')).toBeDisabled();
  await expect(ada.page.getByText('You picked this word, so you sit the vote out.', { exact: false })).toBeVisible();
  await expect(ada.page.getByRole('button', { name: /^Vote for/ })).toHaveCount(0);

  await voteFor(ben.page, 'mutter crossly'); // Chi fools Ben
  await expect(ben.page.getByText('Your vote is in')).toBeVisible();
  await voteFor(chi.page, definition); // Chi finds the real one

  // Reveal: the real one is stamped, fakes are named with their voters, points add up.
  for (const p of all) {
    await expect(p.page.getByRole('heading', { name: 'Scores' })).toBeVisible();
    const real = p.page.locator('.entry--real');
    await expect(real).toContainText(definition);
    await expect(real.locator('.stamp')).toBeVisible();
    await expect(scoreOf(p.page, 'Chi')).toHaveText('2');
    await expect(scoreOf(p.page, 'Ben')).toHaveText('0');
    await expect(scoreOf(p.page, 'Ada')).toHaveText('0');
  }
  await expect(ada.page.locator('.entry', { hasText: 'mutter crossly' })).toContainText('Made up by Chi. Fooled Ben, +1.');
  await expect(ada.page.locator('.entry', { hasText: 'brass hook' })).toContainText('Made up by Ben. Fooled nobody.');
  await expect(ada.page.locator('.entry--real')).toContainText('Found by Chi, +1 each.');
  await expect(ben.page.getByText('Waiting for Ada to continue.')).toBeVisible();

  // Next word: the turn passes to Ben.
  await ada.page.getByRole('button', { name: 'Next word' }).click();
  await expect(ben.page.getByRole('heading', { name: 'Pick a word' })).toBeVisible();
  await expect(ada.page.getByRole('heading', { name: 'Ben is picking a word' })).toBeVisible();
  await closeAll(all);
});

test('a reload takes the same seat back in choosing, writing, voting and reveal', async ({ browser }) => {
  const { players } = await table(browser);
  const [ada, ben, chi] = players;
  await pickSetting(ada.page, 'Writing timer', 'No timer');
  await ada.page.getByRole('button', { name: 'Start the game' }).click();

  // Choosing: the picker reloads and still has the offer; a guest reloads and still waits.
  await expect(ada.page.getByRole('heading', { name: 'Pick a word' })).toBeVisible();
  await ada.page.reload();
  await expect(ada.page.getByRole('heading', { name: 'Pick a word' })).toBeVisible();
  await ben.page.reload();
  await expect(ben.page.getByRole('heading', { name: 'Ada is picking a word' })).toBeVisible();
  const { definition } = await chooseFirstWord(ada.page);

  // Writing: Ben's submitted definition is still his after a reload; the host is still the host.
  await writeDefinition(ben.page, BEN_FAKE);
  await expect(ben.page.getByText('Your definition is in')).toBeVisible();
  await ben.page.reload();
  await expect(ben.page.getByText('Your definition is in')).toBeVisible();
  await expect(ben.page.getByText('A small brass hook for hanging lanterns.')).toBeVisible();
  await expect(ben.page.getByText('Ben (you)')).toBeVisible();
  await ada.page.reload();
  await expect(ada.page.getByText('Keep a straight face.')).toBeVisible();
  await expect(ada.page.getByRole('button', { name: 'End writing now' })).toBeEnabled();
  await writeDefinition(chi.page, CHI_FAKE);

  // Voting: a vote survives a reload, and so does the own-entry lock.
  await voteFor(ben.page, definition);
  await ben.page.reload();
  await expect(ben.page.getByText('Your vote is in')).toBeVisible();
  await expect(ben.page.locator('label.entry--pick', { hasText: definition })).toContainText('your vote');
  await chi.page.reload();
  await expect(chi.page.getByText('Which one is real?')).toBeVisible();
  await expect(chi.page.locator('label.entry--own')).toContainText('mutter crossly');
  await voteFor(chi.page, 'brass hook');

  // Reveal: same seat, same points.
  await expect(ben.page.getByRole('heading', { name: 'Scores' })).toBeVisible();
  await ben.page.reload();
  await expect(ben.page.getByRole('heading', { name: 'Scores' })).toBeVisible();
  await expect(ben.page.locator('.standings__row', { hasText: 'Ben (you)' }).locator('.standings__score')).toHaveText('2');
  await expect(ben.page.locator('.entry--real .stamp')).toBeVisible();
  await expect(ada.page.locator('.standings__row', { hasText: 'Ben' })).not.toContainText('Offline');
  await closeAll(players);
});

test('the writing timer runs out, and the host can end voting early', async ({ browser }) => {
  const { players } = await table(browser);
  const [ada, ben, chi] = players;
  await pickSetting(ada.page, 'Writing timer', '60s');
  await pickSetting(ada.page, 'Style hints for writers', 'Off');
  await ada.page.getByRole('button', { name: 'Start the game' }).click();
  await chooseFirstWord(ada.page);

  await expect(ben.page.getByRole('timer')).toBeVisible();
  await expect(ben.page.getByText(/^Write it like a dictionary/)).toHaveCount(0);
  await writeDefinition(ben.page, BEN_FAKE);
  // Chi never writes: the (shortened) timer closes writing on its own.
  await expect(chi.page.getByText('Which one is real?')).toBeVisible({ timeout: 15_000 });
  await expect(chi.page.locator('.entries .entry')).toHaveCount(2);

  await expect(ada.page.getByRole('button', { name: 'End voting now' })).toBeDisabled();
  await voteFor(chi.page, 'brass hook');
  await ada.page.getByRole('button', { name: 'End voting now' }).click();
  await expect(chi.page.getByRole('heading', { name: 'Scores' })).toBeVisible();
  await expect(chi.page.getByText("You didn't write in time.")).toBeVisible();
  await expect(ada.page.getByText(/Chi didn't write in time\. Ben didn't vote in time\./)).toBeVisible();
  await expect(scoreOf(ada.page, 'Ben')).toHaveText('1');
  await closeAll(players);
});
