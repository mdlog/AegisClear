import { randomBytes } from "node:crypto";
import { poseidon, FIELD_PRIME } from "./poseidon.js";

export const BPS = 10_000n;
export const U32 = 1n << 32n;

export interface Terms {
  unitPrice: bigint; maxM1: bigint; minM2: bigint; penaltyBps: bigint; capBps: bigint; nonce: bigint;
}

export function assertTermsInRange(t: Terms): void {
  for (const k of ["unitPrice", "maxM1", "minM2"] as const) {
    if (t[k] < 0n || t[k] >= U32) throw new Error(`terms.${k} out of range (< 2^32)`);
  }
  for (const k of ["penaltyBps", "capBps"] as const) {
    if (t[k] < 0n || t[k] > BPS) throw new Error(`terms.${k} out of range (<= 10000)`);
  }
  if (t.nonce < 0n || t.nonce >= FIELD_PRIME) throw new Error("terms.nonce must be a field element");
}

/** 253-bit nonce dari CSPRNG (byte teratas dimask ke 5 bit) — selalu < p. */
export function randomNonce(): bigint {
  const b = randomBytes(32);
  b[0] &= 0x1f;
  return BigInt("0x" + b.toString("hex"));
}

/** T = Poseidon(unitPrice, maxM1, minM2, penaltyBps, capBps, nonce)  (t = 7) */
export async function commitTerms(t: Terms): Promise<bigint> {
  assertTermsInRange(t);
  const h = await poseidon();
  return h([t.unitPrice, t.maxM1, t.minM2, t.penaltyBps, t.capBps, t.nonce]);
}
