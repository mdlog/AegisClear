// The console server (web/server on :4040, reached through the Vite proxy or served same-origin): fetch for
// E1-E6, E8 and E9, EventSource for the E7 run stream (API_CONTRACT §3 and §5).
import type { SseEvent } from "@aegis/types";
import { ApiError, type ApiClient } from "./client";

export interface LiveOptions {
  fetch?: typeof fetch;
  EventSource?: typeof EventSource;
  /** Prefix for every path; empty means same origin. */
  base?: string;
}

export function createLiveApi(opts: LiveOptions = {}): ApiClient {
  const base = opts.base ?? "";
  const doFetch: typeof fetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(base + path, init);
    } catch (e) {
      throw new ApiError(0, "server-unreachable", e); // nothing listening on :4040 (API_CONTRACT §9)
    }
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* not JSON: keep the text */ }
    if (!res.ok) throw new ApiError(res.status, errorCode(body) ?? `http-${res.status}`, body);
    return body as T;
  }

  return {
    getConfig: () => request("/api/config"),
    getChannels: () => request("/api/channels"),
    getChannel: (addr) => request(`/api/channels/${encodeURIComponent(addr)}`),
    startRun: (scenario) => request("/api/demo/run", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }),
    }),
    getRuns: () => request("/api/demo/runs"),
    getRun: (id) => request(`/api/demo/runs/${encodeURIComponent(id)}`),
    leakCheck: (runId) => request(`/api/demo/leak-check/${encodeURIComponent(runId)}`),
    getOffer: (client) => request(`/api/offer?client=${client}`),
    subscribeRun(id, onEvent, onTransportError) {
      const ES = opts.EventSource ?? globalThis.EventSource;
      const es = new ES(`${base}/api/demo/runs/${encodeURIComponent(id)}/events`);
      const forward = (type: SseEvent["type"]) => (e: Event) => {
        const data = (e as MessageEvent).data;
        // The server's terminal event is also named "error". Without data it is EventSource's own
        // connection error, and EventSource is already reconnecting (API_CONTRACT §5.2).
        if (typeof data !== "string") return onTransportError?.();
        if (type !== "step") es.close(); // otherwise EventSource reconnects and the server replays everything
        onEvent({ type, data: JSON.parse(data) } as SseEvent);
      };
      es.addEventListener("step", forward("step"));
      es.addEventListener("done", forward("done"));
      es.addEventListener("error", forward("error"));
      return () => es.close();
    },
  };
}

function errorCode(body: unknown): string | undefined {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "string" ? error : undefined;
}
