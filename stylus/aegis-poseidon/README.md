# aegis-poseidon — `AegisPoseidon` (Stylus)

Program Stylus (Rust, `no_std`, `stylus-sdk` 0.10.9) yang mengimplementasikan **`IPoseidonPath`** untuk mode anchored
AegisClear (FR-25) di Robinhood Chain. Ini adalah **kembaran** `contracts/src/PoseidonPathYul.sol`: ABI, semantik,
dan keluarannya identik byte-per-byte, sehingga `AegisChannelFactory` dapat menunjuk salah satunya sebagai `POSEIDON`
(Stylus di Robinhood Chain; Yul di Anvil/Foundry/Rencana B).

- **Hash:** circomlib **Poseidon v1** (bukan Poseidon2), BN254 Fr, `t = 3` (8 full + 57 partial round, S-box x⁵) —
  port 1:1 dari `circomlibjs/src/poseidon_opt.js` (**algoritma teroptimasi** neptune/filecoin: konstanta round sudah
  dilipat, 57 partial round memakai matriks jarang `S` (5 perkalian) alih-alih MDS 3×3 penuh (9 perkalian), full round
  ke-4 memakai matriks pra-jarang `P`); **keluarannya identik** dengan `poseidon_reference.js` / `PoseidonT3`
  (poseidon-solidity) / SDK `poseidon([a, b])` — bukti kesetaraan: semua vektor di bawah lolos tanpa diubah.
- **Aritmetika:** `ark-bn254` / `ark-ff` 0.5 (backend Montgomery generik; konstanta compile-time via `MontFp!`).
  Dot product 3 suku (campur MDS/P dan baris `S`) memakai `Fr::sum_of_products` — satu reduksi Montgomery, bukan tiga.
  Perkalian, kuadrat, dot product, campur, dan full round adalah fungsi `#[inline(never)]` (satu salinan kode) supaya
  `opt-level = 3` tidak menggandakan tubuh `Fr::mul` (≈ 600 instruksi) ke puluhan titik panggil — tanpa itu program
  27,1 KB terkompresi (2 fragmen), melewati batas 24 KB, karena konstanta teroptimasi (384 elemen = 12,3 KB) tidak
  bisa dikompresi.
- **ABI** (`cargo stylus export-abi`, selector sama dengan `PoseidonPathYul`: `0x511c53ff`, `0x70839bfa`):
  ```solidity
  function hash2(uint256 a, uint256 b) external view returns (uint256);
  function insertPath(uint256 leaf, uint256 index, uint256[7] calldata filled) external view returns (uint256, uint256[7] memory);
  ```
  `insertPath`: `cur = leaf`; untuk level `i = 0..6`, bit `i` dari `index` = 0 → `(cur, zeros[i])`, `nodes[i] = cur`;
  bit 1 → `(filled[i], cur)`, `nodes[i] = filled[i]`; `cur = H(kiri, kanan)`. Mengembalikan `(root, nodes)` — 7 hash dalam
  satu panggilan. Revert bila ada input ≥ p (`"NotField"`) atau `index ≥ 128` (`"BadIndex"`); `AegisChannel.ack`
  memanggilnya tanpa try/catch sehingga revert diteruskan apa adanya.

## Konstanta (dibangkitkan, di-commit)

`src/constants.rs` **jangan disunting** — dibangkitkan oleh `scripts/gen_constants.mjs` dari:

- `circomlibjs/src/poseidon_constants_opt.json` (indeks 1 = `t = 3`; panjangnya di-assert oleh skrip):
  `C_OPT = C[1]` (81 konstanta round yang sudah dilipat: 3 ARK awal + 3·3 + 3 + 57 + 3·3), `S_OPT = S[1]`
  (285 = 5 × 57 elemen matriks jarang: per partial round `r`, `[5r..5r+3)` baris untuk `state[0]` baru, `[5r+3]`,
  `[5r+4]` kolom untuk `state[1]`, `state[2]`), `M_OPT = M[1]` (MDS 3×3 — skrip meng-assert ia transpose MDS
  `poseidon_constants.json`; JS dan Rust mengindeksnya `[j][i]`), `P_OPT = P[1]` (matriks pra-jarang 3×3);
- `contracts/test/fixtures/anchored_ex1.json` → `zeros[0..6]` (akar subtree kosong; `zeros[0] = 0`,
  `zeros[i+1] = H(zeros[i], zeros[i])`) — dipakai `insert_path` tanpa perhitungan ulang saat runtime.

`tests/pairwise.json` (di-commit) dibangkitkan oleh `scripts/pairwise_vectors.mjs`: `hash2(leaves[i], leaves[i+1])`
untuk 20 daun pertama fixture (19 pasangan), dihitung dengan circomlibjs `poseidon_reference.js` (skrip meng-assert
`poseidon_opt.js` dan `poseidon_wasm.js` sepakat) — oracle hash mentah yang independen dari pohon Merkle fixture.

```bash
# dari root repo (butuh sdk/node_modules terpasang: pnpm install)
node stylus/aegis-poseidon/scripts/gen_constants.mjs
node stylus/aegis-poseidon/scripts/pairwise_vectors.mjs
```

## Uji, periksa, deploy

Semua build memakai `CARGO_TARGET_DIR=/tmp/aegis-stylus-target` (partisi home hampir penuh).

