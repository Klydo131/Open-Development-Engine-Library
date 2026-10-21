import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {supabaseStore} from '../examples/supabase/store.ts';
import {ITERATIONS, type Envelope} from '../packages/core/src/index.ts';

// Synthetic envelope bytes only: no credentials, live service, or user data.
const envelope: Envelope = {
  format: 'open-learning-rooms', version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
  salt: 'AAAAAAAAAAAAAAAAAAAAAA==', iv: 'abcdefghijklmnop', ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA=='
};
const revision = '+/abcdefghijklmn';
const owner = '00000000-0000-0000-0000-000000000001';
type Call = {url: URL; init: RequestInit};

function fixture(t: TestContext, response: () => Response = () => Response.json([{envelope}]), token: unknown = 'synthetic-token') {
  const calls: Call[] = [];
  const accessToken = t.mock.fn(async () => token as string);
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({url: new URL(input instanceof Request ? input.url : input), init});
    return response();
  });
  const store = supabaseStore({url: 'https://example.invalid', publishableKey: 'synthetic-publishable-key', userId: owner, accessToken});
  return {store, calls, accessToken};
}

test('legacy Supabase replacement filters by both owner and exact expected IV', async t => {
  const {store, calls} = fixture(t);
  await store.write(envelope, revision);
  assert.equal(calls.length, 1);
  const {url, init} = calls[0];
  assert.equal(url.pathname, '/rest/v1/learning_room_vaults');
  assert.deepEqual([...url.searchParams], [['owner_id', `eq.${owner}`], ['envelope->>iv', `eq.${revision}`]]);
  assert.equal(init.method, 'PATCH');
  assert.deepEqual(JSON.parse(init.body as string), {envelope});
  assert.equal(init.redirect, 'error');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.referrerPolicy, 'no-referrer');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('Authorization'), 'Bearer synthetic-token');
  assert.equal(headers.get('Prefer'), 'return=representation');
  assert.equal(headers.get('apikey'), 'synthetic-publishable-key');
});

test('legacy Supabase deletion always includes the revision filter and has no body', async t => {
  const {store, calls} = fixture(t);
  await store.remove(revision);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'DELETE');
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].url.searchParams.get('owner_id'), `eq.${owner}`);
  assert.equal(calls[0].url.searchParams.get('envelope->>iv'), `eq.${revision}`);
});

test('only exact null creates a legacy Supabase row, with no upsert preference', async t => {
  const {store, calls} = fixture(t);
  await store.write(envelope, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].url.search, '');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), {owner_id: owner, envelope});
  assert.equal(new Headers(calls[0].init.headers).get('Prefer'), 'return=representation');
});

test('malformed and missing revisions fail before token acquisition or any network access', async t => {
  const {store, calls, accessToken} = fixture(t);
  const invalid: unknown[] = [undefined, '', ' ', 'short', 'abcdefghijklmnop=', 'abcdefghijklmnopq',
    'abcdefghijklmn_1', 'abcdefghijklmn-1', 'eq.abcdefghijklmnop', 'abcdefghijklmn\n0', 'abcdefghijklmnop\n',
    'abcdefghijklmnop\r', 'abcdefghijklmnop\u2028', 0, false, {}, [], ['abcdefghijklmnop']];
  for (const value of invalid) {
    await assert.rejects(() => store.write(envelope, value as string), /valid encrypted backup revision/);
    await assert.rejects(() => store.remove(value as string), /valid encrypted backup revision/);
  }
  await assert.rejects(() => store.remove(null as unknown as string), /valid encrypted backup revision/);
  assert.equal(calls.length, 0);
  assert.equal(accessToken.mock.callCount(), 0);
});

test('invalid outgoing legacy envelopes fail before token acquisition or fetch', async t => {
  const {store, calls, accessToken} = fixture(t);
  for (const value of [undefined, null, {}, {...envelope, iv: ''}, {...envelope, iterations: 1}]) {
    await assert.rejects(() => store.write(value as Envelope, null));
    await assert.rejects(() => store.write(value as Envelope, revision));
  }
  assert.equal(calls.length, 0);
  assert.equal(accessToken.mock.callCount(), 0);
});

test('stale or absent rows cause conflicts without retrying or unconditional replacement', async t => {
  const {store, calls} = fixture(t, () => Response.json([]));
  await assert.rejects(() => store.write(envelope, revision), /conflict/);
  await assert.rejects(() => store.write(envelope, null), /conflict/);
  await assert.rejects(() => store.remove(revision), /changed or is already absent/);
  assert.deepEqual(calls.map(call => call.init.method), ['PATCH', 'POST', 'DELETE']);
});

test('legacy reads validate and normalize envelopes and distinguish an absent row', async t => {
  let rows: unknown = [{envelope: {...envelope, unexpected: 'discard me'}}];
  const {store, calls} = fixture(t, () => Response.json(rows));
  assert.deepEqual(await store.read(), envelope);
  assert.equal(calls[0].init.method, 'GET');
  assert.deepEqual([...calls[0].url.searchParams], [['owner_id', `eq.${owner}`]]);
  assert.equal(calls[0].init.body, undefined);
  rows = [];
  assert.equal(await store.read(), null);
});

test('malformed remote data and ambiguous rows fail closed for reads and mutations', async t => {
  let response = () => Response.json(null);
  const {store} = fixture(t, () => response());
  for (const body of [null, {}, {envelope}, [null], [{}], [{envelope: {...envelope, salt: ''}}], [{envelope}, {envelope}]]) {
    response = () => Response.json(body);
    await assert.rejects(() => store.read());
    await assert.rejects(() => store.write(envelope, revision));
    await assert.rejects(() => store.remove(revision));
  }
  response = () => new Response('private malformed response', {status: 200});
  await assert.rejects(() => store.read(), /^Error: Invalid encrypted backup response\.$/);
});

test('HTTP authorization, duplicate insert and server failures expose only status and never retry', async t => {
  let status = 401;
  const {store, calls} = fixture(t, () => new Response('private server details must stay private', {status}));
  for (const code of [401, 403, 409, 429, 500]) {
    status = code;
    const expected = new RegExp(`^Error: Encrypted backup request failed \\(${code}\\)\\.$`);
    await assert.rejects(() => store.read(), expected);
    await assert.rejects(() => store.write(envelope, null), expected);
    await assert.rejects(() => store.write(envelope, revision), expected);
    await assert.rejects(() => store.remove(revision), expected);
  }
  assert.equal(calls.length, 20);
});

test('missing authentication fails before fetch for all methods', async t => {
  const {store, calls} = fixture(t, undefined, '');
  await assert.rejects(() => store.read(), /Sign in/);
  await assert.rejects(() => store.write(envelope, null), /Sign in/);
  await assert.rejects(() => store.write(envelope, revision), /Sign in/);
  await assert.rejects(() => store.remove(revision), /Sign in/);
  assert.equal(calls.length, 0);
});

test('insecure or credential-bearing endpoints are rejected', () => {
  for (const url of ['http://example.invalid', 'https://user:password@example.invalid']) {
    assert.throws(() => supabaseStore({url, publishableKey: 'synthetic', userId: owner, accessToken: async () => 'synthetic'}), /trusted HTTPS/);
  }
});
