import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunSnapshot, SseEvent, Step } from "@aegis/types";
import type { ApiClient } from "./client";
import { connectRunStream, initialRunStream, runStreamReducer, type RunStreamAction, type RunStreamState } from "./runStream";

const step = (i: number): Step => ({ i, t: i * 10, phase: "serve", label: `${i}/100 unit dilayani & di-ack (checkpoint co-signed)` });
const snapshot = (over: Partial<RunSnapshot> = {}): RunSnapshot => ({ id: "mudg1f4b-60a0fd", scenario: "B-dispute", status: "running", startedAt: 0, steps: [], channels: [], ...over });
const apply = (state: RunStreamState, ...actions: Parameters<typeof runStreamReducer>[1][]) => actions.reduce(runStreamReducer, state);
const ids = (s: RunStreamState) => s.steps.map((x) => x.i);

describe("runStreamReducer (reconnects replay every step, API_CONTRACT §5.2)", () => {
  it("starts from the snapshot, sorted by i", () => {
    expect(ids(initialRunStream(snapshot({ steps: [step(2), step(0), step(1)] })))).toEqual([0, 1, 2]);
  });

  it("drops a step it already has", () => {
    const s = apply(initialRunStream(snapshot()), { type: "step", data: step(0) }, { type: "step", data: step(0) });
    expect(ids(s)).toEqual([0]);
  });

  it("keeps the same state for a replayed step or a repeated drop, so React skips the render", () => {
    const s = apply(initialRunStream(snapshot()), { type: "step", data: step(0) });
    expect(runStreamReducer(s, { type: "step", data: step(0) })).toBe(s);
    const dropped = runStreamReducer(s, { type: "transport-error" });
    expect(runStreamReducer(dropped, { type: "transport-error" })).toBe(dropped);
  });

  it("orders steps that arrive out of order", () => {
    expect(ids(apply(initialRunStream(snapshot()), { type: "step", data: step(3) }, { type: "step", data: step(1) }))).toEqual([1, 3]);
  });

  it("absorbs a full replay after a reconnect without duplicates", () => {
    const s0 = apply(initialRunStream(snapshot()), ...[0, 1, 2].map((i) => ({ type: "step" as const, data: step(i) })));
    expect(ids(apply(s0, ...[0, 1, 2, 3].map((i) => ({ type: "step" as const, data: step(i) }))))).toEqual([0, 1, 2, 3]);
  });

  it("finishes on done with the server's final snapshot and ignores anything after", () => {
    const final = snapshot({ status: "done", steps: [step(0), step(1)], result: [{ pasar: "B: AegisClear sengketa (bukti)", klien_provider: "0.07 / 1.93", penentu: "bukti Groth16", terlihat: "T, R, jumlah, payToClient", gas: "1", proving_ms: "1", txs: [] }] });
    const s = apply(initialRunStream(snapshot()), { type: "step", data: step(0) }, { type: "done", data: final }, { type: "step", data: step(9) });
    expect(s.status).toBe("done");
    expect(s.run.result?.[0].klien_provider).toBe("0.07 / 1.93");
    expect(ids(s)).toEqual([0, 1]);
  });

  it("reports the run's own error message", () => {
    const s = apply(initialRunStream(snapshot()), { type: "error", data: snapshot({ status: "error", error: "mint ke 0x… gagal" }) });
    expect(s).toMatchObject({ status: "error", error: "mint ke 0x… gagal" });
  });

  it("marks a dropped connection as reconnecting without failing the run, and recovers on the next step", () => {
    const dropped = apply(initialRunStream(snapshot()), { type: "transport-error" });
    expect(dropped).toMatchObject({ status: "running", transport: "reconnecting" });
    expect(apply(dropped, { type: "step", data: step(0) }).transport).toBe("live");
  });

  it("merges a polled snapshot, including its terminal status", () => {
    const s = apply(initialRunStream(snapshot()), { type: "step", data: step(0) }, { type: "snapshot", data: snapshot({ status: "done", steps: [step(0), step(1), step(2)] }) });
    expect(ids(s)).toEqual([0, 1, 2]);
    expect(s.status).toBe("done");
  });
});

describe("connectRunStream (SSE first, getRun every 2 s while the stream is down)", () => {
  afterEach(() => vi.useRealTimers());

  function harness() {
    vi.useFakeTimers();
    const h = {
      polls: 0, closed: false, server: snapshot(), actions: [] as RunStreamAction[],
      push: (_: SseEvent) => {}, drop: () => {},
    };
    const api = {
      subscribeRun: (_id: string, onEvent: (e: SseEvent) => void, onTransportError?: () => void) => {
        h.push = onEvent; h.drop = onTransportError!;
        return () => { h.closed = true; };
      },
      getRun: async () => { h.polls++; return h.server; },
    } as unknown as ApiClient;
    const stop = connectRunStream(api, "mudg1f4b-60a0fd", (a) => h.actions.push(a));
    return { h, stop };
  }

  it("forwards stream events and does not poll while the stream is healthy", async () => {
    const { h } = harness();
    h.push({ type: "step", data: step(0) });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.actions).toEqual([{ type: "step", data: step(0) }]);
    expect(h.polls).toBe(0);
  });

  it("polls after a drop until the run is over, then stops and closes the stream", async () => {
    const { h } = harness();
    h.drop();
    expect(h.actions).toEqual([{ type: "transport-error" }]);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.polls).toBe(2);
    h.server = snapshot({ status: "done" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.actions.at(-1)).toMatchObject({ type: "snapshot", data: { status: "done" } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.polls).toBe(3);
    expect(h.closed).toBe(true);
  });

  it("stops polling when the stream delivers again", async () => {
    const { h } = harness();
    h.drop();
    await vi.advanceTimersByTimeAsync(2_000);
    h.push({ type: "step", data: step(0) });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.polls).toBe(1);
  });

  it("closes the stream and stops polling on cleanup", async () => {
    const { h, stop } = harness();
    h.drop();
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.polls).toBe(0);
    expect(h.closed).toBe(true);
  });
});
