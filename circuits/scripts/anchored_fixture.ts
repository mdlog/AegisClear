#!/usr/bin/env tsx
// Fixture mode anchored (FR-25): daun Poseidon, jumlah kumulatif dan root pohon inkremental untuk EX1, plus zeros[0..7].
// Dipakai contracts/test/Anchored.t.sol, contracts/test/PoseidonPathYul.t.sol dan stylus/aegis-poseidon (cargo test).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadVector, leafHash, merkleRoot, commitTerms, settle, poseidon } from "@aegisclear/sdk";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "contracts", "test", "fixtures", "anchored_ex1.json");
const v = loadVector("EX1_7_latency_breaches");
const h = await poseidon();
const zeros: bigint[] = [0n];
for (let i = 0; i < 7; i++) zeros.push(h([zeros[i], zeros[i]]));
const leaves = await Promise.all(v.receipts.map(leafHash));
const roots: bigint[] = []; const cumulative: bigint[] = [];
for (let i = 1; i <= leaves.length; i++) {
  roots.push(await merkleRoot(leaves.slice(0, i)));
  cumulative.push(settle(v.receipts.slice(0, i), v.terms).cumulativeAmount);
}
const fixture = {
  zeros: zeros.map(String), termsCommitment: (await commitTerms(v.terms)).toString(), emptyRoot: (await merkleRoot([])).toString(),
  leaves: leaves.map(String), cumulative: cumulative.map(String), roots: roots.map(String),
};
writeFileSync(out, JSON.stringify(fixture, null, 1) + "\n");
console.log(`ditulis ${out}: ${leaves.length} daun, zeros[7] = ${zeros[7]}`);
