# AegisClear P1 — Design: Web Console, Protokol P1 (rollover · treasury router · anchored mode/Stylus), Ship

**Tanggal:** 20 September 2026 · **Status:** menunggu review pemilik · **Spec induk:** `prd-arsitektur.md` v1.0 (P0 selesai, testnet 46630 live, D2 ditutup: Stylus hanya untuk anchored mode)

Dokumen ini adalah desain untuk tiga sub-proyek yang dieksekusi berurutan, masing-masing dengan plan sendiri:

| # | Sub-proyek | Deliverable yang bisa dilihat | Plan |
|---|---|---|---|
| A | **Web console** (`web/`) | `http://localhost:4040` — dashboard channel + panel demo A vs B + panel privasi, mode `local` (Anvil) & `testnet` (46630) | `2026-09-20-aegisclear-web-console.md` |
| B | **Protokol P1** | `rollover` + epoch (FR-10), `AegisTreasuryRouter` (FR-26), anchored mode + `AegisPoseidon` Stylus (FR-25); redeploy testnet; gas terukur | `2026-09-20-aegisclear-protocol-p1.md` |
| C | **Ship** | skenario baru di web console, audit Slither, spec v1.1, README, paket submission | `2026-09-20-aegisclear-ship.md` |

Yang **tidak** berubah: sirkuit `sla_settlement.circom`, zkey/verifier (release `v0.1.0-zkey`), fungsi penalti §6.3, aturan presedensi §6.4. Semua perubahan kontrak kompatibel dengan bukti yang ada (input publik bukti tetap `[channelIdField, T, R, seq, A, payToClient]`).

---

## A. Web console (`web/`)

### A.1 Tujuan & batas

Satu proses Node yang (1) **menyajikan halaman** yang bisa dibuka di browser, (2) **menjadi provider** AegisClear (Hono app dari SDK, di-mount di `/provider`), dan (3) **menjalankan skenario demo** A vs B atas permintaan halaman lalu men-stream langkahnya. Bukan wallet dApp: tidak ada signing di browser — kunci demo (provider, klien A, klien B) dipegang server persis seperti `demo/run.ts` dan `sdk/test/integration.test.ts`. Proving Groth16 tetap di Node (zkey 101 MB tidak dimuat ke browser).

Non-goal: multi-user, autentikasi, persistensi (state run hanya di memori proses), mainnet.

### A.2 Arsitektur

```
browser ──HTTP/SSE──▶ web/server (Hono, :4040)
                         ├─ /            static  web/dist (Vite build)   [dev: Vite :4041 proxy → :4040]
                         ├─ /provider/*  createProviderApp(...) + startProviderWatcher (responder T1 in-process)
                         └─ /api/*       config · channels · demo runs (SSE) · leak-check · offer
                                │
                                ├─ viem publicClient → RPC (local 8545 | testnet 46630)
                                └─ AegisClient (kunci A/B) + SimpleJobEscrow (Pasar A)  ← logika dari demo/run.ts
```

**Paket:** `web/` (pnpm workspace baru, `@aegisclear/web`), dua sisi:
- `web/server/*.ts` — Node 22, tsx, Hono 4, `@hono/node-server`, viem, `@aegisclear/sdk`, `@aegisclear/demo` (skenario di-refactor menjadi library, lihat A.5).
- `web/src/*` — Vite 6 + React 18 + TypeScript; tanpa framework CSS (satu `styles.css`, tema gelap, monospace untuk alamat); tanpa state library (hooks + `fetch`/`EventSource`).

**Port:** `WEB_PORT` default **4040** (server + halaman produksi). Dev: Vite **4041** dengan proxy `/api` dan `/provider` → 4040. Port 4020/4031 (test/demo CLI) tidak disentuh.

**Network profile** (`AEGIS_NETWORK`, default `local`):

