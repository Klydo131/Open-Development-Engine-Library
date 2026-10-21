import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAsset, createCatalog, createCollection, createResource, createSession, emptyLibrary,
  hashContent, seal, toBase64, validateBundle, validateLibrary,
  type CatalogBundle, type Lesson, type Library, type ResourceKind
} from '../packages/core/src/index.ts';
import {
  LEARNING_NAMESPACE, bundleToLibrary, learningResource, libraryToBundle,
  openLearningVault, revisionOf, sealLearningVault, validateAppEnvelope
} from '../apps/web/src/learning-vault.ts';

const encoder = new TextEncoder();
const createdAt = '2026-09-14T00:00:00Z';
const pdf = encoder.encode('%PDF-1.7\n% 物理 علم\n%%EOF');
const audio = encoder.encode('RIFF0000WAVEfmt 音楽');
function lesson(id: string, overrides: Partial<Lesson> = {}): Lesson {
  return {id, title: `Learning ${id}`, kind: 'note', url: '', tags: ['Physics'], notes: 'Private notes 物理 علم',
    question: 'What changed?', answer: 'My understanding grew.', learned: false, createdAt, ...overrides};
}
function legacyLibrary(): Library {
  return validateLibrary({version: 1, recommendations: true, lessons: [
    lesson('note', {learned: true}),
    lesson('link', {kind: 'link', url: 'https://example.org/physics?q=motion', tags: ['Science', '物理']}),
    lesson('video', {kind: 'video', url: 'https://www.youtube.com/watch?v=synthetic', question: 'How can I apply this?'}),
    lesson('pdf', {kind: 'pdf', attachment: {name: 'Physics 物理.pdf', mime: 'application/pdf', data: toBase64(pdf)}}),
    lesson('audio', {kind: 'audio', attachment: {name: 'Music 音楽.wav', mime: 'audio/wav', data: toBase64(audio)}})
  ], practices: [
    {id: 'practice', lessonId: 'note', title: 'Apply this lesson', steps: ['Observe', 'Try', 'Reflect'], completed: [true, false, true], reflection: 'Private reflection 思考'}
  ]});
}

test('legacy sources, private learning fields, practices and preferences round-trip without loss', async () => {
  const original = legacyLibrary();
  const before = structuredClone(original);
  const bundle = await libraryToBundle(original);
  assert.deepEqual(bundleToLibrary(bundle), original);
  assert.deepEqual(original, before);
  assert.deepEqual(bundle.catalog.resources.map(resource => resource.kind), ['note', 'link', 'video', 'document', 'audio']);
  for (const resource of bundle.catalog.resources) {
    assert.equal(resource.description, '', 'private learning notes must not become general catalog descriptions');
    assert.equal('notes' in resource, false);
  }
  const pdfResource = learningResource(bundle, 'pdf')!;
  const audioResource = learningResource(bundle, 'audio')!;
  assert.deepEqual(bundle.content.get(pdfResource.assetIds[0]), pdf);
  assert.deepEqual(bundle.content.get(audioResource.assetIds[0]), audio);
  assert.equal(bundle.catalog.assets.find(asset => asset.id === pdfResource.assetIds[0])!.name, 'Physics 物理.pdf');
  assert.equal(bundle.catalog.assets.find(asset => asset.id === audioResource.assetIds[0])!.sha256, await hashContent(audio));
  original.recommendations = false;
  const edited = await libraryToBundle(original, bundle);
  assert.deepEqual(bundleToLibrary(edited), original);
  assert.notEqual(edited.catalog.revision, bundle.catalog.revision);
  assert.deepEqual(edited.catalog.assets, bundle.catalog.assets, 'unchanged attachments reuse their asset descriptors');
});

