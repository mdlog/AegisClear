import { poseidon } from "./poseidon.js";
import { U32 } from "./terms.js";

export const MAX_SEQ = 128;
export const DEPTH = 7;
export const EMPTY_LEAF = 0n;
export const U64 = 1n << 64n;

export interface Receipt { seq: number; qty: bigint; m1: bigint; m2: bigint; due: bigint }

export function makeReceipt(seq: number, qty: bigint, m1: bigint, m2: bigint, unitPrice: bigint): Receipt {
  return { seq, qty, m1, m2, due: qty * unitPrice };
}

export function assertReceiptInRange(r: Receipt): void {
  if (r.seq < 0 || r.seq >= MAX_SEQ) throw new Error("receipt.seq out of range");
  for (const k of ["qty", "m1", "m2"] as const) if (r[k] < 0n || r[k] >= U32) throw new Error(`receipt.${k} out of range (< 2^32)`);
  if (r.due < 0n || r.due >= U64) throw new Error("receipt.due out of range (< 2^64)");
}

/** leaf = Poseidon(seq, qty, m1, m2, due)  (t = 6) */
export async function leafHash(r: Receipt): Promise<bigint> {
  assertReceiptInRange(r);
  const h = await poseidon();
  return h([BigInt(r.seq), r.qty, r.m1, r.m2, r.due]);
}

/** Root pohon biner 128 slot; slot kosong = EMPTY_LEAF (0). Node = Poseidon(kiri, kanan). */
export async function merkleRoot(leaves: bigint[]): Promise<bigint> {
  if (leaves.length > MAX_SEQ) throw new Error("MAX_SEQ exceeded");
  const h = await poseidon();
  let layer = [...leaves];
  while (layer.length < MAX_SEQ) layer.push(EMPTY_LEAF);
  while (layer.length > 1) {
    const next: bigint[] = [];
    for (let i = 0; i < layer.length; i += 2) next.push(h([layer[i], layer[i + 1]]));
    layer = next;
  }
  return layer[0];
}

export class ReceiptTree {
  readonly leaves: bigint[] = [];
  readonly receipts: Receipt[] = [];
  get size(): number { return this.leaves.length; }
  async append(r: Receipt): Promise<void> {
    if (r.seq !== this.leaves.length) throw new Error(`expected seq ${this.leaves.length}, got ${r.seq}`);
    if (this.leaves.length >= MAX_SEQ) throw new Error("MAX_SEQ exceeded");
    this.leaves.push(await leafHash(r));
    this.receipts.push(r);
  }
  root(): Promise<bigint> { return merkleRoot(this.leaves); }
  /** Epoch baru (rollover): kosongkan daun & receipt; objek tetap sama agar referensi pemilik tidak putus. */
  reset(): void { this.leaves.length = 0; this.receipts.length = 0; }
}
