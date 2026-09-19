# AegisClear

Escrow & penyelesaian sengketa privacy-preserving untuk pembayaran agen-ke-agen (x402/MPP) dalam USDG, diadili oleh bukti Groth16 (zero-knowledge) — di Robinhood Chain (Arbitrum Dedicated Chain / Nitro), mainnet `4663` / testnet `46630`.

Spesifikasi lengkap: [`prd-arsitektur.md`](./prd-arsitektur.md). Log toolchain & pengukuran per-task: [`docs/TOOLCHAIN.md`](./docs/TOOLCHAIN.md).

**Status implementasi:** kontrak, sirkuit, dan SDK lengkap dan lulus seluruh suite lokal (Anvil + Foundry + circuits). **Deploy ke testnet 46630 sudah di-broadcast dan 7/7 kontrak terverifikasi di Blockscout (20 Sep 2026, blok 121.731.938 = `0x7417b62`)**; test integrasi "kooperatif" dan "sengketa" (bukti Groth16 asli + `settle()`) **lulus di chain 46630** — tx bukti liveness ada di tabel [Alamat kontrak](#alamat-kontrak). Yang belum: unggah release `v0.1.0-zkey` dan pengukuran gas Stylus on-chain untuk menutup D2 (lihat `docs/benchmarks/poseidon.md`).

## Daftar isi
- [Ringkasan produk](#ringkasan-produk)
- [Alamat kontrak](#alamat-kontrak)
- [Menjalankan secara lokal](#menjalankan-secara-lokal)
- [Peran & kendali (matriks akses)](#peran--kendali-matriks-akses)
- [Semantik kontrak yang perlu diketahui](#semantik-kontrak-yang-perlu-diketahui)
- [Keterbatasan SDK referensi yang diketahui](#keterbatasan-sdk-referensi-yang-diketahui)
- [Apa yang tetap bocor — dan apa yang tidak](#apa-yang-tetap-bocor--dan-apa-yang-tidak)
- [Trusted setup & regenerasi zkey](#trusted-setup--regenerasi-zkey)
- [Prior art](#prior-art)
- [Deploy ke testnet 46630](#deploy-ke-testnet-46630)
- [Release artefacts](#release-artefacts)

## Ringkasan produk

*(spec §0)*

AegisClear adalah evaluator itu. Ia adalah **sirkuit**, bukan manusia atau LLM:

1. **Micro-escrow state channel** — klien mendanai satu channel USDG per pasangan agen; setiap unit layanan menghasilkan *receipt* yang ditandatangani kedua pihak dan terakumulasi off-chain. Chain hanya melihat komitmen.
2. **ZK settlement** — jika klien menuntut penalti SLA, ia mengirim bukti Groth16 bahwa *"di bawah syarat yang berkomitmen di `termsCommitment` dan receipt di bawah `receiptsRoot` yang kami berdua tanda tangani, penalti yang sah adalah X"*. Kontrak memverifikasi (**229.241 gas** terukur untuk verifier Groth16 dengan 6 input publik — `contracts/test/Verifier.t.sol`, bukti EX1 asli; lihat `docs/TOOLCHAIN.md` Task 6) dan membagi dana **proporsional** — tanpa pernah melihat harga, ambang, atau metrik.
3. **Payout ke alamat bebas** — `payoutClient`/`payoutProvider` ditetapkan saat `open` dan boleh berupa brankas armada, Safe, atau smart account ERC-4337, bukan hot wallet agen. **Hanya itu yang ada di P0/repo ini.** `AegisTreasuryRouter` (pemetaan agen → treasury per armada, spec §8.4, P1) **belum diimplementasikan** — ia bagian dari Plan 2 (`docs/superpowers/plans/2026-09-19-aegisclear-mvp.md`, "Scope plan ini").

Konteks singkat: agen otonom di Robinhood Chain sudah saling membayar hari ini lewat rel x402/MPP `exact` (bayar dulu, terima kemudian, tanpa recourse). Untuk pekerjaan mesin bernilai puluhan–ribuan dolar, pola *pay-first* itu membuat pembeli menanggung seluruh risiko wanprestasi. AegisClear menyisipkan escrow + bukti ZK di antara deposit dan pelepasan dana, tanpa membuka harga satuan, ambang SLA, atau telemetri ke chain publik (§6.7).

## Alamat kontrak

### Testnet 46630 (Robinhood Chain)

Di-deploy 20 Sep 2026 dari `contracts/script/DeployTestnet.s.sol` (deployer `0x90351bB1E85a17D5f70c62C0cC076D39D897076D`, blok `0x7417b62`); semua source terverifikasi di Blockscout. `contracts/deployments/testnet-46630.json` sengaja tidak di-commit (`.gitignore`) — tabel ini adalah salinannya.

| Kontrak | Variabel deploy | Alamat | Explorer |
|---|---|---|---|
| `MockUSDG` | `usdg` | `0xCadd4526b6E7Beb640c3e920e80Ff28B327B5a83` | [0xCadd4526…](https://explorer.testnet.chain.robinhood.com/address/0xCadd4526b6E7Beb640c3e920e80Ff28B327B5a83) |
| `SLASettlementVerifier` | `verifier` | `0x5EC99814dF5A78ECB4dbC83f066FB62970847462` | [0x5EC99814…](https://explorer.testnet.chain.robinhood.com/address/0x5EC99814dF5A78ECB4dbC83f066FB62970847462) |
| `AegisChannelFactory` (demo, `MIN_CHALLENGE_WINDOW` = 60 s) | `factory` | `0x0922ee7D6D518681Fd94E98e56D3f161A0574ED3` | [0x0922ee7D…](https://explorer.testnet.chain.robinhood.com/address/0x0922ee7D6D518681Fd94E98e56D3f161A0574ED3) |
| `AegisChannelFactory` (produksi, `MIN_CHALLENGE_WINDOW` = 21.600 s / 6 jam) | `factoryProd` | `0x201BaC41758a45925E1eD7a9Ad79757F19337fDD` | [0x201BaC41…](https://explorer.testnet.chain.robinhood.com/address/0x201BaC41758a45925E1eD7a9Ad79757F19337fDD) |
| `SimpleJobEscrow` (kontrol Pasar A, evaluator biner — §14) | `escrow` | `0x5017C9e556bF750aEE1aB9e74aA094a91924964a` | [0x5017C9e5…](https://explorer.testnet.chain.robinhood.com/address/0x5017C9e556bF750aEE1aB9e74aA094a91924964a) |

**Bukti liveness di 46630 (test integrasi SDK, 20 Sep 2026):**

| Skenario | Channel (clone) | Tx kunci | Hasil on-chain |
|---|---|---|---|
| Kooperatif — 10 unit, `closeCooperative` | [`0x8f991b6e…2844`](https://explorer.testnet.chain.robinhood.com/address/0x8f991b6ebbe5a7725fd01d4da9e870dddd5c2844) | open [`0x28e4b0b9…`](https://explorer.testnet.chain.robinhood.com/tx/0x28e4b0b9cdbcd1a52c121226dba96fa3fae558b162319986171060f3c72e61c5) · settle [`0xd46d1343…`](https://explorer.testnet.chain.robinhood.com/tx/0xd46d13430464febbd7ff07c946a95d9f847bf4c465c2095a86b8c8c03a7a2325) | `Settled(seq 10, toProvider 200.000, toClient 800.000, cooperative)` |
| Sengketa — 1 pelanggaran, bukti Groth16, `settle` setelah jendela 120 s nyata | [`0xbcb09638…f3be`](https://explorer.testnet.chain.robinhood.com/address/0xbcb096386994cc4fb3972d0495600ead1db6f3be) | checkpoint [`0x643bf252…`](https://explorer.testnet.chain.robinhood.com/tx/0x643bf252eb5f60a53a7e56af2117b8f4c99ff9e7ed8f345fec72ae9e7760f1d3) · **claimPenalty** [`0x54355aef…`](https://explorer.testnet.chain.robinhood.com/tx/0x54355aefbcd9f651ebd5e0ca067ec0111036461f2509d23177c21d28206e93a6) · settle [`0xd903f389…`](https://explorer.testnet.chain.robinhood.com/tx/0xd903f389f47abf58ef1ff8b052b130e7e30bb04f1131441ae1c7b7cb307e37bc) | `PenaltyClaimed(seq 10, 10.000)`; `Settled(10, A 200.000, penalti 10.000, toProvider 190.000, toClient 810.000)` |

Gas terukur di 46630 (klien sengketa): `fund` 58.413 · `submitCheckpoint` 118.929 · `claimPenalty` 309.373 · `settle` 98.291 (proving Groth16 di klien ±4 s).

### Alamat kanonik lintas-chain (dipakai apa adanya, tidak di-deploy ulang)

Diverifikasi ada di `4663` **dan** `46630` (spec §10.1, §19).

| Kontrak | Alamat | Catatan |
|---|---|---|
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | `permitTransferFrom`/`permitWitnessTransferFrom`; dipakai `AegisChannel.fundWithPermit2` tanpa perubahan |
| `x402ExactPermit2Proxy` | `0x402085c248EeA27D92E8b30b2C58ed07f9E20001` | `payTo` = alamat channel (CREATE2, `AegisChannelFactory.predict`); proxy menegakkan dana hanya sampai ke `witness.to` |
| USDG (mainnet `4663`) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | proxy EIP-1967, 6 desimal, role-based, `paused()` = false. **Testnet `46630` memakai `MockUSDG` sendiri** (6 desimal, `mint` publik) — USDG asli tidak ada di testnet |

## Menjalankan secara lokal

Prasyarat (versi yang diverifikasi, lihat [`docs/TOOLCHAIN.md`](./docs/TOOLCHAIN.md)): Node 22, pnpm 9.15, Foundry (`forge`/`anvil`/`cast`) 1.5.1, circom 2.2.3.

```bash
pnpm install

# Artefak sirkuit yang TIDAK di-commit (circuits/build/* kecuali verification_key.json): r1cs + wasm witness generator
pnpm --filter @aegisclear/circuits build

# Proving key: unduh `sla_final.zkey` dari release `v0.1.0-zkey` ke circuits/build/ (lihat "Release artefacts").
# ALTERNATIF: `bash circuits/scripts/setup.sh` — tetapi ini membangkitkan kunci BARU (entropi /dev/urandom) yang
# TIDAK cocok dengan contracts/src/SLASettlementVerifier.sol, circuits/build/verification_key.json, dan fixture bukti
# contracts/test/fixtures/ex1_verifier.json yang di-commit; ketiganya harus dibangkitkan ulang dan di-commit BERSAMA
# (lihat "Trusted setup & regenerasi zkey"). Dibutuhkan oleh: sdk (test prover/sengketa), circuits (test), dan
# contracts (Penalty.t.sol membuat bukti asli lewat vm.ffi → circuits/scripts/prove.ts).

# Terminal 1: chain lokal
anvil

# Terminal 2: deploy (factory demo, MIN_CHALLENGE_WINDOW = 60 s) + mint MockUSDG ke 4 akun uji
cd contracts
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
cd ..

# Seluruh suite: sdk (vitest) + circuits (node --test) + contracts (forge test)
pnpm test

# Harness demo §14: Pasar A (SimpleJobEscrow, evaluator biner) vs Pasar B (AegisClear)
pnpm --filter @aegisclear/demo demo

# Opsional: pemindaian kebocoran calldata/event on-chain yang membuktikan tabel §6.7 di bawah
pnpm --filter @aegisclear/demo leak-check
```

Sub-suite satuan bila perlu debug lebih sempit: `pnpm test:sdk`, `pnpm test:circuits`, `pnpm test:contracts` (dijalankan dari root; `forge test -vv` juga bisa langsung dari `contracts/`).

## Peran & kendali (matriks akses)

*(spec §8.6 — disalin apa adanya)*

| Peran | Bisa apa | Tidak bisa apa | Catatan |
|---|---|---|---|
| `client` | mendanai, ack (tanda tangan), `submitCheckpoint`, `claimPenalty`, `closeCooperative` (dengan provider) | menarik dana sepihak sebelum settle, mengubah `T` | — |
| `provider` | `submitCheckpoint`, `claimPenalty`, `closeCooperative`, `rollover` | membuat receipt tanpa tanda tangan klien, mengubah `T` | — |
| Siapa pun | `fund` (transfer), `open` dengan tanda tangan sah, `settle` setelah deadline, `sweep` | — | watcher bot |
| Factory deployer | men-deploy factory dengan `VERIFIER`, `IMPLEMENTATION`, `MIN_CHALLENGE_WINDOW` | mengubah apa pun setelah deploy | tidak ada owner |
| Koordinator trusted setup | (satu kali) menghasilkan zkey | — | **risiko T4**; ceremony ≥ 3 kontributor sebelum dana mainnet non-demo |

Tidak ada `owner`, `pause`, proxy, atau `upgradeTo` di jalur dana.

## Semantik kontrak yang perlu diketahui

Perilaku `AegisChannel` berikut disengaja (lihat `contracts/src/AegisChannel.sol`, FR-12–FR-16) tetapi mudah disalahpahami oleh integrator; SDK referensi dan watcher-nya ditulis dengan asumsi ini:

- **`deadline` hanya menggerbangi `settle()`.** `submitCheckpoint` (seq lebih tinggi, co-signed) dan `claimPenalty` **tetap bisa dipanggil setelah `deadline` lewat, selama belum ada yang memanggil `settle()`** — tidak ada pemeriksaan `deadline` di kedua fungsi itu. Konsekuensi: (i) respons tantangan yang "terlambat" masih sah dan masih menang sampai state benar-benar di-settle, sehingga responder provider (`Watcher`) selalu merespons dulu tanpa memandang `deadline`, membaca ulang state, dan baru men-settle bila deadline hasil baca ulang pun sudah lewat; (ii) siapa pun yang ingin hasil final harus benar-benar memanggil `settle()` — `deadline` lewat tidak "mengunci" apa pun dengan sendirinya.
- **`claimPenalty`: klaim valid terakhir yang menang.** Setiap klaim valid atas state saat ini menimpa `payToClient`/`proofSeq` sebelumnya; tidak ada aturan "klaim pertama" atau "penalti terbesar". Karena fungsi penalti deterministik (§6.3), semua bukti valid atas `(T, R, seq, A)` yang sama menghasilkan `payToClient` yang identik, jadi urutan tidak mengubah hasil — kecuali `seq` berubah: checkpoint baru (`submitCheckpoint`) membatalkan bukti yang tertunda (`hasProof = false`, FR-15) dan klaim harus diulang atas root baru.
- **`settle()` hanya memakai bukti atas `seq` saat ini** (`hasProof && proofSeq == seq`); bukti atas seq lama diabaikan.

## Keterbatasan SDK referensi yang diketahui

`sdk/` adalah implementasi referensi protokol (§11) untuk demo dan test, bukan server produksi. Yang berikut **diketahui dan belum ditutup**; tidak satu pun mengubah keamanan dana di kontrak (§12), tetapi memengaruhi layanan/UX provider dan klien:

- **Autentikasi request.** Header `Aegis-Client` **tidak diautentikasi**: siapa pun yang tahu alamat sebuah klien dapat memanggil `POST /job` atas namanya selama checkpoint terakhir sesi itu sudah di-ack (provider hanya menahan unit berikutnya sampai ack checkpoint *terakhir* diterima — mis. setelah `finalAck()`). Dampak terbatas: provider melayani paling banyak **satu unit** tanpa ack (FR-24/T2 — unit itu tidak pernah dibayar, dan checkpoint berikutnya tidak akan pernah di-ack), dan sesi klien korban tidak bisa lanjut (request berikutnya ditolak `409 ack-required` untuk checkpoint yang tidak pernah ia lihat) sehingga klien harus keluar: `closeCooperative()` tetap bisa (provider menandatangani `Close` di seq ter-ack tertinggi) atau `dispute()` dengan checkpoint co-signed tertingginya (klien menyimpan invarian "pohon lokal = checkpoint co-signed tertinggi", diuji: satu balasan cacat tidak menyentuh pohon). Perbaikan yang direncanakan: header per-request yang ditandatangani klien (mis. EIP-712 atas `(channel, seq, nonce)`), bukan sekadar alamat.
- **`Aegis-Client` tidak divalidasi sebagai alamat** — nilai bukan-alamat baru gagal di `predictChannel`/tanda tangan, bukan ditolak lebih awal dengan 400.
- **Tidak ada serialisasi per sesi.** Dua `POST /job` paralel untuk klien yang sama berlomba di `s.tree`/`s.checkpoints` (handler async tanpa mutex); klien referensi mengirim request secara berurutan sehingga tidak terpicu, tetapi server tidak memaksakannya.
- **Sesi tidak pernah dievict.** `sessions` (termasuk sesi yang sudah `SETTLED`) hidup selama proses; `GET /job` dari alamat baru membuat sesi (dan dua tanda tangan) tanpa batas — tanpa rate limit, ini vektor kehabisan memori pada provider publik.
- **Provider membuka channel sebelum memeriksa pendanaan.** `POST /job` pertama yang membawa tanda tangan `ChannelTerms` sah langsung `factory.open` (gas provider) sebelum memeriksa saldo channel; klien yang tidak pernah mendanai membuat provider membayar gas `open` sia-sia (dana klien tidak pernah berisiko: tanpa dana tidak ada unit yang dilayani).
- **Pagar ekonomi klien harus dikonfigurasi.** `ClientPolicy` (`maxDeposit`, `maxChallengeWindow`, `maxQtyPerUnit`) menolak tawaran 402/receipt di luar batas **sebelum** transfer/ack; tanpa `maxQtyPerUnit`, batas qty per unit adalah `unitQty` yang provider iklankan sendiri di 402 (klien menolak mendanai bila keduanya tidak ada). `accept(receipt)` tetap satu-satunya tempat klien membandingkan metrik dengan pengamatannya sendiri (§11.3) — defaultnya menerima semua.
- **Verifikasi tanda tangan ERC-1271/6492** memakai `publicClient.verifyTypedData` (eth_call ke validator universal) — konsisten dengan kontrak, tetapi berarti setiap verifikasi off-chain adalah satu panggilan RPC; fungsi murni `verify*Sig` (ecrecover) tetap tersedia untuk EOA/offline.

## Apa yang tetap bocor — dan apa yang tidak

*(spec §6.7 — disalin apa adanya)*

| Terlihat di chain | Tersembunyi |
|---|---|
| Alamat klien, provider, payout; token | `p`, `L*`, `Q*`, `π`, `κ`, `ν` |
| `B` (deposit), `A` (total yang di-ack), `seq` (jumlah unit) | `qty_i`, `m1_i`, `m2_i`, `due_i` per unit |
| `payToClient` (jika ada klaim), waktu setiap transaksi | Berapa unit yang melanggar, pelanggaran jenis apa |
| `termsCommitment`, `receiptsRoot` | Isi keduanya |

Inferensi yang **masih mungkin**: `A / seq` = harga rata-rata per receipt (bukan `p` jika `qty` bervariasi); `payToClient / A` = porsi penalti (bukan jumlah pelanggaran, karena `π`, `κ` privat); pola waktu ack = ritme layanan. Mitigasi yang disediakan SDK: `qty` bervariasi dan agregasi beberapa unit per receipt; **bukan** klaim "anonim".

## Trusted setup & regenerasi zkey

*(spec §9.4)*

Pipeline yang dirancang spec: `powersOfTau28_hez_final_17.ptau` (Hermez, phase-1 publik) → `snarkjs groth16 setup` → kontribusi phase-2 → beacon → `zkey`. **Yang benar-benar terjadi di repo ini (lihat `docs/TOOLCHAIN.md`, Task 5): kedua mirror publik ptau Hermez (`storage.googleapis.com/zkevm/ptau`, `hermez.s3-eu-west-1.amazonaws.com`) mengembalikan HTTP 403 pada 19 Sep 2026, sehingga `circuits/scripts/setup.sh` membangkitkan Powers of Tau 2¹⁷ secara lokal — artinya BAIK phase-1 (ptau) MAUPUN phase-2 (zkey) dihasilkan secara lokal oleh SATU pihak (penulis), bukan dari ceremony publik.** Konsekuensinya nyata: pemegang *toxic waste* dari ceremony ini bisa memalsukan bukti Groth16 dan menuntut penalti palsu — tetapi kontrak membatasi kerugian maksimum: `AegisChannel.claimPenalty`/`settle` menegakkan **`payToClient ≤ A`** (`A` = `cumulativeAmount`, jumlah yang sudah di-ack kedua pihak) secara on-chain, terlepas dari apa yang dikatakan verifier (FR-18; diuji `test_fr18_exceeds_cumulative_reverts_even_if_verifier_says_true` di `contracts/test/Penalty.t.sol`) — bukti palsu tidak bisa mencetak dana di luar deposit channel yang bersangkutan.

Mitigasi sebelum ada dana non-demo di mainnet:
1. **Prosedurnya** terdokumentasi dan dapat diulang (`circuits/scripts/setup.sh`: `powersoftau new/contribute/beacon/prepare phase2/verify` → `groth16 setup` → `zkey contribute/beacon/verify`), termasuk nilai *beacon* yang dipakai (`0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`, hardcoded di skrip). **Artefaknya TIDAK dapat direproduksi bit-per-bit:** kedua langkah `contribute` (ptau dan zkey) menarik entropi dari `/dev/urandom` (`entropy()` di skrip), jadi menjalankan ulang skrip menghasilkan ptau/zkey/verifier yang **berbeda** — yang bisa diverifikasi pihak lain adalah konsistensi artefak yang dirilis (`snarkjs powersoftau verify`, `snarkjs zkey verify` terhadap `sla_settlement.r1cs`, dan kecocokan `verification_key.json` ↔ `SLASettlementVerifier.sol`), bukan bahwa *toxic waste*-nya telah dibuang. **Catatan jujur:** beacon tersebut adalah nilai tetap/placeholder, bukan diambil dari sumber acak publik (mis. hash blok Bitcoin/Ethereum masa depan) — bukan ceremony production-grade.
2. **Wajib sebelum ada dana non-demo di mainnet:** ceremony phase-1 dari sumber publik yang terverifikasi (atau ptau Hermez asli begitu mirror bisa diakses) **dan** phase-2 dengan ≥ 3 kontributor independen — atau
3. Alternatif D6 (belum diimplementasikan): PLONK universal (snarkjs, tanpa phase-2 khusus sirkuit), dengan biaya verifikasi ≈ +50–100% gas.

**Nyatakan ini di pitch sebelum ditanya.**

### Regenerasi zkey

```bash
cd circuits
bash scripts/setup.sh
```

Perilaku default: jika `build/sla_final.zkey` sudah ada, phase-2 **dilewati** (idempotent). Untuk memaksa regenerasi:

```bash
FORCE_SETUP=1 bash scripts/setup.sh
```

**Peringatan:** `FORCE_SETUP=1` menjalankan phase-2 baru dengan entropi acak baru → menghasilkan `sla_final.zkey`, `verification_key.json`, **dan** `contracts/src/SLASettlementVerifier.sol` yang **berbeda** dari yang sebelumnya (kunci Groth16 baru = verifier Solidity baru). Setiap kontrak `AegisChannelFactory` yang sudah di-deploy dengan verifier lama **tidak kompatibel** dengan zkey baru, dan **fixture bukti** `contracts/test/fixtures/ex1_verifier.json` (snapshot bukti EX1 + input publik yang dipakai `Verifier.t.sol`) harus dibangkitkan ulang bersamanya sebelum di-commit — bukti lama tidak akan lolos verifier baru. Vektor settlement di `vectors/` (EX1 dkk.) **tidak** bergantung pada zkey (mereka hanya menguji fungsi penalti §6.3 di Python/SDK/sirkuit) dan tidak perlu diubah. `circuits/ptau/` juga di-`.gitignore`; skrip memakai ptau lokal yang ada bila sudah ada, dan membangkitkan yang baru bila tidak. Jangan jalankan `FORCE_SETUP=1` setelah deploy testnet/mainnet tanpa berencana men-deploy ulang seluruh factory.

`circuits/build/sla_final.zkey` (≈101 MB) sengaja **tidak** ter-commit (`.gitignore`) — lihat [Release artefacts](#release-artefacts) untuk cara mendapatkannya tanpa menjalankan ulang setup.

## Prior art

*(spec §1 — prior art yang harus disebut di pitch, disalin apa adanya)*

| Hal | Sudah ada | Klaim AegisClear yang sah |
|---|---|---|
| Escrow job antar-agen dengan evaluator | **ERC-8183 Agentic Commerce** (draft, Feb 2026): `createJob/fund/submit/complete/reject/claimRefund`, evaluator tunggal, terminal biner, fee split, integrasi ERC-8004 | AegisClear tidak menemukan escrow agen. Yang baru: evaluator = sirkuit (trustless), payout **proporsional** dari skedul penalti, syarat & telemetri **privat**, dan channel prabayar untuk banyak unit — bukan satu job |
| Identitas & validasi agen | **ERC-8004 Trustless Agents**: Identity/Reputation/Validation registry; menyebut zkML, TEE, re-eksekusi berjamin | AegisClear tidak membangun registry. Hasil settlement dirancang menjadi sinyal reputasi 8004 (FR-28, roadmap) |
| Pembayaran berbasis pemakaian | **x402 `upto`** (klien tanda tangan maksimum, server settle aktual — Permit2), **MPP `session`** (deposit & refund otomatis sisa) | Keduanya tetap *pay-then-trust*; tidak ada adjudikasi. AegisClear menyisipkan escrow + bukti di antara deposit dan pelepasan |
| Rel M2M di Robinhood Chain | **MeshGateway**: x402/MPP, USDG via Permit2 witness transfer (USDG tidak punya EIP-3009), MeshIdentity ERC-8004, facilitator terbuka | AegisClear tidak membangun rel. `payTo` = alamat channel memakai proxy Permit2 kanonik **tanpa perubahan** (§10.2) |
| Escrow dengan adjudikasi | **Kleros Escrow** (juri manusia), **UMA Optimistic Oracle** (asersi + bond + sengketa) | Keduanya manusia/optimistik dan publik. AegisClear deterministik dan privat; tidak ada bond arbitrase |
| ZK di Stylus | **Renegade** (PLONK verifier produksi di Stylus), **zk-sunade** (Groth16 di Stylus, 256k gas), **ZeroStyl** (toolkit privasi Stylus — verifikasi Hari 1, V16), **OpenZeppelin `openzeppelin-crypto` Poseidon2** (11.887 gas) | AegisClear memakai Stylus hanya untuk Poseidon on-chain, dengan angka yang diukur sendiri |
| Payment channel | Raiden / Perun / state channel generik | Pola checkpoint co-signed + jendela tantangan diambil dari sana dan **dikreditkan**; kontribusi ada di objek yang di-channel-kan (receipt SLA) dan penyelesaiannya (bukti) |

## Deploy ke testnet 46630

Salin `.env.example` → `.env`, isi `PK_DEPLOYER`/`PK_PROVIDER`/`PK_CLIENT_A`/`PK_CLIENT_B` dengan private key yang didanai ETH uji Robinhood testnet (faucet: `faucet.quicknode.com/robinhood/testnet` atau `faucets.chain.link/robinhood-testnet`), lalu:

```bash
set -a; source .env; set +a
```

### (a) Deploy + verifikasi Blockscout

```bash
cd contracts
forge script script/DeployTestnet.s.sol --rpc-url $RPC_URL --broadcast --private-key $PK_DEPLOYER \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
cat deployments/testnet-46630.json
cd ..
```

Hasil yang diharapkan: 5 alamat (`usdg`, `verifier`, `factory`, `factoryProd`, `escrow`) di `contracts/deployments/testnet-46630.json`, dan halaman explorer masing-masing kontrak menampilkan source terverifikasi. **Jangan commit file ini** (sudah di `.gitignore`) — isi tabel di [Alamat kontrak](#alamat-kontrak) secara manual dari isinya untuk dibagikan di pitch/submission.

Jika `--verify` gagal saat broadcast (mis. timeout explorer), ulangi per kontrak:

```bash
forge verify-contract <alamat> <NamaKontrak> --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/ --chain-id 46630
```

### (b) Mint MockUSDG ke akun klien

```bash
export USDG=<alamat "usdg" dari deployments/testnet-46630.json>
cast send $USDG "mint(address,uint256)" "$(cast wallet address --private-key $PK_CLIENT_A)" 100000000 \
  --rpc-url $RPC_URL --private-key $PK_DEPLOYER
cast send $USDG "mint(address,uint256)" "$(cast wallet address --private-key $PK_CLIENT_B)" 100000000 \
  --rpc-url $RPC_URL --private-key $PK_DEPLOYER
```

(`MockUSDG.mint` tidak dibatasi hak akses — pengirim tx mana pun boleh dipakai, `PK_DEPLOYER` dipilih agar konsisten dengan langkah (a). 100000000 = 100 USDG pada 6 desimal.)

### (c) Jalankan test integrasi terhadap testnet

Jalankan dari **root repo** (`pnpm --filter` mengeksekusi script `test` dengan cwd pindah ke `sdk/`, tetapi `DEPLOY_FILE` di `sdk/test/integration.test.ts` diresolve terhadap root repo — bukan cwd proses — jadi path relatif di bawah ini valid dari root repo apa adanya):

```bash
DEPLOY_FILE=contracts/deployments/testnet-46630.json CHAIN_ID=46630 RPC_URL=$RPC_URL \
  pnpm --filter @aegisclear/sdk test -- integration
```

Alternatif dengan path absolut (setara, kalau ragu soal direktori mana yang jadi acuan):

```bash
DEPLOY_FILE="$(pwd)/contracts/deployments/testnet-46630.json" CHAIN_ID=46630 RPC_URL=$RPC_URL \
  pnpm --filter @aegisclear/sdk test -- integration
```

Jika `DEPLOY_FILE` salah eja/tidak ada, test tidak diam-diam ter-skip — konsol mencetak `integration: deploy file not found at <path> — suite skipped` sebelum vitest melaporkan 0 test.

Hasil yang diharapkan: test "kooperatif" (`PK_CLIENT_A`) dan "sengketa" (`PK_CLIENT_B`, termasuk bukti ZK asli + `settle()`) **PASS** di chain `46630`, ±3–4 menit karena jendela tantangan 120 s ditunggu secara nyata (bukan `evm_increaseTime`). Tx hash channel B (test sengketa) adalah bukti liveness untuk submission. Test lain di file ini (`/close`, tiket keluar unilateral, watcher in-process) memakai akun Anvil hardcode di luar `PK_CLIENT_A/B` dan **tidak** dirancang untuk lulus di testnet tanpa pendanaan tambahan — ini konsisten dengan cakupan Task 17.

### (d) Menjalankan provider (watcher in-process) & watcher permissionless

Provider **wajib** menjalankan `startProviderWatcher` di proses yang sama dengan `createProviderApp` (memori co-signed checkpoint hanya hidup di proses itu — lihat komentar di `sdk/src/watcher/cli.ts`); tanpa ini provider tidak punya perlindungan T1 terhadap checkpoint basi (Task 15). Contoh proses provider (adaptasi dari `demo/run.ts`, ganti `foundry`/RPC lokal dengan `defineChain`/`$RPC_URL` seperti di `sdk/test/integration.test.ts`):

```ts
import { serve } from "@hono/node-server";
import { createWalletClient, createPublicClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createProviderApp } from "@aegisclear/sdk";

const chain = defineChain({ id: 46630, name: "robinhood-testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [process.env.RPC_URL!] } } });
const publicClient = createPublicClient({ chain, transport: http(process.env.RPC_URL) });
const account = privateKeyToAccount(process.env.PK_PROVIDER as `0x${string}`);
const walletClient = createWalletClient({ account, chain, transport: http(process.env.RPC_URL) });

const { app, startProviderWatcher } = createProviderApp({
  ctx: { publicClient, walletClient, chainId: 46630, factory: process.env.FACTORY as `0x${string}` },
  account, usdg: process.env.USDG as `0x${string}`,
  terms: { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: /* … */ 0n },
  unitQty: 1n, deposit: 1_000_000n, challengeWindow: 120, responseWindow: 60,
  metrics: (seq) => ({ m1: 300n, m2: 95n }),
});
// T1: responder challenge in-process. fromBlock = blok deployment factory (lihat contracts/broadcast/DeployTestnet.s.sol/46630/run-latest.json
// atau explorer): Watcher.scan() memanggil eth_getLogs(ChannelOpened) dari fromBlock sampai latest pada SETIAP tick; default 0n
// memindai seluruh riwayat chain, dan RPC publik umumnya membatasi rentang blok per eth_getLogs (mis. 10k–50k blok) atau
// jumlah log per respons — tanpa fromBlock yang benar scan() akan gagal (tick tetap memproses channel yang sudah dikenal, tapi
// channel baru tidak pernah ditemukan).
startProviderWatcher({ intervalMs: 60_000, fromBlock: BigInt(process.env.FACTORY_BLOCK!) });
serve({ fetch: app.fetch, port: 4020 });
```

Watcher permissionless terpisah (`sdk/src/watcher/cli.ts`) — settle setelah deadline + sweep dana telat, boleh dijalankan siapa pun (klien, provider, atau pihak ketiga), **tidak** menggantikan `startProviderWatcher` di atas — keempat env var wajib ada (`FROM_BLOCK` opsional tetapi disarankan di RPC publik, alasan yang sama seperti `fromBlock` di atas; default 0):

```bash
RPC_URL=$RPC_URL FACTORY=<alamat "factory" dari deployments/testnet-46630.json> PRIVATE_KEY=$PK_PROVIDER CHAIN_ID=46630 \
  FROM_BLOCK=<blok deployment factory> npx tsx sdk/src/watcher/cli.ts
```

## Release artefacts

`circuits/build/sla_final.zkey` (≈101 MB, 100.834.787 byte) **tidak di-commit** ke git (lihat `.gitignore`) — terlalu besar untuk repo, dan **tidak bisa dibangkitkan ulang secara identik** dari `circuits/scripts/setup.sh` (kontribusi menarik entropi dari `/dev/urandom`; menjalankan ulang setup menghasilkan zkey + verifier baru yang tidak cocok dengan yang di-commit — lihat "Trusted setup & regenerasi zkey"). Karena itu berkas ini harus didistribusikan, bukan diregenerasi: unggah sebagai GitHub Release bertag **`v0.1.0-zkey`** dengan tiga berkas terlampir:

- `circuits/build/sla_final.zkey` (≈101 MB) — satu-satunya dari ketiganya yang **tidak** ada di git; wajib diunggah agar pihak lain bisa membangkitkan bukti (`snarkjs groth16 fullprove` / `circuits/scripts/prove.ts`) tanpa re-run trusted setup.
- `circuits/build/verification_key.json` — sudah ter-commit di repo; disertakan lagi di rilis agar bundel self-contained.
- `contracts/src/SLASettlementVerifier.sol` — sudah ter-commit di repo; disertakan lagi agar konsumen rilis bisa memverifikasi kecocokan verifier on-chain vs `verification_key.json` tanpa checkout repo.

**Tautan rilis:** _(diisi setelah pemilik repo mengunggah `v0.1.0-zkey` — langkah ini di luar cakupan yang bisa dijalankan tanpa akses GitHub dari lingkungan implementasi)._
