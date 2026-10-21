import {test, expect, type Page} from '@playwright/test';

const passphrase = 'a synthetic idle warning room';
const savedNotes = 'A saved synthetic observation.';
const draftNotes = 'A private unsaved thought remains here.';
const warning = (page: Page) => page.getByRole('dialog', {name: 'Still studying?', exact: true});

async function createRoom(page: Page) {
  // Install before navigation so the application's first timer uses the controlled clock.
  await page.clock.install({time: new Date('2026-10-19T00:00:00Z')});
  await page.goto('/');
  await page.getByRole('button', {name: 'Create your room', exact: true}).click();
  await page.getByLabel('Passphrase', {exact: true}).fill(passphrase);
  await page.getByLabel('Confirm passphrase').fill(passphrase);
  await page.getByRole('button', {name: 'Create & start learning'}).click();
  await expect(page.getByRole('heading', {name: 'Follow your curiosity.'})).toBeVisible();
}

async function unlock(page: Page) {
  await page.getByLabel('Passphrase', {exact: true}).fill(passphrase);
  await page.getByRole('button', {name: 'Unlock & start learning'}).click();
  await expect(page.getByRole('heading', {name: 'Follow your curiosity.'})).toBeVisible();
}

async function addNote(page: Page) {
  await page.getByRole('button', {name: 'Add a source', exact: true}).click();
  await page.getByLabel('My own note').check();
  await page.getByLabel('Title', {exact: true}).fill('A synthetic idle test source');
  await page.getByLabel('A thought to begin with').fill(savedNotes);
  await page.getByRole('button', {name: 'Add to learning room'}).click();
  await expect(page.getByLabel('Learning notes')).toHaveValue(savedNotes);
}

async function pause(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  // A real key interaction sets the activity anchor precisely at the now-paused clock.
  await page.keyboard.press('ArrowLeft');
}

async function encryptedSavedCopy(page: Page) {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('open-learning-rooms');
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('vaults').objectStore('vaults').get('library');
      read.onsuccess = () => {resolve(JSON.stringify(read.result)); db.close();};
      read.onerror = () => {db.close(); reject(read.error);};
    };
    request.onerror = () => reject(request.error);
  }));
}

test('idle warning gives thirty seconds and at least ten deliberate extensions without changing a draft', async ({page}) => {
  test.setTimeout(60_000);
  await createRoom(page);
  await addNote(page);
  const original = await encryptedSavedCopy(page);
  const notes = page.getByLabel('Learning notes');
  await notes.fill(draftNotes);
  await pause(page);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  for (let i = 0; i < 11; i++) {
    await page.clock.fastForward(270_000);
    await expect(warning(page)).toBeVisible();
    await expect(warning(page).getByRole('button', {name: 'Continue studying'})).toBeFocused();
    if (i === 0) {
      await page.clock.runFor(29_000);
      await expect(warning(page)).toBeVisible();
      await expect(notes).toHaveValue(draftNotes);
    }
    await warning(page).getByRole('button', {name: 'Continue studying'}).click();
    await expect(warning(page)).toHaveCount(0);
    await expect(notes).toHaveValue(draftNotes);
    await expect(notes).toBeFocused();
  }
  expect(await encryptedSavedCopy(page)).toEqual(original);
  expect(requests).toEqual([]);
  await page.getByRole('button', {name: 'Save learning notes', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await page.getByRole('button', {name: 'Lock room', exact: true}).click();
  await unlock(page);
  await page.locator('.source-card').first().click();
  await expect(page.getByLabel('Learning notes')).toHaveValue(draftNotes);
});

test('idle warning is actionable above another native dialog and restores its field and focus', async ({page}) => {
  await createRoom(page);
  await page.getByRole('button', {name: 'Add a source', exact: true}).click();
  const title = page.getByLabel('Title', {exact: true});
  await title.fill('A new source still being written');
  await pause(page);
  await page.clock.fastForward(270_000);
  await expect(warning(page)).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  await warning(page).getByRole('button', {name: 'Continue studying'}).click();
  await expect(warning(page)).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(title).toHaveValue('A new source still being written');
  await expect(title).toBeFocused();
});

test('unanswered idle warning expires at five minutes and removes private draft content', async ({page}) => {
  await createRoom(page);
  await addNote(page);
  const original = await encryptedSavedCopy(page);
  await page.getByLabel('Learning notes').fill(draftNotes);
  await pause(page);
  await page.clock.fastForward(270_000);
  await expect(warning(page)).toBeVisible();
  await page.clock.runFor(30_000);
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
  await expect(warning(page)).toHaveCount(0);
  await expect(page.getByLabel('Learning notes')).toHaveCount(0);
  expect(await page.locator('textarea').evaluateAll(elements => elements.map(element => (element as HTMLTextAreaElement).value))).not.toContain(draftNotes);
  expect(await encryptedSavedCopy(page)).toEqual(original);
  await unlock(page);
  await page.locator('.source-card').first().click();
  await expect(page.getByLabel('Learning notes')).toHaveValue(savedNotes);
});

test('manual lock and pagehide lock immediately while an idle warning is open', async ({page}) => {
  await createRoom(page);
  await addNote(page);
  const prompts: string[] = [];
  page.on('dialog', async dialog => {prompts.push(dialog.message()); await dialog.dismiss();});
  await pause(page);
  for (const mode of ['manual', 'pagehide']) {
    await page.getByLabel('Learning notes').fill(draftNotes);
    await page.keyboard.press('ArrowLeft');
    await page.clock.fastForward(270_000);
    await expect(warning(page)).toBeVisible();
    if (mode === 'manual') await warning(page).getByRole('button', {name: 'Lock room now'}).click();
    else await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
    await expect(page.getByLabel('Learning notes')).toHaveCount(0);
    await expect(warning(page)).toHaveCount(0);
    await unlock(page);
    await page.locator('.source-card').first().click();
    await expect(page.getByLabel('Learning notes')).toHaveValue(savedNotes);
  }
  expect(prompts).toEqual([]);
});

test('late input before a delayed timer cannot revive an expired room', async ({page}) => {
  await createRoom(page);
  await addNote(page);
  await page.getByLabel('Learning notes').fill(draftNotes);
  await pause(page);
  // Moving the wall clock does not run timers. The next input must check the old deadline first.
  await page.clock.setSystemTime(await page.evaluate(() => Date.now() + 300_001));
  await page.keyboard.press('a');
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
  await expect(page.getByLabel('Learning notes')).toHaveCount(0);
  await expect(warning(page)).toHaveCount(0);
});

test('a long background timer gap and a backwards clock both fail closed', async ({page}) => {
  await createRoom(page);
  await pause(page);
  await page.clock.fastForward(3_600_000);
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
  await unlock(page);
  await page.keyboard.press('ArrowLeft');
  await page.clock.setSystemTime(await page.evaluate(() => Date.now() - 1));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
});
