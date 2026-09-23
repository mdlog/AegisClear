import { describe, expect, it } from "vitest";
import type { RunSnapshot, Step } from "@aegis/types";
import { groupRun, railOf, waitClock } from "./run";

const files = import.meta.glob("@fixtures/local-31337/runs/*.snapshot.json", { eager: true, import: "default" }) as Record<string, { body: RunSnapshot }>;
const run = (scenario: string) => Object.values(files).map((f) => f.body).find((r) => r.scenario === scenario)!;
const actKinds = (scenario: string, leg = 0) => groupRun(run(scenario)).legs[leg].acts.map((a) => a.kind);

describe("groupRun splits the tape into legs and acts", () => {
  it("keeps the four legs of the comparison run in server order", () => {
    expect(groupRun(run("all")).legs.map((l) => l.scenario)).toEqual(["B-cooperative", "B-dispute", "A-complete", "A-reject"]);
  });

  it.each([
    ["B-dispute", ["fund", "service", "resolution"]],
    ["B-anchored-dispute", ["fund", "service", "resolution"]],
    ["B-cooperative", ["fund", "service", "close"]],
    ["B-rollover", ["fund", "service", "close", "service", "close"]],
    ["A-complete", ["escrow"]],
  ])("%s → %j", (scenario, want) => {
    expect(actKinds(scenario)).toEqual(want);
  });

  it("puts a faucet mint emitted before the leg marker into that leg's fund act", () => {
    const steps: Step[] = [
      { i: 0, t: 0, phase: "fund", label: "faucet: mint 50 USDG ke klien B" },
      { i: 1, t: 1, phase: "fund", label: "▶ B-dispute — klien B 0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
      { i: 2, t: 2, phase: "fund", label: "fund", txHash: "0x01", gasUsed: "51577" },
    ];
    const { legs } = groupRun({ id: "x-000000", scenario: "B-dispute", status: "running", startedAt: 0, steps, channels: [] });
    expect(legs).toHaveLength(1);
    expect(legs[0].acts[0].steps.map((s) => s.i)).toEqual([0, 2]);
  });

  it("does not lose or duplicate any step", () => {
    const r = run("all");
    const grouped = groupRun(r).legs.flatMap((l) => [l.marker, ...l.acts.flatMap((a) => a.steps)]).filter(Boolean) as Step[];
    expect(grouped.map((s) => s.i).sort((a, b) => a - b)).toEqual(r.steps.map((s) => s.i));
  });
});

describe("the resolution block is in logical order, not arrival order", () => {
  it("puts the proof before the claim although it arrived after it (dispute)", () => {
    // arrival: dispute, submitCheckpoint, claimPenalty, prove, wait, settle
    const act = groupRun(run("B-dispute")).legs[0].acts.find((a) => a.kind === "resolution")!;
    expect(act.stations!.map((s) => s.kind)).toEqual(["opened", "state", "proof", "claim", "window", "settled"]);
    expect(act.stations!.find((s) => s.kind === "state")!.steps[0].label).toBe("submitCheckpoint");
  });

  it("uses startClose as the on-chain state for anchored runs", () => {
    const act = groupRun(run("B-anchored-dispute")).legs[0].acts.find((a) => a.kind === "resolution")!;
    expect(act.stations!.find((s) => s.kind === "state")!.steps[0].label).toBe("startClose");
  });

  it("puts the 20 on-chain acks in the service act of the anchored run", () => {
    const service = groupRun(run("B-anchored-dispute")).legs[0].acts.find((a) => a.kind === "service")!;
    expect(service.steps.filter((s) => s.txHash && s.label === "ack")).toHaveLength(20);
  });
});

describe("waitClock counts the challenge window down between 10-second steps", () => {
  const wait = (done: number): Step => ({ i: 5, t: 0, phase: "wait", label: "menunggu jendela tantangan: 50 s tersisa", progress: { done, total: 60 } });

  it("subtracts the local time since the last wait step", () => {
    expect(waitClock({ step: wait(10), receivedAt: 1_000 }, 4_000)).toEqual({ left: 47, total: 60, overdue: false });
  });
  it("clamps at zero and flags the deadline as passed", () => {
    expect(waitClock({ step: wait(50), receivedAt: 1_000 }, 60_000)).toEqual({ left: 0, total: 60, overdue: true });
  });
  it("has no clock without a wait step or without progress (local fast-forward)", () => {
    expect(waitClock(undefined, 0)).toBeNull();
    expect(waitClock({ step: { i: 1, t: 0, phase: "wait", label: "Anvil: evm_increaseTime(118) + evm_mine" }, receivedAt: 0 }, 0)).toBeNull();
  });
});

describe("railOf: the protocol-named lifecycle rail (LAYOUT_SPEC; figures read from the recordings with jq)", () => {
  const rail = (scenario: string, status?: "running" | "done", upTo?: number) => {
    const r = run(scenario);
    return railOf(r.scenario, upTo === undefined ? r.steps : r.steps.filter((s) => s.i <= upTo), status ?? r.status);
  };
  const summary = (stations: ReturnType<typeof railOf>) => stations.map((s) => ({ key: s.key, state: s.state, tx: s.txCount, gas: s.gas }));

  it("names the co-signed dispute Fund, Open, Serve, Resolve, Settle, with each station's client transactions", () => {
    expect(summary(rail("B-dispute"))).toEqual([
      { key: "fund", state: "done", tx: 1, gas: 51_577n },
      { key: "open", state: "done", tx: 0, gas: 0n },
      { key: "serve", state: "done", tx: 0, gas: 0n },
      { key: "resolve", state: "done", tx: 2, gas: 397_051n },
      { key: "settle", state: "done", tx: 1, gas: 97_098n },
    ]);
    expect(rail("B-dispute").find((s) => s.key === "serve")?.units).toBe(100);
  });

  it("marks the station of the latest step current while the run is live", () => {
    expect(rail("B-dispute", "running", 13).map((s) => s.state)).toEqual(["done", "done", "current", "pending", "pending"]);
  });

  it("counts the anchored acks as 20 units and 20 transactions", () => {
    const serve = rail("B-anchored-dispute").find((s) => s.key === "serve")!;
    expect({ units: serve.units, tx: serve.txCount, gas: serve.gas }).toEqual({ units: 20, tx: 20, gas: 6_263_908n });
  });

  it("splits the rollover into two epochs around the rollover, with no Open station", () => {
    const stations = rail("B-rollover");
    expect(stations.map((s) => s.key)).toEqual(["fund", "serve0", "rollover", "serve1", "close"]);
    expect(stations.map((s) => s.units)).toEqual([undefined, 128, undefined, 5, undefined]);
    expect(stations.find((s) => s.key === "rollover")?.gas).toBe(124_384n);
  });

  it("closes the cooperative run without a resolution", () => {
    expect(rail("B-cooperative").map((s) => s.key)).toEqual(["fund", "open", "serve", "close"]);
  });

  it("names Market A's five control transactions", () => {
    expect(summary(rail("A-complete"))).toEqual([
      { key: "approve", state: "done", tx: 1, gas: 46_330n },
      { key: "createJob", state: "done", tx: 1, gas: 103_827n },
      { key: "fundEscrow", state: "done", tx: 1, gas: 103_854n },
      { key: "submit", state: "done", tx: 1, gas: 30_880n },
      { key: "evaluate", state: "done", tx: 1, gas: 45_963n },
    ]);
  });

  it("marks where a failed run stopped", () => {
    expect(rail("B-dispute", undefined, 15).map((s) => s.state)).toEqual(["done", "done", "done", "done", "done"]);
    const r = run("B-dispute");
    expect(railOf("B-dispute", r.steps.filter((s) => s.i <= 15), "error").map((s) => s.state)).toEqual(["done", "done", "done", "stopped", "pending"]);
  });
});