```bash
cd stylus/aegis-poseidon

# 1. Uji native (9 test): vektor circomlib hash2(1,2), rantai zeros fixture, 100 root insertPath vs SDK,
#    19 pasangan daun vs circomlibjs (tests/pairwise.json), penolakan input ≥ p, dot3 (sum_of_products) vs tiga
#    perkalian biasa pada 20.000 triple acak + representasi ekstrem, plus pembungkus #[public] (batas index, error,
#    format kawat (uint256,uint256[7])). Profil debug juga mengaktifkan debug_assert ark-ff di dalam sum_of_products.
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo test
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo test --release   # codegen opt-level 3, tanpa debug_assert

# 2. Validasi WASM terhadap chain (read-only, tanpa kunci): ukuran terkompresi + ArbWasm.activateProgram via eth_call.
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo stylus check --endpoint https://rpc.testnet.chain.robinhood.com

# 3. ABI Solidity
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo stylus export-abi

# 4. Deploy + aktivasi (Task 9; alamat hasil → POSEIDON_STYLUS untuk script DeployTestnet)
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo stylus deploy --endpoint $RPC_URL --private-key $PK_DEPLOYER
```

Oracle lintas-implementasi: `hash2(1, 2) = 7853200120776062878684798364095072458815029376092732009249414926327459813530`
(= `0x115cc0f5…189a`), rantai `zeros[1..7]`, 100 root `anchored_ex1.json`, dan 19 pasangan `tests/pairwise.json` —
semuanya juga dilewati `PoseidonPathYul` (kecuali pairwise, yang khusus Stylus) dan tidak berubah saat algoritma
diganti dari referensi ke teroptimasi.

## Ukuran WASM terukur (20 Sep 2026, cargo-stylus 0.10.9, rustc 1.92.0, LTO)

| Build | Uncompressed | **Terkompresi (dikirim ke chain, batas 24 KB = 24.576 byte)** | Data fee aktivasi (`check`) |
|---|---|---|---|
| referensi, `opt-level = "z"` (commit `2e4f1ab`) | 39.110 byte | 18.418 byte (18,4 KB) | 0,000079 ETH (+20 % → 0,000095) |
| referensi, `opt-level = 3` (commit `edddf15`) | — | ≈ 20,1 KB | — |
| teroptimasi, `opt-level = 3`, `Fr::mul` inline | 74.223 byte | 27.108 byte (27,1 KB, **2 fragmen** — melewati batas) | — |
| **teroptimasi, `opt-level = 3`, aritmetika `#[inline(never)]` (build ini)** | 49.666 byte | **21.662 byte (21,7 KB)** — sisa ≈ 2,9 KB | 0,000076 ETH (+20 % → 0,000091) |

Dari 21,7 KB itu, ≈ 12,3 KB adalah 384 konstanta field (`C_OPT` 81 + `S_OPT` 285 + `M_OPT` 9 + `P_OPT` 9; data acak,
tak terkompresi) — versi referensi hanya 204 konstanta (6,5 KB). Menggandakan kode tidak banyak menambah ukuran
terkompresi (kode berulang terkompresi baik), maka pengurangan kode yang menentukan adalah satu salinan `Fr::mul`.

## Gas terukur di Robinhood testnet (chain 46630, 20 Sep 2026; Stylus tanpa CacheManager → setiap panggilan bayar init program)

| Implementasi | `insertPath` (7 hash) | `hash2` (1 hash) |
|---|---|---|
| `PoseidonPathYul` (Solidity/Yul, library eksternal `PoseidonT3`) | 252.271 | 62.138 |
| `AegisPoseidon` referensi, `opt-level = "z"` | 231.217 | — |
| `AegisPoseidon` referensi, `opt-level = 3` | 175.905 (1,43× vs Yul; ≈ 1,50× eksekusi saja) | 83.172 |
| `AegisPoseidon` teroptimasi (build ini) | (diukur controller) | (diukur controller) |

Pada `hash2` tunggal, overhead init program Stylus (≈ 8,8k gas uncached) mendominasi sehingga Yul lebih murah; jalur
anchored memakai `insertPath` (7 hash per panggilan) justru karena itu.

Perkiraan offline (bukan gas): instruksi wasm yang dieksekusi, dihitung dengan `wasmi --fuel` pada harness tanpa host
(sumber crate yang sama, build `opt-level = 3`) — referensi 1.468.503 fuel/hash, teroptimasi 887.781 fuel/hash
(**−39,5 %**; `insert_path` 10.268.426 → 6.203.464). Rinciannya: matriks jarang −30,8 %, `sum_of_products` −13,3 %
lagi, `#[inline(never)]` +0,7 %. Gas Stylus menimbang opcode berbeda-beda, jadi angka on-chain akan berbeda; yang
berlaku adalah baris "diukur controller".

`cargo stylus check` 0.10.9 tidak mencetak kalimat "contract is valid"; verdict-nya adalah exit 0 setelah baris
`wasm data fee: …`, yang hanya muncul bila `ArbWasm.activateProgram` (eth_call dengan bytecode disuntik via state
override) berhasil — yakni program **akan teraktivasi** di chain 46630.

> **Catatan:** tidak ada CacheManager di Robinhood Chain (20 Sep 2026; `cargo stylus cache bid` → "no cache managers
> found … Stylus cache is not yet enabled on this chain") — **setiap panggilan membayar init program** (uncached, ≈ 8,8k gas).
> Itulah sebabnya jalur anchored memakai satu panggilan `insertPath` (7 hash) alih-alih 7 panggilan `hash2`.
