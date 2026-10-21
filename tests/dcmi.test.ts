import test from 'node:test';
import assert from 'node:assert/strict';
import {createResource, resourceToDCMI, type DCMIField, type Resource} from '../packages/core/src/index.ts';

const allFields: DCMIField[] = ['title', 'description', 'creators', 'languages', 'subjects', 'rightsStatement', 'licenseUrl', 'sourceUrl'];
const term = (name: string) => `http://purl.org/dc/terms/${name}`;
function fixture(): Resource {
  return createResource({id: 'PRIVATE_LOCAL_ID_CANARY', title: 'Forces 物理 علم', kind: 'document',
    description: 'A selected account of equilibrium.', creators: ['Ana', 'علي'], languages: ['fil', 'zh-Hant', 'Arabic'],
    subjects: ['Physics', '物理'], rights: {statement: 'Permission is limited to classroom use.', licenseUrl: 'https://example.org/license'},
    provenance: {sourceUrl: 'https://example.org/physics'}, assetIds: ['PRIVATE_ASSET_ID_CANARY'],
    extensions: {'org.example.learning': {notes: 'PRIVATE_JOURNAL_CANARY', answer: 'PRIVATE_ATTEMPT_CANARY'},
      'org.example.files': {bytes: 'PRIVATE_FILE_BYTES_CANARY'}}});
}

test('explicit selection emits only chosen descriptive fields, never identifiers, files or application extensions', () => {
  const resource = fixture();
  const mapped = resourceToDCMI(resource, ['title', 'languages', 'rightsStatement']);
  assert.deepEqual(mapped, {
    [term('title')]: ['Forces 物理 علم'],
    [term('language')]: ['fil', 'zh-Hant', 'Arabic'],
    [term('rights')]: ['Permission is limited to classroom use.']
  });
  const text = JSON.stringify(resourceToDCMI(resource, allFields));
  for (const privateValue of ['PRIVATE_LOCAL_ID_CANARY', 'PRIVATE_ASSET_ID_CANARY', 'PRIVATE_JOURNAL_CANARY', 'PRIVATE_ATTEMPT_CANARY', 'PRIVATE_FILE_BYTES_CANARY'])
    assert.equal(text.includes(privateValue), false, privateValue);
  assert.deepEqual(resourceToDCMI(resource, []), {});
});

test('rights statements, license documents and source relations remain separate without inferring permission or custody', () => {
  const resource = fixture();
  resource.rights.licenseUrl = 'https://EXAMPLE.org:443/license';
  resource.provenance.sourceUrl = 'https://EXAMPLE.org:443/physics';
  assert.deepEqual(resourceToDCMI(resource, ['rightsStatement', 'licenseUrl', 'sourceUrl']), {
    [term('rights')]: ['Permission is limited to classroom use.'],
    [term('license')]: ['https://example.org/license'],
    [term('relation')]: ['https://example.org/physics']
  });
  const mapped = resourceToDCMI(createResource({title: 'A work with unknown rights'}), allFields);
  assert.deepEqual(mapped, {[term('title')]: ['A work with unknown rights']});
  assert.equal(term('provenance') in mapped, false);
  assert.equal(term('source') in mapped, false);
  assert.equal(term('accessRights') in mapped, false);
});

test('optional absent metadata is omitted while descriptive language text follows existing catalog validation', () => {
  const resource = createResource({title: 'Learning', description: '   ', languages: ['Cebuano', 'en-PH'], creators: [], subjects: [], rights: {statement: ''}});
  assert.deepEqual(resourceToDCMI(resource, allFields), {
    [term('title')]: ['Learning'], [term('language')]: ['Cebuano', 'en-PH']
  });
});

test('mapping is deterministic and detached in both directions without changing its resource', () => {
  const resource = fixture();
  const before = structuredClone(resource);
  const first = resourceToDCMI(resource, allFields);
  assert.deepEqual(resourceToDCMI(resource, allFields), first);
  assert.deepEqual(resource, before);
  first['http://purl.org/dc/terms/creator']!.push('Output changed');
  assert.deepEqual(resource.creators, before.creators);
  const second = resourceToDCMI(resource, ['creators']);
  resource.creators[0] = 'Caller changed';
  assert.deepEqual(second, {[term('creator')]: before.creators});
});

test('invalid resources and unsafe links reject rather than exporting partial metadata', () => {
  const valid = fixture();
  for (const invalid of [null, {...valid, title: ''}, {...valid, kind: 'unsupported'},
    {...valid, creators: [12]}, {...valid, unexpected: 'extra'},
    {...valid, rights: {statement: '', licenseUrl: 'javascript:alert(1)'}},
    {...valid, provenance: {sourceUrl: 'https://name:password@example.org/'}}]) {
    assert.throws(() => resourceToDCMI(invalid as Resource, ['title']));
  }
});

test('field selection is required, bounded and rejects unknown names; selected text can still be private', () => {
  const resource = fixture();
  for (const fields of [undefined, null, 'title', ['extensions'], ['__proto__'], ['title', 'title'], Array(1), Array(9).fill('title')])
    assert.throws(() => resourceToDCMI(resource, fields as DCMIField[]), /distinct supported/);
  resource.title = 'PRIVATE_SELECTED_TITLE_CANARY';
  resource.description = 'PRIVATE_SELECTED_DESCRIPTION_CANARY';
  assert.equal(JSON.stringify(resourceToDCMI(resource, ['title', 'description'])).includes('PRIVATE_SELECTED_TITLE_CANARY'), true);
  assert.equal(JSON.stringify(resourceToDCMI(resource, ['title'])).includes('PRIVATE_SELECTED_DESCRIPTION_CANARY'), false);
});
