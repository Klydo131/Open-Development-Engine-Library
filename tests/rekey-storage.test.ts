import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {CatalogConflictError, createSession, emptyLibrary, rekeyCatalog, seal, type Library} from '../packages/core/src/index.ts';
import {bundleToLibrary, openLearningVault, revisionOf, sealLearningVault} from '../apps/web/src/learning-vault.ts';
import {localStore} from '../apps/web/src/storage.ts';

const currentPassphrase = 'synthetic existing room passphrase';
const newPassphrase = 'synthetic replacement room passphrase';
const fixture = (async () => {
  const library: Library = {...emptyLibrary(), recommendations: false, lessons: [{id: 'lesson-1', title: 'Private source', kind: 'note', url: '', tags: ['Physics'], notes: 'Original private notes', question: '', answer: '', learned: false, createdAt: '2020-01-01T00:00:00.000Z'}]};
  const session = await createSession(currentPassphrase);
  const legacy = await seal(library, session);
  const migrated = await sealLearningVault(library, session);
  return {library, session, legacy, migrated};
})();

test.beforeEach(async () => {
  const current = await localStore.read();
  if (current) await localStore.remove(revisionOf(current));
  assert.equal(await localStore.readLegacyBackup(), null);
});

async function archivedFixture() {
  const original = await fixture;
  await localStore.write(original.legacy, null);
  await localStore.write(original.migrated.envelope, original.legacy.iv);
  assert.deepEqual(await localStore.readLegacyBackup(), original.legacy);
  return original;
}

test('successful passphrase change atomically replaces the vault and removes its older local archive', async () => {
  const original = await archivedFixture();
  const prepared = await rekeyCatalog(original.migrated.envelope, currentPassphrase, newPassphrase);
  await localStore.rekey(prepared.envelope, original.migrated.envelope.revision);
  assert.deepEqual(await localStore.read(), prepared.envelope);
  assert.equal(await localStore.readLegacyBackup(), null);
  assert.deepEqual((await openLearningVault((await localStore.read())!, newPassphrase)).library, original.library);
  await assert.rejects(() => openLearningVault((prepared.envelope), currentPassphrase), /Could not unlock/);
});

test('stale passphrase change preserves the current saved vault and its matching legacy archive', async () => {
  const original = await archivedFixture();
  const prepared = await rekeyCatalog(original.migrated.envelope, currentPassphrase, newPassphrase);
  const rivalLibrary = structuredClone(original.library); rivalLibrary.lessons[0].notes = 'Saved from another tab.';
  const rival = await sealLearningVault(rivalLibrary, original.session, original.migrated.bundle);
  await localStore.write(rival.envelope, original.migrated.envelope.revision);
  await assert.rejects(() => localStore.rekey(prepared.envelope, original.migrated.envelope.revision), CatalogConflictError);
  assert.deepEqual(await localStore.read(), rival.envelope);
  assert.deepEqual(await localStore.readLegacyBackup(), original.legacy);
  assert.deepEqual((await openLearningVault((await localStore.read())!, currentPassphrase)).library, rivalLibrary);
});

test('quota failure during passphrase replacement preserves both the saved vault and local archive', async () => {
  const original = await archivedFixture();
  const prepared = await rekeyCatalog(original.migrated.envelope, currentPassphrase, newPassphrase);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () {throw new DOMException('Synthetic quota failure', 'QuotaExceededError');};
  try {
    await assert.rejects(() => localStore.rekey(prepared.envelope, original.migrated.envelope.revision), /Could not save/);
  } finally {IDBObjectStore.prototype.put = put;}
  assert.deepEqual(await localStore.read(), original.migrated.envelope);
  assert.deepEqual(await localStore.readLegacyBackup(), original.legacy);
  assert.deepEqual((await openLearningVault((await localStore.read())!, currentPassphrase)).library, original.library);
});

test('archive removal failure rolls back an already queued replacement write', async () => {
  const original = await archivedFixture();
  const prepared = await rekeyCatalog(original.migrated.envelope, currentPassphrase, newPassphrase);
  const remove = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function () {throw new Error('Synthetic archive removal failure.');};
  try {
    await assert.rejects(() => localStore.rekey(prepared.envelope, original.migrated.envelope.revision), /Could not save/);
  } finally {IDBObjectStore.prototype.delete = remove;}
  assert.deepEqual(await localStore.read(), original.migrated.envelope);
  assert.deepEqual(await localStore.readLegacyBackup(), original.legacy);
});

test('a subsequent normal save uses the replacement session and does not restore the old local archive', async () => {
  const original = await archivedFixture();
  const prepared = await rekeyCatalog(original.migrated.envelope, currentPassphrase, newPassphrase);
  await localStore.rekey(prepared.envelope, original.migrated.envelope.revision);
  const edited = bundleToLibrary(prepared.bundle); edited.lessons[0].notes = 'Private notes after changing the passphrase.';
  const next = await sealLearningVault(edited, prepared.session, prepared.bundle);
  await localStore.write(next.envelope, prepared.envelope.revision);
  assert.equal(next.envelope.salt, prepared.envelope.salt);
  assert.notEqual(next.envelope.revision, prepared.envelope.revision);
  assert.notEqual(next.envelope.iv, prepared.envelope.iv);
  assert.equal(await localStore.readLegacyBackup(), null);
  assert.deepEqual((await openLearningVault((await localStore.read())!, newPassphrase)).library, edited);
  await assert.rejects(() => openLearningVault(next.envelope, currentPassphrase), /Could not unlock/);
});
