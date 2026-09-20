import type { ChannelDetail, ChannelSummary, ConfigResponse, LeakResponse, RunSnapshot, ScenarioId, SseEvent } from "../shared/types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  const body = (await r.json().catch(() => ({}))) as { error?: string; channel?: string };
  if (!r.ok) throw new Error(body.error ? `${body.error}${body.channel ? ` (${body.channel})` : ""}` : `${path} → HTTP ${r.status}`);
  return body as T;
}
export const getConfig = () => api<ConfigResponse>("/api/config");
export const getChannels = () => api<{ scannedAt: number; channels: ChannelSummary[] }>("/api/channels");
export const getChannel = (a: string) => api<ChannelDetail>(`/api/channels/${a}`);
export const startRun = (scenario: ScenarioId) =>
  api<{ runId: string }>("/api/demo/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }) });
export const getRun = (id: string) => api<RunSnapshot>(`/api/demo/runs/${id}`);
export const getRuns = () => api<RunSnapshot[]>("/api/demo/runs");
export const leakCheck = (id: string) => api<LeakResponse[]>(`/api/demo/leak-check/${id}`);
export const getOffer = (client: "A" | "B") => api<{ status: number; body: unknown }>(`/api/offer?client=${client}`);

/** SSE run: replay step lama lalu live; ditutup otomatis setelah done/error. */
export function subscribeRun(id: string, onEvent: (ev: SseEvent) => void): () => void {
  const es = new EventSource(`/api/demo/runs/${id}/events`);
  const parse = (e: Event) => JSON.parse((e as MessageEvent).data as string);
  es.addEventListener("step", (e) => onEvent({ type: "step", data: parse(e) }));
  es.addEventListener("done", (e) => { onEvent({ type: "done", data: parse(e) }); es.close(); });
  es.addEventListener("error", (e) => { if ((e as MessageEvent).data) { onEvent({ type: "error", data: parse(e) }); es.close(); } });
  return () => es.close();
}
