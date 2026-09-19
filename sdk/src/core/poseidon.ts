import { buildPoseidon } from "circomlibjs";

export type PoseidonFn = (inputs: bigint[]) => bigint;
export const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let cached: Promise<PoseidonFn> | undefined;
/** Satu instance circomlibjs untuk seluruh proses; hasil = bigint field element. */
export function poseidon(): Promise<PoseidonFn> {
  if (!cached) {
    cached = buildPoseidon().then((p: any) => (inputs: bigint[]): bigint => {
      if (inputs.length < 1 || inputs.length > 16) throw new Error("poseidon: 1..16 inputs");
      return p.F.toObject(p(inputs)) as bigint;
    });
  }
  return cached as Promise<PoseidonFn>;
}
