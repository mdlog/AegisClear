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

const PROBE = path.join(here, "circuits", "divbps_probe.circom");
let probe: any;
async function getProbe() { if (!probe) probe = await wasmTester(PROBE, { include: [path.join(here, "..", "node_modules")] }); return probe; }

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

// Regression untuk fix round 1/2 (finding #1): DivBps dulu hanya membatasi r via
// LessThan(14) tanpa Num2Bits(14) pada r, sehingga r bisa "negatif" (elemen field
// dekat p) dan quotient q bisa digelembungkan +1 (payToClient naik).
//
// Fix round 1's test tampered (q, r) langsung di witness array sla_settlement penuh
// setelah calculateWitness — review menemukan tes itu TIDAK diskriminatif: mengubah
// q/r di situ tanpa memperbarui bit-bit dekomposisi terkait (qb.out[], rlt.n2b.out[])
// membuat constraint LAIN (bukan rb) yang gagal duluan, sehingga tes tetap "pass"
// (menolak witness) walau baris rb dihapus. Fix round 2: DivBps dipecah menjadi
// DivBpsConstraints({x,q,r} sebagai input sirkuit) di lib/divbps.circom, diuji lewat
// sirkuit probe test/circuits/divbps_probe.circom. Karena x,q,r adalah INPUT (bukan
// witness turunan), calculateWitness menghitung ULANG semua bit turunan (rb.out[],
// qb.out[], rlt.n2b.out[]) secara konsisten untuk nilai yang diserang — tidak ada
// bit basi yang mencemari constraint lain. Ini yang membuat tes benar-benar
// menguji khusus baris `rb = Num2Bits(14)` (lihat task-4-report.md § Fix round 2
// untuk bukti diskriminasi: tes GAGAL ketika rb sengaja dihapus, PASS setelah
// dikembalikan).
test("DivBps: pembagian jujur diterima", async () => {
  const c = await getProbe();
  const w = await c.calculateWitness({ x: "13616", q: "1", r: "3616" }, true);
  await c.checkConstraints(w);
});

test("DivBps: sisa negatif (q+1, r−10000 mod p) DITOLAK — hanya karena Num2Bits(14) pada r", async () => {
  const c = await getProbe();
  // Tanpa rb, LessThan(14) menerima r = p − 6384 (r + 6384 = p ≡ 0 < 2^14) — celah soundness yang ditemukan review.
  await assert.rejects(c.calculateWitness({ x: "13616", q: "2", r: (FIELD_PRIME - 6384n).toString() }, true), /Assert Failed|Error/);
});

// Catatan (fix round 2): tes ketiga yang disarankan controller (q di luar 64-bit,
// x=0, r = p − ((2^64·10000) mod p)) DIHAPUS setelah diverifikasi empiris — r hasil
// konstruksi itu adalah bilangan ~254-bit (p − 1.8e23), jauh di luar [0,2^14), jadi
// ia menggelontor rb/rlt (celah r yang SAMA dengan tes di atas), bukan qb (batas
// 64-bit pada q) yang ingin diuji secara terisolasi. Diverifikasi: calculateWitness
// menolak dengan "Assert Failed" tapi tidak bisa dipastikan constraint qb yang
// gagal duluan — redundan dengan tes "sisa negatif" di atas. Dijatuhkan sesuai
// izin eksplisit controller ("the first two are the required ones").
