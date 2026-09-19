# Benchmark Poseidon — gerbang D2 (tanggal: 2026-09-19)

**Status: ANGKA ON-CHAIN LENGKAP (20 Sep 2026) — keputusan D2 menunggu pemilik repo.** Hasil apple-to-apple di testnet 46630 (`cast estimate` − intrinsik): hash tunggal **Yul 39.472 vs Stylus 56.513 → rasio_hash 0,70×** (Stylus LEBIH MAHAL: biaya init program 8.832 gas + overhead tetap mendominasi satu hash); rantai 7 hash (jalur anchored ack) **Yul 223.901 vs Stylus 95.934 → rasio_chain7 2,33×** (Stylus 2,3× lebih murah; biaya marjinal per hash ≈ 6,6k Stylus vs ≈ 30,7k Yul). Catatan penting: `cargo stylus cache bid` gagal — **tidak ada CacheManager di ArbWasmCache chain ini** ("no cache managers found … Stylus cache is not yet enabled on this chain"), sehingga `codehashIsCached` = false dan setiap panggilan membayar init *uncached* (8.832 gas); panggilan pertama dan kedua memberi angka identik. Alamat: Stylus `0xa91333b9c548c9b584effaad4c57b45bfd92fec6` (aktivasi tx `0x4a1044fc…`), Yul `PoseidonT3` `0x5bcbFCb083D64F9723Dcd3Af973F9432E844cbb7`, caller rantai-7 `0x0a32b8E60E50aF209aa004C942aB01740e700B75`.

**Catatan jujur (dari brief):** kontrak Stylus di sini memakai `openzeppelin-crypto::Poseidon2` (Poseidon**2**), sedangkan `poseidon-solidity` Yul memakai Poseidon **v1** (varian yang kompatibel circomlib, dipakai di seluruh sirkuit AegisClear). Keduanya bukan fungsi yang identik — benchmark ini membandingkan **kelas biaya hashing on-chain** (EVM/Yul vs WASM/Stylus untuk operasi "satu permutasi Poseidon berukuran sebanding"), bukan interoperabilitas hash. Jika D2 lolos, port Poseidon v1 ke Rust (`AegisPoseidon.rs`, konstanta circomlib) adalah pekerjaan Plan 2 tersendiri — lihat §8.3 `prd-arsitektur.md`.

| Implementasi | Fungsi | Gas (Foundry, REFERENSI SAJA*) | Gas (testnet 46630, cast estimate − intrinsik) | Catatan |
|---|---|---|---|---|
| Yul `poseidon-solidity` T3 | hash([1,2]) | 32.503 | **39.472** (60.816 − 21.344) | == circomlibjs (D3 ✅; nilai on-chain = `7853…3530`) |
| Yul T6 | hash(5 input) | 172.418 | – (di luar gerbang D2; leaf-only, tidak ada langkah on-chain untuk ini) | leaf |
| Yul 7× T3 | anchored ack | 212.715 | **223.901** (245.105 − 21.204, caller `YulChain7Caller` + 7 DELEGATECALL) | |
| Stylus OZ Poseidon2 | hash([1,2]) | – | **56.513** (77.857 − 21.344; uncached — chain tanpa CacheManager) | Poseidon2 ≠ v1 (nilai `2181…5040`) |
| Stylus OZ Poseidon2 | hashChain7 | – | **95.934** (117.138 − 21.204; uncached) | biaya marjinal ≈ 6.570 gas/hash |

\* Kolom Foundry adalah `DELEGATECALL` ke library Solidity ter-link (lihat §1) dan **menyertakan** ≈3,1–3,5k gas overhead cross-contract-call + cold-account-access yang **tidak ada** pada panggilan on-chain langsung (top-level `CALL`) ke kontrak Stylus. Kolom ini hanya referensi/konteks (menjawab "apakah angka Yul kita masuk akal"); **rasio keputusan D2 tidak boleh dihitung dari kolom ini** — mencampur pembilang Foundry dengan penyebut on-chain akan membesarkan rasio secara tidak adil menguntungkan Stylus. Rasio wajib dihitung dari kolom on-chain saja.

