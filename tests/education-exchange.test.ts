import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCatalog, createResource, createSession, fromBase64, sealCatalog, toBase64,
  unsealCatalog, type CatalogBundle
} from '../packages/core/src/index.ts';
import {
  addAttempt, addBrief, addFeedback, emptyEducation, exportExchange, parseExchange,
  submitAttempt, MAX_EXCHANGE_BYTES
} from '../packages/education/src/index.ts';
import {
  EDUCATION_FILE_LIMIT, encryptEducationExchange, isEncryptedEducationExchange,
  openEducationExchange
} from '../apps/web/src/education-exchange.ts';

const passphrase = 'synthetic independent transfer secret';
let state = addBrief(emptyEducation(), {
  id: 'forces', version: 1, title: '物理 علم — balanced forces', goal: 'Explain a stationary book.',
  task: 'Name both forces.', example: 'Equal forces in opposite directions.',
  successChecklist: ['Name both forces', 'Explain the result'], sources: [], language: 'en'
});
state = addAttempt(state, {id: 'attempt', revision: 1, briefId: 'forces', briefVersion: 1, answer: 'Gravity down; desk up. 👩🏽‍🏫', question: 'How do the arrows compare?', nextAction: 'PRIVATE NEXT ACTION', reviewDate: '2027-01-02'});
state = addAttempt(state, {id: 'unrelated-attempt', revision: 1, briefId: 'forces', briefVersion: 1, answer: 'UNRELATED PRIVATE ANSWER', question: '', nextAction: ''});
state = submitAttempt(state, 'attempt', 1, 'submission');
state = addFeedback(state, {id: 'feedback', submissionId: 'submission', strength: 'You named both forces.', nextAction: 'Draw equal-length arrows.', question: 'What would change on a slope?'});
const plaintext = exportExchange(state, 'submission', 'submission', 'My chosen teacher');
const fixture = encryptEducationExchange(plaintext, passphrase);

test('encrypted selective exchange preserves exact selected work and supports check-only plaintext import', async () => {
  const encrypted = await fixture;
  assert.deepEqual(await openEducationExchange(encrypted, passphrase), parseExchange(plaintext));
  assert.deepEqual(await openEducationExchange(plaintext), parseExchange(plaintext));
  assert.equal(isEncryptedEducationExchange(encrypted), true);
  assert.equal(isEncryptedEducationExchange(plaintext), false);
  for (const text of ['Gravity down', 'My chosen teacher', 'PRIVATE NEXT ACTION', 'UNRELATED PRIVATE ANSWER', passphrase]) assert.equal(encrypted.includes(text), false);
  assert.equal(plaintext.includes('PRIVATE NEXT ACTION'), false);
  assert.equal(plaintext.includes('UNRELATED PRIVATE ANSWER'), false);
  assert.equal(plaintext.includes('reviewDate'), false);
  assert.equal(state.attempts.length, 2);
  assert.equal(state.attempts[0].nextAction, 'PRIVATE NEXT ACTION');
  const checked = await openEducationExchange(encrypted, passphrase);
  assert.equal(Object.isFrozen(checked), true);
});

test('brief and feedback use the same bounded transfer format without embedding private state', async () => {
  for (const [kind, selected] of [['brief', 'forces'], ['feedback', 'feedback']] as const) {
    const text = exportExchange(state, kind, selected, 'Chosen recipient');
    const encrypted = await encryptEducationExchange(text, passphrase);
    assert.deepEqual(await openEducationExchange(encrypted, passphrase), parseExchange(text));
    assert.equal(text.includes('UNRELATED PRIVATE ANSWER'), false);
    assert.equal(text.includes('PRIVATE NEXT ACTION'), false);
  }
});

test('independent encryption uses fresh salt and IV even for identical selected work', async () => {
  const first = JSON.parse(await fixture);
  const second = JSON.parse(await encryptEducationExchange(plaintext, passphrase));
  assert.notEqual(first.vault.salt, second.vault.salt);
  assert.notEqual(first.vault.iv, second.vault.iv);
  assert.notEqual(first.vault.ciphertext, second.vault.ciphertext);
  assert.equal((await openEducationExchange(JSON.stringify(second), passphrase)).kind, 'submission');
});

test('wrong passphrase and authenticated ciphertext tampering fail closed', async () => {
  const encrypted = await fixture;
  await assert.rejects(() => openEducationExchange(encrypted, 'a completely different transfer secret'), /Could not unlock/);
  const altered = JSON.parse(encrypted), bytes = fromBase64(altered.vault.ciphertext);
  bytes[0] ^= 1; altered.vault.ciphertext = toBase64(bytes);
  await assert.rejects(() => openEducationExchange(JSON.stringify(altered), passphrase), /Could not unlock/);
});