| | `local` | `testnet` |
|---|---|---|
| RPC | `RPC_URL` ?? `http://127.0.0.1:8545` | `RPC_URL` (wajib) |
| chainId | 31337 (`foundry`) | 46630 (`defineChain`) |
| deployment | `contracts/deployments/local.json` | `contracts/deployments/testnet-46630.json` |
| kunci provider / A / B | anvil #2 / #1 / #3 (sama dengan `demo/run.ts`) | `PK_PROVIDER` / `PK_CLIENT_A` / `PK_CLIENT_B` (wajib) |
| kunci faucet (mint MockUSDG bila saldo klien < deposit) | anvil #0 | `PK_DEPLOYER` |
| jendela channel (provider app) | 120 s / 60 s + `evm_increaseTime` | 60 s / 30 s, tunggu nyata |
| explorer | — (tautan dinonaktifkan) | `https://explorer.testnet.chain.robinhood.com` |
| `fromBlock` scan | 0 | `deployBlock` dari deployment JSON (fallback `FACTORY_BLOCK`, lalu 0 — RPC testnet terbukti melayani `eth_getLogs` rentang penuh, diuji 20 Sep 2026) |

Server memuat `<repo>/.env` sendiri bila ada (parser 10 baris, hanya mengisi variabel yang belum ada di `process.env`) sehingga `pnpm --filter @aegisclear/web start` cukup.

### A.3 API server

Semua respons JSON (`bigint` → string). Alamat selalu checksum.

| Rute | Isi |
|---|---|
| `GET /api/config` | `{ network, chainId, rpcUrl, explorerBase, deployBlock, addresses: {usdg, factory, factoryProd, escrow, verifier, …}, provider, clients: [{label:"A", address}, {label:"B", address}], windows: {challenge, response}, terms: {unitPrice, maxM1, minM2, penaltyBps, capBps}, breaches: [3,17,29,44,58,71,90] }` — `terms`/`breaches` adalah nilai **privat off-chain** yang ditampilkan halaman dengan label "hanya diketahui kedua pihak"; nonce per sesi tidak dikirim. |
| `GET /api/channels` | `{ scannedAt, channels: [{ channel, factory, client, provider, termsCommitment, state, epoch?, seq, cumulativeAmount, budget, deadline, hasProof, payToClient, openedTx, openedBlock, runId? }] }` — union event `ChannelOpened` dari semua factory di deployment JSON (`factory`, `factoryProd`, dan nanti `factoryAnchored`), lalu `readChannel` + `cfg()` per channel; cache 3 s; `runId` bila channel dibuat oleh run di proses ini. |
| `GET /api/channels/:addr` | detail: semua field di atas + `cfg` lengkap + `events` (`CheckpointSubmitted`, `PenaltyClaimed`, `Settled`, `Swept`, `Funded`, ditambah `Acked`/`CloseStarted`/`RolledOver` setelah Plan B) dengan `txHash`, `blockNumber`, `gasUsed`. 404 bila bukan channel yang dikenal. |
| `POST /api/demo/run` `{scenario}` | `scenario ∈ {"B-cooperative","B-dispute","A-complete","A-reject","all"}` → `202 {runId}`. 409 `{error:"busy"}` bila ada run aktif; 409 `{error:"client-has-open-channel", channel}` bila sesi provider untuk klien itu masih punya channel non-SETTLED (lihat A.5). |
| `GET /api/demo/runs` | daftar ringkas 50 run terakhir. |
| `GET /api/demo/runs/:id` | snapshot `{ id, scenario, status: "running"\|"done"\|"error", startedAt, endedAt, steps: Step[], result?: Row[], error? }`. |
| `GET /api/demo/runs/:id/events` | SSE: setiap `Step` sebagai event `step`, lalu `done` (dengan `result`) atau `error`. Klien yang datang terlambat menerima replay seluruh `steps` dulu. |
| `GET /api/demo/leak-check/:runId` | untuk run Pasar B: pindai calldata + log semua tx channel (termasuk `open` provider, seperti `demo/leak-check.ts`) terhadap nilai privat sesi → `{ txs, leaks, ambiguous, details: [{txHash, word, kind}] }`. |
| `GET /api/offer?client=A\|B` | body 402 mentah yang provider kirim (`GET /provider/job` dengan header `Aegis-Client`), untuk panel "apa yang dilihat klien x402". |

