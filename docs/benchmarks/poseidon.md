# Benchmark Poseidon — gerbang D2 (tanggal: 2026-09-19)

**Status: D2 TERBUKA.** Yul terukur penuh (Foundry). Kontrak Stylus dibangun dan lolos `cargo stylus check` terhadap RPC testnet 46630 (aktivasi OK, ukuran WASM tercatat). Angka gas **on-chain** untuk Stylus (dan pembanding on-chain untuk Yul) belum ada — perlu `$PK_DEPLOYER` berdana, yang tidak tersedia di lingkungan pengerjaan task ini. Perintah persis untuk melengkapi ada di §"Langkah tersisa untuk user" di bawah; setelah dijalankan, isi ulang sel tabel yang masih bertuliskan "menunggu deploy oleh user" dan tutup D2.

**Catatan jujur (dari brief):** kontrak Stylus di sini memakai `openzeppelin-crypto::Poseidon2` (Poseidon**2**), sedangkan `poseidon-solidity` Yul memakai Poseidon **v1** (varian yang kompatibel circomlib, dipakai di seluruh sirkuit AegisClear). Keduanya bukan fungsi yang identik — benchmark ini membandingkan **kelas biaya hashing on-chain** (EVM/Yul vs WASM/Stylus untuk operasi "satu permutasi Poseidon berukuran sebanding"), bukan interoperabilitas hash. Jika D2 lolos, port Poseidon v1 ke Rust (`AegisPoseidon.rs`, konstanta circomlib) adalah pekerjaan Plan 2 tersendiri — lihat §8.3 `prd-arsitektur.md`.

| Implementasi | Fungsi | Gas (Foundry) | Gas (testnet 46630, cast estimate − intrinsik) | Catatan |
|---|---|---|---|---|
| Yul `poseidon-solidity` T3 | hash([1,2]) | **32.503** | menunggu deploy oleh user (perintah di bawah) | == circomlibjs (D3 ✅) |
| Yul T6 | hash(5 input) | **172.418** | – (tidak diukur on-chain; leaf-only) | leaf |
| Yul 7× T3 | anchored ack | **212.715** | – (tidak diukur on-chain; jalur ack dibangun dari 7× panggilan T3 di atas) | |
| Stylus OZ Poseidon2 | hash([1,2]) | – | menunggu deploy oleh user (cache: menunggu) | Poseidon2 ≠ v1 |
| Stylus OZ Poseidon2 | hashChain7 | – | menunggu deploy oleh user | |

Rasio Yul/Stylus (hash tunggal): **menunggu angka on-chain Stylus** ; (rantai 7): **menunggu angka on-chain Stylus**.

**Keputusan D2:** ≥ 1,5× → Plan 2 memasukkan `AegisPoseidon.rs` (port Poseidon v1, konstanta circomlib) + anchored mode di Stylus; < 1,5× → anchored mode memakai Yul, Stylus dihapus dari scope. **Status saat ini: TERBUKA** — belum ada angka on-chain untuk menghitung rasio; keputusan tidak bisa diambil dari angka Foundry saja (Foundry mengukur EVM gas Yul, bukan biaya WASM Stylus, yang hanya bisa diukur `cast estimate` terhadap kontrak yang benar-benar di-deploy).

Ukuran WASM terkompresi: **14,4 KB (14.394 byte)** (batas kode Robinhood Chain 96 KB — jauh di bawah batas, ≈ 15% dari limit). Ukuran WASM mentah (tidak terkompresi): 44,8 KB (44.807 byte). `cargo stylus check` lolos pemeriksaan aktivasi: estimasi *wasm data fee* 0,000094 ETH (dasar 0,000079 ETH + bump 20%), exit code 0, tanpa error.

---

## 1. Hasil Step 1 — Yul (`poseidon-solidity`) + kompatibilitas circomlib (D3)

`forge install chancehudson/poseidon-solidity` (forge 1.5.1 tidak punya flag `--no-commit` — lihat catatan toolchain di bawah; hasilnya submodule biasa di `contracts/lib/poseidon-solidity`, tag `v0.0.5` @ `8205c97`). Remapping ditambahkan ke `contracts/remappings.txt`:
```
poseidon-solidity/=lib/poseidon-solidity/contracts/
```

