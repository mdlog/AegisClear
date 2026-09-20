# aegis-poseidon — `AegisPoseidon` (Stylus)

Program Stylus (Rust, `no_std`, `stylus-sdk` 0.10.9) yang mengimplementasikan **`IPoseidonPath`** untuk mode anchored
AegisClear (FR-25) di Robinhood Chain. Ini adalah **kembaran** `contracts/src/PoseidonPathYul.sol`: ABI, semantik,
dan keluarannya identik byte-per-byte, sehingga `AegisChannelFactory` dapat menunjuk salah satunya sebagai `POSEIDON`
(Stylus di Robinhood Chain; Yul di Anvil/Foundry/Rencana B).

- **Hash:** circomlib **Poseidon v1** (bukan Poseidon2), BN254 Fr, `t = 3` (8 full + 57 partial round, S-box x⁵) —
  port 1:1 dari `circomlibjs/src/poseidon_reference.js`; padanan `PoseidonT3` (poseidon-solidity) dan SDK `poseidon([a, b])`.
- **Aritmetika:** `ark-bn254` / `ark-ff` 0.5 (backend Montgomery generik; konstanta compile-time via `MontFp!`).
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

- `circomlibjs/src/poseidon_constants.json` → `C[1]` (195 konstanta round) dan `M[1]` (MDS 3×3) untuk `t = 3`;
- `contracts/test/fixtures/anchored_ex1.json` → `zeros[0..6]` (akar subtree kosong; `zeros[0] = 0`,
  `zeros[i+1] = H(zeros[i], zeros[i])`) — dipakai `insert_path` tanpa perhitungan ulang saat runtime.

```bash
# dari root repo (butuh sdk/node_modules terpasang: pnpm install)
node stylus/aegis-poseidon/scripts/gen_constants.mjs
```

## Uji, periksa, deploy

Semua build memakai `CARGO_TARGET_DIR=/tmp/aegis-stylus-target` (partisi home hampir penuh).

```bash
cd stylus/aegis-poseidon

# 1. Uji native (7 test): vektor circomlib hash2(1,2), rantai zeros fixture, 100 root insertPath vs SDK,
#    penolakan input ≥ p, plus pembungkus #[public] (batas index, error, format kawat (uint256,uint256[7])).
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo test

# 2. Validasi WASM terhadap chain (read-only, tanpa kunci): ukuran terkompresi + ArbWasm.activateProgram via eth_call.
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo stylus check --endpoint https://rpc.testnet.chain.robinhood.com

# 3. ABI Solidity
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo stylus export-abi

# 4. Deploy + aktivasi (Task 9; alamat hasil → POSEIDON_STYLUS untuk script DeployTestnet)
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo stylus deploy --endpoint $RPC_URL --private-key $PK_DEPLOYER
```

Oracle lintas-implementasi: `hash2(1, 2) = 7853200120776062878684798364095072458815029376092732009249414926327459813530`
(= `0x115cc0f5…189a`), rantai `zeros[1..7]` dan 100 root `anchored_ex1.json` — semuanya juga dilewati `PoseidonPathYul`.

## Ukuran WASM terukur (20 Sep 2026, cargo-stylus 0.10.9, rustc 1.92.0, `opt-level = "z"`, LTO)

| | Ukuran |
|---|---|
| WASM setelah diproses (uncompressed) | 39.110 byte (39,1 KB) |
| **Terkompresi (yang dikirim ke chain)** | **18.418 byte (18,4 KB)** — batas 24 KB |
| Data fee aktivasi (estimasi `check`) | 0,000079 ETH (0,000095 ETH dengan bump 20 %) |

`cargo stylus check` 0.10.9 tidak mencetak kalimat "contract is valid"; verdict-nya adalah exit 0 setelah baris
`wasm data fee: …`, yang hanya muncul bila `ArbWasm.activateProgram` (eth_call dengan bytecode disuntik via state
override) berhasil — yakni program **akan teraktivasi** di chain 46630.

> **Catatan:** tidak ada CacheManager di Robinhood Chain (20 Sep 2026; `cargo stylus cache bid` → "no cache managers
> found … Stylus cache is not yet enabled on this chain") — **setiap panggilan membayar init program** (uncached, ≈ 8,8k gas).
> Itulah sebabnya jalur anchored memakai satu panggilan `insertPath` (7 hash) alih-alih 7 panggilan `hash2`.
