export class BoundedFetchError extends Error {
  readonly code: 'response-size' | 'timeout' | 'aborted' | 'network' | 'response';
  constructor(code: BoundedFetchError['code']) {
    super(code === 'response-size' ? 'Provider response exceeded its byte limit.'
      : code === 'timeout' ? 'Provider request exceeded its deadline.'
      : code === 'aborted' ? 'Provider request was canceled.' : 'Provider request could not be completed.');
    this.name = 'BoundedFetchError'; this.code = code;
  }
}
export function boundedJsonFetch(options: {maxResponseBytes: number; timeoutMs: number; fetch?: typeof fetch}): typeof fetch {
  const {maxResponseBytes, timeoutMs} = options;
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2 ** 31 - 1) throw new TypeError('Use positive safe response-byte and deadline limits; the deadline must fit a 32-bit timer.');
  const upstream = options.fetch ?? globalThis.fetch;
  return async (input, init) => {
    const caller = init?.signal === undefined ? (input instanceof Request ? input.signal : undefined) : init.signal;
    if (caller?.aborted) throw new BoundedFetchError('aborted');
    const controller = new AbortController();
    let failure: BoundedFetchError | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let rejectAbort!: (error: BoundedFetchError) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    function stop(code: BoundedFetchError['code']) {
      if (failure) return;
      failure = new BoundedFetchError(code);
      controller.abort(failure); rejectAbort(failure);
      // An uncooperative source can leave cancel() pending; cancellation must not delay rejection.
      try { void reader?.cancel(failure).catch(() => {}); } catch { /* already released */ }
    }
    const onAbort = () => stop('aborted');
    caller?.addEventListener('abort', onAbort, {once: true});
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    const deadline = performance.now() + timeoutMs;
    let phase: 'network' | 'response' = 'network';
    try {
      const pending = Promise.resolve().then(() => {
        if (performance.now() >= deadline) stop('timeout');
        if (failure) throw failure;
        return upstream(input, {...init, signal: controller.signal});
      }).then(response => {
        if (performance.now() >= deadline) stop('timeout');
        if (failure) {
          // A fetch implementation may ignore abort and return a body after this request has settled.
          try { void response.body?.cancel(failure).catch(() => {}); } catch { /* no usable body */ }
          throw failure;
        }
        return response;
      });
      const response = await Promise.race([pending, aborted]);
      phase = 'response';
      if (!response.body) return response;
      reader = response.body.getReader();
      const read = async () => {
        let data = new Uint8Array(0), length = 0;
        while (true) {
          // Immediately resolved empty chunks can starve the timer queue.
          if (performance.now() >= deadline) throw new BoundedFetchError('timeout');
          const chunk = await reader!.read();
          if (failure) throw failure;
          if (performance.now() >= deadline) throw new BoundedFetchError('timeout');
          if (chunk.done) break;
          if (!(chunk.value instanceof Uint8Array)) throw new BoundedFetchError('response');
          if (chunk.value.byteLength > maxResponseBytes - length) throw new BoundedFetchError('response-size');
          const next = length + chunk.value.byteLength;
          // One geometrically grown buffer bounds overhead even for millions of tiny or empty chunks.
          if (next > data.byteLength) {
            const grown = new Uint8Array(Math.min(maxResponseBytes, Math.max(next, 16384, data.byteLength * 2)));
            grown.set(data); data = grown;
          }
          data.set(chunk.value, length); length = next;
        }
        return new Response(data.subarray(0, length), {status: response.status, statusText: response.statusText, headers: response.headers});
      };
      return await Promise.race([read(), aborted]);
    } catch (error) {
      stop(error instanceof BoundedFetchError ? error.code : phase);
      throw failure;
    } finally {
      clearTimeout(timer); caller?.removeEventListener('abort', onAbort);
      reader?.releaseLock();
    }
  };
}