**Formula rasio keputusan (wajib on-chain, apples-to-apples — cara mendapatkan angkanya ada di §3):**
```
rasio_hash   = (Yul T3 hash([1,2]), on-chain − 21.344) / (Stylus hash([1,2]), on-chain, panggilan KEDUA/ter-cache − 21.344)
rasio_chain7 = (Yul 7×T3, on-chain via caller opsional − intrinsik) / (Stylus hashChain7, on-chain, panggilan KEDUA/ter-cache − 21.204)
```
`rasio_hash` = 39.472 / 56.513 = **0,70×**. `rasio_chain7` = 223.901 / 95.934 = **2,33×**. (Sebelumnya: `rasio_hash`: menunggu angka on-chain Yul & Stylus; `rasio_chain7`: menunggu angka on-chain Yul (caller rantai-7 opsional) & Stylus — jika caller rantai-7 Yul tidak dibuat, baris ini TIDAK BOLEH diisi dari angka Foundry sebagai pengganti; tandai "tidak diukur on-chain" dan pakai `rasio_hash` saja untuk D2. Karena anchored mode (§8.3 `prd-arsitektur.md`) secara operasional justru kasus rantai-7 (7 hash per ack), sangat disarankan tetap mengisi `rasio_chain7` on-chain sebelum menutup D2 untuk anchored mode secara final.

**Keputusan D2:** `rasio_hash` (dan `rasio_chain7` jika tersedia) ≥ 1,5× → Plan 2 memasukkan `AegisPoseidon.rs` (port Poseidon v1, konstanta circomlib) + anchored mode di Stylus; < 1,5× → anchored mode memakai Yul, Stylus dihapus dari scope. **Status saat ini: TERBUKA** — belum ada angka on-chain untuk menghitung rasio apa pun; keputusan **tidak boleh** diambil dari angka Foundry saja, dan **tidak boleh** dari campuran Foundry (Yul) × on-chain (Stylus) — kedua sisi rasio harus sama-sama on-chain (`cast estimate` terhadap kontrak yang benar-benar di-deploy di 46630).

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
Frame delegatecall T3 sendiri berharga 29.336 gas (T6: 168.952 gas); sisanya (≈3,1–3,5k) adalah overhead di frame pemanggil (cold-account-access EIP-2929, ABI-encode argumen, memory expansion) yang konsisten di kedua fungsi. Angka README kemungkinan diukur dengan harness/versi lib berbeda (pemanggilan langsung tanpa Solidity glue, atau commit lama). **Dibanding angka marketing README pihak ketiga, angka Foundry proyek ini sendiri yang harus dipercaya** — itulah biaya nyata jika kontrak AegisClear (mis. anchored-mode di Plan 2) memanggil library ini persis seperti `PoseidonBench.t.sol` memanggilnya (`import ... ; LibraryName.hash(...)`).

**Penting — angka Foundry di atas BUKAN angka yang dipakai untuk menghitung rasio keputusan D2.** Overhead DELEGATECALL/cold-access (≈3,1–3,5k gas) yang baru dijelaskan **tidak ada** pada panggilan on-chain langsung (top-level `CALL` dari EOA/`cast`) ke kontrak Stylus yang di-deploy. Memakai angka Foundry ini sebagai pembilang dibagi angka on-chain Stylus sebagai penyebut akan membesarkan rasio secara tidak adil menguntungkan Stylus. Rasio keputusan **wajib** dihitung dari dua angka on-chain (Yul on-chain vs Stylus on-chain) — lihat formula di ringkasan tabel di atas dan §3.

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

# 5) WAJIB — Yul di jaringan yang sama, untuk pembanding apple-to-apple.
#    Tanpa langkah ini, rasio_hash TIDAK BISA dihitung dengan benar (lihat catatan bias
#    di ringkasan tabel di atas — jangan pakai angka Foundry §1 sebagai pengganti).
cd ../../contracts
forge create lib/poseidon-solidity/contracts/PoseidonT3.sol:PoseidonT3 \
  --rpc-url "$RPC_URL" --private-key "$PK_DEPLOYER" --broadcast
export YUL_T3=0x...   # isi dari output "Deployed to:" di atas
cast estimate "$YUL_T3" "hash(uint256[2])(uint256)" "[1,2]" --rpc-url "$RPC_URL"
cd ..
```

### Opsional (disarankan) — caller rantai-7 Yul on-chain, untuk `rasio_chain7`

Tidak ada di Step 3 asli brief (yang hanya mendefinisikan pembanding untuk `hash([1,2])`). Anchored mode (§8.3 `prd-arsitektur.md`) memakai 7 hash per ack, jadi `rasio_chain7` adalah angka yang paling relevan secara operasional. Untuk mengukurnya on-chain apples-to-apples terhadap `hashChain7` Stylus, deploy caller kecil ini (murni untuk benchmark — bukan bagian `AegisChannel`, jangan biarkan masuk scope produksi):

```bash
cat > contracts/src/YulChain7Caller.sol <<'EOF'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

/// Benchmark-only: pembanding on-chain untuk Stylus hashChain7. Tidak dipakai AegisChannel.
contract YulChain7Caller {
    function chain7(uint256 seed) external pure returns (uint256) {
        uint256 x = seed;
        for (uint256 i; i < 7; i++) x = PoseidonT3.hash([x, i]);
        return x;
    }
}
EOF
cd contracts
forge create src/YulChain7Caller.sol:YulChain7Caller \
  --rpc-url "$RPC_URL" --private-key "$PK_DEPLOYER" --broadcast
export YUL_CHAIN7=0x...   # isi dari output "Deployed to:" di atas
cast estimate "$YUL_CHAIN7" "chain7(uint256)(uint256)" 5 --rpc-url "$RPC_URL"
cd ..
rm contracts/src/YulChain7Caller.sol   # benchmark-only — jangan commit ke contracts/src
```

**Sebelum membandingkan, kurangi biaya intrinsik transaksi (21.000 + calldata) dari SETIAP angka `cast estimate`** — `cast estimate`/`eth_estimateGas` mengembalikan gas TOTAL transaksi (intrinsik + calldata + eksekusi), sedangkan angka Foundry di §1 hanya mengukur eksekusi (tidak ada transaksi top-level, jadi tidak ada biaya intrinsik). Untuk memudahkan, calldata dari kedua panggilan berikut sudah dihitung persis (independen dari alamat kontrak, hanya tergantung ABI + argumen):

| Panggilan | Calldata (byte) | Zero/nonzero byte | Biaya calldata | Intrinsik total (21.000 + calldata) |
|---|---|---|---|---|
| `hash(uint256[2])` dengan `[1,2]` | 68 | 62 zero / 6 nonzero | 344 | **21.344** |
| `hashChain7(uint256)` dengan `5` | 36 | 31 zero / 5 nonzero | 204 | **21.204** |
| `chain7(uint256)` dengan `5` (caller Yul opsional) | 36 | 31 zero / 5 nonzero | 204 | **21.204** |

(dihitung dengan `cast calldata "hash(uint256[2])" "[1,2]"` / `cast calldata "hashChain7(uint256)" 5` / `cast calldata "chain7(uint256)" 5`, lalu 4 gas/byte-nol + 16 gas/byte-bukan-nol — aturan calldata standar EVM sejak Istanbul/EIP-2028, dipakai baik oleh `eth_estimateGas` Stylus maupun Yul di atas karena keduanya sama-sama chain 46630. `hash(uint256[2])` memakai calldata yang **sama persis** untuk kontrak Stylus maupun `PoseidonT3.hash` Yul — signature identik. `chain7`/`hashChain7` punya intrinsik yang sama, 21.204, karena kedua selector 4-byte-nya kebetulan sama-sama tanpa byte nol.)

Jadi: `gas eksekusi Stylus hash([1,2]) ≈ cast_estimate(hash, panggilan KEDUA/ter-cache) − 21.344`, `gas eksekusi Yul on-chain T3 ≈ cast_estimate($YUL_T3, hash) − 21.344`, `gas eksekusi Stylus hashChain7 ≈ cast_estimate(hashChain7, panggilan KEDUA/ter-cache) − 21.204`, `gas eksekusi Yul on-chain 7× (caller opsional) ≈ cast_estimate($YUL_CHAIN7, chain7) − 21.204`.

### Setelah mendapat angka di atas

1. Isi ulang tabel di bagian atas dokumen ini, kolom "Gas (testnet 46630, cast estimate − intrinsik)": **wajib** kedua baris "WAJIB" (Yul T3 on-chain dan Stylus hash on-chain, panggilan KEDUA/ter-cache); opsional (disarankan) kedua baris rantai-7 jika caller `YulChain7Caller` dideploy.
2. Hitung `rasio_hash = (gas eksekusi Yul T3 on-chain) / (gas eksekusi Stylus hash on-chain, ter-cache)` — **bukan** dari angka Foundry §1 (lihat catatan bias di ringkasan tabel). Isi baris "Rasio Yul/Stylus (hash tunggal)". Jika caller rantai-7 dideploy, hitung `rasio_chain7` dengan cara yang sama (Yul `chain7` on-chain / Stylus `hashChain7` on-chain, ter-cache) dan isi baris "(rantai 7)"; jika tidak, tandai baris itu "tidak diukur on-chain" — jangan isi dari angka Foundry sebagai pengganti.
3. Terapkan aturan keputusan: **`rasio_hash` (dan `rasio_chain7` jika ada) ≥ 1,5× → Plan 2 memasukkan `AegisPoseidon.rs`** (port Poseidon v1 ke Rust, konstanta circomlib, dipakai di anchored mode) **+ anchored mode di Stylus**; **< 1,5× → anchored mode tetap pakai Yul, Stylus dihapus dari scope MVP**.
4. Ubah baris "Status" di puncak dokumen ini dari TERBUKA → TERTUTUP dengan keputusan dan angka final, dan perbarui baris D2 di `prd-arsitektur.md` §20 (kolom Rekomendasi) dengan hasil yang sama.
5. `cargo stylus deploy` TIDAK diverifikasi (`--no-verify`) — jika ingin publish source untuk verifikasi publik, jalankan `cargo stylus verify` terpisah setelah deploy (butuh hash deployment yang sudah dicetak `cargo stylus check`/`deploy` di atas: `52c67c8fd95e981e804851e2a5d19d0ff5452515cce1b499df948b79f6358f16`, lihat log build).

## 4. Lingkungan pengukuran

- Foundry: `forge Version: 1.5.1-stable` (lihat `docs/TOOLCHAIN.md`), `solc 0.8.28`, `evm_version = "cancun"`, `optimizer_runs = 200` (`contracts/foundry.toml`, tidak diubah untuk task ini).
- Rust/Stylus: `cargo 1.92.0`, `cargo-stylus 0.10.9`, toolchain `1.92.0-x86_64-unknown-linux-gnu` + target `wasm32-unknown-unknown` (rustup, sudah terpasang — lihat §2 untuk kenapa `rust-toolchain.toml` di-pin ke versi ini, bukan 1.91.0 bawaan template).
- `CARGO_TARGET_DIR=/tmp/aegis-stylus-target`, `CARGO_HOME=/tmp/aegis-cargo-home` dipakai untuk semua perintah `cargo`/`cargo stylus` di atas — **wajib** diset ulang di shell manapun yang menjalankan perintah Step 3, karena `/home` (lokasi repo ini) nyaris penuh (lihat §2).
- Endpoint testnet: `https://rpc.testnet.chain.robinhood.com` (chain id 46630, sesuai `.env.example`).
