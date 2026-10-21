/** Server-only contract: implementations must atomically acquire both actor and global budgets. */
export type EducationAbuseRequest = {actorKey: string; byteLength: number};
export type EducationAbuseRejection = {
  allowed: false;
  reason: 'invalid-request' | 'payload' | 'rate' | 'concurrency' | 'capacity' | 'clock';
  retryAfterMs: number;
};
export type EducationAbusePermit = {allowed: true; release(): Promise<void>};
export interface EducationAbuseStore {
  acquire(request: EducationAbuseRequest): Promise<EducationAbusePermit | EducationAbuseRejection>;
}
export type EducationAbuseLimits = {
  windowMs: number;
  requestsPerActor: number;
  requestsGlobal: number;
  concurrentPerActor: number;
  concurrentGlobal: number;
  maxKeys: number;
  keyTtlMs: number;
  maxPayloadBytes: number;
};
export class EducationAbuseDenied extends Error {
  readonly reason: EducationAbuseRejection['reason'];
  readonly retryAfterMs: number;
  constructor(rejection: EducationAbuseRejection) {
    super('Education operation temporarily unavailable.');
    this.name = 'EducationAbuseDenied';
    this.reason = rejection.reason;
    this.retryAfterMs = rejection.retryAfterMs;
  }
}
type Counter = {windowStart: number; requests: number; concurrent: number; lastSeen: number};
const rejected = (reason: EducationAbuseRejection['reason'], retryAfterMs = 0): EducationAbuseRejection => ({allowed: false, reason, retryAfterMs});

/** Bounded, single-process reference. Not a distributed limiter or a network DDoS defense. */
export class MemoryEducationAbuseGuard implements EducationAbuseStore {
  readonly #limits: Readonly<EducationAbuseLimits>;
  readonly #clock: () => number;
  readonly #keys = new Map<string, Counter>();
  #global: Counter | undefined;
  #lastClock = -1;
  constructor(limits: EducationAbuseLimits, clock: () => number = () => performance.now()) {
    const fields: (keyof EducationAbuseLimits)[] = ['windowMs', 'requestsPerActor', 'requestsGlobal', 'concurrentPerActor', 'concurrentGlobal', 'maxKeys', 'keyTtlMs', 'maxPayloadBytes'];
    if (fields.some(field => !Number.isSafeInteger(limits[field]) || limits[field] <= 0) || limits.keyTtlMs < limits.windowMs) throw new Error('Invalid education abuse limits.');
    this.#limits = Object.freeze({...limits});
    this.#clock = clock;
  }
  /** A count only; actor keys are intentionally not exposed. */
  get keyCount(): number { return this.#keys.size; }

  async acquire(request: EducationAbuseRequest): Promise<EducationAbusePermit | EducationAbuseRejection> {
    if (!request || typeof request.actorKey !== 'string' || request.actorKey.length < 1 || request.actorKey.length > 128
      || !/^[A-Za-z0-9]/.test(request.actorKey) || /[^A-Za-z0-9_-]/.test(request.actorKey)
      || !Number.isSafeInteger(request.byteLength) || request.byteLength < 0) return rejected('invalid-request');
    const limits = this.#limits;
    if (request.byteLength > limits.maxPayloadBytes) return rejected('payload');
    const now = this.#clock();
    // A monotonic clock must never move backward. Fail closed until it catches up.
    if (!Number.isFinite(now) || now < 0 || now < this.#lastClock) return rejected('clock', limits.windowMs);
    this.#lastClock = now;
    for (const [key, counter] of this.#keys) {
      if (counter.concurrent === 0 && now - counter.lastSeen >= limits.keyTtlMs) this.#keys.delete(key);
    }
    const global = this.#global ??= {windowStart: now, requests: 0, concurrent: 0, lastSeen: now};
    let actor = this.#keys.get(request.actorKey);
    if (!actor && this.#keys.size >= limits.maxKeys) return rejected('capacity', limits.keyTtlMs);
    // Rate/concurrency denials must not allocate entries for arbitrary new keys.
    const rollWindow = (counter: Counter) => {
      if (now - counter.windowStart >= limits.windowMs) { counter.windowStart = now; counter.requests = 0; }
    };
    rollWindow(global);
    if (actor) rollWindow(actor);
    if (global.requests >= limits.requestsGlobal || (actor && actor.requests >= limits.requestsPerActor)) {
      const waits = [global.requests >= limits.requestsGlobal ? limits.windowMs - (now - global.windowStart) : 0,
        actor && actor.requests >= limits.requestsPerActor ? limits.windowMs - (now - actor.windowStart) : 0];
      return rejected('rate', Math.max(1, Math.ceil(Math.max(...waits))));
    }
    if (global.concurrent >= limits.concurrentGlobal || (actor && actor.concurrent >= limits.concurrentPerActor)) return rejected('concurrency', 1_000);
    if (!actor) {
      actor = {windowStart: now, requests: 0, concurrent: 0, lastSeen: now};
      this.#keys.set(request.actorKey, actor);
    }
    actor.requests++; actor.concurrent++; actor.lastSeen = now;
    global.requests++; global.concurrent++; global.lastSeen = now;
    let released = false;
    return {allowed: true, release: async () => {
      if (released) return;
      released = true;
      actor.concurrent--; global.concurrent--;
    }};
  }
}

/** Acquire before parsing/importing/encrypting; release even when the operation throws. */
export async function runGuardedEducationOperation<T>(store: EducationAbuseStore, request: EducationAbuseRequest, operation: () => Promise<T>): Promise<T> {
  const permit = await store.acquire(request);
  if (!permit.allowed) throw new EducationAbuseDenied(permit);
  try { return await operation(); }
  finally { await permit.release(); }
}