test('nonconforming legacy identifiers become stable catalog IDs while original lesson and practice references survive', async () => {
  const legacyId = 'a private lesson / 物理';
  const original: Library = {version: 1, recommendations: false, lessons: [lesson(legacyId)], practices: [
    {id: 'practice / 1', lessonId: legacyId, title: 'Try it', steps: ['Observe'], completed: [false], reflection: 'Keep the original references.'}
  ]};
  const bundle = await libraryToBundle(original);
  const expected = `legacy-${(await hashContent(encoder.encode(legacyId))).slice(0, 48)}`;
  assert.equal(bundle.catalog.resources[0].id, expected);
  assert.equal((bundle.catalog.resources[0].extensions[LEARNING_NAMESPACE] as {lessonId: string}).lessonId, legacyId);
  assert.equal(learningResource(bundle, legacyId)!.id, expected);
  assert.deepEqual(bundleToLibrary(bundle), original);
  const savedAgain = await libraryToBundle(bundleToLibrary(bundle), bundle);
  assert.equal(savedAgain.catalog.resources[0].id, expected);
  assert.deepEqual(bundleToLibrary(savedAgain), original);
});

test('learning edits preserve generic catalog metadata, collections and other applications’ extensions', async () => {
  const resource = createResource({
    id: 'generic-source', title: 'Published study', kind: 'link', description: 'Public bibliographic description.',
    creators: ['Ada Example'], languages: ['en', 'zh-Hant'], subjects: ['Science', '物理'],
    rights: {statement: 'Permission supplied by its owner.', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'},
    provenance: {sourceUrl: 'https://example.org/original'}, createdAt: '2025-01-01T00:00:00Z',
    extensions: {'org.example.citation': {edition: 2, locator: ['chapter 1', 'p. 8']}}
  });
  const catalog = createCatalog();
  catalog.resources = [resource];
  catalog.collections = [createCollection({id: 'shelf', title: 'Reading shelf', description: 'A curated shelf', resourceIds: [resource.id], extensions: {'org.example.shelf': {position: 1}}})];
  catalog.extensions = {'org.example.curator': {custom: true}, [LEARNING_NAMESPACE]: {version: 1, recommendations: true, practices: [], customPreference: 'keep'}};
  const previous = await validateBundle({catalog, content: new Map()});
  const input = bundleToLibrary(previous);
  input.lessons[0].notes = 'New private notes';
  input.lessons[0].question = 'A private question?';
  input.lessons[0].answer = 'A private answer.';
  input.lessons[0].learned = true;
  const next = await libraryToBundle(input, previous);
  const saved = next.catalog.resources[0];
  for (const field of ['id', 'title', 'kind', 'description', 'creators', 'languages', 'subjects', 'rights', 'provenance', 'assetIds', 'createdAt'] as const) {
    assert.deepEqual(saved[field], resource[field], `generic ${field} must survive`);
  }
  assert.deepEqual(saved.extensions['org.example.citation'], resource.extensions['org.example.citation']);
  assert.deepEqual(next.catalog.collections, previous.catalog.collections);
  assert.deepEqual(next.catalog.extensions['org.example.curator'], {custom: true});
  assert.equal((next.catalog.extensions[LEARNING_NAMESPACE] as {customPreference: string}).customPreference, 'keep');
  assert.deepEqual(bundleToLibrary(next), input);
  assert.equal(saved.description.includes('New private notes'), false);
});

test('empty generic catalogs default recommendations off while explicit legacy preferences survive', async () => {
  assert.equal(bundleToLibrary({catalog: createCatalog(), content: new Map()}).recommendations, false);
  for (const preference of [true, false]) {
    const original = {...emptyLibrary(), recommendations: preference};
    assert.equal(bundleToLibrary(await libraryToBundle(original)).recommendations, preference);
  }
});

test('valid legacy practice and reflection data larger than 64 KiB survives catalog migration', async () => {
  const original = {...emptyLibrary(), lessons: [lesson('source')], practices: Array.from({length: 5}, (_, index) => ({
    id: `practice-${index}`, lessonId: 'source', title: `Practice ${index}`, steps: ['Use this knowledge'],
    completed: [index % 2 === 0], reflection: 'Learning reflection 物理. '.repeat(700)
  }))};
  const validated = validateLibrary(original);
  assert.ok(encoder.encode(JSON.stringify(validated.practices)).length > 64 * 1024);
  const bundle = await libraryToBundle(validated);
  assert.deepEqual(bundleToLibrary(bundle), validated);
});

async function genericAssets(kind: ResourceKind, supportedPrimary: boolean): Promise<CatalogBundle> {
  const primary = supportedPrimary ? pdf : encoder.encode('Unrendered primary document content');
  const second = encoder.encode('Additional supplementary data 物理');
  const primaryAsset = await createAsset(primary, {id: 'primary', name: supportedPrimary ? 'study.pdf' : 'study.epub', mime: supportedPrimary ? 'application/pdf' : 'application/epub+zip'});
  const supplement = await createAsset(second, {id: 'supplement', name: 'supplement.txt', mime: 'text/plain'});
  const catalog = createCatalog();
  catalog.assets = [primaryAsset, supplement];
  catalog.resources = [createResource({id: 'generic', title: 'Generic resource', kind, assetIds: ['primary', 'supplement']})];
  return validateBundle({catalog, content: new Map([['primary', primary], ['supplement', second]])});
}

test('unsupported resource kinds and all asset references survive repeated learning edits', async () => {
  for (const kind of ['other', 'document'] as const) {
    const original = await genericAssets(kind, false);
    let current = original;
    for (let revision = 0; revision < 2; revision++) {
      const library = bundleToLibrary(current);
      assert.equal(library.lessons[0].attachment, undefined, 'the learning demo does not render this format');
      library.lessons[0].notes = `Private learning edit ${revision}`;
      current = await libraryToBundle(library, current);
      assert.equal(current.catalog.resources[0].kind, kind);
      assert.deepEqual(current.catalog.resources[0].assetIds, original.catalog.resources[0].assetIds);
      assert.deepEqual(current.catalog.assets, original.catalog.assets);
      assert.deepEqual(current.content, original.content);
    }
  }
});

test('a supported primary preview preserves supplementary generic resource assets after learning edits', async () => {
  const original = await genericAssets('document', true);
  const library = bundleToLibrary(original);
  assert.equal(library.lessons[0].kind, 'pdf');
  library.lessons[0].notes = 'Private edit with no file replacement.';
  const saved = await libraryToBundle(library, original);
  assert.deepEqual(saved.catalog.resources[0].assetIds, ['primary', 'supplement']);
  assert.deepEqual(saved.catalog.assets, original.catalog.assets);
  assert.deepEqual(saved.content, original.content);
});

test('replacing a previewed primary attachment retains supplementary generic resource assets', async () => {
  const original = await genericAssets('document', true);
  const library = bundleToLibrary(original);
  const replacement = encoder.encode('%PDF-1.7\n% Revised private study 物理\n%%EOF');
  library.lessons[0].attachment = {name: 'revised-study.pdf', mime: 'application/pdf', data: toBase64(replacement)};
  const saved = await libraryToBundle(library, original);
  const ids = saved.catalog.resources[0].assetIds;
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], 'primary');
  assert.equal(ids[1], 'supplement');
  assert.deepEqual(saved.content.get(ids[0]), replacement);
  assert.deepEqual(saved.content.get('supplement'), original.content.get('supplement'));
  assert.deepEqual(bundleToLibrary(saved), library);
});

