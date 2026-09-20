import { test } from "node:test";
import assert from "node:assert/strict";
import { toRows, metricsFor, BREACHES, privateValues, TERMS_BASE, type MarketAResult, type MarketBResult } from "../src/index.js";

test("metricsFor: pelanggaran hanya di seq EX1", () => {
  assert.deepEqual(metricsFor(3), { m1: 1200n, m2: 95n });
  assert.deepEqual(metricsFor(4), { m1: 300n, m2: 95n });
  assert.equal(BREACHES.size, 7);
});

test("toRows: urutan §14 dan format USDG 2 desimal", () => {
  const tx = { label: "x", hash: "0x01" as const, gasUsed: 10n };
  const b = (payToClient: bigint, providerDelta: bigint, provingMs: number): MarketBResult => ({
    channel: "0x0000000000000000000000000000000000000001", txs: [tx], gasTotal: 542_194n, provingMs, clientDelta: 0n, providerDelta,
    local: { cumulativeAmount: 2_000_000n, breaches: 7, penRaw: 70_000n, cap: 600_000n, payToClient, payToProvider: 2_000_000n - payToClient },
    terms: { ...TERMS_BASE, nonce: 1n },
  });
  const a = (result: string): MarketAResult => ({ gasTotal: 347_918n, result, txs: [tx] });
  const rows = toRows({ aOk: a("0 / 2.00"), aRej: a("2.00 / 0"), bCoop: b(0n, 2_000_000n, 0), bDisp: b(70_000n, 1_930_000n, 4245) });
  assert.deepEqual(rows.map((r) => r.pasar), [
    "A: evaluator biner (complete)", "A: evaluator biner (reject)", "B: AegisClear kooperatif", "B: AegisClear sengketa (bukti)",
  ]);
  assert.equal(rows[2].klien_provider, "0.00 / 2.00");
  assert.equal(rows[3].klien_provider, "0.07 / 1.93");
  assert.equal(rows[3].proving_ms, "4245");
  assert.equal(rows[3].gas, "542194");
  assert.deepEqual(rows[3].txs, [{ label: "x", hash: "0x01" }]);
  // baris yang hasilnya tidak ada dilewati
  assert.equal(toRows({ bCoop: b(0n, 2_000_000n, 0) }).length, 1);
});

test("privateValues: 6 syarat + 3 metrik demo", () => {
  const v = privateValues({ ...TERMS_BASE, nonce: 7n });
  assert.deepEqual(v, [20_000n, 800n, 90n, 5000n, 3000n, 7n, 1200n, 300n, 95n]);
});

test("toRows: baris anchored dan rollover", () => {
  const tx = { label: "x", hash: "0x01" as const, gasUsed: 10n };
  const base = { channel: "0x0000000000000000000000000000000000000001" as const, txs: [tx], gasTotal: 1n, clientDelta: 0n, terms: { ...TERMS_BASE, nonce: 1n } };
  const anch = { ...base, provingMs: 4000, providerDelta: 380_000n, local: { cumulativeAmount: 400_000n, breaches: 2, penRaw: 20_000n, cap: 120_000n, payToClient: 20_000n, payToProvider: 380_000n } };
  const roll = { ...base, provingMs: 0, providerDelta: 2_660_000n, local: { cumulativeAmount: 100_000n, breaches: 0, penRaw: 0n, cap: 30_000n, payToClient: 0n, payToProvider: 100_000n }, epoch: 1, units: 133 };
  const rows = toRows({ bAnch: anch, bRoll: roll });
  assert.deepEqual(rows.map((r) => r.pasar), ["B: AegisClear anchored (ack on-chain, sengketa)", "B: AegisClear rollover (128 + 5 unit, 1 deposit)"]);
  assert.equal(rows[0].klien_provider, "0.02 / 0.38"); assert.equal(rows[0].penentu, "bukti Groth16 atas R on-chain");
  assert.equal(rows[1].klien_provider, "0.00 / 2.66"); assert.equal(rows[1].terlihat, "T, R, epoch, jumlah");
});
test("privateValues anchored: tanpa unitPrice (A per ack ada di chain)", () => {
  const v = privateValues({ ...TERMS_BASE, nonce: 7n }, { anchored: true });
  assert.deepEqual(v, [800n, 90n, 5000n, 3000n, 7n, 1200n, 300n, 95n]);
});