`Step = { i, t (ms sejak start), phase: "fund"\|"open"\|"serve"\|"ack"\|"close"\|"dispute"\|"prove"\|"wait"\|"settle"\|"escrow", label, detail?, txHash?, gasUsed?, channel?, progress?: {done, total} }` — `serve` dipancarkan per 10 unit (bukan per unit) agar stream ringan.

`Row` = baris tabel §14 persis seperti `demo/run.ts` (`pasar`, `klien_provider`, `penentu`, `terlihat`, `gas`, `proving_ms`) + `txs: [{label, hash}]`.

### A.4 Halaman (`web/src`)

Satu halaman, tiga panel yang selalu terlihat (layout grid 2 kolom di ≥ 1100 px, satu kolom di bawahnya):

1. **Header** — nama, badge network (`local 31337` / `testnet 46630`), alamat factory/USDG/verifier (tautan explorer bila ada), status provider (`GET /api/config` gagal → banner merah "server tidak jalan: `pnpm --filter @aegisclear/web start`").
2. **Channels** — tabel dari `GET /api/channels` (poll 3 s): channel (8 hex + tautan), klien, provider, `state` sebagai pill (UNINIT/OPEN/CLOSING/SETTLED), `seq`, `A` (USDG 2 desimal), `budget`, countdown `deadline` (bila CLOSING), `hasProof → payToClient`. Klik baris → drawer detail (`/api/channels/:addr`): cfg, timeline event dengan tautan tx.
3. **Demo A vs B** — tombol per skenario + "Jalankan semua"; log langkah live (SSE) dengan progress bar untuk `serve`, tautan tx; setelah selesai: **tabel perbandingan** (kolom §14) dan dua kartu:
   - **Privat (off-chain)**: `terms` (harga, ambang, penalti, cap), metrik unit yang melanggar — ikon gembok, teks "tidak pernah masuk chain".
   - **Yang dilihat chain**: `T`, `R`, `A`, `payToClient`, hasil `leak-check` (`bocor: 0`, dengan jumlah tx yang dipindai) — tombol "Periksa kebocoran" memanggil `/api/demo/leak-check/:runId`.
   - Sub-panel "402 yang dilihat klien x402" (`/api/offer`) — JSON yang bisa dilipat.

Tidak ada router/halaman lain. Aksesibilitas dasar: semua tombol `<button>`, tabel `<table>`, kontras ≥ 4.5:1.

### A.5 Refactor `demo/` menjadi library + CLI

`demo/run.ts` (CLI) dipecah: `demo/src/scenarios.ts` mengekspor

```ts
export interface ScenarioEnv { ctx: (pk: Hex) => ChainCtx; publicClient: PublicClient; d: Deployment; art: Artifacts; providerUrl: string; providerAddress: Address; keys: {a: Hex; b: Hex; provider: Hex}; timeTravel: (seconds: number) => Promise<void>; challengeWindow: number }
export type Emit = (s: Omit<Step, "i"|"t">) => void
export async function runMarketB(env: ScenarioEnv, pk: Hex, dispute: boolean, emit: Emit, units = 100): Promise<MarketBResult>
export async function runMarketA(env: ScenarioEnv, pk: Hex, accept: boolean, emit: Emit): Promise<MarketAResult>
export function toRows(...): Row[]           // tabel §14
export const BREACHES, TERMS_BASE            // konstanta demo (nonce diisi per sesi oleh provider)
```

`demo/run.ts` memakai fungsi yang sama dengan `emit` → `console.log` dan `timeTravel` = `evm_increaseTime` (output & `demo/out/result.json` tidak berubah — `leak-check.ts` tetap jalan). `demo/package.json` menambah `"exports": {".": "./src/index.ts"}`. Pemeriksaan sebelum run di web: sesi provider (`sessions` yang dikembalikan `createProviderApp`) untuk klien tersebut dihapus bila channel-nya `SETTLED`/belum dibuka; bila masih OPEN/CLOSING → 409 (`client-has-open-channel`) — tidak pernah menghapus sesi yang masih punya co-signed checkpoint aktif (responder T1 butuh itu).

### A.6 Pengujian

