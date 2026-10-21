import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAsset, addCollection, addResource, createAsset, createCatalog, createCollection,
  createResource, createSession, exportCatalogBundle, importCatalogBundle, rekeyCatalog,
  sealCatalog, unsealCatalog, type CatalogBundle, type JsonValue
} from '../packages/core/src/index.ts';
import {
  addAttempt, addBrief, addFeedback, emptyEducation, submitAttempt, EDUCATION_EXTENSION,
  type EducationState
} from '../packages/education/src/index.ts';
import {readEducation, withEducation} from '../apps/web/src/education-store.ts';
import {bundleToLibrary, libraryToBundle} from '../apps/web/src/learning-vault.ts';

function education(): EducationState {
  let state = addBrief(emptyEducation(), {
    id: 'brief', version: 1, title: 'Forces 物理 علم', goal: 'Explain equilibrium.',
    task: 'Draw the forces on a resting book.', example: 'Name the object first.',
    successChecklist: ['Name both forces.'], sources: [], language: 'en'
  });
  state = addAttempt(state, {id: 'attempt', revision: 1, briefId: 'brief', briefVersion: 1,
    answer: 'The upward support balances gravity.', question: 'What changes when lifted?',
    nextAction: 'PRIVATE_PLAN_CANARY', reviewDate: '2026-10-22'});
  state = submitAttempt(state, 'attempt', 1, 'submission');
  return addFeedback(state, {id: 'feedback', submissionId: 'submission',
    strength: 'You named both forces.', nextAction: 'Label the directions.', question: ''});
}

async function fixture(): Promise<CatalogBundle> {
  const bytes = new TextEncoder().encode('PRIVATE_RESOURCE_BYTES_CANARY 物理 علم');
  const descriptor = await createAsset(bytes, {id: 'asset', name: 'reference.txt', mime: 'text/plain'});
  let catalog = addAsset(createCatalog(), descriptor);
  catalog = addResource(catalog, createResource({id: 'resource', title: 'Private reference',
    kind: 'document', description: 'PRIVATE_RESOURCE_DESCRIPTION_CANARY', assetIds: ['asset'],
    extensions: {'org.example.notes': {notes: 'PRIVATE_RESOURCE_NOTES_CANARY'}}}));
  catalog = addCollection(catalog, createCollection({id: 'shelf', title: 'My shelf', resourceIds: ['resource'],
    extensions: {'org.example.shelf': {color: 'green'}}}));
  catalog = {...catalog, modifiedAt: '2020-01-01T00:00:00.000Z',
    extensions: {'org.example.catalog': {journal: 'PRIVATE_JOURNAL_CANARY', nested: [null, false, 17]}}};
  return {catalog, content: new Map([['asset', bytes]])};
}

test('legacy catalogs without education read as empty without writing a namespace', async () => {
  const original = await fixture();
  const before = structuredClone(original);
  assert.deepEqual(readEducation(original), emptyEducation());
  assert.equal(EDUCATION_EXTENSION in original.catalog.extensions, false);
  assert.deepEqual(original, before);
});

test('writing education preserves resources, private notes, content, shelves and unrelated extensions', async () => {
  const original = await fixture();
  const before = structuredClone(original);
  const state = education();
  const next = withEducation(original, state);
  assert.notEqual(next, original);
  assert.notEqual(next.catalog.revision, original.catalog.revision);
  assert.notEqual(next.catalog.modifiedAt, original.catalog.modifiedAt);
  assert.ok(Number.isFinite(Date.parse(next.catalog.modifiedAt)));
  assert.deepEqual(next.catalog, {...before.catalog, revision: next.catalog.revision,
    modifiedAt: next.catalog.modifiedAt,
    extensions: {...before.catalog.extensions, [EDUCATION_EXTENSION]: state}});
  assert.equal(next.content, original.content, 'metadata updates must not recopy file bytes');
  assert.deepEqual(next.content, before.content);
  assert.deepEqual(readEducation(next), state);
  assert.deepEqual(original, before);
});

