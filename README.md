# AegisClear

Escrow & penyelesaian sengketa privacy-preserving untuk pembayaran agen-ke-agen (x402/MPP) dalam USDG, diadili oleh bukti Groth16 (zero-knowledge) — di Robinhood Chain (Arbitrum Dedicated Chain / Nitro), mainnet `4663` / testnet `46630`.

Spesifikasi lengkap: [`prd-arsitektur.md`](./prd-arsitektur.md). Log toolchain & pengukuran per-task: [`docs/TOOLCHAIN.md`](./docs/TOOLCHAIN.md).

**Status implementasi:** kontrak, sirkuit, dan SDK lengkap dan lulus seluruh suite lokal (Anvil + Foundry + circuits). **Deploy v2 ke testnet 46630 — implementasi P1 dengan epoch/rollover (FR-10), payout hook via `AegisTreasuryRouter` (FR-26), dan anchored mode (FR-25), pada bytecode yang sudah memuat hardening audit (`docs/audit/slither-2026-09.md`) — sudah di-broadcast dan 7/7 kontrak terverifikasi di Blockscout (20 Sep 2026, blok 122.028.843 = `0x746032b`)**, menggantikan deploy v1 (pra-audit) dan v0/P0 (keduanya didokumentasikan sebagai riwayat, lihat [deploy v1](#deploy-v1-riwayat-20-sep-2026) dan [deploy v0](#deploy-v0-riwayat-20-sep-2026)). Program Stylus `AegisPoseidon` (port circomlib Poseidon v1, dioptimasi) **aktif on-chain** di `0x1027cf7DC26152012ed9Ef949Aa1432Bf1C7ef34` dan dipakai `factoryAnchored`. Test integrasi SDK terhadap 46630 (deploy v2): **15 lulus, 4 dilewati otomatis** (test yang memakai akun Anvil #4/#5 hardcode, tidak dirancang jalan di luar chain id `31337`) — tx bukti liveness ada di tabel [Alamat kontrak](#alamat-kontrak). Release proving key: [`v0.1.0-zkey`](https://github.com/mdlog/AegisClear/releases/tag/v0.1.0-zkey). Gas Stylus vs Yul terukur on-chain dengan Poseidon **v1 kompatibel-sirkuit** (`docs/benchmarks/poseidon.md`) — D2: Stylus dipertahankan untuk anchored mode (P1), rasio **1,75× total / ≈1,9× eksekusi** pada jalur 7-hash `ack`.

## Lihat di browser (web console)

```bash
# Lokal (Anvil 8545 + DeployLocal sudah jalan, zkey ada di circuits/build/):
pnpm web                                  # = pnpm --filter @aegisclear/web start → http://localhost:4040
# Testnet 46630 (butuh RPC_URL, PK_PROVIDER, PK_CLIENT_A, PK_CLIENT_B, PK_DEPLOYER di .env — dibaca otomatis):
AEGIS_NETWORK=testnet pnpm web
```

Mode local mengabaikan `RPC_URL` non-localhost (jatuh ke Anvil `127.0.0.1:8545` + catatan sekali di log) dan menolak start bila chain id yang benar-benar dilayani RPC ≠ 31337 (atau ≠ chain id testnet di mode testnet). Server hanya mendengarkan di `127.0.0.1`; set `WEB_HOST=0.0.0.0` untuk mengekspos (semua endpoint tanpa autentikasi, kunci demo ada di proses ini).

Halaman `http://localhost:4040` (port `WEB_PORT`) memuat: **dashboard channel** (semua `ChannelOpened` di factory deployment, state/seq/A/budget/deadline/bukti, klik untuk detail + event), **panel demo** Pasar A vs Pasar B — tombol menjalankan skenario §14 di server (provider, klien A/B, proving Groth16 semuanya di proses Node; tidak ada wallet di browser) dan men-stream langkahnya (SSE) dengan tautan explorer, lalu tabel perbandingan, kartu **"privat"** (syarat & metrik yang tidak pernah masuk chain) vs **"yang dilihat chain"** (T, R, A, payToClient) dan tombol **leak-check**; serta JSON 402 mentah yang dilihat klien x402. Provider yang sama di-mount di `http://localhost:4040/provider` (`GET /job` → 402) lengkap dengan challenge responder in-process. Pengembangan UI: `pnpm web:dev` (Vite di :4043, proxy ke :4040). API: `GET /api/config`, `/api/channels`, `/api/channels/:addr`, `POST /api/demo/run {scenario}`, `GET /api/demo/runs`, `/api/demo/runs/:id`, `/api/demo/runs/:id/events` (SSE), `/api/demo/leak-check/:runId`, `/api/offer?client=A|B`.

Sejak deploy v1 (20 Sep 2026; kini v2), `AEGIS_NETWORK=testnet` otomatis memakai alamat di `contracts/deployments/testnet-46630.json` (`factory`, `factoryProd`, `factoryAnchored`, `router`, `poseidon`); dashboard channel memindai ketiga factory sekaligus dan menandai setiap channel dengan factory asalnya, termasuk tag `factoryAnchored` untuk channel anchored (Stylus `AegisPoseidon`) — lihat [Rollover, treasury router, anchored mode](#rollover-treasury-router-anchored-mode).

**Diverifikasi di testnet v2 lewat API konsol (20 Sep 2026, `AEGIS_NETWORK=testnet`, semua enam skenario, leak-check `bocor 0 · ambigu 0` di setiap channel; angka baris identik dengan Anvil karena fungsi penalti deterministik — yang berbeda hanya gas dan waktu tunggu):**

| Skenario (tombol) | Baris hasil (klien / provider) | Gas siklus di 46630 | Proving | Durasi | Channel |
|---|---|---|---|---|---|
| `B-dispute` (klien B, 100 unit, 7 pelanggaran) | **0.07 / 1.93** | **575.544** — `fund` 56.876 · `submitCheckpoint` 114.159 · `claimPenalty` 304.432 · `settle` 100.077 (+ `open` oleh provider 310.235, di luar total) | 4.165 ms | 158 s | [`0x4B6F3c6d…bBd1`](https://explorer.testnet.chain.robinhood.com/address/0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1) (leak-check 5 tx) |
| `B-anchored-dispute` (klien A, 20 `ack` on-chain, Stylus) | **0.02 / 0.38** | **4.799.914** — `fund` 56.214 · `ack` pertama 349.751 lalu 201.020–210.087 (×19) · `startClose` 63.108 · `claimPenalty` 304.420 · `settle` 100.077 (+ `open` 308.476); Anvil/Yul untuk siklus yang sama: 6.766.593 | 3.404 ms | 140 s | [`0xAD30BC16…879c`](https://explorer.testnet.chain.robinhood.com/address/0xAD30BC162CCd7cB7680760b4a6181186A28d879c) (leak-check 25 tx) |
| `B-rollover` (klien B, 128 + 5 unit, 1 deposit) | **0.00 / 2.66** | **298.821** — `fund` 56.214 · `rollover` 137.539 · `closeCooperative` 105.068 (+ `open` 308.526) | — | 135 s | [`0xD1F69213…2b1D`](https://explorer.testnet.chain.robinhood.com/address/0xD1F69213799aDbc595ff8Eae6B8C20f917a22b1D) (`epoch` 1, `seq` 5; leak-check 4 tx) |
| `B-cooperative` (klien A, 100 unit) | **0.00 / 2.00** | **182.452** — `fund` 57.688 · `closeCooperative` 124.764 (+ `open` 312.398) | — | 96 s | [`0x66C493f7…05dC`](https://explorer.testnet.chain.robinhood.com/address/0x66C493f712648419C11Ab8f21f8C6b0A21ff05dC) (leak-check 3 tx) |
| `A-complete` (escrow biner, kontrol) | **0 / 2.00** | **384.176** — `approve` 52.441 · `createJob` 132.604 · `fund` 109.987 · `submit` 37.082 · `complete` 52.062 | — | 13 s | `SimpleJobEscrow` |
| `A-reject` (escrow biner, kontrol) | **2.00 / 0** | **367.017** — `approve` 52.441 · `createJob` 115.482 · `fund` 109.999 · `submit` 37.094 · `reject` 52.001 | — | 13 s | `SimpleJobEscrow` |

Durasi memuat jendela tantangan nyata (60 s) dan ~2,5 s per blok konfirmasi; run ini dijalankan lewat `POST /api/demo/run` + `GET /api/demo/runs/:id` (bukan klik di browser — ekstensi browser tidak tersedia di sesi verifikasi), sehingga yang belum diverifikasi hanyalah rendering UI-nya di testnet, bukan datanya.

## Daftar isi
- [Lihat di browser (web console)](#lihat-di-browser-web-console)
- [Ringkasan produk](#ringkasan-produk)
- [Rollover, treasury router, anchored mode](#rollover-treasury-router-anchored-mode)
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
3. **Payout ke alamat bebas** — `payoutClient`/`payoutProvider` ditetapkan saat `open` dan boleh berupa brankas armada, Safe, atau smart account ERC-4337, bukan hot wallet agen. Di P1, `AegisTreasuryRouter` (pemetaan agen → treasury per armada, spec §8.4) **sudah diimplementasikan dan live di testnet 46630** — lihat [Rollover, treasury router, anchored mode](#rollover-treasury-router-anchored-mode) di bawah.

Konteks singkat: agen otonom di Robinhood Chain sudah saling membayar hari ini lewat rel x402/MPP `exact` (bayar dulu, terima kemudian, tanpa recourse). Untuk pekerjaan mesin bernilai puluhan–ribuan dolar, pola *pay-first* itu membuat pembeli menanggung seluruh risiko wanprestasi. AegisClear menyisipkan escrow + bukti ZK di antara deposit dan pelepasan dana, tanpa membuka harga satuan, ambang SLA, atau telemetri ke chain publik (§6.7).

## Rollover, treasury router, anchored mode

*(P1 — spec §5.6, §8.3, §8.4; live di testnet 46630 deploy v2, lihat [Alamat kontrak](#alamat-kontrak))*

Tiga kapabilitas baru di atas channel P0 (fund → checkpoint → settle), dari sudut pandang integrator SDK:

1. **Rollover epoch (FR-10).** Satu epoch channel co-signed dibatasi `MAX_SEQ = 128` unit; provider menolak unit ke-129 dengan `409 epoch-full`. Klien memanggil `await client.rollover()` (`AegisClient.rollover()`, `sdk/src/client/agent.ts`): menandatangani `Rollover(epoch, seq, toProvider)` (EIP-712) dan mengirimkannya ke `POST /rollover` provider, yang membalas dengan tanda tangannya sendiri atas `Rollover` **dan** tiket keluar pra-tanda-tangan untuk epoch berikutnya — `Checkpoint(epoch+1, seq=0, cumulativeAmount=0, receiptsRoot=emptyRoot)` (`exitSigNext`), **bukan** `Close` — yang klien WAJIB verifikasi SEBELUM mem-broadcast tx `rollover()` on-chain sama sekali (mencegah provider menyandera sisa budget epoch baru dengan menahan balasan konfirmasi setelah tx klien ter-mined; tiket ini aman ditandatangani di muka karena inert sampai epoch benar-benar naik, yang mensyaratkan tanda tangan Rollover provider itu sendiri). Setelah tx `rollover()` masuk (epoch bertambah 1, sisa deposit epoch lama jadi budget epoch baru, `seq`/`R`/`A` di-reset ke nol), klien memanggil `POST /rollover/confirm` sebagai sinkronisasi idempoten sisi provider (boleh ikut membalas tiket yang sama; klien memakai versi pra-tanda-tangannya). Aman dipanggil ulang: tx `rollover` yang sudah tercatat tidak dikirim ulang, dan bila epoch sudah naik on-chain lebih dulu (mis. percobaan sebelumnya sempat mengirim tx tapi terputus), `rollover()` melewati pengiriman tx dan langsung ke konfirmasi. Dibuktikan di skenario 11 (lihat tabel liveness di bawah).
2. **Treasury router (FR-26).** `AegisTreasuryRouter` memisahkan alamat payout channel dari treasury operasional agen: provider mengarahkan payout-nya lewat `ProviderOptions.payoutProvider = <alamat router>` (`createProviderApp`), dan agen (EOA, Safe, atau akun 4337 — siapa pun `msg.sender`) memanggil `AegisTreasuryRouter.setTreasury(treasury)` on-chain untuk mengatur treasury-nya **sendiri** (bukan `setTreasury(agent, treasury)` — router tidak bisa mengatur treasury pihak lain). Bila belum diset, `onPayout` meneruskan dana ke agen itu sendiri. Tanpa custody: penerusan terjadi dalam transaksi yang sama; bila transfer ke treasury gagal (mis. dibekukan), jumlahnya tercatat sebagai kredit yang bisa ditarik lewat `claim()`. **Peringatan (I2):** `onPayout` permissionless — hanya channel (lewat hook `_send`, dipanggil dengan stipend `HOOK_GAS` tepat setelah token benar-benar berpindah) yang dimaksud sebagai pemanggil; token yang mendarat di alamat router DI LUAR jalur itu (transfer langsung) tidak diatribusikan otomatis dan bisa diklaim siapa pun lewat `onPayout(party, token, amount)` dengan `party` pilihannya sendiri — **jangan pernah mengirim token langsung ke alamat router**. Catatan gas: `HOOK_GAS` = 300k (margin proxy USDG bergaya Paxos, lihat `AegisChannel.HOOK_GAS`), dan `_send` menolak (`InsufficientGas`) bila gas tersisa tidak cukup untuk meneruskan stipend penuh (aturan 63/64 EIP-150 — temuan M-1 audit), sehingga hook tidak bisa dibuat kelaparan gas oleh pemanggil `settle`/`close`; keduanya sudah ada di bytecode testnet v2 (deploy v1 memakai 150k tanpa guard). Dibuktikan di skenario 13.
3. **Anchored mode (FR-25).** Alternatif checkpoint off-chain untuk job bernilai tinggi/frekuensi rendah yang tidak mau bergantung pada asumsi liveness channel: provider dijalankan dengan `ProviderOptions.anchored = true` di atas `factoryAnchored` (`POSEIDON` = program Stylus `AegisPoseidon`, bukan `address(0)`); setiap unit di-*ack* lewat transaksi `ack(seq, leaf, cumulativeAmount, sigProvider)` on-chain, bukan checkpoint co-signed off-chain. Kontrak memasukkan `leaf` ke pohon Merkle inkremental kedalaman 7 (7 hash Poseidon t=3 per `ack`, `IPoseidonPath.insertPath`). **Yang bocor ke chain per ack: hash daun (`leaf = Poseidon(seq, qty, m1, m2, due)`) dan `cumulativeAmount`** — `qty`/`m1`/`m2`/`due` mentah dan metrik SLA **tidak pernah** dikirim on-chain (hanya ditandatangani off-chain via EIP-712 `Leaf`), persis seperti mode co-signed (§6.7). Klien menurunkan mode ini dari `factory.POSEIDON()` on-chain, bukan dari klaim 402 mentah-mentah (T-mode — 402 yang bohong soal `anchored` ditolak `start()`). Dibuktikan di 4 skenario anchored (lihat tabel liveness); gas terukur di [Alamat kontrak](#alamat-kontrak) dan `prd-arsitektur.md` §8.7.

**Catatan operasional (M9, anchored/Stylus — T15 di `prd-arsitektur.md` §19/§649):** program Stylus kedaluwarsa setelah 365 hari tanpa panggilan sama sekali (`expiryDays`), dengan `keepaliveDays` = 31 sebagai ambang aman untuk memperbaruinya. Bila `AegisPoseidon` kedaluwarsa dan tidak sempat di-`keepalive`, setiap `ack()` anchored berhenti berfungsi (panggilan `insertPath` gagal) — **tapi dana TETAP bisa diselamatkan**: `startClose()` → `claimPenalty()` (opsional) → `settle()`, atau `closeCooperative()`, semuanya EVM murni dan tidak pernah memanggil `POSEIDON`. Watcher `keepalive` otomatis (menjaga `AegisPoseidon` tetap hidup tanpa campur tangan manual) **belum diimplementasikan di P1** — direncanakan P2; sampai saat itu, `keepalive` adalah operasi manual (lihat `prd-arsitektur.md` T15).

Gas anchored (`ack`) dibayar dengan Stylus di testnet 46630 (`factoryAnchored` menunjuk `AegisPoseidon`, D2 — lihat `docs/benchmarks/poseidon.md`); Yul (`PoseidonPathYul`) tetap tersedia sebagai Rencana B (Anvil/Foundry, atau chain lain tanpa Stylus).

## Alamat kontrak

### Testnet 46630 (Robinhood Chain) — deploy v2 (kontrak teraudit: epoch/rollover, payout hook, anchored mode)

Di-deploy 20 Sep 2026 dari `contracts/script/DeployTestnet.s.sol` (deployer `0x90351bB1E85a17D5f70c62C0cC076D39D897076D`, blok `122.028.843` = `0x746032b`, `POSEIDON_STYLUS=0x1027cf7DC26152012ed9Ef949Aa1432Bf1C7ef34`); semua source terverifikasi di Blockscout (7/7). Bytecode v2 memuat hasil audit `docs/audit/slither-2026-09.md`: `HOOK_GAS` = 300.000 **plus** guard `InsufficientGas` (M-1, `_send` — §8.1 spec), dua perbaikan Low Slither, dan cek zero-address di konstruktor factory. `contracts/deployments/testnet-46630.json` **di-commit** dan dibaca langsung oleh `AEGIS_NETWORK=testnet` (SDK, demo CLI, konsol web); tabel ini adalah salinannya.

| Kontrak | Variabel deploy | Alamat | Explorer |
|---|---|---|---|
| `MockUSDG` | `usdg` | `0x5A9BC1441DE45D7a722339Bec093637bc5042382` | [0x5A9BC144…](https://explorer.testnet.chain.robinhood.com/address/0x5A9BC1441DE45D7a722339Bec093637bc5042382) |
| `SLASettlementVerifier` | `verifier` | `0x2729cbdCd07719A40DC8d458ba7cDA5e40Afa405` | [0x2729cbdC…](https://explorer.testnet.chain.robinhood.com/address/0x2729cbdCd07719A40DC8d458ba7cDA5e40Afa405) |
| `AegisChannelFactory` (demo, co-signed, `MIN_CHALLENGE_WINDOW` = 60 s) | `factory` | `0x52773ab546e78828DDAbC4F3dA13eaCb167941B6` | [0x52773ab5…](https://explorer.testnet.chain.robinhood.com/address/0x52773ab546e78828DDAbC4F3dA13eaCb167941B6) |
| `AegisChannelFactory` (produksi, co-signed, `MIN_CHALLENGE_WINDOW` = 21.600 s / 6 jam) | `factoryProd` | `0xFB20a588750C700B9Bb5DD2e0278344bCd4e01E0` | [0xFB20a588…](https://explorer.testnet.chain.robinhood.com/address/0xFB20a588750C700B9Bb5DD2e0278344bCd4e01E0) |
| `AegisChannelFactory` (anchored — FR-25, `MIN_CHALLENGE_WINDOW` = 60 s, `POSEIDON` = Stylus `AegisPoseidon`) | `factoryAnchored` | `0xa53eC39546f5Fb743A02dF412F290c2A435E2B76` | [0xa53eC395…](https://explorer.testnet.chain.robinhood.com/address/0xa53eC39546f5Fb743A02dF412F290c2A435E2B76) |
| `AegisTreasuryRouter` (FR-26) | `router` | `0xE97dD3879B2aAe737b23B9219E5580EdB5Fae17A` | [0xE97dD387…](https://explorer.testnet.chain.robinhood.com/address/0xE97dD3879B2aAe737b23B9219E5580EdB5Fae17A) |
| `SimpleJobEscrow` (kontrol Pasar A, evaluator biner — §14) | `escrow` | `0x6ddac1F8df3d0d0C9160B55DF781db1303b4b02E` | [0x6ddac1F8…](https://explorer.testnet.chain.robinhood.com/address/0x6ddac1F8df3d0d0C9160B55DF781db1303b4b02E) |
| `AegisPoseidon` (Stylus — FR-25, circomlib Poseidon v1, port teroptimasi, 21,7 KB terkompresi, **aktif**; dipakai apa adanya oleh v1 dan v2) | `poseidon` | `0x1027cf7DC26152012ed9Ef949Aa1432Bf1C7ef34` | [0x1027cf7D…](https://explorer.testnet.chain.robinhood.com/address/0x1027cf7DC26152012ed9Ef949Aa1432Bf1C7ef34) |

**Yul twin di testnet (pembanding apples-to-apples untuk D2, bukan bagian deployment produksi — lihat `docs/benchmarks/poseidon.md`):**

| Kontrak | Alamat | Explorer |
|---|---|---|
| `PoseidonT3` (library, `poseidon-solidity`) | `0xd52e29197D7Fc27FB79240097B92a169408Ad3d1` | [0xd52e2919…](https://explorer.testnet.chain.robinhood.com/address/0xd52e29197D7Fc27FB79240097B92a169408Ad3d1) |
| `PoseidonPathYul` (`IPoseidonPath`, kembaran ABI dari `AegisPoseidon`, Rencana B bila `POSEIDON_STYLUS` kosong) | `0x804318aE7b0cFCE9e1995A84B7833d95B2713766` | [0x804318aE…](https://explorer.testnet.chain.robinhood.com/address/0x804318aE7b0cFCE9e1995A84B7833d95B2713766) |

#### Deploy v1 (riwayat, 20 Sep 2026)

Implementasi P1 pertama (blok `121.982.356` = `0x7454d94`; 7/7 terverifikasi), digantikan oleh deploy v2 di atas karena bytecode-nya mendahului hardening audit (`HOOK_GAS` = 150.000, tanpa guard `InsufficientGas`, tanpa dua perbaikan Low Slither). Tidak lagi dipakai `AEGIS_NETWORK=testnet`; `AegisPoseidon` Stylus yang sama dipakai ulang oleh v2. Bukti liveness v1 (13/13 lulus, 973 s) tersimpan di README pada commit `4144d3d`.

| Kontrak | Variabel deploy | Alamat | Explorer |
|---|---|---|---|
| `MockUSDG` | `usdg` | `0x7455E600be30C511175B410453E8a23dF52E94EF` | [0x7455E600…](https://explorer.testnet.chain.robinhood.com/address/0x7455E600be30C511175B410453E8a23dF52E94EF) |
| `SLASettlementVerifier` | `verifier` | `0x7B8ad2d9e848e4Ac62f6Df30283D50Df36D56273` | [0x7B8ad2d9…](https://explorer.testnet.chain.robinhood.com/address/0x7B8ad2d9e848e4Ac62f6Df30283D50Df36D56273) |
| `AegisChannelFactory` (demo, co-signed, `MIN_CHALLENGE_WINDOW` = 60 s) | `factory` | `0x596E9f218a0e73Cb8a22F5cDcb93FD681F24dAfF` | [0x596E9f21…](https://explorer.testnet.chain.robinhood.com/address/0x596E9f218a0e73Cb8a22F5cDcb93FD681F24dAfF) |
| `AegisChannelFactory` (produksi, co-signed, `MIN_CHALLENGE_WINDOW` = 21.600 s / 6 jam) | `factoryProd` | `0xf8e93aE5790a3484874963ADE7397Bc5006dFE5a` | [0xf8e93aE5…](https://explorer.testnet.chain.robinhood.com/address/0xf8e93aE5790a3484874963ADE7397Bc5006dFE5a) |
| `AegisChannelFactory` (anchored — FR-25, `MIN_CHALLENGE_WINDOW` = 60 s, `POSEIDON` = Stylus `AegisPoseidon`) | `factoryAnchored` | `0x1fB7d8E1445802508c1003aE4543467a3f7c6147` | [0x1fB7d8E1…](https://explorer.testnet.chain.robinhood.com/address/0x1fB7d8E1445802508c1003aE4543467a3f7c6147) |
| `AegisTreasuryRouter` (FR-26) | `router` | `0xe4A87335A54d50bf5E2afd830dc917b33b697689` | [0xe4A87335…](https://explorer.testnet.chain.robinhood.com/address/0xe4A87335A54d50bf5E2afd830dc917b33b697689) |
| `SimpleJobEscrow` (kontrol Pasar A, evaluator biner — §14) | `escrow` | `0xC4b08e8Fd02ef1549F129A509A04a8e6319fAb9C` | [0xC4b08e8F…](https://explorer.testnet.chain.robinhood.com/address/0xC4b08e8Fd02ef1549F129A509A04a8e6319fAb9C) |

#### Deploy v0 (riwayat, 20 Sep 2026)

Implementasi P0 (sebelum epoch/rollover, payout hook, anchored mode); digantikan oleh deploy v1 (di atas, riwayat) dan kemudian v2 (aktif); tidak lagi dipakai `AEGIS_NETWORK=testnet`. Di-deploy dari `contracts/script/DeployTestnet.s.sol` (deployer sama, blok `121.731.938` = `0x7417b62`); 7/7 source terverifikasi di Blockscout saat itu.

| Kontrak | Variabel deploy | Alamat | Explorer |
|---|---|---|---|
| `MockUSDG` | `usdg` | `0xCadd4526b6E7Beb640c3e920e80Ff28B327B5a83` | [0xCadd4526…](https://explorer.testnet.chain.robinhood.com/address/0xCadd4526b6E7Beb640c3e920e80Ff28B327B5a83) |
| `SLASettlementVerifier` | `verifier` | `0x5EC99814dF5A78ECB4dbC83f066FB62970847462` | [0x5EC99814…](https://explorer.testnet.chain.robinhood.com/address/0x5EC99814dF5A78ECB4dbC83f066FB62970847462) |
| `AegisChannelFactory` (demo, `MIN_CHALLENGE_WINDOW` = 60 s) | `factory` | `0x0922ee7D6D518681Fd94E98e56D3f161A0574ED3` | [0x0922ee7D…](https://explorer.testnet.chain.robinhood.com/address/0x0922ee7D6D518681Fd94E98e56D3f161A0574ED3) |
| `AegisChannelFactory` (produksi, `MIN_CHALLENGE_WINDOW` = 21.600 s / 6 jam) | `factoryProd` | `0x201BaC41758a45925E1eD7a9Ad79757F19337fDD` | [0x201BaC41…](https://explorer.testnet.chain.robinhood.com/address/0x201BaC41758a45925E1eD7a9Ad79757F19337fDD) |
| `SimpleJobEscrow` (kontrol Pasar A, evaluator biner — §14) | `escrow` | `0x5017C9e556bF750aEE1aB9e74aA094a91924964a` | [0x5017C9e5…](https://explorer.testnet.chain.robinhood.com/address/0x5017C9e556bF750aEE1aB9e74aA094a91924964a) |

**Bukti liveness di 46630 — deploy v2 (test integrasi SDK `sdk/test/integration.test.ts`, 20 Sep 2026; 15 lulus, 4 dilewati otomatis; semua channel skenario di bawah berakhir `SETTLED`, diverifikasi lewat `ChannelOpened` di kedua factory + pembacaan `state()`/`seq()`/`epoch()` on-chain):**

Factory co-signed (`factory`, demo):

| Skenario | Channel | Tx `open` |
|---|---|---|
| Kooperatif — klien A, 10 unit → provider +200.000, sisa 800.000 kembali | [`0xF66912ad…5BFB`](https://explorer.testnet.chain.robinhood.com/address/0xF66912ad90594b93930579Bf7c57011aF9195BFB) | [`0x82db54c3…9cba`](https://explorer.testnet.chain.robinhood.com/tx/0x82db54c3f2ed209eb9dbbaeb4eb8d2a79cf0e709e504a2cb6898aa20c2b29cba) |
| Sengketa — klien B, 1 pelanggaran + bukti Groth16 → 190.000 / refund 810.000 | [`0x4EC029e8…C61F`](https://explorer.testnet.chain.robinhood.com/address/0x4EC029e871D8fAaAD06Cbb349a7B044356E5C61F) | [`0x634d9d82…3dc9`](https://explorer.testnet.chain.robinhood.com/tx/0x634d9d82bc71f107b26ac6aee82735d5a18d6f213aaa9ad5a985273936943dc9) |
| Skenario 11 (FR-10) — epoch penuh → `rollover()` → lanjut epoch 1 → close (berakhir `epoch` = 1, `seq` = 5) | [`0xeeb6816A…BDe4`](https://explorer.testnet.chain.robinhood.com/address/0xeeb6816A5A5d65CE8403215465152B430A15BDe4) | [`0x90d00b2b…40c1`](https://explorer.testnet.chain.robinhood.com/tx/0x90d00b2bc357abfd3f259767f5ff019456a931fe3bef409c384c85525deb40c1) |
| F3 — klien B, `ClientPolicy` menolak qty di luar batas, keluar lewat tiket seq-0 | [`0x71c78849…3979`](https://explorer.testnet.chain.robinhood.com/address/0x71c78849D7A677791e42eb8F1Cf6625De1F43979) | [`0x62d431ab…65cf`](https://explorer.testnet.chain.robinhood.com/tx/0x62d431abcfd6c414bca0b1ea322be67b6a0241eb6813a47bb75ac674cb6865cf) |
| Skenario 13 (FR-26) — `payoutProvider` = `AegisTreasuryRouter`, treasury dibayar dalam tx `close` yang sama | [`0x75aC713F…bBfe`](https://explorer.testnet.chain.robinhood.com/address/0x75aC713F0f47F71Db0D1953a37D802264F98bBfe) | [`0x52fda9b1…2de2`](https://explorer.testnet.chain.robinhood.com/tx/0x52fda9b1746c87aa3a9c8e386da72f3496ec27fa1e6e53e08f0640998b6f2de2) |

Factory anchored (`factoryAnchored`, FR-25, Stylus `AegisPoseidon`):

| Skenario | Channel | Tx `open` |
|---|---|---|
| Sengketa anchored — 10 `ack` on-chain (1 pelanggaran) → `startClose` → bukti → settle 190.000 / 810.000 (run pertama; `Settled` on-chain benar, lihat catatan di bawah) | [`0x089821c0…9FB9`](https://explorer.testnet.chain.robinhood.com/address/0x089821c0E6C23d111d43aF3010cB8865dbeD9FB9) | [`0x807663e0…e848`](https://explorer.testnet.chain.robinhood.com/tx/0x807663e0000d3dd1271ce612afae9a18e37ad374da92bce75cb6b342f303e848) |
| Sengketa anchored — run ulang setelah assertion dibuat eventually-consistent (lulus, 194 s) | [`0x7B9E95b8…09b4`](https://explorer.testnet.chain.robinhood.com/address/0x7B9E95b85BbcDBB5c71C4D63eC41a5bCbB3109b4) | [`0x81c352b7…6c1e`](https://explorer.testnet.chain.robinhood.com/tx/0x81c352b711f562134352f890bfd6505dc20f03a8988c059cccbfb5f134546c1e) |
| Provider memanggil `startClose()` lebih dulu (CLOSING) — `dispute()` tetap lanjut ke bukti | [`0x21769167…1A71`](https://explorer.testnet.chain.robinhood.com/address/0x21769167942130a8F49807FAF675b3F0dd231A71) | [`0x6655dedc…7fa7`](https://explorer.testnet.chain.robinhood.com/tx/0x6655dedc0e04cd5dbeda1b0c1c7190f04d53d5b5248f0a9db02050798fcb7fa7) |
| Kooperatif anchored — 5 `ack` → close (klien menandatangani dulu) → provider +100.000 | [`0x33874317…50d6`](https://explorer.testnet.chain.robinhood.com/address/0x33874317E205C9D5264C77468d09024B0A1f50d6) | [`0x25331440…ee74`](https://explorer.testnet.chain.robinhood.com/tx/0x253314403945596ca25b9176dc8fd94cc5b4307e39a2375ba41f4065f996ee74) |
| Keluar unilateral anchored — provider tidak menjawab → `startClose` → settle, deposit kembali penuh | [`0xdB72fBbD…7ac5`](https://explorer.testnet.chain.robinhood.com/address/0xdB72fBbD557b6fD830329839db843c1125Ca7ac5) | [`0x6a36132c…36df`](https://explorer.testnet.chain.robinhood.com/tx/0x6a36132c49e8bd7078904f46dfe6b0b4e7bc71f2ff516b6e69ebdc55581a36df) |

Dua channel lain di `factory` — [`0xD9c20c4c…9ebA`](https://explorer.testnet.chain.robinhood.com/address/0xD9c20c4c6B8384ed88dd12689b4dFbCb6aB49ebA) dan [`0x9AA0C0c2…5e69`](https://explorer.testnet.chain.robinhood.com/address/0x9AA0C0c281338295505003B6D80017B56e335e69) — adalah artefak test negatif I1 (countersign `/rollover` tanpa `exitSigNext` ditolak **sebelum** tx apa pun dikirim) dan test konkurensi M6 (dua `POST /job` paralel tidak meng-korupsi pohon provider): keduanya dibuka dengan kunci sekali pakai, sengaja ditinggalkan `OPEN` (`seq` = 0, deposit 1 MockUSDG masing-masing), dan tidak pernah dipakai `AEGIS_NETWORK=testnet`.

Catatan run pertama: 14/15 lulus; satu assertion saldo pada sengketa anchored gagal karena load balancer RPC publik mengembalikan `balanceOf` **basi** tepat setelah receipt — settlement on-chain-nya benar (`Settled` 190.000 / 810.000, tx [`0x2c39b179…63d6`](https://explorer.testnet.chain.robinhood.com/tx/0x2c39b1791e6d1f3343e5df9ea8ec9b4d70cd2e84b2885206ff00e8cf417e63d6)). Sejak commit `f75f4f0` semua assertion saldo memakai polling eventually-consistent (`expectEventually`, 15 s), dan run ulang test itu lulus (channel kedua di tabel anchored).

Gas terukur di 46630 (deploy v2, proving Groth16 di klien ±4 s):
- **Sengketa co-signed** (klien B): `fund` **58.389** · `submitCheckpoint` **119.336** · `claimPenalty` **309.342** · `settle` **101.474**.
- **Sengketa anchored** (Stylus `AegisPoseidon`): `fund` **57.632** · `ack` pertama **352.421** (storage dingin), lalu **206.615–212.830** stabil (9 `ack` berikutnya) · `startClose` **64.045** · `claimPenalty` **307.625** · `settle` **100.988**.
- **Anchored `ack` di Anvil lokal** (jalur Yul, pembanding — bukan testnet): pertama **449.142**, stabil **≈303.400–309.400**.

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
git clone --recurse-submodules https://github.com/mdlog/AegisClear.git && cd AegisClear   # submodule: contracts/lib/*
pnpm install

# Artefak sirkuit yang TIDAK di-commit (circuits/build/* kecuali verification_key.json): r1cs + wasm witness generator
pnpm --filter @aegisclear/circuits build

# Proving key: unduh `sla_final.zkey` dari release `v0.1.0-zkey` ke circuits/build/ (lihat "Release artefacts"):
gh release download v0.1.0-zkey --repo mdlog/AegisClear -p sla_final.zkey -D circuits/build/
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

pnpm test:web   # butuh Anvil + DeployLocal seperti test SDK (RPC_URL untuk port lain)
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
- **Sesi tidak pernah dievict.** `sessions` (termasuk sesi yang sudah `SETTLED`) hidup selama proses; `GET /job` dari alamat baru membuat sesi (dan dua tanda tangan) tanpa batas — tanpa rate limit, ini vektor kehabisan memori pada provider publik. Konsekuensi kedua: setelah channel sebuah sesi `SETTLED`, `GET /job` klien yang sama masih menerima 402 lama dengan `payTo` = channel yang sudah selesai (konsol web menghapus sesi seperti itu sebelum run baru — `resetSession` di `web/server/demo.ts` — tetapi provider referensi tidak); token yang telanjur dikirim ke channel `SETTLED` tidak hilang — `sweep()` (permissionless) mengembalikannya ke `payoutClient`.
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

### (a) Deploy program Stylus `AegisPoseidon`, lalu kontrak + verifikasi Blockscout

`AegisChannelFactory` anchored (FR-25) butuh alamat program Stylus **sebelum** di-deploy — jalankan `cargo stylus deploy` lebih dulu:

```bash
cd stylus/aegis-poseidon
export CARGO_TARGET_DIR=/tmp/aegis-stylus-target   # partisi /home sering nyaris penuh, lihat docs/benchmarks/poseidon.md §2
cargo stylus deploy --endpoint $RPC_URL --private-key $PK_DEPLOYER
# catat alamat yang dicetak → testnet 46630: 0x1027cf7DC26152012ed9Ef949Aa1432Bf1C7ef34 (21,7 KB terkompresi, aktivasi lolos)
cd ../..
```

Lalu deploy kontrak Solidity dengan `POSEIDON_STYLUS` diisi alamat di atas (kosongkan variabelnya untuk memakai Rencana B `PoseidonPathYul` — lihat komentar di `.env.example`):

```bash
cd contracts
POSEIDON_STYLUS=0x1027cf7DC26152012ed9Ef949Aa1432Bf1C7ef34 \
  forge script script/DeployTestnet.s.sol --rpc-url $RPC_URL --broadcast --private-key $PK_DEPLOYER \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
cat deployments/testnet-46630.json
cd ..
```

Hasil yang diharapkan: 8 alamat (`usdg`, `verifier`, `factory`, `factoryProd`, `factoryAnchored`, `poseidon`, `escrow`, `router`) + `chainId`/`deployBlock` di `contracts/deployments/testnet-46630.json`, dan halaman explorer masing-masing kontrak (termasuk `AegisPoseidon`) menampilkan source terverifikasi. Script menjalankan known-answer check `hash2(1,2)` terhadap `poseidon` sebelum men-deploy `factoryAnchored` — wiring Poseidon yang salah gagal jelas di sini (`revert POSEIDON_STYLUS: wrong Poseidon`), bukan diam-diam menghasilkan root yang salah. **Jangan commit file ini** (sudah di `.gitignore`) — isi tabel di [Alamat kontrak](#alamat-kontrak) secara manual dari isinya untuk dibagikan di pitch/submission.

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
  pnpm --filter @aegisclear/sdk test -- integration --testTimeout=600000
```

Alternatif dengan path absolut (setara, kalau ragu soal direktori mana yang jadi acuan):

```bash
DEPLOY_FILE="$(pwd)/contracts/deployments/testnet-46630.json" CHAIN_ID=46630 RPC_URL=$RPC_URL \
  pnpm --filter @aegisclear/sdk test -- integration --testTimeout=600000
```

`--testTimeout=600000` (10 menit/test) diperlukan karena beberapa jendela tantangan (60 s/120 s) ditunggu secara nyata (bukan `evm_increaseTime`) dan default timeout vitest (5 s) jauh lebih pendek. Jika `DEPLOY_FILE` salah eja/tidak ada, test tidak diam-diam ter-skip — konsol mencetak `integration: deploy file not found at <path> — suite skipped` sebelum vitest melaporkan 0 test.

Hasil yang diharapkan (deploy v2, diverifikasi 20 Sep 2026): **15 test PASS** di chain `46630` — kooperatif & sengketa co-signed (`PK_CLIENT_A`/`PK_CLIENT_B`, termasuk bukti ZK asli + `settle()`), skenario 11 (rollover epoch), I1 negatif dan M6 konkurensi (kunci sekali pakai, channel ditinggalkan `OPEN`), F3 (ClientPolicy + tiket keluar), skenario 13 (treasury router), dan keempat skenario anchored (sengketa, provider-`startClose`-dulu, kooperatif, keluar unilateral) — total **±1.000 detik (~17 menit)**. Assertion saldo memakai polling eventually-consistent (15 s) karena load balancer RPC publik kadang mengembalikan `balanceOf` basi tepat setelah receipt. **4 test lain di-skip otomatis** di luar chain id `31337` (`it.skipIf(LOCAL_ONLY)`: `/close` seq basi, tiket keluar unilateral non-anchored, watcher in-process pengganti checkpoint basi, F2 balasan tanda tangan salah) karena memakai akun Anvil #4/#5 hardcode yang tidak berdana di testnet — ini bukan kegagalan, konsisten dengan cakupan Task 17. Tx `open`/`ack`/`claimPenalty` dari run ini adalah bukti liveness untuk submission — lihat tabel di [Alamat kontrak](#alamat-kontrak).

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

**Tautan rilis:** <https://github.com/mdlog/AegisClear/releases/tag/v0.1.0-zkey> (dibuat 20 Sep 2026 dari commit `0e24687`). Selain tiga berkas di atas, rilis juga melampirkan `sla_settlement.r1cs` (61 MB) dan `pot17_final.ptau` (151 MB, Powers of Tau 2^17 **lokal** — mirror publik 403 saat setup, §19 V14) supaya siapa pun bisa memverifikasi zkey, plus `SHA256SUMS`:

```bash
gh release download v0.1.0-zkey --repo mdlog/AegisClear -D /tmp/aegis-rel && (cd /tmp/aegis-rel && sha256sum -c SHA256SUMS)
npx snarkjs zkey verify circuits/build/sla_settlement.r1cs /tmp/aegis-rel/pot17_final.ptau /tmp/aegis-rel/sla_final.zkey
```

| Berkas | SHA-256 |
|---|---|
| `sla_final.zkey` | `dfb8395623080e403b8521efa8a26eb8886c7f277c87e303cdfb05d4728d1552` |
| `verification_key.json` | `9d915a7ecb7ed065d2b8330e00eac83bf98f51f83d1b6d9ac83f246f2ed8ec8e` |
| `SLASettlementVerifier.sol` | `03b5061a36f17cb3737d71c725562ec455bd3b002f2353a956361d325115eb1e` |
| `sla_settlement.r1cs` | `473f1e4cb2a9c89f65356e59d2a4d79fa9046bf0d0648908dd62079f6af4e1fb` |
