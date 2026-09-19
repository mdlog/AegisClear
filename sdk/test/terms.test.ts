import { describe, it, expect } from "vitest";
import { commitTerms, randomNonce, FIELD_PRIME, type Terms } from "../src/core/index.js";

const base: Terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: 0n };
describe("commitTerms", () => {
  it("nonce berbeda → komitmen berbeda; nonce < p", async () => {
    const n1 = randomNonce(), n2 = randomNonce();
    expect(n1).not.toBe(n2); expect(n1 < FIELD_PRIME).toBe(true);
    expect(await commitTerms({ ...base, nonce: n1 })).not.toBe(await commitTerms({ ...base, nonce: n2 }));
  });
  it("menolak bps > 10000", async () => {
    await expect(commitTerms({ ...base, capBps: 10_001n })).rejects.toThrow(/capBps/);
  });
});