`contracts/test/PoseidonBench.t.sol` ditulis persis sesuai brief. Sebelum menjalankan test, konstanta `POSEIDON_1_2` di brief diverifikasi independen memakai SDK proyek ini (`circomlibjs` via `sdk/src/core/poseidon.ts`, BUKAN dihitung ulang manual):

```
node --import tsx -e '
import { poseidon } from "./sdk/src/core/poseidon.ts";
const p = await poseidon();
console.log(p([1n, 2n]).toString());
'
# => 7853200120776062878684798364095072458815029376092732009249414926327459813530
```

Hasil **cocok persis** dengan konstanta di brief — tidak ada perubahan yang diperlukan pada `POSEIDON_1_2`.

`forge test --match-contract PoseidonBenchTest -vv`:

```
Ran 3 tests for test/PoseidonBench.t.sol:PoseidonBenchTest
[PASS] test_T3_matches_circomlib_and_gas() (gas: 34799)
Logs:
  PoseidonT3.hash gas: 32503

[PASS] test_T6_gas() (gas: 174603)
Logs:
  PoseidonT6.hash gas: 172418

[PASS] test_chain7_gas() (gas: 215160)
Logs:
  7x PoseidonT3 (anchored ack path) gas: 212715

Suite result: ok. 3 passed; 0 failed; 0 skipped; finished in 2.28ms
```

**`test_T3_matches_circomlib_and_gas` PASS → D3 compatibility check lolos**: hash Yul `PoseidonT3.hash([1,2])` == `POSEIDON_1_2` == circomlibjs, dengan dua sumber independen yang setuju (SDK proyek ini dan `assertEq` di Solidity).

**Kenapa T3/T6 lebih tinggi dari ekspektasi kasar brief (≈19–22k untuk T3) dan dari angka README `poseidon-solidity` (T3: 21.124 gas; T6: 74.039 gas):** `PoseidonT3.hash`/`PoseidonT6.hash` dideklarasikan `public` di dalam sebuah Solidity `library` (bukan `internal`) — forge me-link library ini sebagai kontrak terpisah dan setiap panggilan dikompilasi menjadi **DELEGATECALL** lintas-kontrak, bukan inline JUMP. Trace `-vvvv` mengonfirmasi ini:
```
[34799] PoseidonBenchTest::test_T3_matches_circomlib_and_gas()
  ├─ [29336] PoseidonT3::hash([1, 2]) [delegatecall]
  │   └─ ← [Return] 7853...530
  ├─ emit log_named_uint(...)
  └─ ← [Stop]
```
Frame delegatecall T3 sendiri berharga 29.336 gas (T6: 168.952 gas); sisanya (≈3,1–3,5k) adalah overhead di frame pemanggil (cold-account-access EIP-2929, ABI-encode argumen, memory expansion) yang konsisten di kedua fungsi. Angka README kemungkinan diukur dengan harness/versi lib berbeda (pemanggilan langsung tanpa Solidity glue, atau commit lama). **Untuk keputusan D2, angka yang relevan adalah angka Foundry di atas** — itulah biaya nyata jika kontrak AegisClear (mis. anchored-mode di Plan 2) memanggil library ini persis seperti `PoseidonBench.t.sol` memanggilnya (`import ... ; LibraryName.hash(...)`), bukan angka marketing README.

**Angka-angka ini adalah gas EVM yang diukur langsung oleh Foundry (`gasleft()` sebelum/sesudah panggilan)** — semantiknya identik untuk opcode EVM apa pun di Arbitrum/Robinhood Chain (Orbit L2 menjalankan EVM standar untuk kontrak Solidity/Yul; tidak ada penyesuaian opcode gas untuk kode EVM biasa). Angka ini **bukan** estimasi; ini eksekusi nyata di EVM Foundry (anvil-compatible), jadi berlaku sebagai dasar pembanding "apples-to-apples" untuk sisi Yul.

## 2. Hasil Step 2 — Kontrak Stylus (OZ Poseidon2)