- `web/test/server.test.ts` (vitest, `describe.skipIf(!DEPLOY_EXISTS)` seperti integration SDK, Anvil privat + `DeployLocal`): `GET /api/config` bentuknya; `POST /api/demo/run B-cooperative` → poll `/runs/:id` sampai `done` → `result` punya 1 baris `B: AegisClear kooperatif`, `channels` memuat channel run itu dengan `state: SETTLED`; `B-dispute` → `payToClient` = 70000 (0,07 USDG, EX1) dan `leak-check` → `leaks: 0`; run kedua untuk klien yang sama diterima (sesi lama SETTLED dihapus); SSE mengirim replay `steps` lalu `done`.
- `web/test/runstore.test.ts` (tanpa chain): `RunStore` — kapasitas 50, `busy`, replay urutan `steps`, error → `status:"error"`.
- `web/test/format.test.ts`: `fmtUsdg`, `shortAddr`, `countdown`.
- Tidak ada test komponen React (biaya/tenaga tidak sepadan untuk hackathon); `pnpm --filter @aegisclear/web build` + `tsc --noEmit` wajib hijau.

---

## B. Protokol P1

### B.1 Epoch & `rollover` (FR-10)

**Masalah yang harus dipecahkan dulu.** Setelah `rollover`, `seq`/`R`/`A` di-reset tetapi semua checkpoint co-signed epoch lama tetap tanda tangan sah atas domain yang sama → bisa di-replay (mis. `Checkpoint(128, 2,56 USDG, R)` disubmit lagi di epoch baru → provider dibayar dua kali). Karena itu **semua struct yang ditandatangani memuat `epoch`**:

```
Checkpoint(uint32 epoch,uint64 seq,uint128 cumulativeAmount,bytes32 receiptsRoot)
Close(uint32 epoch,uint64 seq,uint128 toProvider)
Rollover(uint32 epoch,uint64 seq,uint128 toProvider)
Leaf(uint32 epoch,uint64 seq,bytes32 leaf,uint128 cumulativeAmount)      // anchored, B.3
```

`ChannelTerms` tidak berubah (Config & salt tetap → alamat channel, `predict`, dan T19 tidak berubah). Bukti Groth16 tidak memuat epoch: bukti mengikat `(channelId, T, R, seq, A, payToClient)`; bukti epoch lama hanya valid kembali bila state epoch baru **identik** — dan saat itu ia membuktikan pernyataan yang benar (fungsi penalti deterministik), jadi bukan celah.

**Kontrak (`AegisChannel`):**
- `uint32 public epoch;` (0 saat initialize).
- `hashCheckpoint(epoch_, seq_, amount, root)`, `hashClose(epoch_, seq_, toProvider)`, `hashRollover(epoch_, seq_, toProvider)` — `submitCheckpoint`/`closeCooperative` memakai `epoch` saat ini.
- `rollover(uint64 seq_, uint128 toProvider, bytes sigClient, bytes sigProvider) external nonReentrant`: state OPEN/CLOSING; `seq_ ≤ MAX_SEQ`; `seq_ ≥ seq` (seperti close); dua tanda tangan `Rollover(epoch, seq_, toProvider)`; `toProvider ≤ budget()`; bayar `toProvider` → `payoutProvider` (lewat `_send`, B.2); **sisa tetap di channel** sebagai budget epoch berikutnya; reset `seq=0, cumulativeAmount=0, receiptsRoot=0, hasProof=false, deadline=0, state=OPEN, epoch++` (anchored: `filledSubtrees` di-nol-kan); emit `RolledOver(uint32 newEpoch, uint64 closedSeq, uint256 toProvider, uint256 remaining)` + `PaymentReleased(jobId, provider, toProvider)`.
- `ChannelView`/ABI SDK menambah `epoch`.

