import { describe, expect, it } from "vitest";
import type { SseEvent } from "@aegis/types";
import { ApiError } from "./client";
import { createLiveApi } from "./live";

type Call = { url: string; init?: RequestInit };
const fakeFetch = (respond: (call: Call) => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return respond({ url, init }); }) as unknown as typeof fetch;
  return { f, calls };
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Minimal stand-in for the browser EventSource: the wrapper only uses addEventListener and close. */
class FakeEventSource {
  static last: FakeEventSource;
  readonly listeners = new Map<string, ((e: Event) => void)[]>();
  closed = false;
  constructor(readonly url: string) { FakeEventSource.last = this; }
  addEventListener(type: string, fn: (e: Event) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  close() { this.closed = true; }
  emit(type: string, data?: unknown) {
    const e = data === undefined ? new Event(type) : new MessageEvent(type, { data: JSON.stringify(data) });
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
}

describe("createLiveApi: HTTP", () => {
  it("posts the scenario as JSON to /api/demo/run", async () => {
    const { f, calls } = fakeFetch(() => json(202, { runId: "mudg1f4b-60a0fd" }));
    await expect(createLiveApi({ fetch: f }).startRun("B-dispute")).resolves.toEqual({ runId: "mudg1f4b-60a0fd" });
    expect(calls[0].url).toBe("/api/demo/run");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ scenario: "B-dispute" });
  });

  it("turns a JSON error body into ApiError with the status and the server's code", async () => {
    const { f } = fakeFetch(() => json(409, { error: "busy" }));
    const err = await createLiveApi({ fetch: f }).startRun("B-dispute").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "busy" });
  });

  it("keeps the open channel from a client-has-open-channel conflict", async () => {
    const { f } = fakeFetch(() => json(409, { error: "client-has-open-channel", channel: "0x9AA0C0c281338295505003B6D80017B56e335e69" }));
    const err = await createLiveApi({ fetch: f }).startRun("B-dispute").catch((e) => e);
    expect(err.code).toBe("client-has-open-channel");
    expect(err.body.channel).toBe("0x9AA0C0c281338295505003B6D80017B56e335e69");
  });

  it("reports a server that cannot be reached as status 0", async () => {
    const { f } = fakeFetch(() => { throw new TypeError("fetch failed"); });
    await expect(createLiveApi({ fetch: f }).getConfig()).rejects.toMatchObject({ status: 0, code: "server-unreachable" });
  });

  it("names non-JSON failures by their HTTP status", async () => {
    const { f } = fakeFetch(() => new Response("upstream down", { status: 502 }));
    await expect(createLiveApi({ fetch: f }).getChannels()).rejects.toMatchObject({ status: 502, code: "http-502" });
  });

  it("asks for the offer of the selected client and puts the channel address in the path", async () => {
    const { f, calls } = fakeFetch(() => json(200, { status: 402, body: {} }));
    const api = createLiveApi({ fetch: f });
    await api.getOffer("B");
    await api.getChannel("0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1");
    expect(calls.map((c) => c.url)).toEqual(["/api/offer?client=B", "/api/channels/0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1"]);
  });
});

describe("createLiveApi: SSE (the 'error' event name gotcha, API_CONTRACT §5.2)", () => {
  const open = () => {
    const events: SseEvent[] = [];
    let transport = 0;
    const api = createLiveApi({ EventSource: FakeEventSource as unknown as typeof EventSource });
    api.subscribeRun("mudg1f4b-60a0fd", (e) => events.push(e), () => transport++);
    return { es: FakeEventSource.last, events, transport: () => transport };
  };

  it("subscribes to the run's event stream and forwards parsed steps", () => {
    const { es, events } = open();
    expect(es.url).toBe("/api/demo/runs/mudg1f4b-60a0fd/events");
    es.emit("step", { i: 0, t: 4, phase: "fund", label: "x" });
    expect(events).toEqual([{ type: "step", data: { i: 0, t: 4, phase: "fund", label: "x" } }]);
  });

  it("closes the stream after done so EventSource does not reconnect", () => {
    const { es, events } = open();
    es.emit("done", { id: "mudg1f4b-60a0fd", status: "done" });
    expect(events.at(-1)?.type).toBe("done");
    expect(es.closed).toBe(true);
  });

  it("treats an 'error' event with data as the run failing, and closes", () => {
    const { es, events, transport } = open();
    es.emit("error", { id: "mudg1f4b-60a0fd", status: "error", error: "boom" });
    expect(events.at(-1)).toMatchObject({ type: "error", data: { error: "boom" } });
    expect(transport()).toBe(0);
    expect(es.closed).toBe(true);
  });

  it("treats a native error without data as a transport problem, not a run failure", () => {
    const { es, events, transport } = open();
    es.emit("error");
    expect(events).toEqual([]);
    expect(transport()).toBe(1);
    expect(es.closed).toBe(false);
  });
});