### Penyesuaian disk sebelum build (wajib, lihat juga catatan controller)

`/home` (partisi tempat repo ini berada) hanya punya **~1,3 GB free** (`df -h /home` saat pengerjaan: `/dev/nvme0n1p4 189G 178G 1.3G 100% /home`), sementara root partition (`/`, termasuk `/tmp`) punya 386 GB free. Sebelum build apa pun:

```bash
export CARGO_TARGET_DIR=/tmp/aegis-stylus-target
```

**Tambahan yang saya lakukan di luar instruksi awal:** `~/.cargo/registry` sudah terisi 1,1 GB (dari kerja sebelumnya) di partisi `/home` yang sama, sehingga menambah dependency baru (`openzeppelin-crypto` + turunannya: `ff`-style arithmetic, `zeroize`, dst.) berisiko menghabiskan sisa 1,3 GB tsb. Untuk build Stylus ini saya juga mengarahkan `CARGO_HOME`:

```bash
export CARGO_HOME=/tmp/aegis-cargo-home
```

sehingga seluruh registry/cache dependency untuk crate ini di-download ke partisi root, bukan `/home`. Dikonfirmasi `/home` tidak bertambah penggunaannya (tetap 1,3 GB free) setelah build selesai.

**Penyesuaian kedua:** `cargo stylus new poseidon-bench` men-generate `rust-toolchain.toml` dengan `channel = "1.91.0"`. Toolchain rustup yang sudah terpasang di mesin ini adalah `1.92.0-x86_64-unknown-linux-gnu` (default, sudah termasuk target `wasm32-unknown-unknown`) — tidak ada 1.91.0 terpasang. Membiarkan pin di 1.91.0 akan memicu `rustup` mengunduh toolchain baru (ratusan MB) ke `~/.rustup` yang **juga** ada di partisi `/home` yang nyaris penuh. Saya ubah pin ke toolchain yang sudah terpasang:

```toml
[toolchain]
channel = "1.92.0"
targets = ["wasm32-unknown-unknown"]
```

Tidak ada toolchain baru yang diunduh; build memakai 1.92.0 yang sudah ada.

### Sumber (dari brief, tanpa adaptasi API)

`stylus/poseidon-bench/Cargo.toml` dan `stylus/poseidon-bench/src/lib.rs` ditulis **persis** sesuai cuplikan brief (lihat file). **Tidak ada perbedaan API** yang ditemukan pada `openzeppelin-crypto = "0.3.0"` (`arithmetic::uint::U256`, `field::instance::FpBN256`, `poseidon2::instance::bn256::BN256Params`, `Poseidon2::new/absorb/squeeze`, `FpBN256::from_bigint`, `.into_bigint()`) maupun `stylus-sdk = "0.10.9"` (`#[entrypoint] #[storage] struct`, `#[public] impl`) — kompilasi berhasil pada percobaan pertama tanpa modifikasi kode. `src/main.rs` dan `Stylus.toml` bawaan `cargo stylus new` (memakai `poseidon_bench::print_from_args()`, konvensi stylus-sdk 0.10.x yang lebih baru daripada pola `print_abi(license, pragma)` di fallback brief) dibiarkan apa adanya — fallback brief tidak diperlukan karena template bawaan sudah cocok dan berhasil build.

`cargo build --release --target wasm32-unknown-unknown`: sukses (4 warning `unexpected cfg condition value: contract-client-gen`, tidak berbahaya — proc-macro `stylus-proc` mengenali sebuah cfg feature yang tidak kita deklarasikan di `Cargo.toml` minimal kita; tidak memengaruhi build/ABI).

`cargo stylus export-abi` mengonfirmasi signature yang persis sesuai ekspektasi brief (Rust snake_case → Solidity camelCase otomatis oleh `#[public]`):
```solidity
interface IPoseidonBench {
    function hash(uint256[2] calldata inputs) external view returns (uint256);
    function hashChain7(uint256 seed) external view returns (uint256);
}
```

### `cargo stylus check --endpoint https://rpc.testnet.chain.robinhood.com`