**SDK:**
- `typedData.ts`: `Checkpoint`/`CloseMsg` mendapat `epoch: number`; tipe baru `RolloverMsg`, `signRollover`/`verifyRolloverSig` (+ di `TypedDataVerifier`).
- Provider: `Session.epoch`; `POST /rollover {seq}` → seperti `/close` (hanya seq co-signed tertinggi) tetapi menandatangani `Rollover`; `POST /rollover/confirm` → provider membaca on-chain `epoch()==session.epoch+1 && seq()==0`, lalu reset tree/cumulative/checkpoints, `epoch++`; `/job` saat `tree.size ≥ MAX_SEQ` → 409 `epoch-full` (klien harus rollover). Tiket keluar seq-0 ditandatangani ulang untuk epoch baru saat confirm (dikembalikan di respons confirm).
- Klien: `rollover()` → `POST /rollover` → verifikasi `toProvider == cumulativeAmount lokal`, verifikasi `sigProvider`, tanda tangani, kirim tx, `POST /rollover/confirm`, reset lokal (`tree`, `checkpoints`, `pendingAck`, `epoch++`, simpan `exitSig` baru). `requestUnit()` sesudahnya mulai dari seq 0.
- Watcher responder: hanya merespons bila `mine.cp.epoch === view.epoch` (checkpoint epoch lama pasti gagal verifikasi on-chain; jangan dicoba tiap tick).

**Uji:** Foundry `Rollover.t.sol` — happy path (provider dibayar, sisa jadi budget, OPEN, epoch 1, seq 0); replay checkpoint/close epoch 0 setelah rollover → `BadSignature`; rollover dari CLOSING menghapus bukti tertunda; `toProvider > budget` → `ExceedsBudget`; `seq_ < seq` → `StaleCheckpoint`; dua rollover berurutan (epoch 2). SDK: `typedData.test.ts` (epoch di digest, cocok dengan `hashCheckpoint` on-chain lewat fixture); integrasi skenario 11: 128 unit → 409 `epoch-full` → `rollover()` → 5 unit lagi → cooperative close; saldo: provider = A_epoch0 + A_epoch1.

### B.2 `AegisTreasuryRouter` (FR-26) & hook payout

ERC-20 tidak punya hook penerimaan, jadi "receive → forward" dari spec §8.4 diwujudkan sebagai **hook yang dipanggil channel** setelah transfer, best-effort:

```solidity
interface IAegisPayoutHook { function onPayout(address party, address token, uint256 amount) external; }
```

**`AegisChannel._send(address to, address party, uint256 amount)`** (dipakai `_payout` dua kaki, `sweep`, `rollover`): `safeTransfer(to, amount)`; jika `to.code.length > 0`: `try IAegisPayoutHook(to).onPayout{gas: 150_000}(party, cfg.token, amount) {} catch {}`. Kegagalan hook **tidak pernah** menggagalkan settle (T-baru: `payoutClient` kontrak jahat yang revert tidak boleh menyandera dana provider). Semua pemanggil `_send` sudah/akan `nonReentrant` dan state diubah sebelum interaksi.

**`AegisTreasuryRouter`** (tanpa owner, tanpa upgrade):
- `mapping(address agent => address treasury) public treasuryOf; mapping(address agent => mapping(address token => uint256)) public credit; mapping(address token => uint256) public totalCredit;`
- `setTreasury(address treasury)` — `msg.sender` mengatur miliknya sendiri (akun 4337/Safe memanggil sebagai dirinya). `address(0)` = hapus.
- `onPayout(party, token, amount)`: `require(IERC20(token).balanceOf(this) ≥ totalCredit[token] + amount)` (pemanggil tidak bisa mengkredit dirinya dengan token yang tidak benar-benar masuk — invarian Σcredit ≤ saldo); `credit[party][token] += amount; totalCredit += amount`; `dest = treasuryOf[party] != 0 ? treasuryOf[party] : party`; `try token.transfer(dest, amount)` sukses → kurangi credit/totalCredit; gagal (mis. `dest` dibekukan USDG) → kredit tetap. Emit `PayoutRouted(party, token, dest, amount, bool forwarded)`.
- `claim(address token, address to)` — `msg.sender` menarik `credit[msg.sender][token]` ke `to`.
- Gas ekstra hanya bagi yang memakai router (≈ 2 SSTORE + transfer); channel tanpa router hanya membayar `extcodesize`.

**SDK:** `ProviderOptions.payoutProvider?: Address` (default `account.address`) → `cfg.payoutProvider`; klien sudah punya `payoutTo`. ABI router di `abi.ts`. Deploy: `DeployLocal`/`DeployTestnet` men-deploy satu router (`router` di JSON).

