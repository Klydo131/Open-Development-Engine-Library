import test from 'node:test';
import assert from 'node:assert/strict';
import {IDLE_LOCK_MS, IDLE_WARNING_MS, inspectIdle, renewIdle, startIdle} from '../apps/web/src/idle.ts';

const clock = (elapsed: number) => ({wall: 1_000_000 + elapsed, monotonic: 10_000 + elapsed});

test('five-minute room warns thirty seconds before expiry with inclusive boundaries', () => {
  const state = startIdle(clock(0));
  assert.equal(inspectIdle(state, clock(IDLE_LOCK_MS - IDLE_WARNING_MS - 1)).phase, 'active');
  assert.deepEqual({...inspectIdle(state, clock(IDLE_LOCK_MS - IDLE_WARNING_MS)), state: undefined}, {state: undefined, phase: 'warning', remainingMs: 30_000});
  assert.equal(inspectIdle(state, clock(IDLE_LOCK_MS - 1)).phase, 'warning');
  assert.equal(inspectIdle(state, clock(IDLE_LOCK_MS)).phase, 'expired');
});

test('at least ten deliberate extensions preserve a live room without an extension quota', () => {
  let state = startIdle(clock(0));
  let elapsed = 0;
  for (let i = 0; i < 12; i++) {
    elapsed += IDLE_LOCK_MS - IDLE_WARNING_MS;
    const warning = inspectIdle(state, clock(elapsed));
    assert.equal(warning.phase, 'warning');
    const renewed = renewIdle(warning.state, clock(elapsed + 1));
    assert.equal(renewed.phase, 'active');
    assert.equal(renewed.remainingMs, IDLE_LOCK_MS);
    state = renewed.state;
    elapsed++;
  }
  assert.equal(inspectIdle(state, clock(elapsed + IDLE_LOCK_MS)).phase, 'expired');
});

test('activity can renew a live deadline but never an expired or delayed deadline', () => {
  const state = startIdle(clock(0));
  const renewed = renewIdle(state, clock(100_000));
  assert.equal(inspectIdle(renewed.state, clock(399_999)).phase, 'warning');
  for (const elapsed of [300_000, 300_001, 3_600_000]) {
    const expired = renewIdle(state, clock(elapsed));
    assert.equal(expired.phase, 'expired');
    assert.equal(renewIdle(expired.state, clock(elapsed + 1)).phase, 'expired');
  }
});

test('either wall or monotonic elapsed time expires throttled or paused-clock sessions', () => {
  const state = startIdle(clock(0));
  assert.equal(inspectIdle(state, {wall: clock(0).wall, monotonic: clock(300_000).monotonic}).phase, 'expired');
  assert.equal(inspectIdle(state, {wall: clock(300_000).wall, monotonic: clock(0).monotonic}).phase, 'expired');
});

test('backwards and invalid readings fail closed and remain expired after clock recovery', () => {
  const observed = inspectIdle(startIdle(clock(0)), clock(20_000)).state;
  for (const now of [{...clock(20_000), wall: clock(19_999).wall}, {...clock(20_000), monotonic: clock(19_999).monotonic}, {wall: NaN, monotonic: 0}, {wall: Infinity, monotonic: 0}, {wall: -1, monotonic: 0}, {wall: 0, monotonic: -1}]) {
    const checked = inspectIdle(observed, now);
    assert.equal(checked.phase, 'expired');
    assert.equal(renewIdle(checked.state, clock(30_000)).phase, 'expired');
  }
  assert.equal(inspectIdle(startIdle({wall: NaN, monotonic: 0}), clock(0)).phase, 'expired');
});

test('pure timing helpers do not mutate state or retain caller-owned clock objects', () => {
  const initialClock = clock(0);
  const state = startIdle(initialClock);
  initialClock.wall = 0;
  const saved = JSON.stringify(state);
  const nextClock = clock(270_000);
  const checked = inspectIdle(state, nextClock);
  nextClock.monotonic = -1;
  assert.equal(JSON.stringify(state), saved);
  assert.equal(checked.state.observed.monotonic, clock(270_000).monotonic);
  assert.notEqual(checked.state, state);
});
