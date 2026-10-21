import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CatalogConflictError, MemoryCatalogStore, addAsset, addCollection, addResource,
  createAsset, createCatalog, createCollection, createResource, createRevision,
  createSession, fromBase64, rekeyCatalog, sealCatalog, toBase64, unsealCatalog,
  type CatalogBundle, type CatalogStore
} from '../packages/core/src/index.ts';

const currentPassphrase = 'synthetic current library passphrase';
const newPassphrase = 'synthetic replacement library passphrase';
const fixture = (async () => {
  const bytes = new Uint8Array([0, 255, 17, 128, 42]);
  const extra = new TextEncoder().encode('Supplementary document: 物理 علم');
  const asset = await createAsset(bytes, {id: 'asset-1', name: 'original.bin', mime: 'application/octet-stream'});
  const supplementary = await createAsset(extra, {id: 'asset-2', name: 'supplementary.txt', mime: 'text/plain'});
  let catalog = addAsset(addAsset(createCatalog(), asset), supplementary);
  catalog = addResource(catalog, createResource({
    id: 'resource-1', title: 'Physics 物理 علم', kind: 'other', description: 'Keep every field.',
    creators: ['Ana', 'علي'], languages: ['en', 'zh'], subjects: ['Physics', 'Music'],
    rights: {statement: 'Permission recorded.', licenseUrl: 'https://example.org/license'},
    provenance: {sourceUrl: 'https://example.org/source'}, assetIds: [asset.id],
    extensions: {'org.example.learning': {notes: 'Private reflection', nested: [null, false, 12, {meaning: 'Keep me'}]}}
  }));
  catalog = addCollection(catalog, createCollection({id: 'collection-1', title: 'My shelf', description: 'A shelf description', resourceIds: ['resource-1'], extensions: {'org.example.collection': {color: 'green'}}}));
  catalog = {...catalog, modifiedAt: '2020-01-01T00:00:00.000Z', extensions: {'org.example.catalog': {recommendations: false, practices: [{id: 'practice-1', done: true}]}}};
  const bundle: CatalogBundle = {catalog, content: new Map([[asset.id, bytes], [supplementary.id, extra]])};
  const session = await createSession(currentPassphrase);
  const envelope = await sealCatalog(bundle, session);
  return {bundle, session, envelope};
})();

test('passphrase change preserves every catalog field and byte except revision and modification time', async () => {
  const original = await fixture;
  const before = structuredClone(original.bundle);
  const input = Object.freeze({...original.envelope});
  const prepared = await rekeyCatalog(input, currentPassphrase, newPassphrase);
  assert.deepEqual(prepared.bundle.catalog, {...before.catalog, revision: prepared.bundle.catalog.revision, modifiedAt: prepared.bundle.catalog.modifiedAt});
  assert.notEqual(prepared.bundle.catalog.revision, before.catalog.revision);
  assert.notEqual(prepared.bundle.catalog.modifiedAt, before.catalog.modifiedAt);
  assert.ok(Number.isFinite(Date.parse(prepared.bundle.catalog.modifiedAt)));
  assert.deepEqual(prepared.bundle.content, before.content);
  assert.notEqual(prepared.envelope.salt, input.salt);
  assert.notEqual(prepared.envelope.iv, input.iv);
  assert.notEqual(prepared.session.key, original.session.key);
  assert.equal(prepared.session.key.extractable, false);
  assert.equal(prepared.session.salt, prepared.envelope.salt);
  assert.equal(prepared.envelope.revision, prepared.bundle.catalog.revision);
  assert.deepEqual(input, original.envelope);
  prepared.bundle.catalog.resources[0].title = 'Changed returned snapshot';
  prepared.bundle.content.get('asset-1')![0] = 99;
  assert.deepEqual(original.bundle, before);
});

