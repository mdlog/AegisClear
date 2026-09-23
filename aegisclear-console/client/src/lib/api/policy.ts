// Freshness and retry rules for TanStack Query (API_CONTRACT §10). Intervals pause in hidden tabs (TanStack default).
import type { ChannelDetail, RunSnapshot } from "@aegis/types";
import { ApiError } from "./client";

/** Channel detail: every 5 s until SETTLED, which is terminal. */
export const channelRefetchMs = (detail: ChannelDetail | undefined): number | false => (detail?.state === "SETTLED" ? false : 5_000);

/** Registry: the server caches the scan for 3 s, so 4 s at rest and 2 s while a run is opening and settling channels. */
export const channelsRefetchMs = (runLive: boolean): number => (runLive ? 2_000 : 4_000);

/** Runs list: every 5 s only while a run is live (the live-run chip). */
export const runsRefetchMs = (runs: RunSnapshot[] | undefined): number | false => (runs?.some((r) => r.status === "running") ? 5_000 : false);

/** An unreachable server or a 5xx may recover, so retry up to 3 times. A 4xx answer will not change. */
export function shouldRetry(failures: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failures < 3;
}
