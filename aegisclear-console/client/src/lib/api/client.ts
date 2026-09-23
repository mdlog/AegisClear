// The console's only door to data (README §5.2). Method names are LAYOUT_SPEC's DATA CONTRACT.
import type { ChannelDetail, ChannelSummary, ConfigResponse, LeakResponse, RunSnapshot, ScenarioId, SseEvent } from "@aegis/types";
import { createLiveApi } from "./live";

export interface ApiClient {
  getConfig(): Promise<ConfigResponse>;
  getChannels(): Promise<{ scannedAt: number; channels: ChannelSummary[] }>;
  getChannel(addr: string): Promise<ChannelDetail>;
  startRun(scenario: ScenarioId): Promise<{ runId: string }>;
  getRuns(): Promise<RunSnapshot[]>;
  getRun(id: string): Promise<RunSnapshot>;
  /**
   * Streams a run: every past step, then live steps, then one `done` or `error`. Returns the unsubscribe.
   * `onTransportError`: the connection dropped with no terminal event; poll `getRun` until it recovers (API_CONTRACT §5.2).
   */
  subscribeRun(id: string, onEvent: (ev: SseEvent) => void, onTransportError?: () => void): () => void;
  leakCheck(runId: string): Promise<LeakResponse[]>;
  getOffer(client: "A" | "B"): Promise<{ status: number; body: unknown }>;
}

/** A non-2xx answer: `code` is the body's `error` field. Status 0 means the server could not be reached. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly body: unknown) {
    super(code);
    this.name = "ApiError";
  }
}

/** Replay settings in fixture mode, or null against the live server (the header's fixture badge reads this). */
export function fixtureInfo(): { set: "local" | "testnet"; speed: number } | null {
  if (import.meta.env.VITE_API_MODE !== "fixtures") return null;
  return {
    set: import.meta.env.VITE_FIXTURE_SET === "testnet" ? "testnet" : "local",
    speed: Number(new URLSearchParams(globalThis.location?.search).get("speed")) || 1,
  };
}

export function createApi(): ApiClient {
  // Statically dead unless VITE_API_MODE=fixtures, so the recordings never reach the demo build (README §2.2 #10).
  if (import.meta.env.VITE_API_MODE === "fixtures") {
    const settings = fixtureInfo()!;
    return deferred(import("./fixtures").then((m) => m.createFixtureApi(settings)));
  }
  return createLiveApi();
}

/** Forwards every call to a client that is still loading (the fixture chunk). */
function deferred(ready: Promise<ApiClient>): ApiClient {
  return {
    getConfig: () => ready.then((a) => a.getConfig()),
    getChannels: () => ready.then((a) => a.getChannels()),
    getChannel: (addr) => ready.then((a) => a.getChannel(addr)),
    startRun: (scenario) => ready.then((a) => a.startRun(scenario)),
    getRuns: () => ready.then((a) => a.getRuns()),
    getRun: (id) => ready.then((a) => a.getRun(id)),
    leakCheck: (runId) => ready.then((a) => a.leakCheck(runId)),
    getOffer: (client) => ready.then((a) => a.getOffer(client)),
    subscribeRun(id, onEvent, onTransportError) {
      let off: (() => void) | undefined;
      let closed = false;
      void ready.then((a) => { if (!closed) off = a.subscribeRun(id, onEvent, onTransportError); });
      return () => { closed = true; off?.(); };
    },
  };
}
