# AegisClear

Escrow & penyelesaian sengketa privacy-preserving untuk pembayaran agen-ke-agen (x402/MPP) dalam USDG, diadili oleh bukti Groth16 (zero-knowledge) — di Robinhood Chain (Arbitrum Dedicated Chain / Nitro), mainnet `4663` / testnet `46630`.

Spesifikasi lengkap: [`prd-arsitektur.md`](./prd-arsitektur.md). Log toolchain & pengukuran per-task: [`docs/TOOLCHAIN.md`](./docs/TOOLCHAIN.md).

**Status implementasi:** kontrak, sirkuit, dan SDK sudah lengkap dan lulus seluruh suite lokal (Anvil + Foundry + circuits, lihat "Menjalankan secara lokal" di bawah). **Deploy ke testnet 46630 belum di-broadcast** — skrip sudah divalidasi lewat dry-run simulation terhadap RPC testnet yang hidup (lihat `.superpowers/sdd/2026-09-19-aegisclear-mvp/task-17-report.md`), tetapi transaksi nyata memerlukan private key yang didanai ETH uji, yang merupakan keputusan pemilik repo untuk dijalankan sendiri. Bagian ["Deploy ke testnet 46630"](#deploy-ke-testnet-46630) berisi perintah persis yang perlu dijalankan.

## Daftar isi
- [Ringkasan produk](#ringkasan-produk)
- [Alamat kontrak](#alamat-kontrak)
- [Menjalankan secara lokal](#menjalankan-secara-lokal)
- [Peran & kendali (matriks akses)](#peran--kendali-matriks-akses)
- [Apa yang tetap bocor — dan apa yang tidak](#apa-yang-tetap-bocor--dan-apa-yang-tidak)
- [Trusted setup & regenerasi zkey](#trusted-setup--regenerasi-zkey)
- [Prior art](#prior-art)
- [Deploy ke testnet 46630](#deploy-ke-testnet-46630)
- [Release artefacts](#release-artefacts)

## Ringkasan produk

*(spec §0)*

AegisClear adalah evaluator itu. Ia adalah **sirkuit**, bukan manusia atau LLM:

1. **Micro-escrow state channel** — klien mendanai satu channel USDG per pasangan agen; setiap unit layanan menghasilkan *receipt* yang ditandatangani kedua pihak dan terakumulasi off-chain. Chain hanya melihat komitmen.
2. **ZK settlement** — jika klien menuntut penalti SLA, ia mengirim bukti Groth16 bahwa *"di bawah syarat yang berkomitmen di `termsCommitment` dan receipt di bawah `receiptsRoot` yang kami berdua tanda tangani, penalti yang sah adalah X"*. Kontrak memverifikasi (~194k gas) dan membagi dana **proporsional** — tanpa pernah melihat harga, ambang, atau metrik.
3. **Treasury routing** — payout diarahkan ke brankas armada / smart account ERC-4337, bukan ke hot wallet agen.

Konteks singkat: agen otonom di Robinhood Chain sudah saling membayar hari ini lewat rel x402/MPP `exact` (bayar dulu, terima kemudian, tanpa recourse). Untuk pekerjaan mesin bernilai puluhan–ribuan dolar, pola *pay-first* itu membuat pembeli menanggung seluruh risiko wanprestasi. AegisClear menyisipkan escrow + bukti ZK di antara deposit dan pelepasan dana, tanpa membuka harga satuan, ambang SLA, atau telemetri ke chain publik (§6.7).

## Alamat kontrak

### Testnet 46630 (Robinhood Chain)

Diisi dari `contracts/deployments/testnet-46630.json` setelah perintah [deploy](#deploy-ke-testnet-46630) dijalankan (file ini sengaja **tidak** ada di git — lihat `.gitignore` — karena isinya baru valid setelah broadcast nyata).

| Kontrak | Variabel deploy | Alamat | Explorer |
|---|---|---|---|
| `MockUSDG` | `usdg` | _diisi setelah deploy_ | `https://explorer.testnet.chain.robinhood.com/address/<alamat>` |
| `SLASettlementVerifier` | `verifier` | _diisi setelah deploy_ | `https://explorer.testnet.chain.robinhood.com/address/<alamat>` |
| `AegisChannelFactory` (demo, `MIN_CHALLENGE_WINDOW` = 60 s) | `factory` | _diisi setelah deploy_ | `https://explorer.testnet.chain.robinhood.com/address/<alamat>` |
| `AegisChannelFactory` (produksi, `MIN_CHALLENGE_WINDOW` = 21.600 s / 6 jam) | `factoryProd` | _diisi setelah deploy_ | `https://explorer.testnet.chain.robinhood.com/address/<alamat>` |
| `SimpleJobEscrow` (kontrol Pasar A, evaluator biner — §14) | `escrow` | _diisi setelah deploy_ | `https://explorer.testnet.chain.robinhood.com/address/<alamat>` |

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

Pipeline: `powersOfTau28_hez_final_17.ptau` (Hermez, atau ptau 2¹⁷ lokal bila mirror publik tidak tersedia — lihat catatan di bawah) → `snarkjs groth16 setup` → kontribusi phase-2 → beacon → `zkey`. **Untuk hackathon ini: satu kontributor (penulis).** Konsekuensinya nyata: pemegang *toxic waste* dari ceremony ini bisa memalsukan bukti Groth16 dan menuntut penalti palsu — tetapi kontrak membatasi kerugian maksimum: `AegisChannel.claimPenalty`/`settle` menegakkan **`payToClient ≤ A`** (`A` = `cumulativeAmount`, jumlah yang sudah di-ack kedua pihak) secara on-chain, terlepas dari apa yang dikatakan verifier (FR-18; diuji `test_fr18_exceeds_cumulative_reverts_even_if_verifier_says_true` di `contracts/test/Penalty.t.sol`) — bukti palsu tidak bisa mencetak dana di luar deposit channel yang bersangkutan.

Mitigasi sebelum ada dana non-demo di mainnet:
1. Transkrip ceremony — ptau final dan zkey final yang ada di repo/rilis (`circuits/ptau/`, `circuits/build/`) — dapat direproduksi ulang persis dari `circuits/scripts/setup.sh`, termasuk nilai *beacon* publik yang dipakai (`0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`, hardcoded di skrip). **Catatan jujur:** untuk hackathon ini beacon tersebut adalah nilai tetap/placeholder, bukan diambil dari sumber acak publik (mis. hash blok Bitcoin/Ethereum masa depan) — bukan ceremony production-grade.
2. Sebelum ada dana non-demo di mainnet: ceremony ≥ 3 kontributor independen.
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

**Peringatan:** `FORCE_SETUP=1` menjalankan phase-2 baru dengan entropi acak baru → menghasilkan `sla_final.zkey`, `verification_key.json`, **dan** `contracts/src/SLASettlementVerifier.sol` yang **berbeda** dari yang sebelumnya (kunci Groth16 baru = verifier Solidity baru). Setiap kontrak `AegisChannelFactory` yang sudah di-deploy dengan verifier lama **tidak kompatibel** dengan zkey baru, dan fixture uji (`contracts/test/fixtures/ex1_verifier.json`, vektor `EX1` dkk. di `vectors/`) harus dibangkitkan ulang bersamanya sebelum di-commit. Jangan jalankan `FORCE_SETUP=1` setelah deploy testnet/mainnet tanpa berencana men-deploy ulang seluruh factory.

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

```bash
DEPLOY_FILE=contracts/deployments/testnet-46630.json CHAIN_ID=46630 RPC_URL=$RPC_URL \
  pnpm --filter @aegisclear/sdk test -- integration
```

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
startProviderWatcher({ intervalMs: 60_000 });   // T1: responder challenge in-process
serve({ fetch: app.fetch, port: 4020 });
```

Watcher permissionless terpisah (`sdk/src/watcher/cli.ts`) — settle setelah deadline + sweep dana telat, boleh dijalankan siapa pun (klien, provider, atau pihak ketiga), **tidak** menggantikan `startProviderWatcher` di atas — keempat env var wajib ada:

```bash
RPC_URL=$RPC_URL FACTORY=<alamat "factory" dari deployments/testnet-46630.json> PRIVATE_KEY=$PK_PROVIDER CHAIN_ID=46630 \
  npx tsx sdk/src/watcher/cli.ts
```

## Release artefacts

`circuits/build/sla_final.zkey` (≈101 MB, 100.834.787 byte) **tidak di-commit** ke git (lihat `.gitignore`) — terlalu besar untuk repo dan dihasilkan deterministik dari `circuits/scripts/setup.sh`. Untuk mendapatkannya tanpa menjalankan ulang ceremony (~7–8 menit lokal), unggah sebagai GitHub Release bertag **`v0.1.0-zkey`** dengan tiga berkas terlampir:

- `circuits/build/sla_final.zkey` (≈101 MB) — satu-satunya dari ketiganya yang **tidak** ada di git; wajib diunggah agar pihak lain bisa membangkitkan bukti (`snarkjs groth16 fullprove` / `circuits/scripts/prove.ts`) tanpa re-run trusted setup.
- `circuits/build/verification_key.json` — sudah ter-commit di repo; disertakan lagi di rilis agar bundel self-contained.
- `contracts/src/SLASettlementVerifier.sol` — sudah ter-commit di repo; disertakan lagi agar konsumen rilis bisa memverifikasi kecocokan verifier on-chain vs `verification_key.json` tanpa checkout repo.

**Tautan rilis:** _(diisi setelah pemilik repo mengunggah `v0.1.0-zkey` — langkah ini di luar cakupan yang bisa dijalankan tanpa akses GitHub dari lingkungan implementasi)._
