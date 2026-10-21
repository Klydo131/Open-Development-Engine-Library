/** Local inactivity policy. No storage, identity, network or learning measurements. */
export const IDLE_LOCK_MS = 5 * 60 * 1000;
export const IDLE_WARNING_MS = 30 * 1000;

export type IdleClock = Readonly<{wall: number; monotonic: number}>;
export type IdleState = Readonly<{activity: IdleClock; observed: IdleClock; expired: boolean}>;
export type IdleCheck = Readonly<{state: IdleState; phase: 'active' | 'warning' | 'expired'; remainingMs: number}>;

function validClock(clock: IdleClock): boolean {
  return Number.isFinite(clock.wall) && clock.wall >= 0 && Number.isFinite(clock.monotonic) && clock.monotonic >= 0;
}

export function startIdle(clock: IdleClock): IdleState {
  const reading = {...clock};
  return {activity: reading, observed: reading, expired: !validClock(clock)};
}

/** Either elapsed clock can expire the room. A backwards/invalid clock fails closed. */
export function inspectIdle(state: IdleState, now: IdleClock): IdleCheck {
  if (state.expired || !validClock(now) || now.wall < state.observed.wall || now.monotonic < state.observed.monotonic) {
    return {state: {...state, expired: true}, phase: 'expired', remainingMs: 0};
  }
  const remainingMs = Math.max(0, IDLE_LOCK_MS - Math.max(now.wall - state.activity.wall, now.monotonic - state.activity.monotonic));
  const next = {...state, observed: {...now}, expired: remainingMs === 0};
  return {state: next, phase: remainingMs === 0 ? 'expired' : remainingMs <= IDLE_WARNING_MS ? 'warning' : 'active', remainingMs};
}

/** Renew only a still-live room. A late input never revives an expired deadline. */
export function renewIdle(state: IdleState, now: IdleClock): IdleCheck {
  const checked = inspectIdle(state, now);
  if (checked.phase === 'expired') return checked;
  return {state: startIdle(now), phase: 'active', remainingMs: IDLE_LOCK_MS};
}
