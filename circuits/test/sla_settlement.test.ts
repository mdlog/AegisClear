import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wasm as wasmTester } from "circom_tester";
import { loadVector, buildCircuitInput, settle, FIELD_PRIME } from "@aegisclear/sdk";

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

// Regression untuk fix round 1 (finding #1): DivBps() dulu hanya membatasi r via
// LessThan(14) tanpa Num2Bits(14) pada r, sehingga r bisa "negatif" (elemen field
// dekat p) dan quotient q bisa digelembungkan +1 (payToClient naik). Tes ini
// menyusun ulang witness valid, menaikkan (q, r) di main.div[0] ke pasangan yang
// masih memenuhi `x === q*10000 + r` secara aritmetika field tapi tidak lagi
// merepresentasikan pembagian bilangan bulat yang sah, dan menuntut checkConstraints
// menolaknya (fix: Num2Bits(14) pada r, ditambahkan sebelum LessThan(14)).
test("DivBps r tergelembung (q+1, r-10000) → constraint gagal (C8 fix round 1)", async () => {
  const c = await getCircuit();
  const v = loadVector("EX1_7_latency_breaches");
  const input = await buildCircuitInput(CHANNEL, v.terms, v.receipts);
  const w = await c.calculateWitness(input, true);
  await c.checkConstraints(w); // baseline: witness valid lulus sebelum di-tamper

  await c.loadSymbols();
  await c.loadConstraints();
  const qIdx = c.symbols["main.div[0].q"].varIdx;
  const rIdx = c.symbols["main.div[0].r"].varIdx;
  const origQ: bigint = w[qIdx];
  const origR: bigint = w[rIdx];

  // due[0]*penaltyBps = 20000*5000 = 100_000_000 → q=10000, r=0 untuk EX1.
  // (q+1, r-10000 mod p) tetap memenuhi x === q*10000+r secara field:
  // (10000+1)*10000 + (p-10000) ≡ 100_000_000 + p ≡ 100_000_000 (mod p).
  const tampered = w.slice();
  tampered[qIdx] = origQ + 1n;
  tampered[rIdx] = ((origR - 10000n) % FIELD_PRIME + FIELD_PRIME) % FIELD_PRIME;

  await assert.rejects(c.checkConstraints(tampered), /Constraint doesn't match|Error/);
  await c.checkConstraints(w); // witness asli (belum di-tamper) tetap lulus
});
