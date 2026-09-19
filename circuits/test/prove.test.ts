import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAbiParameters } from "viem";
import { loadVector, settle, commitTerms } from "@aegisclear/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROVE = path.join(here, "..", "scripts", "prove.ts");
const CHANNEL = "0x00000000000000000000000000000000000001ff";

test("prove.ts EX1 → bukti valid, inputs sesuai vektor", () => {
  const out = execFileSync("npx", ["tsx", PROVE, "--vector", "EX1_7_latency_breaches", "--channel", CHANNEL], { encoding: "utf8" }).trim();
  const [proof, inputs] = decodeAbiParameters([{ type: "uint256[8]" }, { type: "uint256[6]" }], out as `0x${string}`);
  assert.equal(proof.length, 8);
  assert.equal(inputs[0], BigInt(CHANNEL));
  assert.equal(inputs[3], 100n);
  assert.equal(inputs[4], 2_000_000n);
  assert.equal(inputs[5], 70_000n);
});

test("prove.ts --terms-only", async () => {
  const out = execFileSync("npx", ["tsx", PROVE, "--vector", "EX1_7_latency_breaches", "--terms-only"], { encoding: "utf8" }).trim();
  const [T] = decodeAbiParameters([{ type: "uint256" }], out as `0x${string}`);
  assert.equal(T, await commitTerms(loadVector("EX1_7_latency_breaches").terms));
});
