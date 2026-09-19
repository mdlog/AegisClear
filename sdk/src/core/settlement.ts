import { BPS, type Terms, assertTermsInRange } from "./terms.js";
import { MAX_SEQ, type Receipt, assertReceiptInRange } from "./receipts.js";

export interface Settlement {
  cumulativeAmount: bigint; breaches: number; penRaw: bigint; cap: bigint; payToClient: bigint; payToProvider: bigint;
}

/** Port 1:1 dari tools/settlement_vectors.py::settle — sumber kebenaran §6.3. */
export function settle(receipts: Receipt[], t: Terms): Settlement {
  assertTermsInRange(t);
  if (receipts.length > MAX_SEQ) throw new Error("MAX_SEQ exceeded");
  let cumulativeAmount = 0n, penRaw = 0n, breaches = 0;
  receipts.forEach((r, i) => {
    if (r.seq !== i) throw new Error("seq harus 0..n-1 berurutan");
    assertReceiptInRange(r);
    if (r.due !== r.qty * t.unitPrice) throw new Error("C3: due == qty * unitPrice");
    cumulativeAmount += r.due;
    const breach = r.m1 > t.maxM1 || r.m2 < t.minM2;
    if (breach) { breaches += 1; penRaw += (r.due * t.penaltyBps) / BPS; }
  });
  const cap = (cumulativeAmount * t.capBps) / BPS;
  const payToClient = penRaw < cap ? penRaw : cap;
  return { cumulativeAmount, breaches, penRaw, cap, payToClient, payToProvider: cumulativeAmount - payToClient };
}