test('education reads return frozen detached records while leaving generic metadata unchanged', async () => {
  const stored = withEducation(await fixture(), education());
  const read = readEducation(stored);
  assert.notEqual(read, stored.catalog.extensions[EDUCATION_EXTENSION]);
  assert.ok(Object.isFrozen(read));
  assert.ok(Object.isFrozen(read.briefs));
  assert.ok(Object.isFrozen(read.attempts[0]));
  assert.throws(() => { (read.attempts[0] as {answer: string}).answer = 'Changed'; }, TypeError);
  assert.equal(readEducation(stored).attempts[0].answer, 'The upward support balances gravity.');
});

test('unsupported and malformed education fails closed without changing or dropping source data', async () => {
  const original = await fixture();
  for (const invalid of [null, {...emptyEducation(), version: 2}, {...emptyEducation(), unexpected: true},
    {...emptyEducation(), attempts: [{id: 'dangling'}]}]) {
    const bundle = {...original, catalog: {...original.catalog, extensions: {
      ...original.catalog.extensions, [EDUCATION_EXTENSION]: invalid as JsonValue}}};
    const before = structuredClone(bundle);
    assert.throws(() => readEducation(bundle));
    assert.deepEqual(bundle, before);
    assert.throws(() => withEducation(bundle, invalid as unknown as EducationState));
    assert.deepEqual(bundle, before);
  }
});

test('portable backups, encrypted vaults and passphrase changes retain the full education history', async () => {
  const bundle = withEducation(await fixture(), education());
  const before = structuredClone(bundle);
  const portable = await importCatalogBundle(await exportCatalogBundle(bundle));
  assert.deepEqual(portable, before);
  assert.deepEqual(readEducation(portable), education());
  const passphrase = 'synthetic education vault passphrase';
  const replacement = 'synthetic replacement education passphrase';
  const envelope = await sealCatalog(portable, await createSession(passphrase));
  for (const privateText of ['Forces', 'PRIVATE_PLAN_CANARY', 'PRIVATE_RESOURCE_BYTES_CANARY', 'PRIVATE_JOURNAL_CANARY'])
    assert.equal(JSON.stringify(envelope).includes(privateText), false, privateText);
  const opened = await unsealCatalog(envelope, passphrase);
  assert.deepEqual(opened.bundle, before);
  const changed = await rekeyCatalog(envelope, passphrase, replacement);
  const reopened = await unsealCatalog(changed.envelope, replacement);
  assert.deepEqual(reopened.bundle.catalog, {...before.catalog,
    revision: changed.bundle.catalog.revision, modifiedAt: changed.bundle.catalog.modifiedAt});
  assert.deepEqual(reopened.bundle.content, before.content);
  assert.deepEqual(readEducation(reopened.bundle), education());
  await assert.rejects(() => unsealCatalog(changed.envelope, passphrase), /Could not unlock/);
  assert.deepEqual(bundle, before);
});

test('editing a learning-room lesson preserves the optional education namespace and private attempt history', async () => {
  const base = await libraryToBundle({version: 1, lessons: [{id: 'lesson', title: 'My lesson', kind: 'note',
    url: '', tags: ['Physics'], notes: 'Original journal', question: '', answer: '', learned: false,
    createdAt: '2026-10-18T00:00:00.000Z'}], practices: [], recommendations: false});
  base.catalog.extensions['org.example.unrelated'] = {keep: 'PRIVATE_OTHER_EXTENSION'};
  const stored = withEducation(base, education());
  const before = structuredClone(stored);
  const library = bundleToLibrary(stored);
  library.lessons[0].notes = 'Updated learning-room journal';
  const saved = await libraryToBundle(library, stored);
  assert.equal(bundleToLibrary(saved).lessons[0].notes, 'Updated learning-room journal');
  assert.deepEqual(readEducation(saved), education());
  assert.deepEqual(saved.catalog.extensions['org.example.unrelated'], {keep: 'PRIVATE_OTHER_EXTENSION'});
  assert.deepEqual(stored, before);
});
