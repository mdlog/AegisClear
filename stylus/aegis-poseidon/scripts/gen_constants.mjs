// Membangkitkan src/constants.rs dari konstanta circomlib Poseidon v1 (t = 3) + zeros pohon (fixture SDK).
// Jalankan dari root repo: node stylus/aegis-poseidon/scripts/gen_constants.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const require = createRequire(path.join(repo, "sdk", "package.json"));
// circomlibjs 0.1.7 hanya meng-export "." (exports map) → resolve paket lewat entry utamanya (build/main.cjs), lalu naik ke src/.
const circomlibjsRoot = path.resolve(path.dirname(require.resolve("circomlibjs")), "..");
const k = JSON.parse(readFileSync(path.join(circomlibjsRoot, "src", "poseidon_constants.json"), "utf8"));
const fx = JSON.parse(readFileSync(path.join(repo, "contracts", "test", "fixtures", "anchored_ex1.json"), "utf8"));
const C = k.C[1], M = k.M[1];                     // indeks 1 = t = 3 (8 full + 57 partial round → 195 konstanta)
if (C.length !== 195 || M.length !== 3 || M[0].length !== 3) throw new Error(`bentuk konstanta tak terduga: C ${C.length}, M ${M.length}x${M[0]?.length}`);
const dec = (h) => BigInt(h).toString();
const fp = (h) => `MontFp!("${dec(h)}")`;
const out = `// DIBANGKITKAN oleh scripts/gen_constants.mjs — jangan sunting. Sumber: circomlibjs poseidon_constants.json (t = 3)
// dan zeros[0..6] dari contracts/test/fixtures/anchored_ex1.json (SDK). Poseidon v1 circomlib (D3).
use ark_bn254::Fr;
use ark_ff::MontFp;

pub const N_ROUNDS_F: usize = 8;
pub const N_ROUNDS_P: usize = 57;
pub const T: usize = 3;
pub const DEPTH: usize = 7;

pub const C: [Fr; ${C.length}] = [
${C.map((c) => `    ${fp(c)},`).join("\n")}
];

pub const M: [[Fr; 3]; 3] = [
${M.map((row) => `    [${row.map(fp).join(", ")}],`).join("\n")}
];

/// zeros[i] = akar subtree kosong tinggi i (zeros[0] = 0, zeros[i+1] = H(zeros[i], zeros[i])).
pub const ZEROS: [Fr; 7] = [
${fx.zeros.slice(0, 7).map((z) => `    ${fp(z)},`).join("\n")}
];
`;
writeFileSync(path.join(here, "..", "src", "constants.rs"), out);
console.log(`ditulis src/constants.rs: C ${C.length}, M 3x3, ZEROS 7`);