test('encrypted legacy v1 opens, migrates and reopens in the new encrypted catalog format', async () => {
  const original = legacyLibrary();
  const passphrase = 'Synthetic migration passphrase 物理';
  const session = await createSession(passphrase);
  const legacy = await seal(original, session);
  const before = structuredClone(legacy);
  assert.equal(validateAppEnvelope(legacy).format, 'open-learning-rooms');
  assert.equal(revisionOf(legacy), legacy.iv);
  const migrated = await openLearningVault(legacy, passphrase);
  assert.equal(migrated.migrated, true);
  assert.deepEqual(migrated.library, original);
  const saved = await sealLearningVault(migrated.library, migrated.session, migrated.bundle);
  assert.equal(validateAppEnvelope(saved.envelope).format, 'open-library-catalog-vault');
  assert.equal(revisionOf(saved.envelope), saved.bundle.catalog.revision);
  const reopened = await openLearningVault(saved.envelope, passphrase);
  assert.equal(reopened.migrated, false);
  assert.deepEqual(reopened.library, original);
  assert.deepEqual(reopened.bundle, saved.bundle);
  assert.deepEqual(legacy, before, 'migration does not overwrite the input backup');
  assert.equal(JSON.stringify(saved.envelope).includes('Private notes'), false);
  await assert.rejects(() => openLearningVault(saved.envelope, 'a wrong passphrase'), /Could not unlock catalog/);
});
