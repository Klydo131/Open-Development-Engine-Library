# Bounded HTTP JSON transport

[`examples/http/bounded-fetch.ts`](../examples/http/bounded-fetch.ts) provides an optional, dependency-free Fetch adapter for bounded JSON requests. It limits response bytes before a provider SDK parses them and applies one deadline across response headers and body consumption. It is separate from the catalog, education and portal contract packages.

```ts
import {boundedJsonFetch} from '../examples/http/bounded-fetch.ts';

const request = boundedJsonFetch({
  maxResponseBytes: 4 * 1024 * 1024,
  timeoutMs: 30000,
});
const controller = new AbortController();
const response = await request('https://service.example/catalog', {
  signal: controller.signal,
  redirect: 'error',
  cache: 'no-store',
});
const value: unknown = await response.json();
```

`maxResponseBytes` must be a positive safe integer. `timeoutMs` must be an integer from 1 to 2,147,483,647. Invalid configuration throws `TypeError` before requests start. Supply an optional `fetch: typeof fetch` implementation for a trusted provider adapter or isolated tests; otherwise the adapter uses native Fetch.

The configured web portal injects this adapter through Supabase's [`global.fetch` option](https://supabase.com/docs/reference/javascript/initializing#custom-fetch-implementation), with a 4 MiB response limit for JSON exchanges. Only GET requests to the configured provider origin's exact `/functions/v1/library-media` path use a separate 10 MiB ceiling. Both use a 30-second deadline per fetch attempt. The local demonstration does not contact a provider.

## Response handling

The adapter reads actual decoded response bytes through a native stream reader. It rejects before copying a chunk that would exceed the limit. Missing, inaccurate or compressed `Content-Length` values cannot bypass the limit. A contiguous buffer grows within the configured ceiling, so many small chunks do not create a retained array entry per chunk.

After a successful read, the adapter returns a new `Response` with the original status, status text and headers. HTTP errors such as 429 and 503 remain responses; `Retry-After` and their bodies remain available to the consumer. Invalid JSON remains a consumer parsing error. Responses without a body, including normal HEAD and 204 responses, remain bodyless.

This is an adapter for bounded Auth/RPC exchanges and small, fully buffered file responses, not a transparent replacement for arbitrary Fetch use. Reconstructed responses do not preserve the original `url`, `type` or `redirected` metadata. Original headers can describe the wire representation even though Fetch has already decoded its body. Do not forward the reconstructed response as an HTTP representation without applying appropriate headers. Large downloads, streaming media, server-sent events and opaque cross-origin responses need a different transport.

Schema validation still belongs at the provider boundary after JSON parsing. A bounded byte sequence can contain invalid records. Authentication, authorization, revision checks and request-body limits remain the responsibility of the service and its adapter.

## Cancellation and failures

Caller cancellation propagates through an internal `AbortController`. A pre-aborted caller causes no dispatch. A Request's signal is inherited when `init.signal` is omitted or undefined; explicit `init.signal: null` detaches it, following the Fetch constructor contract.

The deadline starts before dispatch and remains active while the body is read. On cancellation, deadline or oversize, the adapter aborts the upstream request, requests reader cancellation and releases its lock. Rejection does not wait for an uncooperative cancellation promise. A fetch implementation that returns a response after cancellation has its late body canceled as well. Timers and caller listeners are removed when the adapter settles.

Failures use `BoundedFetchError` with one of these codes:

| Code | Meaning |
| --- | --- |
| `response-size` | Decoded response exceeded the configured byte ceiling |
| `timeout` | Fetch attempt exceeded its deadline |
| `aborted` | Caller canceled the fetch attempt |
| `network` | Dispatch or response-header retrieval failed |
| `response` | Response stream or reconstruction failed |

Messages omit provider URLs, bodies, headers, original exception messages and caller-supplied abort reasons. HTTP error responses are preserved separately; consumers must avoid exposing sensitive provider response details.

The adapter adds no retries. A timed-out mutation may already have committed on the server; do not automatically repeat it. Existing SDK refresh and retry policies are separate, so an SDK operation may contain multiple fetch attempts and exceed one attempt's deadline.

JavaScript cannot forcibly terminate arbitrary injected code or guarantee timer execution during browser suspension or blocked synchronous work. A deadline bounds the adapter's pending await while the event loop can run; it does not guarantee upstream rollback or physical connection termination by an uncooperative transport. The body limit is per response, not a process-memory or concurrency limit: incoming chunks, buffer growth, Response copying and the SDK's parsed objects consume additional memory. Services still need gateway limits and bounded concurrent work.

## Verification

Run `node --experimental-strip-types --test tests/bounded-fetch.test.ts`. The fixtures cover exact and excessive byte counts, inaccurate length headers, split UTF-8, tiny chunks, slow headers and bodies, noncooperative cancellation, Request signal overrides, error sanitization, HTTP status/header preservation, localhost HTTP and the pinned Supabase SDK. They use synthetic records and no external account.

The implementation uses native `AbortController`, stream readers and cancellable timers rather than requiring newer `AbortSignal.any()` or `AbortSignal.timeout()` APIs. Standards references: [Fetch body consumption](https://fetch.spec.whatwg.org/#concept-body-consume-body), [Request construction](https://fetch.spec.whatwg.org/#dom-request), [stream cancellation](https://streams.spec.whatwg.org/#readable-stream-reader-generic-cancel) and [AbortSignal](https://dom.spec.whatwg.org/#abortsignal).
