import { describe, expect, it } from "vitest";
import type { Row, RunSnapshot, Step } from "@aegis/types";
import { presentRow, presentStep, proofFacts } from "./labels";

// Real recordings: docs/frontend/fixtures/local-31337/runs/*.snapshot.json (all seven scenarios).
const files = import.meta.glob("@fixtures/local-31337/runs/*.snapshot.json", { eager: true, import: "default" }) as Record<string, { body: RunSnapshot }>;
const runs = Object.values(files).map((f) => f.body);
const byScenario = Object.fromEntries(runs.map((r) => [r.scenario, r]));
const allSteps = runs.flatMap((r) => r.steps.map((s) => ({ run: r, step: s })));

// Words from the server's Indonesian labels that must never reach the English UI.
const INDONESIAN = /\b(diterima|dilayani|sengketa|bukti|menunggu|tersisa|klien|penuh|dimulai|kembali|diulang|sudah|kalah|balapan|syarat|terakhir|dikirim|membuka|saat|lihat|kolom|bayar|sisa|jadi|tanpa|lalu|tertinggi)\b/i;
const step = (s: Partial<Step>): Step => ({ i: 0, t: 0, phase: "fund", label: "", ...s });

describe("presentStep on the seven recorded runs", () => {
  it("recognises every label the server emitted (none falls back to raw text)", () => {
    expect(runs).toHaveLength(7);
    expect(allSteps).toHaveLength(147); // 21 + 33 + 16 + 16 + 6 + 6 + 49 recorded steps: the check is not vacuous
    const unmatched = allSteps.filter(({ run, step: s }) => !presentStep(s, { scenario: run.scenario }).matched).map(({ step: s }) => s.label);
    expect(unmatched).toEqual([]);
  });

  it("leaves no Indonesian words in titles or meta", () => {
    const leaks = allSteps
      .map(({ run, step: s }) => presentStep(s, { scenario: run.scenario }))
      .filter((p) => INDONESIAN.test(p.title) || INDONESIAN.test(p.meta ?? ""));
    expect(leaks).toEqual([]);
  });

  it("marks transaction steps as tx and narrative ones as not tx", () => {
    for (const { run, step: s } of allSteps) {
      expect(presentStep(s, { scenario: run.scenario }).kind === "tx").toBe(Boolean(s.txHash));
    }
  });
});

describe("values survive the translation", () => {
  const dispute = byScenario["B-dispute"];

  it("402 line keeps the deposit and the predicted channel", () => {
    const s = dispute.steps.find((x) => x.label.startsWith("402 diterima"))!;
    const p = presentStep(s, { scenario: "B-dispute" });
    expect(p.title).toContain("5.00");
    expect(p.title).toContain("0x1E12…C6C4");
  });

  it("proof line keeps payToClient and turns the detail into seconds", () => {
    const s = dispute.steps.find((x) => x.phase === "prove")!; // label "bukti Groth16: payToClient 0.07 USDG", detail "4682 ms proving"
    const p = presentStep(s, { scenario: "B-dispute" });
    expect(p.kind).toBe("proof");
    expect(p.tone).toBe("proof");
    expect(p.title).toContain("0.07");
    expect(p.meta).toBe("proved in 4.7 s");
  });

  it("serve progress keeps both counts", () => {
    const p = presentStep(step({ phase: "serve", label: "30/100 unit dilayani & di-ack (checkpoint co-signed)" }));
    expect(p.title).toMatch(/\b30\b/);
    expect(p.title).toMatch(/\b100\b/);
  });

  it("rollover lines keep the epoch numbers and the paid amount with a decimal point", () => {
    const roll = byScenario["B-rollover"];
    const full = presentStep(roll.steps.find((x) => x.label.startsWith("epoch 0 penuh"))!);
    expect(full.title).toContain("2.56");
    expect(full.title).toContain("epoch 1");
    const started = presentStep(roll.steps.find((x) => x.label.startsWith("epoch 1 dimulai"))!);
    expect(started.title).toMatch(/Epoch 1/);
  });
});

