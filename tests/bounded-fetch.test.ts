import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once, getEventListeners} from 'node:events';
import {createClient} from '@supabase/supabase-js';
import {boundedJsonFetch, BoundedFetchError} from '../examples/http/bounded-fetch.ts';
import {supabaseCoursePortal} from '../examples/supabase/course-portal.ts';

const encoder = new TextEncoder();
const expected = (code: BoundedFetchError['code']) => (error: unknown) => error instanceof BoundedFetchError && error.code === code;
const transport = (fetcher: typeof fetch, maximum = 16, timeoutMs = 1000) => boundedJsonFetch({maxResponseBytes: maximum, timeoutMs, fetch: fetcher});
const idle = () => new Promise<void>(resolve => setImmediate(resolve));

test('bounded transport rejects invalid budgets before dispatch', () => {
  for (const maxResponseBytes of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => boundedJsonFetch({maxResponseBytes, timeoutMs: 1000}));
  }
  for (const timeoutMs of [0, -1, 1.5, NaN, Infinity, 2 ** 31]) {
    assert.throws(() => boundedJsonFetch({maxResponseBytes: 16, timeoutMs}));
  }
});

test('actual byte ceiling accepts its exact boundary and cancels an oversized lying stream', async () => {
  const exact = transport(async () => new Response('"💡"'), 6);
  assert.equal(await (await exact('https://provider.example')).json(), '💡');
  for (const headers of [{}, {'Content-Length': '1'}, {'Content-Length': '999999'}] as HeadersInit[]) {
    let canceled = false;
    const fetcher = transport(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode('12345678')); controller.enqueue(encoder.encode('123456789')); },
      cancel() { canceled = true; },
    }), {headers}));
    await assert.rejects(fetcher('https://provider.example'), expected('response-size'));
    assert.equal(canceled, true);
  }
});

test('split UTF-8 and many tiny or empty chunks preserve JSON without per-chunk accumulation', async () => {
  const data = encoder.encode(JSON.stringify('💡'.repeat(5000)));
  let index = 0;
  const fetcher = transport(async () => new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === data.length) { controller.close(); return; }
      controller.enqueue(new Uint8Array(0)); controller.enqueue(data.slice(index, ++index));
    },
  })), data.length);
  assert.equal(await (await fetcher('https://provider.example')).json(), '💡'.repeat(5000));
});

test('total deadline bounds noncooperative headers and cancels a late response', {timeout: 3000}, async () => {
  let finish!: (value: Response) => void;
  let signal: AbortSignal | null | undefined;
  let canceled = false;
  const fetcher = transport((_input, init) => { signal = init?.signal; return new Promise(resolve => { finish = resolve; }); }, 16, 25);
  await assert.rejects(fetcher('https://provider.example'), expected('timeout'));
  assert.equal(signal?.aborted, true);
  finish(new Response(new ReadableStream({cancel() { canceled = true; }})));
  await idle(); assert.equal(canceled, true);
});

test('total deadline includes a noncooperative body and never awaits hanging cancellation', {timeout: 3000}, async () => {
  let canceled = false;
  let body!: ReadableStream<Uint8Array>;
  const fetcher = transport(async () => new Response(body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(encoder.encode('{')); },
    pull() { return new Promise(() => {}); },
    cancel() { canceled = true; return new Promise(() => {}); },
  })), 16, 25);
  await assert.rejects(fetcher('https://provider.example'), expected('timeout'));
  assert.equal(canceled, true); assert.equal(body.locked, false);
});

test('caller abort skips dispatch and Request signals follow explicit init overrides', async () => {
  const caller = new AbortController(); caller.abort('PRIVATE_ABORT_REASON'); let calls = 0;
  const fetcher = transport(async () => { calls++; return new Response('{}'); });
  await assert.rejects(fetcher('https://provider.example', {signal: caller.signal}), expected('aborted'));
  const request = new Request('https://provider.example', {signal: caller.signal});
  await assert.rejects(fetcher(request), expected('aborted'));
  await assert.rejects(fetcher(request, {signal: undefined}), expected('aborted'));
  assert.equal(calls, 0);
  assert.deepEqual(await (await fetcher(request, {signal: null})).json(), {});
  assert.equal(calls, 1);
});

test('immediate caller cancellation prevents dispatch queued in the next microtask', async () => {
  const caller = new AbortController(); let calls = 0;
  const fetcher = transport(async () => { calls++; return new Response('{}'); });
  const request = fetcher('https://provider.example', {signal: caller.signal});
  caller.abort();
  await assert.rejects(request, expected('aborted'));
  assert.equal(calls, 0);
});

test('mid-stream abort is isolated, classified and removes caller listeners', async () => {
  const caller = new AbortController(); let cancelCount = 0; let dispatched!: () => void;
  const ready = new Promise<void>(resolve => { dispatched = resolve; });
  let calls = 0;
  const fetcher = transport(async () => {
    if (++calls > 1) return new Response('{}');
    dispatched(); return new Response(new ReadableStream<Uint8Array>({cancel() { cancelCount++; }}));
  });
  const first = fetcher('https://provider.example', {signal: caller.signal}); await ready;
  caller.abort('PRIVATE_ABORT_REASON');
  await assert.rejects(first, error => expected('aborted')(error) && !(error as Error).message.includes('PRIVATE'));
  await idle(); assert.equal(cancelCount, 1);
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
  const nextCaller = new AbortController();
  assert.deepEqual(await (await fetcher('https://provider.example', {signal: nextCaller.signal})).json(), {});
  assert.equal(getEventListeners(nextCaller.signal, 'abort').length, 0);
});