```
contract size: 14.4 KB (14394 bytes)
wasm size: 44.8 KB (44807 bytes)
wasm data fee: 0.000094 ETH (originally 0.000079 ETH with 20% bump)
```
Exit code 0, tidak ada error. **Lolos pemeriksaan aktivasi** (RPC testnet 46630 menghitung *data fee* aktivasi untuk WASM ini, yang hanya berhasil jika WASM valid, ter-instrumentasi dengan benar, dan dalam batas ukuran/gas-metering Stylus). 14,4 KB jauh di bawah batas kode 96 KB Robinhood Chain (§ V9 `prd-arsitektur.md`) — margin ≈ 6,7×.

Tidak ada kunci yang dipakai atau diperlukan untuk langkah ini (`check` hanya mensimulasikan aktivasi via `eth_call`, tidak mengirim transaksi).

## 3. Langkah tersisa untuk user (Step 3 — butuh `$PK_DEPLOYER` berdana di 46630)

Jalankan dari root repo. Semua perintah di bawah memakai variabel dari `.env` (lihat `.env.example`): `RPC_URL=https://rpc.testnet.chain.robinhood.com`, `PK_DEPLOYER`.

```bash
set -a; source .env; set +a

# 1) Deploy kontrak Stylus (JANGAN dijalankan oleh agent — butuh kunci berdana)
export CARGO_TARGET_DIR=/tmp/aegis-stylus-target   # hindari disk /home penuh, lihat §2
cd stylus/poseidon-bench
cargo stylus deploy --endpoint "$RPC_URL" --private-key "$PK_DEPLOYER" --no-verify
# catat alamat yang dicetak → simpan sebagai $STYLUS
export STYLUS=0x...   # isi dari output di atas

# 2) Estimasi gas Stylus — PERTAMA (program belum ter-cache di chain)
cast estimate "$STYLUS" "hash(uint256[2])(uint256)" "[1,2]" --rpc-url "$RPC_URL"
cast estimate "$STYLUS" "hashChain7(uint256)(uint256)" 5 --rpc-url "$RPC_URL"

# 3) Estimasi gas Stylus — KEDUA, panggilan yang sama lagi (program sudah ter-cache:
#    init cost turun dari ~8.832 gas ke ~352 gas, lihat prd-arsitektur.md §19 V2 minInitGas())
cast estimate "$STYLUS" "hash(uint256[2])(uint256)" "[1,2]" --rpc-url "$RPC_URL"
cast estimate "$STYLUS" "hashChain7(uint256)(uint256)" 5 --rpc-url "$RPC_URL"

# 4) Sanity check — HASIL akan BERBEDA dari POSEIDON_1_2 (Poseidon2 != Poseidon v1).
#    Ini DIHARAPKAN, bukan bug — catat nilainya saja untuk arsip.
cast call "$STYLUS" "hash(uint256[2])(uint256)" "[1,2]" --rpc-url "$RPC_URL"

# 5) Yul di jaringan yang sama, untuk pembanding apple-to-apple
cd ../../contracts
forge create lib/poseidon-solidity/contracts/PoseidonT3.sol:PoseidonT3 \
  --rpc-url "$RPC_URL" --private-key "$PK_DEPLOYER" --broadcast
export YUL_T3=0x...   # isi dari output "Deployed to:" di atas
cast estimate "$YUL_T3" "hash(uint256[2])(uint256)" "[1,2]" --rpc-url "$RPC_URL"
cd ..
```

**Sebelum membandingkan, kurangi biaya intrinsik transaksi (21.000 + calldata) dari SETIAP angka `cast estimate`** — `cast estimate`/`eth_estimateGas` mengembalikan gas TOTAL transaksi (intrinsik + calldata + eksekusi), sedangkan angka Foundry di §1 hanya mengukur eksekusi (tidak ada transaksi top-level, jadi tidak ada biaya intrinsik). Untuk memudahkan, calldata dari kedua panggilan berikut sudah dihitung persis (independen dari alamat kontrak, hanya tergantung ABI + argumen):

