import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_LIMITS, CatalogConflictError, MemoryCatalogStore, addAsset, addCollection, addResource,
  createAsset, createCatalog, createCollection, createResource, createRevision, createSession,
  deleteAsset, deleteCollection, deleteResource, exportCatalogBundle, fromBase64, importCatalogBundle,
  searchCatalog, sealCatalog, setCollectionMembers, toBase64, unseal, unsealCatalog,
  updateCollection, updateResource, validateBundle, validateCatalog, validateCatalogEnvelope,
  type CatalogBundle, type Resource
} from '../packages/core/src/index.ts';
const bytes = new TextEncoder().encode('An opaque original document: 物理 علم');
async function fixture(): Promise<CatalogBundle> {
  const file = await createAsset(bytes, {id: 'asset-1', name: 'lesson.txt', mime: 'text/plain'});
  let catalog = addAsset(createCatalog(), file);
  catalog = addResource(catalog, createResource({id: 'resource-1', title: 'Physics 物理 علم', kind: 'document', assetIds: [file.id], creators: ['Ana'], subjects: ['Science'], languages: ['en', 'zh'], extensions: {'org.example.learning': {learned: false, notes: 'Private notes'}}}));
  catalog = addCollection(catalog, createCollection({id: 'collection-1', title: 'My shelf', resourceIds: ['resource-1']}));
  return {catalog, content: new Map([[file.id, bytes.slice()]])};
}
test('catalog CRUD creates detached generic snapshots with fresh opaque revisions', () => {
  const original = createCatalog();
  const entry = createResource({id: 'entry', title: 'A library resource', kind: 'note'});
  const added = addResource(original, entry);
  assert.equal(original.resources.length, 0); assert.notEqual(added.revision, original.revision);
  entry.title = 'Mutated caller'; assert.equal(added.resources[0].title, 'A library resource');
  const updated = updateResource(added, 'entry', {description: 'A meaningful description'});
  assert.equal(updated.resources[0].id, 'entry'); assert.equal(updated.resources[0].createdAt, added.resources[0].createdAt);
  assert.equal(added.resources[0].description, ''); assert.notEqual(updated.revision, added.revision);
  assert.equal('learned' in updated.resources[0], false); assert.equal('practices' in updated, false);
  assert.throws(() => addResource(updated, updated.resources[0]), /Duplicate/);
  assert.throws(() => updateResource(updated, 'missing', {title: 'No'}), /does not exist/);
  assert.throws(() => deleteResource(updated, 'missing'), /does not exist/);
  assert.equal(deleteResource(updated, 'entry').resources.length, 0);
});
test('collection membership validates references, deletes without deleting resources and cleans removed resources', () => {
  const entry = createResource({id: 'resource', title: 'A resource'});
  const catalog = addCollection(addResource(createCatalog(), entry), createCollection({id: 'shelf', title: 'A shelf'}));
  const populated = setCollectionMembers(catalog, 'shelf', [entry.id]);
  assert.deepEqual(populated.collections[0].resourceIds, [entry.id]);
  assert.equal(updateCollection(populated, 'shelf', {title: 'Renamed shelf'}).collections[0].title, 'Renamed shelf');
  assert.throws(() => setCollectionMembers(catalog, 'shelf', ['missing']), /dangling/);
  assert.throws(() => setCollectionMembers(catalog, 'shelf', [entry.id, entry.id]), /Duplicate/);
  assert.deepEqual(deleteResource(populated, entry.id).collections[0].resourceIds, []);
  const unshelved = deleteCollection(populated, 'shelf'); assert.equal(unshelved.collections.length, 0); assert.equal(unshelved.resources.length, 1);
  assert.throws(() => deleteCollection(populated, 'missing'), /does not exist/);
});
test('asset descriptors are separate from byte content; referenced bytes cannot be silently removed', async () => {
  const bundle = await fixture();
  assert.equal('data' in bundle.catalog.resources[0], false); assert.equal('data' in bundle.catalog.assets[0], false);
  assert.throws(() => deleteAsset(bundle.catalog, 'asset-1'), /references/);
  const afterResource = deleteResource(bundle.catalog, 'resource-1'); assert.equal(afterResource.assets.length, 1);
  assert.equal(deleteAsset(afterResource, 'asset-1').assets.length, 0);
  assert.throws(() => deleteAsset(bundle.catalog, 'missing'), /does not exist/);
  const validated = await validateBundle(bundle); validated.content.get('asset-1')![0] ^= 1;
  assert.deepEqual(bundle.content.get('asset-1'), bytes);
});
test('deterministic metadata search preserves Chinese, Arabic and canonical Unicode variants', () => {
  let catalog = createCatalog();
  for (const entry of [
    createResource({id: 'b', title: 'CAFÉ 物理', kind: 'document', creators: ['Ana'], subjects: ['Science'], languages: ['zh']}),
    createResource({id: 'a', title: 'cafe\u0301 物理', kind: 'document', description: 'علم الحركة', subjects: ['SCIENCE'], languages: ['ZH']}),
    createResource({id: 'c', title: 'Music', kind: 'audio', provenance: {sourceUrl: 'https://example.org/physics'}, extensions: {'org.example.identity': {email: 'science@example.org'}}})
  ]) catalog = addResource(catalog, entry);
  catalog = addCollection(catalog, createCollection({id: 'shelf', title: 'Shelf', resourceIds: ['b']}));
  assert.deepEqual(searchCatalog(catalog, {query: 'café 物理', subject: 'science', language: 'zh', kind: 'document'}).map(item => item.id), ['a','b']);
  assert.deepEqual(searchCatalog(catalog, {query: 'علم'}).map(item => item.id), ['a']);
  assert.deepEqual(searchCatalog(catalog, {collectionId: 'shelf'}).map(item => item.id), ['b']);
  assert.deepEqual(searchCatalog(catalog, {collectionId: 'missing'}), []);
  assert.deepEqual(searchCatalog(catalog, {query: 'physics'}), []);
  assert.deepEqual(searchCatalog(catalog, {query: 'science@example.org'}), []);
  const found = searchCatalog(catalog); found[0].subjects.push('Edited'); assert.equal(catalog.resources.some(item => item.subjects.includes('Edited')), false);
});
test('catalog validation rejects duplicate IDs, unsafe URLs, unknown fields and dangling references', () => {
  const entry = createResource({id: 'entry', title: 'A resource'});
  const catalog = addResource(createCatalog(), entry);
  assert.throws(() => validateCatalog({...catalog, resources: [entry, entry]}), /Duplicate/);
  assert.throws(() => validateCatalog({...catalog, resources: [{...entry, assetIds: ['missing']}]}), /dangling/);
  assert.throws(() => validateCatalog({...catalog, resources: [{...entry, personalEmail: 'someone@example.org'}]}), /Unknown/);
  assert.throws(() => createResource({...entry, provenance: {sourceUrl: 'javascript:alert(1)'}}), /HTTP/);
  assert.throws(() => createResource({...entry, rights: {statement: '', licenseUrl: 'https://user:pass@example.org/'}}), /HTTP/);
  assert.throws(() => validateCatalog({...catalog, version: 2}), /Unsupported/);
  assert.throws(() => createResource({title: ''}));
  assert.throws(() => createResource({title: 'A', id: 'an email@example.org'}), /identifier/);
});
test('extensions require namespaces and bounded plain JSON; arbitrary execution fields are not accepted', () => {
  assert.throws(() => createResource({title: 'A', extensions: {learning: {notes: 'x'}}}), /namespace/);
  assert.throws(() => createResource({title: 'A', extensions: {'org.example.app': {bad: Infinity}}}), /number/);
  assert.throws(() => createResource({title: 'A', extensions: {'org.example.app': {bad: undefined} as never}}));
  assert.throws(() => createResource({title: 'A', extensions: {'org.example.app': JSON.parse('{"__proto__":{"polluted":true}}')}}), /Unsafe/);
  assert.throws(() => createResource({title: 'A', extensions: {'org.example.app': 'x'.repeat(CATALOG_LIMITS.extensionBytes + 1)}}), /oversized/);
  let deep: unknown = {}; for (let i = 0; i < CATALOG_LIMITS.extensionDepth + 1; i++) deep = {nested: deep};
  assert.throws(() => createResource({title: 'A', extensions: {'org.example.app': deep as never}}), /complex/);
  assert.equal(({} as {polluted?: boolean}).polluted, undefined);
});
test('portable bundle round trip preserves metadata and exact bytes without filesystem paths or fetching', async () => {
  const original = await fixture(); const exported = await exportCatalogBundle(original); const opened = await importCatalogBundle(exported);
  assert.deepEqual(opened.catalog, original.catalog); assert.deepEqual(opened.content, original.content);
  assert.equal(JSON.parse(exported).format, 'open-library-bundle');
  assert.equal(JSON.parse(exported).catalog.resources[0].assetIds[0], 'asset-1');
  assert.equal(JSON.parse(exported).catalog.resources[0].data, undefined);
});
test('bundle imports fail closed for malformed manifests, unknown content and noncanonical base64', async () => {
  const original = JSON.parse(await exportCatalogBundle(await fixture()));
  await assert.rejects(() => importCatalogBundle('{'), /JSON/);
  await assert.rejects(() => importCatalogBundle(JSON.stringify({...original, version: 2})), /Unsupported/);
  await assert.rejects(() => importCatalogBundle(JSON.stringify({...original, extra: 'field'})), /Unknown/);
  await assert.rejects(() => importCatalogBundle(JSON.stringify({...original, content: []})), /count/);
  await assert.rejects(() => importCatalogBundle(JSON.stringify({...original, content: [{id: 'missing', base64: original.content[0].base64}]})), /Unknown/);
  await assert.rejects(() => importCatalogBundle(JSON.stringify({...original, content: [{...original.content[0], base64: '!!!!'}]})), /base64/);
  const tiny = await createAsset(new Uint8Array([102]), {id: 'tiny', name: 'tiny.txt', mime: 'text/plain'});
  const noncanonical = JSON.parse(await exportCatalogBundle({catalog: addAsset(createCatalog(), tiny), content: new Map([['tiny', new Uint8Array([102])]])}));
  noncanonical.content[0].base64 = 'Zh==';
  await assert.rejects(() => importCatalogBundle(JSON.stringify(noncanonical)), /canonical/);
});
test('asset size/hash checks detect corrupted, missing and excess content', async () => {
  const bundle = await fixture(); const corrupted = bytes.slice(); corrupted[0] ^= 1;
  await assert.rejects(() => validateBundle({...bundle, content: new Map([['asset-1', corrupted]])}), /integrity/);
  await assert.rejects(() => validateBundle({...bundle, content: new Map([['asset-1', new Uint8Array([1])]])}), /length/);
  await assert.rejects(() => validateBundle({...bundle, content: new Map()}), /exactly/);
  await assert.rejects(() => validateBundle({...bundle, content: new Map([...bundle.content, ['excess', bytes]])}), /exactly/);
  await assert.rejects(() => createAsset(new Uint8Array(CATALOG_LIMITS.fileBytes + 1), {name: 'large.bin', mime: 'application/octet-stream'}), /oversized/);
  const parsed = JSON.parse(await exportCatalogBundle(bundle)); const sameSize = bytes.slice(); sameSize[0] ^= 1; parsed.content[0].base64 = toBase64(sameSize);
  await assert.rejects(() => importCatalogBundle(JSON.stringify(parsed)), /integrity/);
});
test('metadata, record-count and portable input bounds reject excess work', async () => {
  const empty = createCatalog();
  assert.throws(() => validateCatalog({...empty, resources: Array(CATALOG_LIMITS.resources + 1).fill({})}), /capacity/);
  const entries: Resource[] = Array.from({length: 1000}, (_, index) => createResource({id: `r-${index}`, title: 'Bounded', description: 'x'.repeat(20000)}));
  assert.throws(() => validateCatalog({...empty, resources: entries}), /metadata capacity/);
  await assert.rejects(() => importCatalogBundle('x'.repeat(CATALOG_LIMITS.bundleBytes + 1)), /capacity/);
});
test('new catalog encryption round trip protects all metadata/content and authenticates revisions', async () => {
  const bundle = await fixture(); const session = await createSession('a long catalog test passphrase');
  const encrypted = await sealCatalog(bundle, session); const twice = await sealCatalog(bundle, session);
  assert.equal(encrypted.format, 'open-library-catalog-vault'); assert.notEqual(encrypted.iv, twice.iv); assert.notEqual(encrypted.ciphertext, twice.ciphertext);
  assert.equal(JSON.stringify(encrypted).includes('Physics'), false); assert.equal(JSON.stringify(encrypted).includes('lesson.txt'), false);
  assert.equal(session.key.extractable, false);
  const opened = await unsealCatalog(encrypted, 'a long catalog test passphrase'); assert.deepEqual(opened.bundle, bundle);
  await assert.rejects(() => unsealCatalog(encrypted, 'wrong passphrase'), /Could not unlock/);
  const tampered = fromBase64(encrypted.ciphertext); tampered[0] ^= 1;
  await assert.rejects(() => unsealCatalog({...encrypted, ciphertext: toBase64(tampered)}, 'a long catalog test passphrase'), /Could not unlock/);
  await assert.rejects(() => unsealCatalog({...encrypted, revision: createRevision()}, 'a long catalog test passphrase'), /Could not unlock/);
  await assert.rejects(() => unseal(encrypted, 'a long catalog test passphrase'), /Unsupported/);
});
test('catalog vault header rejects unsupported KDF, legacy formats and malformed encoding before derivation', async () => {
  const encrypted = await sealCatalog({catalog: createCatalog(), content: new Map()}, await createSession('a valid catalog passphrase'));
  assert.throws(() => validateCatalogEnvelope({...encrypted, iterations: 900000000}), /Unsupported/);
  assert.throws(() => validateCatalogEnvelope({...encrypted, format: 'open-learning-rooms'}), /Unsupported/);
  assert.throws(() => validateCatalogEnvelope({...encrypted, unexpected: true}), /Unsupported/);
  assert.throws(() => validateCatalogEnvelope({...encrypted, salt: ' '.repeat(24)}), /encoding/);
  assert.throws(() => validateCatalogEnvelope({...encrypted, iv: ''}), /encoding/);
  assert.throws(() => validateCatalogEnvelope({...encrypted, ciphertext: ''}), /Damaged/);
});
test('memory store implements atomic create/write/delete revisions and detached snapshots', async () => {
  const store = new MemoryCatalogStore(); assert.equal(await store.read(), null);
  const bundle = {catalog: createCatalog(), content: new Map()}; const session = await createSession('a valid store test passphrase');
  const first = await sealCatalog(bundle, session); await store.write(first, null);
  first.iv = 'AAAAAAAAAAAAAAAA'; assert.notEqual((await store.read())!.iv, first.iv);
  const snapshot = (await store.read())!; snapshot.ciphertext = ''; assert.notEqual((await store.read())!.ciphertext, '');
  const current = (await store.read())!;
  const next = await sealCatalog({catalog: {...bundle.catalog, revision: createRevision()}, content: new Map()}, session);
  const rival = await sealCatalog({catalog: {...bundle.catalog, revision: createRevision()}, content: new Map()}, session);
  await assert.rejects(() => store.write(next, null), CatalogConflictError);
  await assert.rejects(() => store.write(current, current.revision), CatalogConflictError);
  const results = await Promise.allSettled([store.write(next, current.revision), store.write(rival, current.revision)]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter(item => item.status === 'rejected').length, 1);
  assert.equal((await store.read())!.revision, next.revision);
  await assert.rejects(() => store.remove(current.revision), CatalogConflictError);
  assert.equal((await store.read())!.revision, next.revision);
  await store.remove(next.revision); assert.equal(await store.read(), null);
  await assert.rejects(() => store.remove(next.revision), CatalogConflictError);
});