test('HTTP error status, headers and text survive without transport retries', async () => {
  for (const status of [429, 503]) {
    let calls = 0;
    const fetcher = transport(async () => { calls++; return new Response('{"error":true}', {status, statusText: 'Service paused', headers: {'Retry-After': '30', 'Content-Type': 'application/json'}}); });
    const response = await fetcher('https://provider.example');
    assert.equal(response.status, status); assert.equal(response.statusText, 'Service paused');
    assert.equal(response.headers.get('Retry-After'), '30'); assert.deepEqual(await response.json(), {error: true});
    assert.equal(calls, 1);
  }
});

test('HEAD and null-body 204 responses remain bodyless', async () => {
  for (const [method, status] of [['HEAD', 200], ['POST', 204]] as const) {
    const fetcher = transport(async () => new Response(null, {status, headers: {'X-Service': 'test'}}));
    const response = await fetcher('https://provider.example', {method});
    assert.equal(response.body, null); assert.equal(response.status, status); assert.equal(response.headers.get('X-Service'), 'test');
  }
});

test('immediately resolved empty chunks cannot starve the total deadline', {timeout: 3000}, async () => {
  let canceled = false;
  const fetcher = transport(async () => new Response(new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(0)); }, cancel() { canceled = true; },
  })), 16, 25);
  await assert.rejects(fetcher('https://provider.example'), expected('timeout'));
  assert.equal(canceled, true);
});

test('request method, selected headers, body and fetch policies reach the injected adapter', async () => {
  let actual: RequestInit | undefined;
  const fetcher = transport(async (_input, init) => { actual = init; return new Response('{}'); });
  await fetcher('https://provider.example', {method: 'POST', body: '{}', headers: {'X-Custom': 'selected'}, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer'});
  assert.equal(actual?.method, 'POST'); assert.equal(actual?.body, '{}'); assert.equal(new Headers(actual?.headers).get('X-Custom'), 'selected');
  assert.equal(actual?.credentials, 'omit'); assert.equal(actual?.redirect, 'error'); assert.equal(actual?.cache, 'no-store'); assert.equal(actual?.referrerPolicy, 'no-referrer');
});

test('invalid JSON stays a consumer parse error while network and stream errors are sanitized', async () => {
  assert.equal(await (await transport(async () => new Response('not json'))('https://provider.example')).text(), 'not json');
  await assert.rejects((await transport(async () => new Response('not json'))('https://provider.example')).json(), SyntaxError);
  for (const [fetcher, code] of [
    [async () => { throw new Error('https://provider.example?token=PRIVATE'); }, 'network'],
    [async () => new Response(new ReadableStream({start(controller) { controller.error(new Error('PRIVATE_BODY')); }})), 'response'],
  ] as const) {
    await assert.rejects(transport(fetcher)('https://provider.example'), error => expected(code)(error) && !(error as Error).message.includes('PRIVATE') && !(error as Error).message.includes('provider.example'));
  }
});

test('native localhost fetch stops a stalled HTTP body and accepts the next valid request', {timeout: 5000}, async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, {'Content-Type': 'application/json'});
    if (request.url === '/stall') { response.write('{'); return; }
    response.end('{"ok":true}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await assert.rejects(boundedJsonFetch({maxResponseBytes: 16, timeoutMs: 100})(`${base}/stall`), expected('timeout'));
    assert.deepEqual(await (await boundedJsonFetch({maxResponseBytes: 16, timeoutMs: 1000})(`${base}/ok`)).json(), {ok: true});
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('pinned SDK uses bounded global fetch and reports oversized or stalled RPC responses safely', {timeout: 5000}, async () => {
  let mode: 'valid' | 'large' | 'slow' = 'valid'; let calls = 0; let canceled = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    if (mode === 'large') return new Response(new ReadableStream({start(controller) { controller.enqueue(encoder.encode('x'.repeat(33))); }, cancel() { canceled++; }}));
    if (mode === 'slow') return new Response(new ReadableStream({cancel() { canceled++; }}));
    return new Response('[]', {headers: {'Content-Type': 'application/json'}});
  };
  const sdk = createClient('https://provider.example', 'sb_publishable_synthetic_key', {global: {fetch: transport(fetcher, 32, 25)}, auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
  const portal = supabaseCoursePortal(sdk, {redirectTo: 'https://library.example/portal.html'});
  try {
    assert.deepEqual(await portal.listCourses(), []);
    for (const failure of ['large', 'slow'] as const) {
      mode = failure;
      await assert.rejects(portal.listCourses(), error => error instanceof Error && /course service/.test(error.message) && !error.message.includes('provider.example'));
    }
    assert.equal(calls, 3); assert.equal(canceled, 2);
  } finally { portal.dispose(); await sdk.auth.dispose(); }
});