**Uji:** Foundry `TreasuryRouter.t.sol` — forward ke treasury; tanpa treasury → agent; `settle` tetap sukses bila `payoutClient` = kontrak yang revert/menghabiskan gas; token yang gagal transfer (mock yang menolak `dest`) → `credit` + `claim`; `onPayout` palsu tanpa token masuk → revert; `sweep`/`rollover` juga memanggil hook. Integrasi SDK skenario 13: provider `payoutProvider = router`, `setTreasury(treasury)` → saldo treasury naik setelah cooperative close.

### B.3 Anchored mode (FR-25) & `AegisPoseidon` (Stylus)

**Mode per factory, bukan per channel.** `AegisChannel` constructor mendapat `address poseidonPath`; `IPoseidonPath public immutable POSEIDON; bool public immutable ANCHORED = poseidonPath != address(0)`. Immutable hidup di bytecode implementasi → semua clone satu factory bermode sama; `Config`/`ChannelTerms`/salt/`predict` **tidak berubah**. Factory constructor: `(verifier, permit2, minChallengeWindow, poseidonPath)`. Deploy: `factory` (demo, co-signed), `factoryProd` (co-signed), **`factoryAnchored`** (anchored, jendela 60 s) — alamat `poseidon` di JSON.

**Pohon inkremental** (Semaphore/Tornado, kedalaman 7, indeks daun = `seq`, daun kosong = 0, node = Poseidon(kiri, kanan) — identik dengan `MerkleRoot` di sirkuit dan `merkleRoot()` SDK; `zeros[0]=0, zeros[i+1]=H(zeros[i],zeros[i])`, `zeros[7]` = root pohon kosong = `merkleRoot([])`). Ketujuh hash satu penyisipan dilakukan dalam **satu** panggilan (benchmark: satu panggilan Stylus ≈ 96k gas untuk 7 hash, tujuh panggilan terpisah ≈ 7 × 56k):

```solidity
interface IPoseidonPath {
    /// current = leaf; untuk i in 0..7: bit i dari index 0 → (current, zeros[i]), nodes[i] = current; bit 1 → (filled[i], current), nodes[i] = filled[i]; current = H(l, r).
    /// revert bila leaf atau filled[i] ≥ p_BN254.
    function insertPath(uint256 leaf, uint256 index, uint256[7] calldata filled) external view returns (uint256 root, uint256[7] memory nodes);
    function hash2(uint256 a, uint256 b) external view returns (uint256);
}
```

Dua implementasi dengan keluaran **identik** (diuji silang lewat vektor circomlibjs):
1. **`stylus/aegis-poseidon/`** (Rust, `stylus-sdk` 0.10.9, `no_std`) — Poseidon **v1 circomlib** t=3 (8 full + 57 partial round, S-box x⁵, konstanta `C`/`M` circomlib untuk t=3, dibangkitkan ke `src/constants.rs` oleh `scripts/gen_constants.mjs` dari `circomlibjs`), aritmetika `ark-bn254`/`ark-ff` 0.5 (`MontFp!` untuk konstanta compile-time; fallback `openzeppelin-crypto` `FpBN256` bila ukuran WASM > 24 KB terkompresi). `cargo test` native memverifikasi `hash2(1,2) = 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a` (vektor circomlib) + 20 vektor acak + `insertPath` vs root SDK. `cargo stylus check` harus lulus; deploy testnet dengan `cargo stylus deploy` (tanpa CacheManager — tidak ada di chain ini). `hash5`/`hash6`/`root128` dari spec §8.3 **tidak** dibuat (tidak ada pemakai on-chain; Rencana B3 tidak diaktifkan) — dicatat di changelog.
2. **`contracts/src/PoseidonPathYul.sol`** — implementasi yang sama di atas `PoseidonT3` (`poseidon-solidity`, submodule yang ada) — dipakai Foundry (tidak ada VM WASM), Anvil lokal, dan Rencana B bila Stylus gagal di-deploy.

