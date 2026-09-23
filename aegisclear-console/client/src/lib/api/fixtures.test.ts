import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunSnapshot, SseEvent } from "@aegis/types";
import { createFixtureApi } from "./fixtures";

// Replays docs/frontend/fixtures (real recordings). speed 10 000× turns the 7.3 s dispute into under a millisecond.
const local = () => createFixtureApi({ set: "local", speed: 10_000 });

function collect(api: ReturnType<typeof createFixtureApi>, runId: string) {
  return new Promise<SseEvent[]>((resolve) => {
    const events: SseEvent[] = [];
    api.subscribeRun(runId, (e) => { events.push(e); if (e.type !== "step") resolve(events); });
  });
}

describe("fixture API: reads", () => {
  it("serves the local config and the 129 recorded channels", async () => {
    const api = local();
    expect(await api.getConfig()).toMatchObject({ network: "local", chainId: 31337 });
    const { channels, scannedAt } = await api.getChannels();
    expect(channels).toHaveLength(129);
    expect(typeof scannedAt).toBe("number");
  });

  it("finds a channel by address in any letter case", async () => {
    const detail = await local().getChannel("0x1e12393da190449b9ca32d1f280c4d45fb21c6c4");
    expect(detail.state).toBe("SETTLED");
    expect(detail.events.map((e) => e.name)).toContain("PenaltyClaimed");
  });

  it("answers an unknown channel with the server's 404", async () => {
    await expect(local().getChannel("0x0000000000000000000000000000000000000001")).rejects.toMatchObject({ status: 404, code: "unknown channel" });
  });

  it("says a listed channel has no recording instead of calling it unknown", async () => {
    await expect(local().getChannel("0x9155b3A70F62D64f0F7523c768CCfaBE00e6e086")).rejects.toMatchObject({ status: 404, code: "not-recorded" });
  });

  it("lists the seven recorded runs with steps stripped, and serves each in full", async () => {
    const api = local();
    const runs = await api.getRuns();
    expect(runs).toHaveLength(7);
    expect(runs.every((r) => r.steps.length === 0)).toBe(true);
    expect((await api.getRun("mudg1f4b-60a0fd")).steps).toHaveLength(21);
    await expect(api.getRun("nope-000000")).rejects.toMatchObject({ status: 404, code: "unknown run" });
  });

  it("serves the x402 offer and refuses a Market-A leak check with 404", async () => {
    const api = local();
    expect(await api.getOffer("B")).toMatchObject({ status: 402, body: { x402Version: 1 } });
    await expect(api.leakCheck("mudg364o-57d0c1")).rejects.toMatchObject({ status: 404 });
  });

  it("serves the testnet set: 16 channels, and no recorded runs to replay", async () => {
    const api = createFixtureApi({ set: "testnet" });
    expect((await api.getChannels()).channels).toHaveLength(16);
    await expect(api.startRun("B-dispute")).rejects.toMatchObject({ status: 502, code: "preflight-failed" });
  });
});

describe("fixture API: replaying a run", () => {
  it("streams the recorded dispute in order, ends with 0.07 / 1.93, then allows its leak check", async () => {
    const api = local();
    const { runId } = await api.startRun("B-dispute");
    expect(runId).toMatch(/^[a-z0-9]+-[0-9a-f]{6}$/);
    const events = await collect(api, runId);
    const steps = events.filter((e) => e.type === "step").map((e) => (e as { data: { i: number } }).data.i);
    expect(steps).toEqual(Array.from({ length: 21 }, (_, i) => i));
    const done = events.at(-1)!;
    expect(done.type).toBe("done");
    expect((done.data as RunSnapshot).result?.[0].klien_provider).toBe("0.07 / 1.93");
    expect((await api.getRuns())[0].id).toBe(runId);
    const [leak] = await api.leakCheck(runId);
    expect(leak).toMatchObject({ leaks: 0, ambiguous: 0 });
    expect(leak.txs).toHaveLength(5);
  });

  it("refuses a second run while one is live, like the server", async () => {
    const api = local();
    await api.startRun("B-anchored-dispute");
    await expect(api.startRun("B-dispute")).rejects.toMatchObject({ status: 409, code: "busy" });
  });

  it("lets exactly one of two simultaneous starts through (a double-click)", async () => {
    const api = local();
    const [first, second] = await Promise.allSettled([api.startRun("B-dispute"), api.startRun("B-cooperative")]);
    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({ status: "rejected", reason: { status: 409, code: "busy" } });
  });

  it("rejects an unknown scenario with 400", async () => {
    await expect(local().startRun("nope" as never)).rejects.toMatchObject({ status: 400, code: "unknown-scenario" });
  });

  it("replays past steps to a late subscriber of a finished run", async () => {
    const events = await collect(local(), "mudg2zjn-faee38"); // recorded rollover
    expect(events.filter((e) => e.type === "step")).toHaveLength(16);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("replays at the chosen speed, with step times on the replay's own clock", async () => {
    vi.useFakeTimers();
    const api = createFixtureApi({ set: "local", speed: 4 });
    const { runId } = await api.startRun("B-cooperative"); // recorded: 16 steps, last at t = 2369 ms, ended after 2376 ms
    const events: SseEvent[] = [];
    api.subscribeRun(runId, (e) => events.push(e));
    await vi.advanceTimersByTimeAsync(500);
    expect((await api.getRun(runId)).status).toBe("running");
    await vi.advanceTimersByTimeAsync(200);
    const done = events.at(-1)!;
    expect(done.type).toBe("done");
    const run = done.data as RunSnapshot;
    expect(run.steps.at(-1)!.t).toBe(592); // round(2369 / 4)
    expect(run.endedAt! - run.startedAt).toBe(594); // round(2376 / 4)
  });

  afterEach(() => vi.useRealTimers());
});
