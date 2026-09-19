import path from "node:path";
import * as snarkjs from "snarkjs";
import type { CircuitInput } from "./circuitInput.js";

export interface ProofBundle { proof: any; publicSignals: string[]; provingMs: number }
export interface ProofCalldata { proof: bigint[]; inputs: bigint[] }
export interface Artifacts { wasm: string; zkey: string; vkey: string }

export function defaultArtifacts(repoRoot: string): Artifacts {
  const b = path.join(repoRoot, "circuits", "build");
  return { wasm: path.join(b, "sla_settlement_js", "sla_settlement.wasm"), zkey: path.join(b, "sla_final.zkey"), vkey: path.join(b, "verification_key.json") };
}

export async function prove(input: CircuitInput, wasm: string, zkey: string): Promise<ProofBundle> {
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  return { proof, publicSignals, provingMs: Date.now() - t0 };
}

/** exportSolidityCallData → 8 kata bukti (pB sudah di-swap) + 6 input publik. */
export async function toCalldata(proof: any, publicSignals: string[]): Promise<ProofCalldata> {
  const s: string = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const nums = s.replace(/[\[\]\s"]/g, "").split(",").map((x) => BigInt(x));
  if (nums.length !== 14) throw new Error(`calldata: expected 14 words, got ${nums.length}`);
  return { proof: nums.slice(0, 8), inputs: nums.slice(8, 14) };
}

export function verifyOffchain(vkey: object, publicSignals: string[], proof: any): Promise<boolean> {
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}