test('invalid files, encrypted headers and native full-vault backups reject before derivation', async t => {
  const encrypted = JSON.parse(await fixture);
  const derivation = t.mock.method(crypto.subtle, 'deriveKey', async () => {throw new Error('Unexpected expensive derivation.');});
  for (const input of ['', '{', '{}', '[]', 'null', JSON.stringify(encrypted.vault)]) await assert.rejects(() => openEducationExchange(input, passphrase));
  for (const value of [
    {...encrypted, version: 2}, {...encrypted, extra: 'private'},
    {...encrypted, vault: {...encrypted.vault, iterations: 1}},
    {...encrypted, vault: {...encrypted.vault, kdf: 'arbitrary'}},
    {...encrypted, vault: {...encrypted.vault, salt: ''}},
    {...encrypted, vault: {...encrypted.vault, iv: 'invalid'}},
    {...encrypted, vault: {...encrypted.vault, ciphertext: '!!!!'}},
    {...encrypted, vault: {...encrypted.vault, ciphertext: ''}},
    {...encrypted, vault: {...encrypted.vault, unrelated: true}}
  ]) {
    const text = JSON.stringify(value);
    assert.equal(isEncryptedEducationExchange(text), false);
    await assert.rejects(() => openEducationExchange(text, passphrase));
  }
  await assert.rejects(() => openEducationExchange(JSON.stringify(encrypted)), /transfer passphrase/);
  await assert.rejects(() => openEducationExchange(JSON.stringify(encrypted), 'x'.repeat(513)), /transfer passphrase/);
  assert.equal(derivation.mock.callCount(), 0);
});

test('file and plaintext limits reject excess UTF-8 bytes before key derivation', async t => {
  await fixture;
  const derivation = t.mock.method(crypto.subtle, 'deriveKey', async () => {throw new Error('Unexpected expensive derivation.');});
  for (const text of ['x'.repeat(EDUCATION_FILE_LIMIT + 1), '物'.repeat(Math.floor(EDUCATION_FILE_LIMIT / 3) + 1)]) {
    assert.equal(isEncryptedEducationExchange(text), false);
    await assert.rejects(() => openEducationExchange(text, passphrase), /too large/);
  }
  for (const text of ['x'.repeat(MAX_EXCHANGE_BYTES + 1), '物'.repeat(Math.floor(MAX_EXCHANGE_BYTES / 3) + 1)]) await assert.rejects(() => encryptEducationExchange(text, passphrase), /too large/);
  await assert.rejects(() => encryptEducationExchange('{}', passphrase));
  await assert.rejects(() => encryptEducationExchange(plaintext, 'short'), /between 12 and 512/);
  assert.equal(derivation.mock.callCount(), 0);
});

test('a valid encrypted full library masquerading as a transfer cannot expose unrelated records', async () => {
  const vault = await sealCatalog({catalog: {...createCatalog(), resources: [createResource({title: 'PRIVATE JOURNAL', kind: 'note', description: 'UNRELATED NOTES'})]}, content: new Map()}, await createSession(passphrase));
  const wrapped = JSON.stringify({format: 'open-learning-exchange-encrypted', version: 1, vault});
  assert.equal(isEncryptedEducationExchange(wrapped), true); // Header detection is not payload acceptance.
  await assert.rejects(() => openEducationExchange(wrapped, passphrase), /not a selected learning exchange/);
});

test('decrypted payload rejects extra metadata and malformed or oversized exchange contents', async () => {
  const original = JSON.parse(await fixture);
  const {bundle} = await unsealCatalog(original.vault, passphrase);
  const variants: CatalogBundle[] = [
    {...bundle, catalog: {...bundle.catalog, extensions: {'org.example.private': 'PRIVATE JOURNAL'}}},
    {...bundle, catalog: {...bundle.catalog, resources: [...bundle.catalog.resources, createResource({title: 'PRIVATE JOURNAL'})]}},
    {...bundle, catalog: {...bundle.catalog, resources: [{...bundle.catalog.resources[0], description: 'PRIVATE NOTES'}]}},
    {...bundle, catalog: {...bundle.catalog, resources: [{...bundle.catalog.resources[0], extensions: {'org.openlearningrooms.exchange': '{}'}}]}},
    {...bundle, catalog: {...bundle.catalog, resources: [{...bundle.catalog.resources[0], extensions: {'org.openlearningrooms.exchange': 'x'.repeat(MAX_EXCHANGE_BYTES + 1)}}]}}
  ];
  const session = await createSession(passphrase);
  for (const changed of variants) {
    const vault = await sealCatalog(changed, session);
    const wrapped = JSON.stringify({format: 'open-learning-exchange-encrypted', version: 1, vault});
    await assert.rejects(() => openEducationExchange(wrapped, passphrase));
  }
});
