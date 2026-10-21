import {test, expect, type Page} from '@playwright/test';
import assert from 'node:assert/strict';
import {openLearningVault} from '../../apps/web/src/learning-vault.ts';
import {createSession, emptyLibrary, seal} from '../../packages/core/src/index.ts';

const pass = 'a private test room 2026';
const nextPass = 'a different private passphrase 2026';

async function createRoom(page: Page) {
  await page.goto('/');
  await page.getByRole('button', {name: 'Create your room', exact: true}).click();
  await page.getByLabel('Passphrase', {exact: true}).fill(pass);
  await page.getByLabel('Confirm passphrase').fill(pass);
  await page.getByRole('button', {name: 'Create & start learning'}).click();
  await expect(page.getByRole('heading', {name: 'Follow your curiosity.'})).toBeVisible();
}

async function unlock(page: Page, password = pass) {
  await page.getByLabel('Passphrase', {exact: true}).fill(password);
  await page.getByRole('button', {name: 'Unlock & start learning'}).click();
}

async function addNote(page: Page, title: string) {
  await page.getByRole('button', {name: 'Learn', exact: false}).first().click();
  await page.getByRole('button', {name: 'Add a source', exact: true}).click();
  await page.getByLabel('My own note').check();
  await page.getByLabel('Title', {exact: true}).fill(title);
  await page.getByLabel('A thought to begin with').fill('Synthetic private learning content.');
  await page.getByRole('button', {name: 'Add to learning room'}).click();
  await expect(page.getByRole('heading', {name: title, exact: true})).toBeVisible();
}

async function stored(page: Page, key = 'library') {
  return page.evaluate(key => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open('open-learning-rooms');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('vaults').objectStore('vaults').get(key);
      read.onsuccess = () => { resolve(read.result); db.close(); };
      read.onerror = () => { reject(read.error); db.close(); };
    };
  }), key);
}