**Kontrak `AegisChannel` (anchored):**
- Storage tambahan: `uint256[7] filledSubtrees` (hanya dipakai mode anchored). Typehash `LEAF_TYPEHASH`.
- `ack(uint64 seq_, bytes32 leaf, uint128 cumulativeAmount_, bytes sigProvider)`: `ANCHORED`; `msg.sender == cfg.client` (ack klien = tx-nya sendiri; akun kontrak memanggil sebagai dirinya); `state == OPEN`; `seq_ == seq && seq < MAX_SEQ`; `cumulativeAmount_ ≥ cumulativeAmount`; tanda tangan provider atas `Leaf(epoch, seq_, leaf, cumulativeAmount_)`; `(root, nodes) = POSEIDON.insertPath(uint256(leaf), seq_, filledSubtrees)`; simpan `nodes[i]` untuk level dengan bit `seq_` = 0; `receiptsRoot = root; seq = seq_ + 1; cumulativeAmount = cumulativeAmount_; hasProof = false`; emit `Acked(uint64 seq, bytes32 leaf, uint128 cumulativeAmount, bytes32 root)`. **Yang naik ke chain: hash daun + kumulatif** — metrik & harga per unit tetap privat (tabel §6.7 mendapat baris: anchored membocorkan `A` per ack, yaitu granularitas harga, bukan nilai harga per se).
- `startClose()`: `ANCHORED`; pihak; `OPEN → CLOSING`, `deadline = now + challengeWindow`; emit `CloseStarted(seq, cumulativeAmount, receiptsRoot, deadline)`. Selama CLOSING salah satu pihak boleh `claimPenalty` (bukti atas `R/seq/A` on-chain, kontrak tidak berubah), lalu `settle()` permissionless setelah deadline.
- `submitCheckpoint` → `revert WrongMode()` bila `ANCHORED`; `ack`/`startClose` → `WrongMode()` bila tidak. `closeCooperative`/`rollover`/`sweep`/`fundWithPermit2` berlaku di kedua mode. `rollover` me-nol-kan `filledSubtrees`.
- Tiket keluar seq-0 tidak diperlukan di mode anchored (klien selalu bisa `startClose()` atas state on-chain; sebelum unit pertama, `settle()` mengembalikan seluruh deposit) — SDK anchored tidak memintanya.

**SDK anchored:** `ProviderOptions.anchored?: boolean` (server satu mode); 402 `extra.aegis.anchored: true`. `POST /job` anchored: (1) buka channel saat tanda tangan ChannelTerms pertama (sama); (2) sebelum melayani unit n>0, provider membaca on-chain `seq() ≥ n` (ack unit n−1 sudah masuk) — tidak ada header `Aegis-Ack`; (3) balasan `{ result, receipt, leaf: {epoch, seq, leaf, cumulativeAmount}, sigProvider, channel }`. Klien `requestUnit()` anchored: verifikasi receipt/due/policy, `leafHash(r) == leaf`, `cumulativeAmount` = settle lokal, tanda tangan provider; kirim tx `ack(...)`; baru `tree.append`. `dispute()` anchored = `startClose()` + bukti (bila `payToClient > 0`); `exitUnilateral()` anchored = `startClose()`. `/close` anchored: `hi` = on-chain `seq()` (harus == `tree.size`). `Watcher` tidak berubah (responder tidak relevan: tidak ada checkpoint co-signed; `settle` setelah deadline & `sweep` tetap).

**Uji:** Foundry `Anchored.t.sol` (memakai `PoseidonPathYul`): 3 ack → `receiptsRoot` == root dari FFI `prove.ts --terms-only`/vektor SDK (fixture JSON `anchored_roots.json` dibuat skrip TS: daun & root untuk 1, 2, 3, 128 daun); ack seq salah → `StaleCheckpoint`; bukan klien → `NotParty`; tanda tangan provider salah → `BadSignature`; `submitCheckpoint` di anchored → `WrongMode`; `startClose` + `claimPenalty` (bukti FFI atas receipts EX1 yang di-ack satu per satu, 100 ack) + `settle` → pembagian sama dengan `Penalty.t.sol`; `rollover` me-reset pohon (ack seq 0 lagi menghasilkan root 1-daun). `PoseidonPathYul.t.sol`: `hash2(1,2)` vektor, `insertPath` 128 daun bertahap == `merkleRoot` fixture. Stylus: `cargo test` (native) vektor sama; on-chain testnet: `cast call insertPath` vs Yul untuk 3 input acak — **harus identik** (dicatat di README). SDK integrasi skenario 12 (anchored, 10 unit, 1 pelanggaran → dispute → bukti → settle; dan kooperatif) di Anvil (Yul) **dan** testnet (Stylus).

