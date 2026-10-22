import test from 'node:test';
import assert from 'node:assert/strict';
import {addCollection, addResource, createCatalog, createCollection, createResource, searchCatalog, type CatalogSearch} from '../packages/core/src/index.ts';

function fixture() {
  let catalog = createCatalog();
  for (const item of [
    createResource({id: 'b', title: 'CAFÉ 物理', kind: 'document', subjects: ['Science'], languages: ['en-PH']}),
    createResource({id: 'a', title: 'cafe\u0301 物理', kind: 'document', description: 'علم الحركة', subjects: ['SCIENCE'], languages: ['EN-ph']}),
    createResource({id: 'c', title: 'Music', kind: 'audio', provenance: {sourceUrl: 'https://example.org/source-canary'}, extensions: {'org.example.notes': {private: 'extension-canary'}}})
  ]) catalog = addResource(catalog, item);
  return addCollection(catalog, createCollection({id: 'shelf', title: 'Shelf', resourceIds: ['b']}));
}

test('search rejects non-object filters and invalid option types independently of catalog contents', () => {
  const invalid: unknown[] = [null, [], 3, 'science', new Date(), {query: null}, {query: 12}, {subject: null}, {subject: 42}, {language: null}, {language: []}, {collectionId: null}, {collectionId: 12}, {kind: null}];
  for (const catalog of [createCatalog(), fixture()]) {
    for (const filter of invalid) assert.throws(() => searchCatalog(catalog, filter as CatalogSearch), /catalog|resource kind/i);
  }
});

test('search rejects unknown fields and unsupported kinds before an empty or missing-collection result', () => {
  for (const catalog of [createCatalog(), fixture()]) {
    for (const invalid of [{subjet: 'Science'}, {extensions: 'extension-canary'}, {kind: 'book'}]) {
      assert.throws(() => searchCatalog(catalog, invalid as CatalogSearch), /catalog|resource kind/i);
      assert.throws(() => searchCatalog(catalog, {...invalid, collectionId: 'missing'} as CatalogSearch), /catalog|resource kind/i);
    }
    assert.throws(() => searchCatalog(catalog, {collectionId: 'missing', subject: 42} as unknown as CatalogSearch), /catalog/i);
  }
});

test('search validates every string bound and collection identifier before matching', () => {
  const invalid: CatalogSearch[] = [{query: 'x'.repeat(2001)}, {subject: 'x'.repeat(201)}, {language: 'x'.repeat(81)}, {collectionId: 'x'.repeat(129)}, {collectionId: ''}, {collectionId: 'bad/id'}, {query: '\0'}, {subject: '\0'}, {language: '\0'}];
  for (const catalog of [createCatalog(), fixture()]) {
    for (const filter of invalid) assert.throws(() => searchCatalog(catalog, filter), /catalog/i);
  }
});

test('search accepts exact UTF-16 limits including astral text and absent optional values', () => {
  const subject = '😀'.repeat(100); const language = '😀'.repeat(40); const collectionId = 's'.repeat(128);
  let catalog = addResource(createCatalog(), createResource({id: 'match', title: 'x', description: 'x'.repeat(2000), subjects: [subject], languages: [language]}));
  catalog = addCollection(catalog, createCollection({id: collectionId, title: 'Shelf', resourceIds: ['match']}));
  assert.equal(searchCatalog(catalog, {query: 'x'.repeat(2000), subject, language, collectionId}).length, 1);
  assert.equal(searchCatalog(catalog, {query: '😀'.repeat(1000)}).length, 0);
  for (const filter of [{subject: `${subject}x`}, {language: `${language}x`}, {query: `${'😀'.repeat(1000)}x`}]) assert.throws(() => searchCatalog(catalog, filter), /catalog/i);
  assert.deepEqual(searchCatalog(catalog, {query: undefined, subject: undefined, language: undefined, collectionId: undefined, kind: undefined}), searchCatalog(catalog));
  assert.deepEqual(searchCatalog(catalog, undefined), searchCatalog(catalog, {}));
});

test('valid search retains Unicode matching, exact filters, deterministic order and detached results', () => {
  const catalog = fixture(); const before = structuredClone(catalog);
  const matches = searchCatalog(catalog, {query: 'ｃａｆé 物理', subject: 'science', language: 'en-ph', kind: 'document'});
  assert.deepEqual(matches.map(item => item.id), ['a', 'b']);
  assert.deepEqual(searchCatalog(catalog, {query: 'علم'}).map(item => item.id), ['a']);
  assert.deepEqual(searchCatalog(catalog, {subject: 'sci'}), []);
  assert.deepEqual(searchCatalog(catalog, {collectionId: 'shelf'}).map(item => item.id), ['b']);
  assert.deepEqual(searchCatalog(catalog, {collectionId: 'missing'}), []);
  assert.deepEqual(searchCatalog(catalog, {subject: ''}), []);
  assert.deepEqual(searchCatalog(catalog, {language: ''}), []);
  matches[0].subjects.push('Changed');
  assert.deepEqual(catalog, before);
});

test('search keeps source URLs and private extensions outside its query fields', () => {
  const catalog = fixture();
  for (const query of ['source-canary', 'extension-canary']) assert.deepEqual(searchCatalog(catalog, {query}), []);
  assert.deepEqual(searchCatalog(catalog, {query: ''}).map(item => item.id), ['a', 'b', 'c']);
});
