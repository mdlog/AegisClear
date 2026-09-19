import { type Terms, commitTerms } from "./terms.js";
import { type Receipt, MAX_SEQ, leafHash, merkleRoot } from "./receipts.js";
import { settle } from "./settlement.js";

export interface CircuitInput {
  channelIdField: string; termsCommitment: string; receiptsRoot: string; seq: string; cumulativeAmount: string; payToClient: string;
  unitPrice: string; maxM1: string; minM2: string; penaltyBps: string; capBps: string; nonce: string;
  qty: string[]; m1: string[]; m2: string[]; due: string[];
}

export async function buildCircuitInput(channel: `0x${string}`, terms: Terms, receipts: Receipt[]): Promise<CircuitInput> {
  const s = settle(receipts, terms);
  const T = await commitTerms(terms);
  const R = await merkleRoot(await Promise.all(receipts.map(leafHash)));
  const pad = (f: (r: Receipt) => bigint) => {
    const a = receipts.map(f); while (a.length < MAX_SEQ) a.push(0n); return a.map(String);
  };
  return {
    channelIdField: BigInt(channel).toString(), termsCommitment: T.toString(), receiptsRoot: R.toString(),
    seq: String(receipts.length), cumulativeAmount: s.cumulativeAmount.toString(), payToClient: s.payToClient.toString(),
    unitPrice: terms.unitPrice.toString(), maxM1: terms.maxM1.toString(), minM2: terms.minM2.toString(),
    penaltyBps: terms.penaltyBps.toString(), capBps: terms.capBps.toString(), nonce: terms.nonce.toString(),
    qty: pad(r => r.qty), m1: pad(r => r.m1), m2: pad(r => r.m2), due: pad(r => r.due),
  };
}

/** Urutan input publik tetap (Global Constraints). */
export function publicSignalsOf(i: CircuitInput): bigint[] {
  return [i.channelIdField, i.termsCommitment, i.receiptsRoot, i.seq, i.cumulativeAmount, i.payToClient].map(BigInt);
}