### B.4 Deploy & pengukuran

- `DeployLocal.s.sol`: + `PoseidonPathYul`, `factoryAnchored` (60 s), `AegisTreasuryRouter`; JSON: `poseidon`, `factoryAnchored`, `router`, `deployBlock`.
- `DeployTestnet.s.sol`: implementasi baru → **semua** kontrak di-deploy ulang; `POSEIDON_STYLUS` (env, alamat program Stylus yang sudah di-`cargo stylus deploy`; bila kosong → `PoseidonPathYul`, dicatat sebagai Plan B); `deployBlock` = `ArbSys(0x64).arbBlockNumber()` (try/catch → `block.number`). README tabel alamat diganti; alamat P0 lama disimpan di baris "deploy 20 Sep (v0)".
- Gas (§8.7) diisi dari pengukuran Foundry + testnet: `ack` (Stylus vs Yul), `startClose`, `rollover`, `settle` dengan/tanpa hook router, `open` (implementasi baru), ukuran WASM.

### B.5 Backlog P0 yang ikut (hygiene, satu task batch)

Dari ledger P0 (aman & kecil): factory `open` mengecek `predict(c).code.length != 0 → AlreadyOpen` (hemat gas tabrakan CREATE2); `fundWithPermit2` `nonReentrant`; `watcher/cli.ts` validasi env + SIGINT `stop()`; `MockVerifier is ISLASettlementVerifier`; test batas `seq == 128` dan `toProvider == budget`. Yang lain tetap di backlog.

---

## C. Ship

1. **Web console + skenario P1**: tombol `B-anchored-dispute` (factoryAnchored) dan `B-rollover` (128 unit + rollover + 5 unit); kolom `epoch`; event baru di timeline; badge mode channel (co-signed/anchored).
2. **Audit Slither** (`slither` ada di mesin; Aderyn tidak dipasang): jalankan atas `contracts/src`, triage ke `docs/audit/slither-2026-09.md` (temuan → fix / false positive dengan alasan). Target nol High/Medium yang benar.
3. **Dokumen**: `prd-arsitektur.md` v1.1 (§6.2 struct ber-epoch + `Leaf` dengan `cumulativeAmount`, §8.1 fungsi baru, §8.3 hasil Stylus nyata + alasan tanpa `hash5/6`, §8.4 desain hook/kredit, §8.7 gas terukur, §6.7 baris anchored, §12 T-hook, §13 skenario 11–13 ✅, §14 web console, §19 V18b redeploy, §20 D2 ✅, §23 changelog); README (bagian **"Lihat di browser"** paling atas: `pnpm --filter @aegisclear/web start` → `http://localhost:4040`, mode testnet); `docs/TOOLCHAIN.md` (+ Vite/React/ark versi).
4. **Paket submission**: `docs/SUBMISSION.md` — skrip video ≤ 3 menit (alur: web console testnet → run dispute → tabel → leak-check → explorer), Q&A juri (§17 diperbarui: Stylus dipakai di mana & kenapa hanya di sana), checklist DQ (repo publik ✅, release zkey ✅, deploy chain ✅), tautan.
5. Memory proyek diperbarui.

**Di luar cakupan (menunggu pemilik):** deploy mainnet 4663 (deployer 0 ETH), facilitator Mesh nyata (V8), video itu sendiri.

---

## Urutan eksekusi & gerbang

A → B → C, masing-masing lewat `writing-plans` → `subagent-driven-development` di branch `feat/aegisclear-p1-<sub>`; merge ke `main` + push setelah suite hijau (SDK, circuits, contracts, web). Testnet di-broadcast di akhir B (butuh ETH testnet yang ada: 0,0012 ETH deployer cukup untuk ~10 deploy pada 0,01 gwei; kalau kurang, minta faucet).