test('only the new passphrase opens the prepared vault while the original remains usable', async () => {
  const original = await fixture;
  const prepared = await rekeyCatalog(original.envelope, currentPassphrase, newPassphrase);
  assert.deepEqual((await unsealCatalog(prepared.envelope, newPassphrase)).bundle, prepared.bundle);
  await assert.rejects(() => unsealCatalog(prepared.envelope, currentPassphrase), /Could not unlock/);
  assert.deepEqual((await unsealCatalog(original.envelope, currentPassphrase)).bundle, original.bundle);
  await assert.rejects(() => unsealCatalog(original.envelope, newPassphrase), /Could not unlock/);
});

test('invalid or unchanged replacement passphrases reject before any key derivation', async t => {
  const derivation = t.mock.method(crypto.subtle, 'deriveKey', async () => {throw new Error('Unexpected expensive derivation.');});
  for (const invalid of ['', 'x'.repeat(11), 'x'.repeat(513), null, undefined, 12]) {
    await assert.rejects(() => rekeyCatalog(null, currentPassphrase, invalid as string), /between 12 and 512/);
  }
  await assert.rejects(() => rekeyCatalog(null, currentPassphrase, currentPassphrase), /different passphrase/);
  assert.equal(derivation.mock.callCount(), 0);
});

test('wrong current passphrase and tampered content cannot prepare a replacement', async () => {
  const {envelope} = await fixture;
  const before = {...envelope};
  await assert.rejects(() => rekeyCatalog(envelope, 'incorrect current passphrase', newPassphrase), /Could not unlock/);
  const corrupted = fromBase64(envelope.ciphertext); corrupted[0] ^= 1;
  await assert.rejects(() => rekeyCatalog({...envelope, ciphertext: toBase64(corrupted)}, currentPassphrase, newPassphrase), /Could not unlock/);
  assert.deepEqual(envelope, before);
});

test('malformed encrypted input rejects before key derivation', async t => {
  const {envelope} = await fixture;
  const derivation = t.mock.method(crypto.subtle, 'deriveKey', async () => {throw new Error('Unexpected expensive derivation.');});
  await assert.rejects(() => rekeyCatalog({...envelope, iterations: 1}, currentPassphrase, newPassphrase), /Unsupported/);
  await assert.rejects(() => rekeyCatalog({...envelope, salt: ''}, currentPassphrase, newPassphrase), /encoding/);
  assert.equal(derivation.mock.callCount(), 0);
});

test('a stale passphrase change cannot replace another writer’s saved catalog', async () => {
  const original = await fixture;
  const store = new MemoryCatalogStore();
  await store.write(original.envelope, null);
  const prepared = await rekeyCatalog(original.envelope, currentPassphrase, newPassphrase);
  assert.deepEqual(await store.read(), original.envelope);
  const rivalBundle = {...original.bundle, catalog: {...original.bundle.catalog, revision: createRevision(), extensions: {'org.example.rival': {saved: true}}}};
  const rival = await sealCatalog(rivalBundle, original.session);
  await store.write(rival, original.envelope.revision);
  await assert.rejects(() => store.write(prepared.envelope, original.envelope.revision), CatalogConflictError);
  assert.deepEqual(await store.read(), rival);
  assert.deepEqual((await unsealCatalog((await store.read())!, currentPassphrase)).bundle, rivalBundle);
});

test('an injected storage failure leaves the saved vault and current passphrase intact', async () => {
  const original = await fixture;
  const memory = new MemoryCatalogStore();
  await memory.write(original.envelope, null);
  const store: CatalogStore = {
    read: () => memory.read(), remove: revision => memory.remove(revision),
    write: async () => {throw new Error('Synthetic storage failure.');}
  };
  const prepared = await rekeyCatalog(original.envelope, currentPassphrase, newPassphrase);
  await assert.rejects(() => store.write(prepared.envelope, original.envelope.revision), /Synthetic storage failure/);
  assert.deepEqual(await store.read(), original.envelope);
  assert.deepEqual((await unsealCatalog((await store.read())!, currentPassphrase)).bundle, original.bundle);
});
