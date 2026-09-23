// Time-driven text as leaf components: only they re-render on the one-second tick, never the page around them
// (README §6.2: no page-wide re-render per second; it would also starve route transitions).
import { countdown, elapsed, relativeTime } from "@/lib/format";
import { useNow } from "./useNow";

/** "12 s ago", with the absolute time on hover. */
export function Ago({ at }: { at: number }) {
  const now = useNow();
  return <span title={new Date(at).toISOString()}>{relativeTime(at, now)}</span>;
}

/** Seconds left until a chain-time deadline (unix seconds), measured against this browser's clock. */
export function Countdown({ deadline, prefix = "≈ " }: { deadline: number; prefix?: string }) {
  const now = useNow();
  return <>{prefix}{countdown(deadline, Math.floor(now / 1000))}</>;
}

/** mm:ss (or mm:ss.s with `tenths`) since a start time in ms. */
export function Elapsed({ since, tenths = false }: { since: number; tenths?: boolean }) {
  const now = useNow();
  const text = elapsed(Math.max(0, now - since));
  return <>{tenths ? text : text.slice(0, 5)}</>;
}

/** Render-prop form for the few places that compute from the clock (the challenge window). */
export function WithNow({ children }: { children: (now: number) => React.ReactNode }) {
  return <>{children(useNow())}</>;
}
