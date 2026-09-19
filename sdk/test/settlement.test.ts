import { describe, it, expect } from "vitest";
import { settle, loadVector } from "../src/core/index.js";

const NAMES = ["EX1_7_latency_breaches", "EX2_cap_binds_80_breaches", "EX3_qty5_2_quality_breaches",
  "EDGE_seq0", "EDGE_seq128_all_breach", "EDGE_cap0", "EDGE_cap100_pen100", "EDGE_qty0_slot"];

describe("settle() == tools/settlement_vectors.py", () => {
  for (const name of NAMES) {
    it(name, () => {
      const v = loadVector(name);
      const s = settle(v.receipts, v.terms);
      expect(s.cumulativeAmount).toBe(v.expected.cumulativeAmount);
      expect(s.breaches).toBe(v.expected.breaches);
      expect(s.penRaw).toBe(v.expected.penRaw);
      expect(s.cap).toBe(v.expected.cap);
      expect(s.payToClient).toBe(v.expected.payToClient);
      expect(s.payToProvider).toBe(v.expected.payToProvider);
      expect(s.payToClient + s.payToProvider).toBe(s.cumulativeAmount);
    });
  }
  it("EX1 angka wajib spec §6.5", () => {
    const v = loadVector("EX1_7_latency_breaches");
    const s = settle(v.receipts, v.terms);
    expect(s.payToClient).toBe(70_000n);
    expect(s.payToProvider).toBe(1_930_000n);
  });
  it("menolak due != qty*unitPrice (C3)", () => {
    const v = loadVector("EX1_7_latency_breaches");
    const bad = v.receipts.map((r, i) => (i === 0 ? { ...r, due: r.due + 1n } : r));
    expect(() => settle(bad, v.terms)).toThrow(/C3/);
  });
});
