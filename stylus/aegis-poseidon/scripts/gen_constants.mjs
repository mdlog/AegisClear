// Membangkitkan src/constants.rs dari konstanta circomlib Poseidon v1 TEROPTIMASI (poseidon_constants_opt.json, t = 3)
// + zeros pohon (fixture SDK). Jalankan dari root repo: node stylus/aegis-poseidon/scripts/gen_constants.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const require = createRequire(path.join(repo, "sdk", "package.json"));
// circomlibjs 0.1.7 hanya meng-export "." (exports map) → resolve paket lewat entry utamanya (build/main.cjs), lalu naik ke src/.
const circomlibjsRoot = path.resolve(path.dirname(require.resolve("circomlibjs")), "..");
const opt = JSON.parse(readFileSync(path.join(circomlibjsRoot, "src", "poseidon_constants_opt.json"), "utf8"));
const ref = JSON.parse(readFileSync(path.join(circomlibjsRoot, "src", "poseidon_constants.json"), "utf8"));
const fx = JSON.parse(readFileSync(path.join(repo, "contracts", "test", "fixtures", "anchored_ex1.json"), "utf8"));

// Indeks 1 = t = 3 (8 full + 57 partial round). Tata letak konstanta poseidon_opt.js (dipakai persis oleh src/poseidon.rs):
//   C: 3 (ARK awal) + 3·3 (3 full round, campur M) + 3 (full round ke-4, campur P) + 57 (satu konstanta per partial round)
//      + 3·3 (3 full round terakhir) = 81  (round terakhir tanpa ARK)
//   S: (2t − 1) · 57 = 285 — per partial round r: S[5r..5r+3] baris untuk state[0] baru, S[5r+3], S[5r+4] kolom untuk state[1..3]
//   M: MDS 3×3 (= transpose MDS referensi; JS mengindeks M[j][i]),  P: matriks pra-jarang 3×3
const N_ROUNDS_F = 8, N_ROUNDS_P = 57, T = 3;
const C = opt.C[1], S = opt.S[1], M = opt.M[1], P = opt.P[1];
const is3x3 = (m) => Array.isArray(m) && m.length === T && m.every((r) => Array.isArray(r) && r.length === T);
const expectC = T + (N_ROUNDS_F / 2 - 1) * T + T + N_ROUNDS_P + (N_ROUNDS_F / 2 - 1) * T; // 81
const expectS = (2 * T - 1) * N_ROUNDS_P;                                              // 285
if (C.length !== expectC || S.length !== expectS || !is3x3(M) || !is3x3(P)) {
  throw new Error(`bentuk konstanta tak terduga: C ${C.length} (harap ${expectC}), S ${S.length} (harap ${expectS}), M ${M.length}x${M[0]?.length}, P ${P.length}x${P[0]?.length}`);
}
const dec = (h) => BigInt(h).toString();
// Cek silang orientasi: M_opt harus = transpose MDS referensi (poseidon_constants.json M[1]) — mix JS Σ_j M_opt[j][i]·s[j] ≡ Σ_j M_ref[i][j]·s[j].
for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) {
  if (dec(M[i][j]) !== dec(ref.M[1][j][i])) throw new Error(`M_opt[${i}][${j}] ≠ M_ref[${j}][${i}] — orientasi MDS berubah`);
}
if (fx.zeros.length < 8 || dec(fx.zeros[0]) !== "0") throw new Error("fixture zeros tak terduga");
const fp = (h) => `MontFp!("${dec(h)}")`;
const out = `// DIBANGKITKAN oleh scripts/gen_constants.mjs — jangan sunting. Sumber: circomlibjs poseidon_constants_opt.json (t = 3,
// konstanta algoritma teroptimasi poseidon_opt.js: C sudah dilipat, S matriks jarang partial round, M MDS, P pra-jarang)
// dan zeros[0..6] dari contracts/test/fixtures/anchored_ex1.json (SDK). Poseidon v1 circomlib (D3) — keluaran identik
// dengan poseidon_reference.js.
use ark_bn254::Fr;
use ark_ff::MontFp;

pub const N_ROUNDS_F: usize = ${N_ROUNDS_F};
pub const N_ROUNDS_P: usize = ${N_ROUNDS_P};
pub const T: usize = ${T};
pub const DEPTH: usize = 7;

/// Konstanta round yang sudah dilipat (opt.C[1]): [0..3) ARK awal, lalu per full round 3, per partial round 1 (lihat poseidon.rs).
pub const C_OPT: [Fr; ${C.length}] = [
${C.map((c) => `    ${fp(c)},`).join("\n")}
];

/// Matriks jarang partial round (opt.S[1]), 5 elemen per round r: [5r..5r+3) baris state[0] baru, [5r+3], [5r+4] kolom state[1], state[2].
pub const S_OPT: [Fr; ${S.length}] = [
${S.map((s) => `    ${fp(s)},`).join("\n")}
];

/// MDS 3×3 (opt.M[1]) — transpose MDS referensi; dipakai sebagai keluaran[i] = Σ_j M_OPT[j][i]·state[j] persis seperti JS.
pub const M_OPT: [[Fr; 3]; 3] = [
${M.map((row) => `    [${row.map(fp).join(", ")}],`).join("\n")}
];

/// Matriks pra-jarang 3×3 (opt.P[1]) untuk full round ke-4 (sebelum partial round); indeks [j][i] seperti M_OPT.
pub const P_OPT: [[Fr; 3]; 3] = [
${P.map((row) => `    [${row.map(fp).join(", ")}],`).join("\n")}
];

/// zeros[i] = akar subtree kosong tinggi i (zeros[0] = 0, zeros[i+1] = H(zeros[i], zeros[i])).
pub const ZEROS: [Fr; 7] = [
${fx.zeros.slice(0, 7).map((z) => `    ${fp(z)},`).join("\n")}
];
`;
writeFileSync(path.join(here, "..", "src", "constants.rs"), out);
console.log(`ditulis src/constants.rs: C_OPT ${C.length}, S_OPT ${S.length}, M_OPT 3x3, P_OPT 3x3, ZEROS 7`);
