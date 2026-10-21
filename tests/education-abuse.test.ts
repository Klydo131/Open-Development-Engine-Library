import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryEducationAbuseGuard, EducationAbuseDenied, runGuardedEducationOperation, type EducationAbuseLimits} from '../packages/education/src/abuse-guard.ts';

function fixture(overrides: Partial<EducationAbuseLimits> = {}) {
  let now = 0;
  const limits = {windowMs: 1_000, requestsPerActor: 2, requestsGlobal: 3, concurrentPerActor: 1, concurrentGlobal: 2, maxKeys: 4, keyTtlMs: 2_000, maxPayloadBytes: 100, ...overrides};
  return {guard: new MemoryEducationAbuseGuard(limits, () => now), setTime: (value: number) => { now = value; }};
}
const input = (actorKey = 'learnerA', byteLength = 5) => ({actorKey, byteLength});
const work = async () => 'completed';

test('per-actor burst is rejected before work and refills after the window', async () => {
  const {guard, setTime} = fixture();
  await runGuardedEducationOperation(guard, input(), work);
  await runGuardedEducationOperation(guard, input(), work);
  let called = false;
  await assert.rejects(runGuardedEducationOperation(guard, input(), async () => { called = true; }), error => error instanceof EducationAbuseDenied && error.reason === 'rate' && error.retryAfterMs === 1_000);
  assert.equal(called, false);
  setTime(1_000);
  assert.equal(await runGuardedEducationOperation(guard, input(), work), 'completed');
});

test('global budget applies across actors without allocating denied churn keys', async () => {
  const {guard} = fixture({requestsGlobal: 2});
  await runGuardedEducationOperation(guard, input('a'), work);
  await runGuardedEducationOperation(guard, input('b'), work);
  for (let i = 0; i < 100; i++) await assert.rejects(runGuardedEducationOperation(guard, input(`new${i}`), work), EducationAbuseDenied);
  assert.equal(guard.keyCount, 2);
});

test('actor and global concurrency limits are atomic and release is idempotent', async () => {
  const {guard} = fixture();
  const a = await guard.acquire(input('a'));
  assert.equal(a.allowed, true);
  assert.deepEqual(await guard.acquire(input('a')), {allowed: false, reason: 'concurrency', retryAfterMs: 1_000});
  const b = await guard.acquire(input('b'));
  assert.equal(b.allowed, true);
  assert.equal((await guard.acquire(input('c'))).allowed, false);
  if (a.allowed) { await a.release(); await a.release(); }
  const c = await guard.acquire(input('c'));
  assert.equal(c.allowed, true);
  if (b.allowed) await b.release();
  if (c.allowed) await c.release();
});

test('thrown operations release concurrency while retaining consumed rate budget', async () => {
  const {guard} = fixture();
  await assert.rejects(runGuardedEducationOperation(guard, input(), async () => { throw new Error('import failed'); }), /import failed/);
  assert.equal(await runGuardedEducationOperation(guard, input(), work), 'completed');
  await assert.rejects(runGuardedEducationOperation(guard, input(), work), error => error instanceof EducationAbuseDenied && error.reason === 'rate');
});

test('oversized or malformed measured sizes are rejected without invoking work or allocating keys', async () => {
  const {guard} = fixture();
  for (const bytes of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 101]) {
    await assert.rejects(runGuardedEducationOperation(guard, input('a', bytes), async () => { assert.fail('work must not start'); }), EducationAbuseDenied);
  }
  await assert.rejects(runGuardedEducationOperation(guard, input('../actor'), work), EducationAbuseDenied);
  assert.equal(guard.keyCount, 0);
});

test('actor keys reject whitespace, terminal newlines and non-ASCII lookalikes before allocating budgets', async () => {
  const {guard} = fixture();
  for (const actorKey of ['', '_actor', '-actor', '../actor', 'a'.repeat(129), 'actor\n', 'actor\r', 'actor\r\n', 'actor\u2028', 'actor\u2029', 'actor\0', 'actor name', 'аctor', 'actor💡']) {
    await assert.rejects(runGuardedEducationOperation(guard, input(actorKey), async () => { assert.fail('work must not start'); }),
      error => error instanceof EducationAbuseDenied && error.reason === 'invalid-request', JSON.stringify(actorKey));
  }
  assert.equal(guard.keyCount, 0);
  assert.equal(await runGuardedEducationOperation(guard, input('A_-0'), work), 'completed');
  assert.equal(await runGuardedEducationOperation(guard, input('a'.repeat(128)), work), 'completed');
  assert.equal(guard.keyCount, 2);
});

test('clock rollback and invalid clocks fail closed without restoring used budgets', async () => {
  const {guard, setTime} = fixture();
  setTime(500);
  await runGuardedEducationOperation(guard, input(), work);
  for (const value of [499, NaN, Infinity, -1]) {
    setTime(value);
    await assert.rejects(runGuardedEducationOperation(guard, input(), work), error => error instanceof EducationAbuseDenied && error.reason === 'clock');
  }
  setTime(500);
  await runGuardedEducationOperation(guard, input(), work);
  await assert.rejects(runGuardedEducationOperation(guard, input(), work), error => error instanceof EducationAbuseDenied && error.reason === 'rate');
});

test('key registry stays bounded, expires idle entries, and never evicts live operations', async () => {
  const {guard, setTime} = fixture({maxKeys: 2, requestsGlobal: 200});
  const live = await guard.acquire(input('live'));
  await runGuardedEducationOperation(guard, input('idle'), work);
  for (let i = 0; i < 100; i++) await assert.rejects(runGuardedEducationOperation(guard, input(`churn${i}`), work), error => error instanceof EducationAbuseDenied && error.reason === 'capacity');
  assert.equal(guard.keyCount, 2);
  setTime(2_000);
  await runGuardedEducationOperation(guard, input('new'), work);
  assert.equal(guard.keyCount, 2);
  assert.equal((await guard.acquire(input('live'))).allowed, false);
  if (live.allowed) await live.release();
  setTime(4_000);
  await runGuardedEducationOperation(guard, input('last'), work);
  assert.equal(guard.keyCount, 1);
});

test('invalid limits and unavailable shared stores cannot allow work', async () => {
  const base = {windowMs: 1_000, requestsPerActor: 2, requestsGlobal: 3, concurrentPerActor: 1, concurrentGlobal: 2, maxKeys: 4, keyTtlMs: 2_000, maxPayloadBytes: 100};
  for (const change of [{windowMs: 0}, {maxKeys: Infinity}, {keyTtlMs: 1}, {maxPayloadBytes: -1}]) assert.throws(() => new MemoryEducationAbuseGuard({...base, ...change}), /Invalid/);
  await assert.rejects(runGuardedEducationOperation({acquire: async () => { throw new Error('store unavailable'); }}, input(), async () => { assert.fail('work must not start'); }), /store unavailable/);
});
