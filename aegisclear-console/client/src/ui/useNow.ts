// One shared one-second clock for every countdown and "N s ago" on screen. It runs only while something reads it.
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let now = Date.now();
let clock: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!clock) {
    now = Date.now();
    clock = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(clock);
      clock = undefined;
    }
  };
}

/** Milliseconds since the epoch, refreshed once per second. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now, () => now);
}
