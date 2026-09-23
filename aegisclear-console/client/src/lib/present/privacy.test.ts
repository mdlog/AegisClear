import { describe, expect, it } from "vitest";
import type { ChannelDetail, ConfigResponse } from "@aegis/types";
import { breachesFor, penaltyMath, privacyMirror } from "./privacy";

const cfgFile = import.meta.glob("@fixtures/testnet-46630/config.json", { eager: true, import: "default" }) as Record<string, { body: ConfigResponse }>;
const config = Object.values(cfgFile)[0].body;
const files = import.meta.glob("@fixtures/testnet-46630/channels/*.json", { eager: true, import: "default" }) as Record<string, { body: ChannelDetail }>;
const channel = (prefix: string) => Object.entries(files).find(([path]) => path.includes(`/${prefix}.`))![1].body;
const row = (rows: ReturnType<typeof privacyMirror>, key: string) => rows.find((r) => r.key === key)!;

describe("breachesFor: the demo schedule applies per epoch, by in-epoch seq", () => {
  it("lists all seven for a 100-unit co-signed channel and without a channel", () => {
    expect(breachesFor(config)).toEqual([3, 17, 29, 44, 58, 71, 90]);
    expect(breachesFor(config, channel("B-dispute"))).toEqual([3, 17, 29, 44, 58, 71, 90]);
  });
  it("keeps only seq 3 and 17 for the 20 anchored acks", () => {
    expect(breachesFor(config, channel("B-anchored-dispute"))).toEqual([3, 17]);
  });
  it("keeps only seq 3 in epoch 1 of the rollover channel (seq 5)", () => {
    expect(breachesFor(config, channel("B-rollover"))).toEqual([3]);
  });
  it("excludes the breach at seq 17 when only 17 units (seq 0–16) were served", () => {
    expect(breachesFor(config, { ...channel("B-dispute"), seq: 17 })).toEqual([3]);
  });
});

describe("penaltyMath follows spec §6.3 / §6.5", () => {
  it("EX1: 7 breaches of a 0.02 unit at 50 % is 0.07, under the 30 % cap of 2.00", () => {
    expect(penaltyMath(config, 7, 2_000_000n)).toEqual({ perUnit: 10_000n, raw: 70_000n, cap: 600_000n, payToClient: 70_000n });
  });
  it("EX2: 80 breaches hit the cap of 0.60", () => {
    expect(penaltyMath(config, 80, 2_000_000n).payToClient).toBe(600_000n);
  });
  it("anchored: 2 breaches over A = 0.40 is 0.02", () => {
    expect(penaltyMath(config, 2, 400_000n)).toEqual({ perUnit: 10_000n, raw: 20_000n, cap: 120_000n, payToClient: 20_000n });
  });
});

describe("privacyMirror pairs each private fact with what the chain shows", () => {
  it("hides the terms inside T and the receipts inside R for the dispute", () => {
    const rows = privacyMirror(config, channel("B-dispute"));
    expect(row(rows, "unitPrice")).toMatchObject({ known: expect.stringContaining("0.02"), chain: expect.stringMatching(/inside T/) });
    expect(row(rows, "breaches").known).toContain("3, 17, 29, 44, 58, 71, 90");
    expect(row(rows, "breaches").chain).toMatch(/inside R/);
  });

  it("shows the proven refund on both sides and the final split from the Settled event", () => {
    const rows = privacyMirror(config, channel("B-dispute"));
    expect(row(rows, "refund").known).toContain("0.07");
    expect(row(rows, "refund").chain).toContain("0.07");
    expect(row(rows, "split").chain).toContain("1.93");
    expect(row(rows, "split").chain).toContain("3.07");
  });

  it("admits that anchored mode implies the unit price on-chain", () => {
    const rows = privacyMirror(config, channel("B-anchored-dispute"));
    expect(row(rows, "unitPrice").chain).toMatch(/implied/i);
    expect(row(rows, "breaches").known).toContain("3, 17");
    expect(row(rows, "breaches").known).not.toContain("29");
  });

  it("reports the rollover payment and the close separately instead of A = 0", () => {
    const rows = privacyMirror(config, channel("B-rollover"));
    expect(row(rows, "ackedTotal").chain).toContain("2.56");
    expect(row(rows, "ackedTotal").chain).toContain("0.10");
    expect(row(rows, "epoch").chain).toContain("1");
  });

  it("lists the rollover's breaches per epoch: all seven in the full epoch 0, then seq 3 in epoch 1", () => {
    const rows = privacyMirror(config, channel("B-rollover"));
    expect(row(rows, "breaches").known).toBe("Epoch 0: seq 3, 17, 29, 44, 58, 71, 90. Epoch 1: seq 3");
    expect(row(rows, "units").known).toBe("133 (128 in epoch 0, 5 in epoch 1)");
    expect(row(rows, "units").chain).toBe("seq 5 in epoch 1; epoch 0 closed at 128");
  });

  it("says a co-signed close never published its receipts (R is zero), instead of hiding them in R", () => {
    const rows = privacyMirror(config, channel("B-cooperative"));
    expect(row(rows, "receipts").chain).toBe("Never sent: the close was co-signed, so no receipts root was published");
    expect(row(rows, "breaches").chain).toBe("Never sent: the close was co-signed, so no receipts root was published");
    expect(row(rows, "commitments").chain).toMatch(/^T 0x17dd…[0-9a-f]{4}, R none$/);
  });

  it("never shows the session nonce value", () => {
    const rows = privacyMirror(config, channel("B-dispute"));
    expect(row(rows, "nonce").known).not.toMatch(/\d{6,}/);
  });
});
