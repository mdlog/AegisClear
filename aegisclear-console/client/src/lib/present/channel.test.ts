import { describe, expect, it } from "vitest";
import type { ChannelDetail, RunSnapshot } from "@aegis/types";
import { usdg } from "@/lib/format";
import { lifecycleOf, settlementOf } from "./channel";

// Real testnet v2 channels: docs/frontend/fixtures/testnet-46630/channels/*.json
const files = import.meta.glob("@fixtures/testnet-46630/channels/*.json", { eager: true, import: "default" }) as Record<string, { body: ChannelDetail }>;
const channel = (prefix: string) => Object.entries(files).find(([path]) => path.includes(`/${prefix}.`))![1].body;
const DEPOSIT = 5_000_000n; // every Market-B demo channel is funded with 5.00
// Local dev-chain runs: every channel a recorded run created, and the result rows of those runs.
const localChannels = import.meta.glob("@fixtures/local-31337/channels/*.json", { eager: true, import: "default" }) as Record<string, { body: ChannelDetail }>;
const localRuns = import.meta.glob("@fixtures/local-31337/runs/*.snapshot.json", { eager: true, import: "default" }) as Record<string, { body: RunSnapshot }>;
const localRows = Object.values(localRuns).flatMap((r) => r.body.result ?? []);

describe("settlementOf (money comes from Settled and RolledOver, never from cumulativeAmount)", () => {
  it("splits the proof dispute 1.93 / 3.07 with the 0.07 penalty", () => {
    expect(settlementOf(channel("B-dispute"))).toMatchObject({ toProvider: 1_930_000n, toClient: 3_070_000n, penalty: 70_000n, cooperative: false });
  });

  it("reads a cooperative close from Settled even though A reads 0 on-chain", () => {
    const detail = channel("B-cooperative");
    expect(detail.cumulativeAmount).toBe("0");
    expect(settlementOf(detail)).toMatchObject({ toProvider: 2_000_000n, toClient: 3_000_000n, penalty: 0n, cooperative: true });
  });

  it("sums the rollover payment and the final close for the provider (2.56 + 0.10 = 2.66)", () => {
    const s = settlementOf(channel("B-rollover"))!;
    expect(s.toProvider).toBe(2_660_000n);
    expect(s.toClient).toBe(2_340_000n);
    expect(s.epochs).toEqual([
      expect.objectContaining({ epoch: 0, kind: "rollover", toProvider: 2_560_000n, carried: 2_440_000n }),
      expect.objectContaining({ epoch: 1, kind: "settled", toProvider: 100_000n, toClient: 2_340_000n }),
    ]);
  });

  it("splits the anchored dispute 0.38 to the provider after the 0.02 proof", () => {
    expect(settlementOf(channel("B-anchored-dispute"))).toMatchObject({ toProvider: 380_000n, toClient: 4_620_000n, penalty: 20_000n });
  });

  it("conserves the deposit across every epoch", () => {
    for (const prefix of ["B-dispute", "B-cooperative", "B-rollover", "B-anchored-dispute"]) {
      const s = settlementOf(channel(prefix))!;
      expect(s.toProvider + s.toClient).toBe(DEPOSIT);
    }
  });

  it("agrees with the SDK's result row for every channel a local run created", () => {
    // Two independent sources: chain events (the channel detail) and the scenario's own row, matched by tx hash.
    const details = Object.values(localChannels).map((f) => f.body);
    expect(details).toHaveLength(6);
    for (const d of details) {
      const hashes = new Set(d.events.map((e) => e.txHash.toLowerCase()));
      const row = localRows.find((r) => r.txs.some((t) => hashes.has(t.hash.toLowerCase())))!;
      const s = settlementOf(d)!;
      expect(`${usdg(s.penalty)} / ${usdg(s.toProvider)}`).toBe(row.klien_provider);
      expect(s.toProvider + s.toClient).toBe(DEPOSIT);
    }
  });

  it("returns null for a channel that has not settled", () => {
    expect(settlementOf(channel("open-unfunded"))).toBeNull();
  });
});

describe("lifecycleOf", () => {
  const kinds = (prefix: string) => lifecycleOf(channel(prefix)).map((s) => s.kind);

  it("orders the co-signed dispute trail", () => {
    expect(kinds("B-dispute")).toEqual(["Opened", "CheckpointSubmitted", "PenaltyClaimed", "Settled"]);
  });

  it("groups the 20 anchored acks into one station with their gas range", () => {
    const stations = lifecycleOf(channel("B-anchored-dispute"));
    expect(stations.map((s) => s.kind)).toEqual(["Opened", "Acked", "CloseStarted", "PenaltyClaimed", "Settled"]);
    expect(stations[1]).toMatchObject({ count: 20, gasMin: 201_020n, gasMax: 349_751n });
  });

  it("shows the rollover between open and settle", () => {
    expect(kinds("B-rollover")).toEqual(["Opened", "RolledOver", "Settled"]);
  });

  it("stops at Opened for a channel with no further activity", () => {
    expect(kinds("open-unfunded")).toEqual(["Opened"]);
  });

  it("keeps events it does not know as generic stations", () => {
    const base = channel("open-unfunded");
    const detail: ChannelDetail = { ...base, events: [...base.events, { name: "Swept", args: { amount: "5" }, txHash: "0xab", blockNumber: "9", gasUsed: "30000" }] };
    expect(lifecycleOf(detail).map((s) => s.kind)).toEqual(["Opened", "Swept"]);
  });
});
