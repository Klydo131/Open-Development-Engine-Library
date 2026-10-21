import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {inspectIdle, renewIdle, startIdle, type IdleClock} from './idle.ts';

const readClock = (): IdleClock => ({wall: Date.now(), monotonic: performance.now()});

/** One mounted hook per app. Warning UI is separate so it can use the native top layer. */
export function useIdleLock({enabled, onLock}: {enabled: boolean; onLock: () => void}) {
  const [warning, setWarning] = useState(false);
  const onLockRef = useRef(onLock);
  const continueRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {onLockRef.current = onLock;}, [onLock]);

  useEffect(() => {
    setWarning(false);
    if (!enabled) return;
    let state = startIdle(readClock());
    let running = true;
    let warningOpen = false;

    function stop() {
      if (!running) return;
      running = false;
      warningOpen = false;
      setWarning(false);
      onLockRef.current();
    }

    function check(now: IdleClock, publishWarning: boolean) {
      if (!running) return false;
      const checked = inspectIdle(state, now);
      state = checked.state;
      if (checked.phase === 'expired') {stop(); return false;}
      if (publishWarning && checked.phase === 'warning' && !warningOpen) {
        warningOpen = true;
        setWarning(true);
      }
      return true;
    }

    function activity(event: Event) {
      const now = readClock();
      if (!check(now, false)) {
        // Stop the stale interaction before a React action can use the expired room.
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // Keep warning actions mounted through pointerdown/keydown. Only Continue renews it.
      if (!warningOpen) state = renewIdle(state, now).state;
    }

    continueRef.current = () => {
      const now = readClock();
      if (!check(now, false)) return;
      state = renewIdle(state, now).state;
      warningOpen = false;
      setWarning(false);
    };
    const observe = () => {check(readClock(), true);};
    const timer = window.setInterval(observe, 1000);
    window.addEventListener('pointerdown', activity, true);
    window.addEventListener('keydown', activity, true);
    window.addEventListener('focus', observe);
    document.addEventListener('visibilitychange', observe);
    observe();
    return () => {
      running = false;
      continueRef.current = () => {};
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', activity, true);
      window.removeEventListener('keydown', activity, true);
      window.removeEventListener('focus', observe);
      document.removeEventListener('visibilitychange', observe);
    };
  }, [enabled]);

  const continueStudying = useCallback(() => {continueRef.current();}, []);
  return {warning: enabled && warning, continueStudying};
}
