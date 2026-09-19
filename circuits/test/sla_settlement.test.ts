import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wasm as wasmTester } from "circom_tester";
import { loadVector, buildCircuitInput, settle } from "@aegisclear/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const CIRCUIT = path.join(here, "..", "sla_settlement.circom");
const CHANNEL = "0x00000000000000000000000000000000000001ff" as const;

let circuit: any;
async function getCircuit() {
  if (!circuit) circuit = await wasmTester(CIRCUIT, { include: [path.join(here, "..", "node_modules")] });
  return circuit;
}

for (const name of ["EX1_7_latency_breaches", "EX2_cap_binds_80_breaches", "EX3_qty5_2_quality_breaches", "EDGE_seq0", "EDGE_seq128_all_breach", "EDGE_cap0"]) {
  test(`witness valid untuk ${name}`, async () => {
    const c = await getCircuit();
    const v = loadVector(name);
    const input = await buildCircuitInput(CHANNEL, v.terms, v.receipts);
    const w = await c.calculateWitness(input, true);
    await c.checkConstraints(w);
    assert.equal(input.payToClient, v.expected.payToClient.toString());
  });
}

test("payToClient salah → constraint gagal", async () => {
  const c = await getCircuit();
  const v = loadVector("EX1_7_latency_breaches");
  const input = await buildCircuitInput(CHANNEL, v.terms, v.receipts);
  input.payToClient = (BigInt(input.payToClient) + 1n).toString();
  await assert.rejects(c.calculateWitness(input, true), /Assert Failed|Error/);
});

test("due != qty*unitPrice → constraint gagal (C3)", async () => {
  const c = await getCircuit();
  const v = loadVector("EX1_7_latency_breaches");
  const input = await buildCircuitInput(CHANNEL, v.terms, v.receipts);
  input.due[0] = (BigInt(input.due[0]) + 1n).toString();
  await assert.rejects(c.calculateWitness(input, true), /Assert Failed|Error/);
});

test("slot kosong berisi data → gagal (kanonik)", async () => {
  const c = await getCircuit();
  const v = loadVector("EX3_qty5_2_quality_breaches");   // seq = 20
  const input = await buildCircuitInput(CHANNEL, v.terms, v.receipts);
  input.m1[50] = "1";
  await assert.rejects(c.calculateWitness(input, true), /Assert Failed|Error/);
});

test("nonce salah → termsCommitment tidak cocok (C1)", async () => {
  const c = await getCircuit();
  const v = loadVector("EX1_7_latency_breaches");
  const input = await buildCircuitInput(CHANNEL, v.terms, v.receipts);
  input.nonce = "1";
  await assert.rejects(c.calculateWitness(input, true), /Assert Failed|Error/);
});
