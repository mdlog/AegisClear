import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Terms } from "./terms.js";
import type { Receipt } from "./receipts.js";

const VECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "vectors");

export interface Vector {
  terms: Terms; receipts: Receipt[];
  expected: { seq: number; cumulativeAmount: bigint; breaches: number; penRaw: bigint; cap: bigint; payToClient: bigint; payToProvider: bigint };
}

export function loadVector(name: string): Vector {
  const j = JSON.parse(readFileSync(join(VECTORS_DIR, `${name}.json`), "utf8"));
  const b = (x: number | string) => BigInt(x);
  return {
    terms: { unitPrice: b(j.terms.unitPrice), maxM1: b(j.terms.maxM1), minM2: b(j.terms.minM2),
             penaltyBps: b(j.terms.penaltyBps), capBps: b(j.terms.capBps), nonce: b(j.terms.nonce) },
    receipts: j.receipts.map((r: any) => ({ seq: r.seq, qty: b(r.qty), m1: b(r.m1), m2: b(r.m2), due: b(r.due) })),
    expected: { seq: j.seq, cumulativeAmount: b(j.cumulativeAmount), breaches: j.breaches, penRaw: b(j.penRaw),
                cap: b(j.cap), payToClient: b(j.payToClient), payToProvider: b(j.payToProvider) },
  };
}
