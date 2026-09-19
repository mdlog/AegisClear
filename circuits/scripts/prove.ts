#!/usr/bin/env tsx
// prove.ts --vector <NAME> --channel <0x..> [--json] [--terms-only]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeAbiParameters } from "viem";
import { loadVector, buildCircuitInput, commitTerms, prove, toCalldata } from "@aegisclear/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(here, "..", "build", "sla_settlement_js", "sla_settlement.wasm");
const ZKEY = path.join(here, "..", "build", "sla_final.zkey");

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const has = (name: string) => process.argv.includes(name);

async function main() {
  const name = arg("--vector"); if (!name) throw new Error("--vector wajib");
  const v = loadVector(name);
  if (has("--terms-only")) {
    process.stdout.write(encodeAbiParameters([{ type: "uint256" }], [await commitTerms(v.terms)]));
    return;
  }
  const channel = arg("--channel") as `0x${string}`; if (!channel) throw new Error("--channel wajib");
  const input = await buildCircuitInput(channel, v.terms, v.receipts);
  const { proof, publicSignals, provingMs: ms } = await prove(input, WASM, ZKEY);
  const cd = await toCalldata(proof, publicSignals);
  if (has("--json")) {
    process.stdout.write(JSON.stringify({ proof: cd.proof.map(String), inputs: cd.inputs.map(String), provingMs: ms }));
  } else {
    process.stdout.write(encodeAbiParameters([{ type: "uint256[8]" }, { type: "uint256[6]" }], [cd.proof as any, cd.inputs as any]));
  }
  process.stderr.write(`proving ${name}: ${ms} ms\n`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
