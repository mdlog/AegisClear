// Membangkitkan tests/pairwise.json: hash2(leaves[i], leaves[i+1]) untuk 20 daun pertama fixture SDK, dihitung dengan
// circomlibjs — oracle yang independen dari pohon Merkle fixture (vektor hash mentah, bukan root).
// Ketiga implementasi circomlibjs (reference, opt, wasm) harus sepakat; yang ditulis adalah hasil poseidon_reference.js
// (algoritma yang BERBEDA dari poseidon_opt.js yang diporting ke src/poseidon.rs).
// Jalankan dari root repo: node stylus/aegis-poseidon/scripts/pairwise_vectors.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const require = createRequire(path.join(repo, "sdk", "package.json"));
const { buildPoseidon, buildPoseidonReference, buildPoseidonOpt } = await import(require.resolve("circomlibjs"));
const fx = JSON.parse(readFileSync(path.join(repo, "contracts", "test", "fixtures", "anchored_ex1.json"), "utf8"));

const N_LEAVES = 20;
const leaves = fx.leaves.slice(0, N_LEAVES).map((s) => BigInt(s));
if (leaves.length !== N_LEAVES) throw new Error(`fixture hanya punya ${leaves.length} daun`);

const [ref, opt, wasm] = await Promise.all([buildPoseidonReference(), buildPoseidonOpt(), buildPoseidon()]);
const toBig = (p, x) => p.F.toObject(x);
const vectors = [];
for (let i = 0; i + 1 < N_LEAVES; i++) {
  const a = leaves[i], b = leaves[i + 1];
  const hRef = toBig(ref, ref([a, b]));
  const hOpt = toBig(opt, opt([a, b]));
  const hWasm = toBig(wasm, wasm([a, b]));
  if (hRef !== hOpt || hRef !== hWasm) throw new Error(`circomlibjs tidak sepakat pada pasangan ${i}: ref ${hRef} opt ${hOpt} wasm ${hWasm}`);
  vectors.push({ a: a.toString(), b: b.toString(), h: hRef.toString() });
}
// Vektor jangkar lintas-implementasi (spec): hash2(1, 2).
const h12 = toBig(ref, ref([1n, 2n]));
if (h12 !== 7853200120776062878684798364095072458815029376092732009249414926327459813530n) throw new Error(`hash2(1,2) tak terduga: ${h12}`);

const out = {
  source: "circomlibjs 0.1.7 poseidon_reference.js (== poseidon_opt.js == poseidon_wasm.js), inputs = anchored_ex1.json leaves[0..20)",
  vectors,
};
writeFileSync(path.join(here, "..", "tests", "pairwise.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`ditulis tests/pairwise.json: ${vectors.length} pasangan (leaves[i], leaves[i+1]) dari ${N_LEAVES} daun`);