async function changeDialog(page: Page, current = pass, confirmation = nextPass) {
  await page.getByRole('button', {name: 'Your library', exact: true}).click();
  await page.getByRole('button', {name: 'Change passphrase', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Change your passphrase'});
  await dialog.getByLabel('Current passphrase', {exact: true}).fill(current);
  await dialog.getByLabel('New passphrase', {exact: true}).fill(nextPass);
  await dialog.getByLabel('Confirm new passphrase', {exact: true}).fill(confirmation);
  return dialog;
}

async function loadBackup(page: Page, envelope: unknown) {
  await page.locator('input[aria-label="Import encrypted backup"]').setInputFiles({
    name: 'synthetic-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope)),
  });
  return page.getByRole('dialog', {name: 'Restore your encrypted library'});
}

async function installDerivationHold(page: Page) {
  await page.addInitScript(() => {
    const original = crypto.subtle.deriveKey.bind(crypto.subtle);
    Object.defineProperty(crypto.subtle, 'deriveKey', {configurable: true, value: async (...args: Parameters<SubtleCrypto['deriveKey']>) => {
      const key = await original(...args);
      const state = window as any;
      if (state.__deriveUntilBlock > 0 && --state.__deriveUntilBlock === 0) {
        await new Promise<void>(resolve => { state.__releaseDerivation = resolve; state.__derivationBlocked = true; });
      }
      return key;
    }});
  });
}

test('changing a passphrase preserves learning and keeps downloaded backup credentials independent', async ({page}) => {
  await createRoom(page);
  await addNote(page, 'Learning before a passphrase change');
  await page.getByLabel('My recall question').fill('What should survive?');
  await page.getByLabel('My answer', {exact: true}).fill('My learning and catalog.');
  await page.getByRole('button', {name: 'Save learning notes'}).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  const previousBackup = await stored(page);
  const before = await openLearningVault(previousBackup, pass);

  const dialog = await changeDialog(page);
  await dialog.getByRole('button', {name: 'Save new passphrase'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Passphrase changed');
  const replacement = await stored(page);
  expect(replacement.revision).not.toBe(previousBackup.revision);
  expect(replacement.salt).not.toBe(previousBackup.salt);
  expect((await openLearningVault(replacement, nextPass)).library).toEqual(before.library);
  await assert.rejects(openLearningVault(replacement, pass));
  expect((await openLearningVault(previousBackup, pass)).library).toEqual(before.library);
  await assert.rejects(openLearningVault(previousBackup, nextPass));

  await page.getByRole('button', {name: 'Lock room', exact: true}).first().click();
  await unlock(page);
  await expect(page.getByRole('alert')).toContainText('Could not unlock');
  await unlock(page, nextPass);
  await expect(page.getByRole('heading', {name: 'Follow your curiosity.'})).toBeVisible();
  await addNote(page, 'Learning after a passphrase change');
  const reopened = await openLearningVault(await stored(page), nextPass);
  expect(reopened.library.lessons.map(lesson => lesson.title)).toEqual([
    'Learning before a passphrase change', 'Learning after a passphrase change',
  ]);
  await page.getByRole('button', {name: 'Lock room', exact: true}).first().click();
  await unlock(page, nextPass);
  await expect(page.getByRole('heading', {name: 'Learning after a passphrase change', exact: true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('wrong current passphrase and mismatched confirmation cannot alter the saved room', async ({page}) => {
  await createRoom(page);
  const original = await stored(page);
  const dialog = await changeDialog(page, pass, 'a mismatching confirmation 2026');
  await dialog.getByRole('button', {name: 'Save new passphrase'}).click();
  await expect(dialog.getByRole('alert')).toContainText(/match/i);
  expect(await stored(page)).toEqual(original);

  await dialog.getByLabel('Confirm new passphrase', {exact: true}).fill(nextPass);
  await dialog.getByLabel('Current passphrase', {exact: true}).fill('the wrong current passphrase');
  await dialog.getByRole('button', {name: 'Save new passphrase'}).click();
  await expect(dialog.getByRole('alert')).toContainText(/could not unlock|current passphrase|incorrect/i);
  expect(await stored(page)).toEqual(original);
  expect((await openLearningVault(original, pass)).library.lessons).toHaveLength(0);
});

test('checking a backup authenticates it without replacing active learning or asking to replace', async ({page}) => {
  await createRoom(page);
  await addNote(page, 'A source in the older backup');
  const olderBackup = await stored(page);
  await addNote(page, 'A newer source on this device');
  const original = await stored(page);
  await page.getByRole('button', {name: 'Your library', exact: true}).click();
  const confirmations: string[] = [];
  page.on('dialog', async nativeDialog => { confirmations.push(nativeDialog.message()); await nativeDialog.dismiss(); });
  const dialog = await loadBackup(page, olderBackup);
  await dialog.getByLabel('Backup passphrase').fill('the wrong backup passphrase');
  await dialog.getByRole('button', {name: 'Check backup only'}).click();
  await expect(dialog.getByRole('alert')).toContainText(/could not unlock|incorrect|passphrase/i);
  expect(await stored(page)).toEqual(original);

  await dialog.getByLabel('Backup passphrase').fill(pass);
  await dialog.getByRole('button', {name: 'Check backup only'}).click();
  await expect(page.getByRole('status').filter({hasText: 'Backup checked'})).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(await stored(page)).toEqual(original);
  expect(confirmations).toEqual([]);
  await dialog.getByRole('button', {name: 'Close dialog'}).click();
  await page.getByRole('button', {name: 'Learn', exact: false}).first().click();
  await expect(page.getByRole('heading', {name: 'A newer source on this device', exact: true})).toBeVisible();
  expect((await openLearningVault(await stored(page), pass)).library.lessons).toHaveLength(2);
});

test('checking a corrupted encrypted backup leaves the current room intact', async ({page}) => {
  await createRoom(page);
  await addNote(page, 'Keep this saved source');
  const original = await stored(page);
  const corrupted = {...original, ciphertext: (original.ciphertext[0] === 'A' ? 'B' : 'A') + original.ciphertext.slice(1)};
  await page.getByRole('button', {name: 'Your library', exact: true}).click();
  const dialog = await loadBackup(page, corrupted);
  await dialog.getByLabel('Backup passphrase').fill(pass);
  await dialog.getByRole('button', {name: 'Check backup only'}).click();
  await expect(dialog.getByRole('alert')).toContainText(/could not unlock|corrupt|damaged/i);
  await expect(page.getByRole('status').filter({hasText: 'Backup checked'})).toHaveCount(0);
  expect(await stored(page)).toEqual(original);
  await dialog.getByRole('button', {name: 'Close dialog'}).click();
  await page.getByRole('button', {name: 'Learn', exact: false}).first().click();
  await expect(page.getByRole('heading', {name: 'Keep this saved source', exact: true})).toBeVisible();
});

test('a stale tab cannot change the passphrase over a newer saved room', async ({page, context}) => {
  await createRoom(page);
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', {name: 'Enter your room'}).click();
  await unlock(second);
  await expect(second.getByRole('heading', {name: 'Follow your curiosity.'})).toBeVisible();
  const dialog = await changeDialog(second);
  await addNote(page, 'A newer saved source from another tab');
  const newest = await stored(page);
  await dialog.getByRole('button', {name: 'Save new passphrase'}).click();
  await expect(dialog.getByRole('alert')).toContainText(/another tab|changed.*session|changed.*elsewhere/i);
  expect(await stored(second)).toEqual(newest);
  const current = await openLearningVault(await stored(page), pass);
  expect(current.library.lessons[0].title).toBe('A newer saved source from another tab');
  await assert.rejects(openLearningVault(newest, nextPass));
});

test('locking during slow passphrase change prevents a write or private room reopening', async ({page}) => {
  await installDerivationHold(page);
  await createRoom(page);
  await addNote(page, 'A source kept private when locking');
  const original = await stored(page);
  const dialog = await changeDialog(page);
  await page.evaluate(() => { (window as any).__deriveUntilBlock = 2; });
  await dialog.getByRole('button', {name: 'Save new passphrase'}).click();
  await page.waitForFunction(() => (window as any).__derivationBlocked === true);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
  await page.evaluate(() => { (window as any).__releaseDerivation(); });
  await expect(page.locator('.landing')).toHaveAttribute('aria-busy', 'false');
  expect(await stored(page)).toEqual(original);
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'A source kept private when locking', exact: true})).toHaveCount(0);
  await unlock(page);
  await expect(page.getByRole('heading', {name: 'A source kept private when locking', exact: true})).toBeVisible();
});

test('locking during a backup check discards its pending result without opening the backup', async ({page}) => {
  await installDerivationHold(page);
  await createRoom(page);
  await addNote(page, 'A source in a backup being checked');
  const original = await stored(page);
  await page.getByRole('button', {name: 'Your library', exact: true}).click();
  const dialog = await loadBackup(page, original);
  await dialog.getByLabel('Backup passphrase').fill(pass);
  await page.evaluate(() => { (window as any).__deriveUntilBlock = 1; });
  await dialog.getByRole('button', {name: 'Check backup only'}).click();
  await page.waitForFunction(() => (window as any).__derivationBlocked === true);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
  await page.evaluate(() => { (window as any).__releaseDerivation(); });
  await expect(page.locator('.landing')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status').filter({hasText: 'Backup checked'})).toHaveCount(0);
  expect(await stored(page)).toEqual(original);
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
});

test('a restored v1 library can change its passphrase before any ordinary edit', async ({page}) => {
  const library = emptyLibrary();
  library.lessons = [{
    id: 'legacy-rekey-source', title: 'Learning from a restored v1 library', kind: 'note',
    url: '', tags: ['Physics'], notes: 'Synthetic learning before migration.',
    question: 'What remains private?', answer: 'The saved learning.', learned: true,
    createdAt: '2026-09-14T00:00:00Z',
  }];
  const legacy = await seal(library, await createSession(pass));
  await page.goto('/');
  await page.getByRole('button', {name: 'Enter your room'}).click();
  const restore = await loadBackup(page, legacy);
  await restore.getByLabel('Backup passphrase').fill(pass);
  await restore.getByRole('button', {name: 'Unlock & restore'}).click();
  await expect(page.getByRole('heading', {name: 'Learning from a restored v1 library', exact: true})).toBeVisible();
  expect(await stored(page)).toEqual(legacy);

  const dialog = await changeDialog(page);
  await expect(page.getByRole('button', {name: 'Export original v1 backup'})).toBeVisible();
  await dialog.getByRole('button', {name: 'Save new passphrase'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Passphrase changed');
  const migrated = await stored(page);
  expect(migrated.format).toBe('open-library-catalog-vault');
  expect((await openLearningVault(migrated, nextPass)).library).toEqual(library);
  await assert.rejects(openLearningVault(migrated, pass));
  expect(await stored(page, 'legacy-backup')).toBeUndefined();
  await expect(page.getByRole('button', {name: 'Export original v1 backup'})).toHaveCount(0);
  await page.getByRole('button', {name: 'Lock room', exact: true}).first().click();
  await unlock(page, nextPass);
  await expect(page.getByRole('heading', {name: 'Learning from a restored v1 library', exact: true})).toBeVisible();
});