| Panggilan | Calldata (byte) | Zero/nonzero byte | Biaya calldata | Intrinsik total (21.000 + calldata) |
|---|---|---|---|---|
| `hash(uint256[2])` dengan `[1,2]` | 68 | 62 zero / 6 nonzero | 344 | **21.344** |
| `hashChain7(uint256)` dengan `5` | 36 | 31 zero / 5 nonzero | 204 | **21.204** |

(dihitung dengan `cast calldata "hash(uint256[2])" "[1,2]"` / `cast calldata "hashChain7(uint256)" 5`, lalu 4 gas/byte-nol + 16 gas/byte-bukan-nol — aturan calldata standar EVM sejak Istanbul/EIP-2028, dipakai baik oleh `eth_estimateGas` Stylus maupun Yul di atas karena keduanya sama-sama chain 46630. `hash(uint256[2])` memakai calldata yang **sama persis** untuk kontrak Stylus maupun `PoseidonT3.hash` Yul — signature identik.)

Jadi: `gas eksekusi Stylus hash([1,2]) ≈ cast_estimate(hash) − 21.344`, dan sama untuk `hashChain7` dengan `− 21.204`, dan untuk Yul on-chain T3 dengan `− 21.344`.

### Setelah mendapat angka di atas

1. Isi ulang tabel di bagian atas dokumen ini: kolom "Gas (testnet 46630, cast estimate − intrinsik)" untuk kedua baris Stylus, dan baris Yul T3 (kolom yang sama, untuk pembanding on-chain apple-to-apple — opsional, baris Foundry Yul T3 sudah cukup untuk gerbang tapi baris on-chain memperkuat argumen).
2. Hitung rasio: `gas Yul T3 (Foundry, 32.503) / gas Stylus hash (on-chain − intrinsik, ter-cache)`. Isi baris "Rasio Yul/Stylus (hash tunggal)" dan "(rantai 7)" (bandingkan `212.715` Yul 7×T3 Foundry terhadap `hashChain7` Stylus on-chain − intrinsik).
3. Terapkan aturan keputusan: **rasio ≥ 1,5× → Plan 2 memasukkan `AegisPoseidon.rs`** (port Poseidon v1 ke Rust, konstanta circomlib, dipakai di anchored mode) **+ anchored mode di Stylus**; **< 1,5× → anchored mode tetap pakai Yul, Stylus dihapus dari scope MVP**.
4. Ubah baris "Status" di puncak dokumen ini dari TERBUKA → TERTUTUP dengan keputusan dan angka final, dan perbarui baris D2 di `prd-arsitektur.md` §20 (kolom Rekomendasi) dengan hasil yang sama.
5. `cargo stylus deploy` TIDAK diverifikasi (`--no-verify`) — jika ingin publish source untuk verifikasi publik, jalankan `cargo stylus verify` terpisah setelah deploy (butuh hash deployment yang sudah dicetak `cargo stylus check`/`deploy` di atas: `52c67c8fd95e981e804851e2a5d19d0ff5452515cce1b499df948b79f6358f16`, lihat log build).

## 4. Lingkungan pengukuran

- Foundry: `forge Version: 1.5.1-stable` (lihat `docs/TOOLCHAIN.md`), `solc 0.8.28`, `evm_version = "cancun"`, `optimizer_runs = 200` (`contracts/foundry.toml`, tidak diubah untuk task ini).
- Rust/Stylus: `cargo 1.92.0`, `cargo-stylus 0.10.9`, toolchain `1.92.0-x86_64-unknown-linux-gnu` + target `wasm32-unknown-unknown` (rustup, sudah terpasang — lihat §2 untuk kenapa `rust-toolchain.toml` di-pin ke versi ini, bukan 1.91.0 bawaan template).
- `CARGO_TARGET_DIR=/tmp/aegis-stylus-target`, `CARGO_HOME=/tmp/aegis-cargo-home` dipakai untuk semua perintah `cargo`/`cargo stylus` di atas — **wajib** diset ulang di shell manapun yang menjalankan perintah Step 3, karena `/home` (lokasi repo ini) nyaris penuh (lihat §2).
- Endpoint testnet: `https://rpc.testnet.chain.robinhood.com` (chain id 46630, sesuai `.env.example`).
