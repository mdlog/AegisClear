#!/usr/bin/env tsx
// prove.ts --vector <NAME> --channel <0x..> [--json] [--terms-only]
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { encodeAbiParameters } from "viem";
import { loadVector, buildCircuitInput, commitTerms } from "@aegisclear/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(here, "..", "build", "sla_settlement_js", "sla_settlement.wasm");
const ZKEY = path.join(here, "..", "build", "sla_final.zkey");

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const has = (name: string) => process.argv.includes(name);

/** "[a0,a1],[[b00,b01],[b10,b11]],[c0,c1],[i0..i5]" → 14 bigint (urutan pB sudah di-swap oleh snarkjs) */
export async function toCalldata(proof: any, publicSignals: string[]): Promise<{ proof: bigint[]; inputs: bigint[] }> {
  const s: string = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const nums = s.replace(/[\[\]\s"]/g, "").split(",").map((x) => BigInt(x));
  if (nums.length !== 14) throw new Error(`calldata: expected 14 words, got ${nums.length}`);
  return { proof: nums.slice(0, 8), inputs: nums.slice(8, 14) };
}

async function main() {
  const name = arg("--vector"); if (!name) throw new Error("--vector wajib");
  const v = loadVector(name);
  if (has("--terms-only")) {
    process.stdout.write(encodeAbiParameters([{ type: "uint256" }], [await commitTerms(v.terms)]));
    return;
  }
  const channel = arg("--channel") as `0x${string}`; if (!channel) throw new Error("--channel wajib");
  const input = await buildCircuitInput(channel, v.terms, v.receipts);
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  const ms = Date.now() - t0;
  const cd = await toCalldata(proof, publicSignals);
  if (has("--json")) {
    process.stdout.write(JSON.stringify({ proof: cd.proof.map(String), inputs: cd.inputs.map(String), provingMs: ms }));
  } else {
    process.stdout.write(encodeAbiParameters([{ type: "uint256[8]" }, { type: "uint256[6]" }], [cd.proof as any, cd.inputs as any]));
  }
  process.stderr.write(`proving ${name}: ${ms} ms\n`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
