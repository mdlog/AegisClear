import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadVector, buildCircuitInput } from "../src/core/index.js";
import { prove, toCalldata, verifyOffchain, defaultArtifacts } from "../src/core/prover.js";

const art = defaultArtifacts(new URL("../..", import.meta.url).pathname);

describe("prover", () => {
  it("EX1 → 14 kata calldata, verifikasi off-chain true, payToClient 70000", async () => {
    const v = loadVector("EX1_7_latency_breaches");
    const input = await buildCircuitInput("0x00000000000000000000000000000000000001ff", v.terms, v.receipts);
    const { proof, publicSignals, provingMs } = await prove(input, art.wasm, art.zkey);
    expect(provingMs).toBeGreaterThan(0);
    const vkey = JSON.parse(readFileSync(art.vkey, "utf8"));
    expect(await verifyOffchain(vkey, publicSignals, proof)).toBe(true);
    const cd = await toCalldata(proof, publicSignals);
    expect(cd.proof.length).toBe(8); expect(cd.inputs.length).toBe(6);
    expect(cd.inputs[5]).toBe(70_000n);
  });
});