describe("context-dependent and code-only labels", () => {
  const disputeOpened = step({ phase: "dispute", label: "sengketa: submit checkpoint co-signed tertinggi, lalu bukti penalti" });

  it("does not claim a co-signed checkpoint for anchored runs (the server sends the same text)", () => {
    expect(presentStep(disputeOpened, { scenario: "B-dispute" }).title).toMatch(/co-signed checkpoint/);
    const anchored = presentStep(disputeOpened, { scenario: "B-anchored-dispute" }).title;
    expect(anchored).not.toMatch(/co-signed checkpoint/);
    expect(anchored).toMatch(/close/i);
    expect(presentStep(disputeOpened, { mode: "anchored" }).title).toBe(anchored);
  });

  it("renders the testnet challenge-window wait (never recorded locally) as a caution wait", () => {
    const p = presentStep(step({ phase: "wait", label: "menunggu jendela tantangan: 50 s tersisa", progress: { done: 10, total: 60 } }));
    expect(p).toMatchObject({ kind: "wait", tone: "caution", matched: true });
    expect(p.title).toContain("50 s");
  });

  it("treats both watcher-settled outcomes as normal, not as errors", () => {
    for (const label of [
      "sudah di-settle oleh watcher provider (permissionless) — tanpa tx klien",
      "settle() klien kalah balapan dengan watcher provider — channel sudah SETTLED",
    ]) {
      const p = presentStep(step({ phase: "settle", label }));
      expect(p.matched).toBe(true);
      expect(p.tone).toBe("ok");
      expect(p.title).not.toMatch(INDONESIAN);
    }
  });

  it("renders the faucet line with the minted amount and client", () => {
    const p = presentStep(step({ phase: "fund", label: "faucet: mint 50 USDG ke klien B" }));
    expect(p.matched).toBe(true);
    expect(p.title).toContain("50");
    expect(p.title).toMatch(/client B/);
  });

  it("turns each leg marker of the four-leg run into its scenario title and client", () => {
    const legs = byScenario["all"].steps.filter((s) => s.label.startsWith("▶")).map((s) => presentStep(s, { scenario: "all" }));
    expect(legs.map((l) => l.kind)).toEqual(["leg", "leg", "leg", "leg"]);
    expect(new Set(legs.map((l) => l.title)).size).toBe(4);
    expect(legs[1].meta).toContain("client B");
  });

  it("translates Market A transaction labels", () => {
    const createJob = presentStep(step({ phase: "escrow", label: "createJob (syarat di calldata)", txHash: "0x01", gasUsed: "132604" }));
    expect(createJob.title).toMatch(/calldata/);
    expect(createJob.title).not.toMatch(INDONESIAN);
    expect(createJob.meta).toBe("132,604 gas");
    expect(presentStep(step({ phase: "escrow", label: "complete (evaluator = klien)", txHash: "0x02", gasUsed: "1" })).title).toMatch(/client/);
  });

  it("colours the proof claim in proof ink", () => {
    expect(presentStep(step({ phase: "dispute", label: "claimPenalty", txHash: "0x03", gasUsed: "304432" })).tone).toBe("proof");
  });

  it("falls back to the raw server text for anything unknown", () => {
    expect(presentStep(step({ phase: "mystery", label: "sesuatu yang baru" }))).toMatchObject({ title: "sesuatu yang baru", matched: false });
    expect(presentStep(step({ label: "fooBar", txHash: "0x04", gasUsed: "10" }))).toMatchObject({ title: "fooBar", matched: false, kind: "tx" });
  });
});

describe("presentRow", () => {
  const rows = byScenario["all"].result as Row[];

  it("translates every recorded market row and splits client / provider shares", () => {
    const presented = rows.map(presentRow);
    expect(presented.every((r) => r.matched)).toBe(true);
    expect(presented.some((r) => INDONESIAN.test(`${r.market} ${r.decidedBy} ${r.visible}`))).toBe(false);
    const dispute = presented[rows.findIndex((r) => r.pasar.includes("sengketa"))];
    expect(dispute).toMatchObject({ clientShare: "0.07", providerShare: "1.93" });
    const complete = presented[rows.findIndex((r) => r.pasar.includes("(complete)"))];
    expect(complete).toMatchObject({ clientShare: "0", providerShare: "2.00" });
  });

  it("keeps unknown rows as raw text", () => {
    const row: Row = { pasar: "Pasar C", klien_provider: "1 / 1", penentu: "x", terlihat: "y", gas: "0", proving_ms: "-", txs: [] };
    expect(presentRow(row)).toMatchObject({ market: "Pasar C", matched: false, clientShare: "1", providerShare: "1" });
  });
});

describe("proofFacts: the refund and proving time of the prove step, read by the adapter", () => {
  it("reads 0.07 and 4,682 ms from the recorded dispute's prove step", () => {
    const step = { i: 18, t: 7229, phase: "prove", label: "bukti Groth16: payToClient 0.07 USDG", detail: "4682 ms proving" };
    expect(proofFacts(step)).toEqual({ amount: "0.07", provingMs: 4682 });
  });
  it("returns nothing for any other step", () => {
    expect(proofFacts({ i: 0, t: 0, phase: "fund", label: "fund", txHash: "0x01", gasUsed: "1" })).toEqual({});
  });
});

