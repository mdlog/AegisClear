# AEGISCLEAR — PRD & TECHNICAL ARCHITECTURE

**Produk:** AegisClear — escrow & penyelesaian sengketa privacy-preserving untuk pembayaran agen-ke-agen (x402/MPP) dalam USDG, diadili oleh bukti zero-knowledge
**Chain:** Robinhood Chain (Arbitrum Dedicated Chain / Nitro) — mainnet `4663`, testnet `46630`. **Stylus aktif di keduanya (diverifikasi on-chain 19 Sep 2026, §19)**
**Event:** Arbitrum Open House Singapore: Online Buildathon (submission **4 Okt 2026 15:59 UTC**)
**Versi:** 1.1 — 20 September 2026 (sistem **sebagaimana dibangun** setelah P1; v1.0 = 19 September 2026; daftar perubahan di §23)
**Status:** **P0 + P1 dikirim (20 Sep 2026).** P0: sirkuit + verifier + `AegisChannel` + SDK + demo A vs B. P1: web console (`web/`, `http://localhost:4040`), epoch & `rollover` (FR-10), `AegisTreasuryRouter` + hook payout (FR-26), anchored mode + program Stylus `AegisPoseidon` (FR-25, D2 terukur **1,75×**). Deploy **testnet 46630 v2** 20 Sep 2026 (bytecode teraudit): 7/7 kontrak terverifikasi Blockscout (blok 122.028.843), suite integrasi SDK **15 lulus / 4 dilewati** di chain publik (§19 V18c; v1 blok 121.982.356 = V18b, riwayat); self-audit Slither: nol temuan High/Medium yang benar, 2 Low + 1 temuan manual (M-1) diperbaiki (§12, `docs/audit/slither-2026-09.md`). Semua angka gas di §8.7 **terukur** (Foundry + testnet 46630). **Belum:** deploy mainnet 4663 (deployer 0 ETH — menunggu pemilik), facilitator Mesh nyata (V8), video. Testnet v2 memuat `HOOK_GAS` 300k + `InsufficientGas` (M-1) + pemeriksaan alamat nol di factory — source `main` = bytecode explorer. Angka yang tidak ada di sumber terukur ditandai "belum diukur".

---

## 0. RINGKASAN EKSEKUTIF

Agen otonom di Robinhood Chain sudah saling membayar hari ini: MeshGateway menjalankan rel x402/MPP dalam USDG dengan 1.030 storefront dan 15.718 settlement on-chain (§2.3). Rel itu memakai skema x402 `exact`: **bayar dulu, terima kemudian, tanpa recourse**. Untuk layanan seharga sen itu benar. Untuk pekerjaan mesin bernilai puluhan hingga ribuan dolar — armada robot membeli rute, charging, atau komputasi; agen B2B membeli data dan inferensi — pola *pay-first* membuat pembeli menanggung seluruh risiko wanprestasi, dan begitu ada sengketa, satu-satunya jalan adalah audit pihak ketiga yang membuka harga satuan, ambang SLA, dan telemetri ke chain publik.

Standar yang sedang lahir untuk celah ini, **ERC-8183 (Agentic Commerce)**, memberi escrow per job dengan satu *evaluator* yang memutuskan `complete` atau `reject`: biner, evaluator dipercaya penuh, dan seluruh syarat terlihat. Spesifikasinya sendiri menyebut evaluator *"MAY be a smart contract … verifying a zero-knowledge proof"* — tetapi tidak ada yang membangunnya.

AegisClear adalah evaluator itu. Ia adalah **sirkuit**, bukan manusia atau LLM:

1. **Micro-escrow state channel** — klien mendanai satu channel USDG per pasangan agen; setiap unit layanan menghasilkan *receipt* yang ditandatangani kedua pihak dan terakumulasi off-chain. Chain hanya melihat komitmen.
2. **ZK settlement** — jika klien menuntut penalti SLA, ia mengirim bukti Groth16 bahwa *"di bawah syarat yang berkomitmen di `termsCommitment` dan receipt di bawah `receiptsRoot` yang kami berdua tanda tangani, penalti yang sah adalah X"*. Kontrak memverifikasi (**229.241 gas** terukur untuk verifier 6 input publik, §8.2) dan membagi dana **proporsional** — tanpa pernah melihat harga, ambang, atau metrik.
3. **Treasury routing** — payout diarahkan ke brankas armada / smart account ERC-4337, bukan ke hot wallet agen; di P1 lewat `AegisTreasuryRouter` (hook payout + buku kredit, §8.4), live di testnet 46630.

**Satu perbandingan yang menjelaskan seluruh produk.** 100 request seharga 0,02 USDG, 7 di antaranya melanggar SLA latensi (§6.5):

| Rel | Hasil untuk klien | Yang terlihat di chain |
|---|---|---|
| x402 `exact` (hari ini) | 2,00 USDG hilang, tanpa recourse | semua transfer |
| ERC-8183 dengan evaluator | 0 **atau** 2,00 — biner, tergantung kepercayaan pada evaluator | syarat & bukti (`reason`) |
| **AegisClear** | **1,93 ke provider / 0,07 kembali ke klien**, deterministik | dua komitmen + pembagian akhir |

**Dua koreksi jujur terhadap draft** yang menjadi fondasi dokumen ini: (i) "Servo Protocol" bukan infrastruktur M2M — ia protokol revenue-share RWA; rel M2M yang nyata di chain ini adalah MeshGateway/x402; (ii) verifier Groth16 di Stylus **tidak lebih murah** dari Solidity (256.334 vs 194.396 gas — pairing sudah precompile). Stylus dipakai hanya di tempat ia terbukti menang — dan itu **sudah diukur sendiri** (D2 ✅, 20 Sep 2026, testnet 46630): jalur 7 hash Poseidon per `ack` anchored (`insertPath`) **144.076 gas di Stylus vs 252.271 di Yul (1,75× total, ≈1,9× eksekusi)**, dengan port circomlib Poseidon **v1** yang kompatibel sirkuit; hash tunggal justru lebih murah di Yul (62.138 vs 82.593) sehingga tidak ada Poseidon satu-hash on-chain di mana pun (§8.3). Klaim gas Stylus **tidak boleh** masuk pitch selain angka yang diukur sendiri.

---

## 1. SCOPE & DOCUMENT CONTROL

### Di dalam scope (MVP hackathon) — status 20 Sep 2026
- ✅ `AegisChannel` (EVM, EIP-1167 clone per pasangan agen): open, fund (transfer/Permit2/x402 `payTo`), checkpoint co-signed, cooperative close, unilateral close dengan jendela tantangan, klaim penalti dengan bukti ZK, settle permissionless, sweep; **P1:** `rollover` per epoch, `ack`/`startClose` (anchored), hook payout `_send` (§8.1)
- ✅ `AegisChannelFactory` (CREATE2, alamat channel deterministik; **P1:** mode per factory lewat immutable `POSEIDON`, tiga factory di testnet — demo, produksi, anchored)
- ✅ `SLASettlementVerifier` (Solidity, ekspor snarkjs Groth16 BN254; tidak berubah di P1, release `v0.1.0-zkey`)
- ✅ Sirkuit `sla_settlement.circom`: komitmen syarat (Poseidon), pohon receipt 128 slot, evaluasi skedul penalti, konservasi jumlah (tidak berubah di P1)
- ✅ `aegis-sdk` (TypeScript): pertukaran receipt/ack EIP-712, checkpoint, prover (snarkjs), middleware provider x402-compatible (Hono), klien agen, watcher/challenge responder; **P1:** `/rollover` + `/rollover/confirm`, opsi `anchored`, `payoutProvider`, mode diturunkan dari factory (§11)
- ✅ `MockUSDG` (6 desimal) untuk testnet 46630; USDG asli di mainnet 4663 (D1) — **mainnet belum di-deploy (deployer 0 ETH)**
- ✅ Demo harness: cooperative close vs sengketa dengan bukti, dibandingkan dengan escrow gaya ERC-8183 evaluator-biner sebagai kontrol (§14); **P1:** web console `web/` (dashboard channel, panel demo A vs B, leak-check, skenario anchored & rollover)
- ✅ **P1 (dikirim, testnet v2):** `AegisPoseidon` (Stylus, port circomlib Poseidon v1) untuk *anchored mode* — gerbang D2 terpenuhi dengan angka on-chain **1,75×** vs Yul (§8.3); `AegisTreasuryRouter` (§8.4); event berbentuk ERC-8183 (FR-27); epoch/`rollover` (FR-10)

### Di luar scope
- Attestor pihak ketiga, zkTLS (Reclaim/Opacity), TEE — jalur ekspansi untuk metrik yang tidak bisa dikonfirmasi klien
- Agregasi rekursif bukti / channel > 128 receipt per epoch tanpa rollover
- Arbitrase manusia, juri, token, governance
- Channel multi-provider, netting lintas channel, kredit (channel adalah prabayar)
- Komponen LLM di jalur penyelesaian. **Jangan tambahkan** — evaluator yang deterministik adalah tesisnya
- Konformansi penuh interface `IACP` ERC-8183 (draft Feb 2026); yang dikirim adalah *kompatibilitas event & peran* (FR-27)

### Prior art yang harus disebut di pitch (jangan disembunyikan)
| Hal | Sudah ada | Klaim AegisClear yang sah |
|---|---|---|
| Escrow job antar-agen dengan evaluator | **ERC-8183 Agentic Commerce** (draft, Feb 2026): `createJob/fund/submit/complete/reject/claimRefund`, evaluator tunggal, terminal biner, fee split, integrasi ERC-8004 | AegisClear tidak menemukan escrow agen. Yang baru: evaluator = sirkuit (trustless), payout **proporsional** dari skedul penalti, syarat & telemetri **privat**, dan channel prabayar untuk banyak unit — bukan satu job |
| Identitas & validasi agen | **ERC-8004 Trustless Agents**: Identity/Reputation/Validation registry; menyebut zkML, TEE, re-eksekusi berjamin | AegisClear tidak membangun registry. Hasil settlement dirancang menjadi sinyal reputasi 8004 (FR-28, roadmap) |
| Pembayaran berbasis pemakaian | **x402 `upto`** (klien tanda tangan maksimum, server settle aktual — Permit2), **MPP `session`** (deposit & refund otomatis sisa) | Keduanya tetap *pay-then-trust*; tidak ada adjudikasi. AegisClear menyisipkan escrow + bukti di antara deposit dan pelepasan |
| Rel M2M di Robinhood Chain | **MeshGateway**: x402/MPP, USDG via Permit2 witness transfer (USDG tidak punya EIP-3009), MeshIdentity ERC-8004, facilitator terbuka | AegisClear tidak membangun rel. `payTo` = alamat channel memakai proxy Permit2 kanonik **tanpa perubahan** (§10.2) |
| Escrow dengan adjudikasi | **Kleros Escrow** (juri manusia), **UMA Optimistic Oracle** (asersi + bond + sengketa) | Keduanya manusia/optimistik dan publik. AegisClear deterministik dan privat; tidak ada bond arbitrase |
| ZK di Stylus | **Renegade** (PLONK verifier produksi di Stylus), **zk-sunade** (Groth16 di Stylus, 256k gas), **ZeroStyl** (toolkit privasi Stylus — verifikasi Hari 1, V16), **OpenZeppelin `openzeppelin-crypto` Poseidon2** (11.887 gas) | AegisClear memakai Stylus hanya untuk Poseidon on-chain (jalur 7-hash `insertPath` di anchored mode), dengan port circomlib Poseidon **v1** — bukan Poseidon2 OZ, yang tidak kompatibel sirkuit — dan angka yang diukur sendiri: 1,75× vs Yul (§8.3) |
| Payment channel | Raiden / Perun / state channel generik | Pola checkpoint co-signed + jendela tantangan diambil dari sana dan **dikreditkan**; kontribusi ada di objek yang di-channel-kan (receipt SLA) dan penyelesaiannya (bukti) |

### Koreksi terhadap draft (ringkas; detail di §23)
| Draft | Fakta terverifikasi | Dampak |
|---|---|---|
| "Servo Protocol … mesin otonom bertransaksi … USDG" | Servo = tokenisasi revenue-share RWA (servoprotocol.xyz). M2M nyata = MeshGateway | Problem statement, persona, integrasi ditulis ulang di atas x402/MPP |
| "groth16 di EVM menelan ratusan ribu gas → Rust/Stylus" | Solidity 194.396 gas; Stylus 256.334 gas (memanggil precompile yang sama) | Verifier di Solidity; Stylus hanya Poseidon (D2) |
| "PoseidonVerifier.rs … tanpa membocorkan batasan memori L2" | Batas memori Stylus: `pageLimit` 128 halaman × 64 KB = 8 MB, `freePages` 2 — bukan isu untuk verifier | Kalimat dihapus; parameter nyata di §19 |
| Tidak ada model bukti, skedul penalti, atau siapa yang membuktikan apa | §6, §9 | Seluruh mekanisme didefinisikan |

---

## 2. PROBLEM STATEMENT

### 2.1 Mekanisme yang menciptakan masalah

| Kode | Fakta | Implikasi |
|---|---|---|
| P1 | Skema x402 `exact`: facilitator menyelesaikan transfer ke `payTo` merchant **sebelum** resource dikembalikan; *"the Facilitator cannot modify the amount or destination"* — dan juga tidak bisa menahannya | Tidak ada recourse on-chain untuk resource yang tidak sesuai. Pembeli menanggung 100% risiko wanprestasi |
| P2 | USDG di Robinhood Chain **tidak mengimplementasikan EIP-3009** (pernyataan MeshGateway; pemanggilan selector `transferWithAuthorization` hanya menghasilkan revert kosong — konfirmasi final di V4b); rel USDG memakai **Permit2 witness transfer** melalui `x402ExactPermit2Proxy` kanonik `0x402085c2…20001` | Setiap integrasi USDG harus lewat Permit2. Witness hanya `{to, validAfter}` — atribusi ke job harus lewat **alamat tujuan**, bukan data tambahan (§10.2) |
| P3 | ERC-8183: *"Evaluator is trusted for completion and rejection once the job is Submitted; a malicious evaluator can complete or reject arbitrarily"*; *"No dispute resolution or arbitration; reject/expire is final"*; payout biner | Escrow ada, adjudikasi tidak. Syarat dan `reason` publik |
| P4 | ERC-8004 Validation Registry menerima skor 0–100 dari validator; metode yang disebut: re-eksekusi berjamin, zkML, TEE | Ada slot untuk "bukti", belum ada bukti untuk SLA komersial |
| P5 | Robinhood Chain: sequencing **first-come-first-served**, *"Priority gas auctions do not exist here"*; block time terukur **0,101 s** (1.000 blok, 19 Sep 2026); gas price mainnet 0,068 gwei saat diukur | Jendela waktu adalah satu-satunya tuas sengketa; biaya verifikasi 194k gas ≈ 13 µETH — sengketa mikro **ekonomis** di sini, tidak di L1 |
| P6 | Stylus aktif (`stylusVersion()=3`), tetapi pairing BN254 sudah precompile EVM: verifier Groth16 Stylus 256k vs Solidity 194k gas; Poseidon Stylus 11.887 vs Yul 19.313 vs Solidity polos 220.244 gas (OpenZeppelin, Poseidon2). **Terukur sendiri (20 Sep 2026, Poseidon v1 kompatibel sirkuit, testnet 46630):** 7 hash `insertPath` Stylus 144.076 vs Yul 252.271; hash tunggal Stylus 82.593 vs Yul 62.138 (§8.3) | Stylus menang hanya di komputasi **tanpa precompile** — hashing, bukan pairing — dan hanya bila satu panggilan cukup besar untuk mengamortisasi init program (8.832 gas, tanpa CacheManager di chain ini) |
| P7 | Chain publik dengan explorer Blockscout; agen bisnis punya harga satuan, ambang SLA, dan telemetri yang bernilai komersial | Escrow transparan = membocorkan struktur harga ke pesaing setiap sengketa |

### 2.2 Konsekuensi ekonomi
Tanpa recourse, pembeli membatasi eksposur dengan **memperkecil ukuran pembelian**: x402 hari ini adalah dunia sen (Mesh: rata-rata 0,033 USDG per settlement, §2.3). Pekerjaan bernilai tinggi tetap di kontrak off-chain dengan faktur dan manusia. Penyedia yang jujur pun kehilangan pasar: ia tidak bisa menawarkan "bayar hanya untuk yang memenuhi SLA" karena tidak ada mekanisme yang memaksakannya tanpa membuka bukunya.

### 2.3 Bukti bahwa ini nyata, bukan teoretis
- **MeshGateway** (meshgateway.co, dibaca 19 Sep 2026): 1.030 storefront hidup, 490+ merchant machine-payable, **15.718 settlement on-chain**, **512,48 USDG** total settle seumur hidup — rel M2M di Robinhood Chain ada, dan volumenya masih sen. Tidak ada escrow, refund, sengketa, atau privasi di seluruh dokumentasinya.
- **ERC-8183** dibuat 25 Feb 2026 justru untuk *"cases where the deliverable can't be verified by HTTP 200"* — pengakuan bahwa x402 `exact` tidak cukup.
- **MPP** mendokumentasikan *refund* (kembalikan dana setelah charge; session mengembalikan sisa deposit) tetapi **bukan sengketa** — keputusan refund sepenuhnya di merchant.
- **USDG di Robinhood Chain** bukan token uji: total supply on-chain **703.768.785 USDG** (`totalSupply()`, 19 Sep 2026).

> Klaim "OKX Agent Payments Protocol menandai escrow & dispute sebagai *coming soon*" (liputan bex.co, Mei 2026) **belum bersumber primer** — tambahkan tautan whitepaper sebelum dipakai di pitch (§22).

### 2.4 Dua hipotesis yang HARUS tetap ditolak
1. **"ZK verification di Stylus lebih murah dari EVM."** Salah untuk Groth16/PLONK atas BN254: bagian mahal (pairing, ecMul) adalah precompile `0x06–0x08` yang dipanggil kedua implementasi. zk-sunade memanggilnya lewat `RawCall` dan membayar 32% lebih mahal karena overhead host I/O. Yang benar dan **terukur sendiri**: **hashing Poseidon** dalam satu panggilan 7-hash (`insertPath`, jalur `ack` anchored) 1,75× lebih murah dari Yul (144.076 vs 252.271 gas, testnet 46630, 20 Sep 2026); hash tunggal justru **lebih mahal** di Stylus (82.593 vs 62.138) karena init program 8.832 gas per panggilan tanpa CacheManager. Angka 1,6×/18× OpenZeppelin adalah Poseidon2, bukan hash kami. Pitch memakai angka yang kami ukur, bukan yang pertama.
2. **"Bukti ZK membuat penyelesaian tidak butuh kerja sama sama sekali."** Salah: bukti bekerja atas receipt yang **ditandatangani kedua pihak**. Yang ZK hilangkan adalah kebutuhan kerja sama **saat sengketa** dan kebutuhan **membuka data** — bukan kebutuhan ack saat layanan diterima. Unit yang tidak di-ack tidak dibayar; itu risiko provider sebesar satu unit (T2), sama seperti API prabayar mana pun.

---

## 3. GOALS & NON-GOALS

### Goals
| G | Tujuan | Ukuran keberhasilan (demo) |
|---|---|---|
| G1 | Pembeli punya recourse tanpa pihak ketiga | Klaim penalti diselesaikan hanya dengan bukti; tidak ada alamat evaluator |
| G2 | Syarat komersial tidak pernah menyentuh chain | Explorer hanya menampilkan `termsCommitment`, `receiptsRoot`, jumlah; script `leak-check` membuktikan tidak ada field lain |
| G3 | Penyelesaian proporsional, bukan biner | 100 request / 7 pelanggaran → 1,93 / 0,07 USDG (§6.5) tereksekusi on-chain |
| G4 | Kompatibel dengan rel yang ada | Klien Mesh/x402 standar mendanai channel lewat 402 `payTo` tanpa perubahan SDK klien (FR-23) |
| G5 | Gagal secara konservatif | Tanpa bukti dan tanpa checkpoint baru, jendela tantangan membayar tepat checkpoint co-signed terakhir — tidak pernah lebih, tidak pernah kurang |
| G6 | Setiap klaim gas diukur, bukan dikutip | ✅ Tabel §8.7 terisi dari Foundry + testnet 46630 (`cast estimate`, receipt tx) per 20 Sep 2026; yang belum diukur ditulis "belum diukur" |

### Non-goals
- Bukan rel pembayaran baru. AegisClear tidak menggantikan x402/MPP/Mesh; ia duduk di alamat `payTo`.
- Bukan registry agen. Identitas/reputasi adalah domain ERC-8004.
- Bukan sistem arbitrase. Tidak ada juri, tidak ada bond arbitrase, tidak ada "kasus" yang perlu dibaca manusia.
- Bukan proyek "Stylus". Stylus adalah optimasi yang diukur (D2), bukan identitas.

---

## 4. PERSONA & USER STORIES

### Persona
| # | Persona | Kebutuhan |
|---|---|---|
| U1 | **Operator armada** (robot logistik / kendaraan otonom) yang membeli charging, rute, slot dok, komputasi dari penyedia mesin lain | Membayar hanya untuk unit yang memenuhi SLA, tanpa membuka tarif kontraknya ke chain |
| U2 | **Agen B2B pembeli** (LLM agent dengan MeshWallet) yang membeli data/inferensi bernilai $10–$1.000 per job | Recourse otomatis; budget cap; tidak perlu manusia untuk refund |
| U3 | **Merchant/provider mesin** (storefront Mesh) | Pembayaran terjamin untuk unit yang di-ack; tidak ada chargeback sepihak; bisa menawarkan "SLA-backed offer" sebagai diferensiasi |
| U4 | **Kurator treasury armada** | Payout dan refund masuk ke brankas (Safe / smart account 4337), bukan ke hot wallet tiap robot |
| U5 | **Integrator rel** (facilitator, marketplace) | Mendukung escrow tanpa menyentuh logika settle-nya: cukup `payTo` yang berbeda |

### User stories
- **US-1 (U1):** Sebagai operator armada saya ingin mendanai satu channel USDG per penyedia dan membiarkan robot saya meng-ack setiap unit, sehingga di akhir hari saya membayar tepat unit yang memenuhi SLA.
- **US-2 (U2):** Sebagai agen pembeli saya ingin menuntut penalti SLA dengan satu transaksi berisi bukti, tanpa mengunggah log saya ke chain.
- **US-3 (U3):** Sebagai provider saya ingin menutup channel secara sepihak dengan checkpoint terakhir yang klien tanda tangani, dan dibayar setelah jendela tantangan meski klien menghilang.
- **US-4 (U3):** Sebagai provider saya ingin klien tidak bisa mengarang pelanggaran SLA — setiap metrik yang dihitung adalah metrik yang saya tanda tangani.
- **US-5 (U4):** Sebagai kurator saya ingin setiap payout channel armada saya diarahkan ke treasury, bukan ke alamat robot.
- **US-6 (U5):** Sebagai facilitator saya ingin tidak perlu tahu AegisClear ada; settlement Permit2 standar ke sebuah alamat sudah cukup.
- **US-7 (semua):** Sebagai siapa pun saya ingin dana tidak pernah terkunci selamanya: setiap state punya jalan keluar berbatas waktu.

---

## 5. FUNCTIONAL REQUIREMENTS

### 5.1 Channel lifecycle
| ID | Requirement | Prioritas |
|---|---|---|
| FR-1 | Setiap channel MUST berupa kontrak sendiri (EIP-1167 clone) dengan alamat deterministik (CREATE2; **sebagaimana dibangun:** salt = `keccak256(abi.encode(Config))` — seluruh Config termasuk jendela, payout, dan `salt`), sehingga transfer USDG apa pun ke alamat itu — termasuk settlement x402 — teratribusi tanpa data tambahan | P0 ✅ |
| FR-2 | `open` MUST mengikat `(client, provider, token, termsCommitment, challengeWindow, responseWindow, payoutClient, payoutProvider, salt)` dan MUST disetujui kedua pihak: untuk masing-masing pihak, `msg.sender == pihak` **atau** tanda tangan EIP-712 `ChannelTerms` yang sah | P0 |
| FR-3 | Pendanaan MUST permissionless dan berulang: saldo USDG kontrak adalah `budget`; `fundWithPermit2` disediakan untuk klien tanpa allowance | P0 |
| FR-4 | State: `OPEN → CLOSING → SETTLED`; transisi hanya lewat fungsi §8.1; tidak ada `pause`, tidak ada upgrade. **P1:** `rollover` (dua tanda tangan) adalah satu-satunya transisi `OPEN/CLOSING → OPEN` — epoch baru, bukti tertunda dihapus | P0 ✅ |
| FR-5 | Semua pemeriksaan tanda tangan MUST menerima EOA **dan** ERC-1271 (agen di smart account ERC-4337; EntryPoint v0.6/v0.7 ada di kedua jaringan, §19 V5) | P0 |
| FR-6 | Setelah `SETTLED`, USDG yang masih masuk MUST bisa di-`sweep` ke `payoutClient` oleh siapa pun | P0 |

### 5.2 Receipt & checkpoint
| ID | Requirement | Prioritas |
|---|---|---|
| FR-7 | Leaf receipt MUST = `Poseidon(seq, qty, m1, m2, due)` atas field BN254 (§6.2); pohon biner 128 slot, `EMPTY_LEAF = 0`; slot `≥ seq` MUST kosong | P0 |
| FR-8 | Checkpoint MUST = EIP-712 `Checkpoint(epoch, seq, cumulativeAmount, receiptsRoot)` ditandatangani **kedua** pihak (`channelId` ada di domain, `epoch` di struct — §6.2); `seq` strictly increasing dalam satu epoch; checkpoint dengan `seq` lebih tinggi MUST menggantikan yang lebih rendah | P0 ✅ |
| FR-9 | Kontrak MUST menerima checkpoint hanya dari tanda tangan — tidak pernah memerlukan receipt | P0 ✅ |
| FR-10 | Satu epoch MUST ≤ 128 receipt (`MAX_SEQ`); `rollover` kooperatif membayar epoch dan me-reset `seq/root` dengan syarat & sisa budget yang sama. **Dikirim:** `rollover(seq, toProvider, sigClient, sigProvider)` di `OPEN`/`CLOSING`, `seq ≥ latest.seq`, dua tanda tangan `Rollover(epoch, seq, toProvider)`, `toProvider ≤ budget()`; membayar provider lewat `_send` (hook, §8.4), **sisa tetap di channel** sebagai budget epoch berikutnya, me-reset `seq/A/R/deadline/bukti` (anchored: juga pohon inkremental), `epoch++` sehingga semua tanda tangan epoch lama mati (`BadSignature`). SDK: provider menolak unit ke-129 dengan `409 epoch-full`; klien `rollover()` → `POST /rollover` (+ tiket keluar epoch berikutnya, pra-tanda-tangan) → tx → `POST /rollover/confirm` (idempoten). Uji: `Rollover.t.sol` (12 test), skenario 11 lulus di testnet (§13) | P1 ✅ |

### 5.3 Penyelesaian & sengketa
| ID | Requirement | Prioritas |
|---|---|---|
| FR-11 | Cooperative close: kedua pihak menandatangani `Close(epoch, seq, toProvider)` → settle seketika, tanpa jendela; `toClient = budget − toProvider` | P0 ✅ |
| FR-12 | Unilateral close: pihak mana pun mengirim checkpoint co-signed → `CLOSING`, `deadline = now + challengeWindow` | P0 |
| FR-13 | Selama `CLOSING`, checkpoint co-signed dengan `seq` lebih tinggi MUST menggantikan state dan MUST memperpanjang deadline ke `max(deadline, now + responseWindow)`, `responseWindow ≤ challengeWindow` | P0 |
| FR-14 | Klaim penalti MUST berupa bukti Groth16 yang input publiknya terikat ke `(channelIdField, termsCommitment, receiptsRoot, seq, cumulativeAmount)` **yang tersimpan saat ini** dan menghasilkan `payToClient`; hanya `client`/`provider` yang boleh mengirim | P0 |
| FR-15 | Checkpoint yang lebih baru MUST membatalkan bukti yang tertunda (bukti boleh dikirim ulang atas root baru) | P0 |
| FR-16 | `settle()` MUST permissionless setelah deadline. Default tanpa bukti: `toProvider = min(cumulativeAmount, budget)`, sisanya ke klien. Dengan bukti: `toProvider = min(cumulativeAmount − payToClient, budget)` | P0 |
| FR-17 | Konservasi: `toProvider + toClient == budget` pada saat settle; saldo kontrak nol setelahnya (kecuali transfer masuk belakangan, FR-6) | P0 |
| FR-18 | `payToClient ≤ cumulativeAmount` MUST dipaksakan **oleh kontrak** (bukan hanya sirkuit) — batas kerusakan jika trusted setup bocor (T4) | P0 |

### 5.4 Privasi
| ID | Requirement | Prioritas |
|---|---|---|
| FR-19 | On-chain MUST hanya berisi: alamat pihak, token, `termsCommitment`, `receiptsRoot`, `seq`, jumlah, waktu. Tidak ada field lain, tidak ada calldata receipt | P0 |
| FR-20 | Sirkuit MUST memaksakan: pembukaan `termsCommitment`, `due_i == qty_i × unitPrice`, `Σ due_i == cumulativeAmount`, `penalty ≤ cap`, slot `≥ seq` kosong | P0 |
| FR-21 | Kebocoran yang tersisa (§6.7) MUST didokumentasikan di README, bukan disembunyikan | P0 |

### 5.5 Integrasi USDG / x402
| ID | Requirement | Prioritas |
|---|---|---|
| FR-22 | Token MUST USDG (6 desimal, `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` mainnet); `MockUSDG` 6 desimal di testnet; **jangan pernah** asumsikan 18 desimal | P0 |
| FR-23 | Provider middleware MUST bisa menjawab 402 dengan `payTo = alamat channel` memakai skema `exact`/Permit2 standar; proxy kanonik dan facilitator **tidak dimodifikasi** | P1 ✅ (middleware `GET /job` → 402 `payTo = predict(cfg)`; uji terhadap facilitator Mesh nyata = V8, menunggu pemilik) |
| FR-24 | Provider middleware MUST menolak melayani jika `budget − cumulativeAmount − due < 0` | P1 ✅ (`POST /job` membaca `balanceOf(channel)` → 402 bila kurang) |

### 5.6 Anchored mode, treasury, ekosistem
| ID | Requirement | Prioritas |
|---|---|---|
| FR-25 | Anchored mode: ack on-chain — hanya **hash** leaf (+ kumulatif) yang naik, metrik tetap privat — + pohon Poseidon inkremental di kontrak; hash node di Stylus **jika** D2 positif, selain itu Yul (`poseidon-solidity`). **Dikirim:** mode **per factory** (`POSEIDON` immutable ≠ 0 ⇒ `ANCHORED`); klien memanggil `ack(seq, leaf, cumulativeAmount, sigProvider)` (hanya `client`, `seq == latest.seq`, `A` tidak boleh turun) dengan tanda tangan provider atas `Leaf(epoch, seq, leaf, cumulativeAmount)`; kontrak memasukkan `leaf` lewat **satu** panggilan `IPoseidonPath.insertPath` (7 hash t=3) dan menyimpan `receiptsRoot`, `seq+1`, `A`; `startClose()` (pihak mana pun) membuka jendela atas state on-chain; `submitCheckpoint` → `WrongMode`. D2 ✅: Stylus `AegisPoseidon` (`0x1027cf7D…ef34`, 1,75× vs Yul) di `factoryAnchored` testnet; `PoseidonPathYul` = Foundry/Anvil/Rencana B. Uji: `Anchored.t.sol` (18 test, termasuk 100 ack + bukti asli), skenario 12 ×4 lulus di testnet (§13) | P1 ✅ |
| FR-26 | `payoutClient`/`payoutProvider` MUST bebas dipilih saat open (treasury, Safe, 4337); `AegisTreasuryRouter` opsional memetakan agen → treasury per armada. **Dikirim:** channel memanggil hook `IAegisPayoutHook.onPayout(party, token, amount)` pada payee **kontrak** setelah transfer (`_send`, stipend `HOOK_GAS` = 300.000 dalam try/catch + penjaga `InsufficientGas`, §8.1); `AegisTreasuryRouter` = hook + buku kredit + `claim` tanpa owner: `setTreasury(treasury)` hanya untuk `msg.sender` sendiri, `onPayout` permissionless tetapi dijaga invarian `Σcredit[token] ≤ balanceOf(router)` (`Unbacked`), transfer gagal (mis. treasury dibekukan) → kredit yang bisa ditarik lewat `claim(token, to)`. Live di testnet `0xe4A87335…7689`; uji `TreasuryRouter.t.sol` (11 test), skenario "13 (FR-26)" suite SDK lulus di testnet (§13) | P1 ✅ |
| FR-27 | Kontrak SHOULD memancarkan event berbentuk ERC-8183 (`JobFunded`, `PaymentReleased`, `Refunded`) agar indexer 8183/8004 memahaminya. **Dikirim:** `JobFunded` di `fundWithPermit2`, `PaymentReleased` + `Refunded` di setiap settle (`jobId = channelIdField()`), `PaymentReleased` di `rollover`; uji `Events.t.sol` | P1 ✅ |
| FR-28 | Hook pasca-settle ke ERC-8004 Reputation (`giveFeedback` dengan `proofOfPayment`) | P2 / roadmap |

---

## 6. SPESIFIKASI PENYELESAIAN

Ini adalah inti produk: definisi yang persis sama dipakai oleh SDK (off-chain), sirkuit (bukti), dan kontrak (pembayaran). Tiga implementasi, satu semantik — diuji secara diferensial (§13).

### 6.1 Notasi
| Simbol | Arti |
|---|---|
| `p` | `unitPrice` — harga per unit, satuan atomik USDG (10⁻⁶) |
| `L*`, `Q*` | ambang SLA: `m1 ≤ L*` (mis. latensi ms, semakin kecil semakin baik) dan `m2 ≥ Q*` (mis. skor kualitas 0–100, semakin besar semakin baik) |
| `π` | `penaltyBps` — porsi harga unit yang dikembalikan untuk setiap unit yang melanggar (bps) |
| `κ` | `capBps` — batas atas total penalti sebagai porsi `cumulativeAmount` (bps) |
| `ν` | `nonce` — 253-bit acak, mencegah tebakan brute-force atas komitmen |
| `T` | `termsCommitment = Poseidon(p, L*, Q*, π, κ, ν)` (t = 7) |
| `r_i` | receipt ke-`i`: `(seq_i = i, qty_i, m1_i, m2_i, due_i)`, `due_i = qty_i × p` |
| `ℓ_i` | leaf: `Poseidon(seq_i, qty_i, m1_i, m2_i, due_i)` (t = 6); `ℓ_i = 0` untuk `i ≥ seq` |
| `R` | `receiptsRoot` — root pohon biner 128 slot (kedalaman 7) atas `ℓ_0..ℓ_127`, node = `Poseidon(kiri, kanan)` (t = 3) |
| `A` | `cumulativeAmount = Σ_{i<seq} due_i` |
| `B` | `budget` — saldo USDG channel saat settle |
| `b_i` | `breach_i = [m1_i > L*] ∨ [m2_i < Q*]` |

Semua nilai selain `ν` dan hash adalah integer ≤ 2⁶⁴; semua aritmetika integer (pembagian dibulatkan ke bawah). Dua metrik generik `m1`/`m2` sengaja tidak diberi semantik oleh protokol — semantiknya ada di *terms* yang disepakati off-chain (latensi/kualitas, jarak/waktu-tiba, token/akurasi).

### 6.2 Struktur data & pesan yang ditandatangani

**Off-chain (SDK, `sdk/src/core/typedData.ts`):**
```
Terms      { unitPrice, maxM1, minM2, penaltyBps, capBps, nonce }        → T (disimpan kedua pihak)
Receipt    { seq, qty, m1, m2, due }                                     → ℓ = leafHash(receipt)
Checkpoint { epoch, seq, cumulativeAmount, receiptsRoot }                → ditandatangani kedua pihak (co-signed)
CloseMsg   { epoch, seq, toProvider }   RolloverMsg { epoch, seq, toProvider }
LeafMsg    { epoch, seq, leaf, cumulativeAmount }                        → ditandatangani provider (anchored)
```

**EIP-712 (domain `AegisClear`, versi `1`, `chainId`, `verifyingContract = channel`) — string typehash persis seperti di `AegisChannel.sol`:**
```
ChannelTerms(address client,address provider,address token,bytes32 termsCommitment,uint32 challengeWindow,uint32 responseWindow,address payoutClient,address payoutProvider,bytes32 salt)
Checkpoint(uint32 epoch,uint64 seq,uint128 cumulativeAmount,bytes32 receiptsRoot)
Close(uint32 epoch,uint64 seq,uint128 toProvider)
Rollover(uint32 epoch,uint64 seq,uint128 toProvider)
Leaf(uint32 epoch,uint64 seq,bytes32 leaf,uint128 cumulativeAmount)          // hanya anchored mode
```
`channelId` tidak perlu ada di struct karena `verifyingContract` = alamat channel itu sendiri (satu channel = satu kontrak) — replay lintas channel mustahil by construction. `receiptsRoot` disimpan sebagai `bytes32` dengan nilai `< p_BN254`. `Close`/`Rollover` hanya memuat `toProvider`: sisa saldo **selalu** ke klien, sehingga transfer debu dari pihak ketiga setelah penandatanganan tidak bisa menggagalkan close (dan tidak ada yang bisa menandatangani "lebih dari saldo" untuk dirinya). `Close` dan `Rollover` berbentuk sama tetapi typehash-nya berbeda: tanda tangan atas satu tidak sah untuk yang lain (`test_close_signature_rejected_by_rollover`).

**Kenapa `epoch` ada di setiap struct (v1.1).** Setelah `rollover`, `seq`/`R`/`A` di-reset tetapi domain EIP-712 (alamat channel) tidak berubah — tanpa `epoch`, setiap checkpoint/close co-signed epoch lama tetap tanda tangan sah dan bisa di-replay di epoch baru (mis. `Checkpoint(128, 2,56 USDG, R)` disubmit ulang → provider dibayar dua kali). `epoch` (`uint32`, dimulai 0, `++` di `rollover`) mematikan seluruh tanda tangan epoch lama (`BadSignature`; `test_old_epoch_checkpoint_and_close_rejected_after_rollover`, `test_old_epoch_leaf_signature_rejected_after_rollover`). `ChannelTerms` **tidak** memuat epoch: `Config`/salt/`predict()`/T19 tidak berubah. Bukti Groth16 juga tidak memuat epoch — ia mengikat `(channelIdField, T, R, seq, A, payToClient)`; bukti epoch lama hanya sah lagi bila state epoch baru **identik**, dan saat itu ia membuktikan pernyataan yang benar (fungsi penalti deterministik), jadi bukan celah.

**Kenapa `Leaf` memuat `cumulativeAmount`.** Di anchored mode kontrak tidak pernah melihat `due_i`, tetapi bukti dan `settle` membutuhkan `A` on-chain (`claimPenalty` mengikat `(R, seq, A)`; default jendela membayar `min(A, B)`). Provider karena itu menandatangani `A` baru bersama hash daun; klien memverifikasi `leaf == Poseidon(seq, qty, m1, m2, due)` **dan** `A == A_sebelumnya + due` (persis `settle()` SDK atas receipt lokal) sebelum mengirim tx `ack` — tx itu adalah persetujuannya. Kontrak sendiri hanya memaksakan `A` tidak turun (`AmountDecreased`) dan tanda tangan provider (analisis "A digelembungkan" di §12 T26).

**Protokol ack — mode co-signed (setiap unit):**
```
1. provider → klien : resource + receipt { seq, qty, m1, m2, due } + Checkpoint_{seq+1} { epoch, seq+1, A', R' } + sigProvider
2. klien   → provider: sigClient(Checkpoint_{seq+1})      // ack = tanda tangan checkpoint kumulatif baru (header Aegis-Ack pada request berikutnya, atau POST /ack)
3. keduanya menyimpan Checkpoint_{seq+1} lengkap (dua tanda tangan) + receipt; provider menahan unit berikutnya sampai ack diterima
```
Ack **adalah** checkpoint: setiap unit yang diterima langsung menghasilkan state co-signed terbaru. Tidak ada langkah checkpoint terpisah; provider selalu memegang bukti tagihan untuk semua unit yang di-ack; klien tidak pernah menandatangani metrik yang tidak ia setujui (b_i dihitung dari metrik yang **dua-duanya** tanda tangani).

**Protokol ack — mode anchored (setiap unit, FR-25):**
```
1. provider → klien : resource + receipt + Leaf { epoch, seq, leaf = Poseidon(seq,qty,m1,m2,due), A' = A + due } + sigProvider(Leaf)
2. klien             : verifikasi receipt/due/policy, leaf == leafHash(receipt), A' == settle(receipts ∪ receipt).A, tanda tangan provider
3. klien → chain     : tx ack(seq, leaf, A', sigProvider) → kontrak: 7 hash insertPath, R' on-chain, seq+1, A'
4. provider melayani unit n hanya setelah membaca seq() on-chain ≥ n (tidak ada header Aegis-Ack; tidak ada checkpoint co-signed)
```
Yang naik ke chain per unit: **hash daun dan `A'`** (calldata `ack` tidak memuat metrik — diuji `leak-check` dan skenario 12 "calldata ack tanpa metrik"). Tiket keluar seq-0 tidak diperlukan di mode ini: klien selalu bisa `startClose()` atas state on-chain (sebelum unit pertama, `settle()` mengembalikan seluruh deposit).

### 6.3 Fungsi penalti

```
due_i       = qty_i × p
b_i         = [m1_i > L*] ∨ [m2_i < Q*]
pen_i       = b_i × ⌊ due_i × π / 10000 ⌋
penRaw      = Σ_{i<seq} pen_i
cap         = ⌊ A × κ / 10000 ⌋
payToClient = min(penRaw, cap)
payToProv   = A − payToClient
```
Sifat: monoton terhadap jumlah pelanggaran; dibatasi `κ` sehingga provider yang jujur pada sebagian besar unit tidak bisa kehilangan seluruh pendapatan epoch; deterministik — dua pihak dengan data sama selalu menghasilkan angka sama, sehingga **tidak ada "versi" sengketa**: bukti mana pun yang valid atas `(T, R, seq, A)` menghasilkan `payToClient` yang identik.

### 6.4 Aturan penyelesaian (presedensi)

```
SETTLED via cooperative close  : toProvider = sesuai Close yang ditandatangani keduanya (require toProvider ≤ B); toClient = B − toProvider
SETTLED via jendela            : setelah deadline —
   jika ada bukti valid atas state saat ini : toProvider = min(A − payToClient, B)
   selain itu                                : toProvider = min(A, B)
   toClient = B − toProvider
```
- Klien tidak pernah membayar lebih dari yang ia ack (`A`), dan tidak pernah kurang dari `A − cap`.
- Provider tidak pernah dibayar untuk unit yang tidak di-ack, dan tidak pernah kurang dari `A − cap` tanpa persetujuannya sendiri.
- Sisa budget yang tidak terpakai (`B − A`) **selalu** kembali ke klien — sama dengan semantik refund MPP `session`.
- Jika `A > B` (provider melayani melebihi deposit — pelanggaran FR-24 di sisi provider), provider menerima `B` dan menanggung selisihnya (T17).

### 6.5 Contoh terhitung (diverifikasi numerik, integer)

Syarat: `p = 20.000` (0,02 USDG), `L* = 800 ms`, `Q* = 90`, `π = 5.000` (50%), `κ = 3.000` (30%). Budget 5,00 USDG.

| Skenario | `seq` | `A` | Pelanggaran | `penRaw` | `cap` | `payToClient` | `payToProv` | Refund sisa budget |
|---|---|---|---|---|---|---|---|---|
| EX1: 7 latensi > 800 ms | 100 | 2.000.000 | 7 | 70.000 | 600.000 | **70.000** | **1.930.000** | 3.000.000 |
| EX2: 80 unit melanggar (cap mengikat) | 100 | 2.000.000 | 80 | 800.000 | 600.000 | **600.000** | **1.400.000** | 3.000.000 |
| EX3: `qty = 5` per receipt, 2 receipt kualitas < 90 | 20 | 2.000.000 | 2 | 100.000 | 600.000 | **100.000** | **1.900.000** | 3.000.000 |

Reproduksi: `tools/settlement_vectors.py` (fungsi `settle()` identik dengan §6.3). Ketiga baris menjadi vektor uji sirkuit **dan** kontrak (§13). EX2 menunjukkan mengapa `κ` ada: tanpa cap, klien yang menyetujui metrik buruk pada 80 unit bisa menarik kembali 80% pendapatan provider — cap memaksa keputusan komersial itu dibuat saat menyepakati *terms*, bukan saat sengketa.

### 6.6 Parameter awal

| Parameter | Nilai awal | Alasan |
|---|---|---|
| `MAX_SEQ` | 128 | ≈ 90k constraint (§9.3); ptau 2¹⁷; proving detik-level dengan rapidsnark |
| `challengeWindow` (produksi) | ≥ 24 jam | ≥ jendela force-inclusion delayed inbox Arbitrum (verifikasi V13) — sequencer yang menyensor tidak boleh bisa memenangkan sengketa |
| `challengeWindow` (demo/testnet) | 120 s | Konfigurasi per channel; factory memaksakan `MIN_CHALLENGE_WINDOW` (produksi 6 jam, demo 60 s — dua deployment factory, D5) |
| `responseWindow` | `challengeWindow / 2` | Perpanjangan per checkpoint baru; total perpanjangan berhingga karena tiap checkpoint butuh **kedua** tanda tangan (T6) |
| `penaltyBps` default SDK | 5.000 | 50% harga unit per pelanggaran |
| `capBps` default SDK | 3.000 | Provider jujur di ≥ 70% unit tidak bisa dirugikan lebih dari 30% |
| `nonce` | 253-bit dari CSPRNG | komitmen tidak bisa ditebak dari ruang harga yang kecil |
| Field | BN254 scalar field `p = 21888…617` | circomlib, snarkjs, precompile EVM, `ark-bn254` |
| Hash | circomlib Poseidon (v1) parameter standar, t ∈ {3, 6, 7} | satu varian di sirkuit, SDK (`circomlibjs`), Yul (`poseidon-solidity`), dan Rust (`AegisPoseidon`, port t=3 dari `circomlibjs/poseidon_opt.js`, D3 ✅) — keluaran identik diuji silang (§8.3) |
| `epoch` | `uint32`, mulai 0, `++` per `rollover` | ada di setiap struct yang ditandatangani (§6.2); tidak ada di `ChannelTerms` maupun input publik bukti |
| `HOOK_GAS` | 300.000 gas | stipend hook payout `_send` (§8.1); hanya terpakai bila payee kontrak; testnet v2 memakai 300k + penjaga `InsufficientGas` (v1 = 150k tanpa penjaga, riwayat) |
| `protocolFeeBps` | 0 di MVP | fee bukan bagian tesis; slot ada di factory (§15) |

### 6.7 Apa yang tetap bocor — dan apa yang tidak

| Terlihat di chain | Tersembunyi |
|---|---|
| Alamat klien, provider, payout; token | `p`, `L*`, `Q*`, `π`, `κ`, `ν` |
| `B` (deposit), `A` (total yang di-ack), `seq` (jumlah unit) | `qty_i`, `m1_i`, `m2_i`, `due_i` per unit |
| `payToClient` (jika ada klaim), waktu setiap transaksi | Berapa unit yang melanggar, pelanggaran jenis apa |
| `termsCommitment`, `receiptsRoot` | Isi keduanya |
| `epoch` (jumlah rollover), `RolledOver(newEpoch, closedSeq, toProvider, remaining)` | — (sama seperti baris di atas, per epoch) |
| **Anchored mode saja (FR-25):** per `ack` — hash daun `ℓ_i` dan `A_i` (kumulatif), sehingga `due_i = A_i − A_{i−1}` per unit terlihat; dengan `qty` konstan itu **menyiratkan `p`** | `qty_i`, `m1_i`, `m2_i` (metrik) per unit, `L*`, `Q*`, `π`, `κ`, `ν`; pra-citra daun |

Inferensi yang **masih mungkin**: `A / seq` = harga rata-rata per receipt (bukan `p` jika `qty` bervariasi); `payToClient / A` = porsi penalti (bukan jumlah pelanggaran, karena `π`, `κ` privat); pola waktu ack = ritme layanan. Mitigasi yang disediakan SDK: `qty` bervariasi dan agregasi beberapa unit per receipt; **bukan** klaim "anonim". **Anchored mode membocorkan lebih banyak by design** — granularitas harga per unit (bukan ambang, metrik, atau pelanggaran); karena itu `leak-check` untuk channel anchored mengeluarkan `unitPrice` dari himpunan nilai privat yang diperiksa dan web console menuliskannya ("hash daun + A per ack terlihat on-chain; metrik & ambang tetap privat"). Sebutkan tabel ini apa adanya di README dan pitch.

---

## 7. SYSTEM ARCHITECTURE

```
      OFF-CHAIN                                       ON-CHAIN (Robinhood Chain 4663 / 46630)
 ┌──────────────────────┐                        ┌──────────────────────────────────────┐
 │ Klien agen           │  402 payTo=channel     │  x402ExactPermit2Proxy (kanonik)     │
 │ (MeshWallet / 4337)  │ ─────────────────────► │  0x402085c2…20001 → Permit2          │──┐ USDG
 │ aegis-sdk: ack, sign │                        └──────────────────────────────────────┘  │
 │ prover (snarkjs)     │                                                                  ▼
 └─────────┬────────────┘   open(ChannelTerms)   ┌──────────────────────────────────────┐
           │                ─────────────────►   │  AegisChannelFactory (CREATE2)       │
           │  receipt/ack   ◄────────────────    │   └─ clone → AegisChannel #k         │
           ▼                                     │        client, provider, T, R, seq, A │
 ┌──────────────────────┐   checkpoint / close   │        OPEN → CLOSING → SETTLED       │
 │ Provider agen        │ ─────────────────────► │        claimPenalty(proof) ───────────┼──► SLASettlementVerifier
 │ middleware x402      │   rollover (epoch++)   │        settle() permissionless        │    (Groth16, Solidity)
 │ Aegis-Receipt header │                        │        ack()/startClose() [anchored] ─┼──► AegisPoseidon (Stylus) / PoseidonPathYul
 └──────────────────────┘                        │        payout → _send(hook onPayout) ─┼──► AegisTreasuryRouter (kredit + claim)
                                                 └──────────────────────────────────────┘
 ┌──────────────────────┐   settle(), sweep()                        │
 │ Watcher / settler    │ ───────────────────────────────────────────┘
 └──────────────────────┘
```

### Prinsip desain
1. **Satu channel = satu kontrak.** Alamat adalah atribusi. Rel pembayaran mana pun yang bisa mengirim USDG ke sebuah alamat sudah terintegrasi.
2. **Ack adalah checkpoint.** Tidak ada state off-chain yang tidak co-signed; tidak ada langkah "sinkronisasi".
3. **Kontrak tidak pernah melihat receipt.** Ia melihat tanda tangan dan bukti. Itulah privasinya.
4. **Deterministik, bukan optimistik.** Tidak ada asersi yang bisa "ditantang" dengan bond; hanya ada bukti yang valid atau tidak.
5. **Gagal ke checkpoint co-signed terakhir.** Tanpa bukti dan tanpa checkpoint baru, hasilnya persis yang kedua pihak terakhir setujui (G5).
6. **Immutable, tanpa admin di jalur dana.** Tidak ada proxy, `pause`, atau peran yang bisa menyentuh saldo channel. Factory hanya memegang parameter minimum, alamat verifier, dan (P1) alamat Poseidon **saat deploy**; implementasi channel menyimpannya sebagai immutable — mode co-signed/anchored adalah sifat factory, bukan channel.
7. **Stylus hanya jika diukur.** Setiap komponen Stylus punya padanan Yul dengan ABI dan keluaran identik (`AegisPoseidon` ↔ `PoseidonPathYul`), di-benchmark on-chain di jaringan yang sama (D2 ✅: 1,75× pada `insertPath`).
8. **Hook payout tidak pernah menyandera dana (P1).** Payee kontrak boleh menerima `onPayout`, tetapi kegagalannya diabaikan (try/catch + stipend), dan pemanggil `settle`/`sweep` tidak bisa "mengelaparkan" hook tanpa transaksinya sendiri revert (`InsufficientGas`).

---

## 8. CONTRACT SPECIFICATIONS

### 8.1 `AegisChannel` (implementasi untuk EIP-1167 clone) — sebagaimana dibangun (`contracts/src/AegisChannel.sol`)

```solidity
enum State { UNINIT, OPEN, CLOSING, SETTLED }

struct Config {                 // ditulis sekali oleh factory saat initialize; di-hash utuh menjadi salt CREATE2 (§8.5)
    address client; address provider; address token;   // token = USDG
    bytes32 termsCommitment;                            // T
    uint32  challengeWindow; uint32 responseWindow;     // responseWindow ≤ challengeWindow (BadConfig)
    address payoutClient; address payoutProvider;       // bebas (D8); ≠ 0
    bytes32 salt;
}

// Immutable di bytecode implementasi (sama untuk semua clone satu factory):
address FACTORY; ISLASettlementVerifier VERIFIER; ISignatureTransfer PERMIT2;
IPoseidonPath POSEIDON; bool ANCHORED = (poseidonPath != 0);            // mode per factory (FR-25)
uint64 constant MAX_SEQ = 128;  uint256 constant HOOK_GAS = 300_000;

// Storage per channel (variabel publik datar, bukan struct):
Config cfg; bytes32 domainSeparator; State state;
uint32  epoch;                  // FR-10: ++ per rollover; ada di setiap struct yang ditandatangani
uint64  seq; uint128 cumulativeAmount /*A*/; bytes32 receiptsRoot /*R*/;
uint64  deadline;               // hanya bermakna di CLOSING
uint128 payToClient; uint64 proofSeq; bool hasProof;   // bukti tertunda; dipakai hanya jika hasProof && proofSeq == seq
uint256[7] filledSubtrees;      // pohon inkremental kedalaman 7 (hanya anchored); di-nol-kan saat rollover

function initialize(Config calldata c, address opener, bytes calldata sigClient, bytes calldata sigProvider) external;
    // factory-only; untuk tiap pihak: opener == pihak ATAU tanda tangan EIP-712 ChannelTerms sah (FR-2)
function fundWithPermit2(ISignatureTransfer.PermitTransferFrom calldata p, bytes calldata sig) external nonReentrant;   // opsional; transfer biasa juga sah
function budget() public view returns (uint256);                                    // token.balanceOf(this)
function hashCheckpoint(uint32 epoch, uint64 seq, uint128 A, bytes32 R) / hashClose(epoch, seq, toProvider)
       / hashRollover(epoch, seq, toProvider) / hashLeaf(epoch, seq, bytes32 leaf, uint128 A) → bytes32   // struct hash EIP-712, pure

// ---- mode co-signed ----
function submitCheckpoint(uint64 seq, uint128 A, bytes32 R, bytes calldata sigClient, bytes calldata sigProvider) external;
    // revert WrongMode jika ANCHORED. OPEN: mulai CLOSING, deadline = now + challengeWindow
    // CLOSING: require seq > latest.seq; ganti state; deadline = max(deadline, now + responseWindow); hasProof = false (FR-15)
// ---- mode anchored (FR-25) ----
function ack(uint64 seq, bytes32 leaf, uint128 A, bytes calldata sigProvider) external;
    // revert WrongMode jika !ANCHORED; hanya cfg.client (NotClient); state OPEN; seq == latest.seq (StaleCheckpoint);
    // seq < MAX_SEQ; A ≥ latest.A (AmountDecreased); sigProvider atas Leaf(epoch, seq, leaf, A);
    // (root, nodes) = POSEIDON.insertPath(leaf, seq, filledSubtrees)  — SATU panggilan, 7 hash t=3 (STATICCALL);
    // simpan nodes[i] untuk level dengan bit-i(seq) == 0; R = root; seq += 1; A = A_baru; hasProof = false; emit Acked
function startClose() external;
    // revert WrongMode jika !ANCHORED; hanya pihak; OPEN → CLOSING, deadline = now + challengeWindow; emit CloseStarted
// ---- kedua mode ----
function claimPenalty(uint256[8] calldata proof, uint128 payToClient) external;     // hanya client/provider; state CLOSING
    // publicInputs = [channelIdField, T, R, seq, A, payToClient]; require verifier.verifyProof; require payToClient <= A (FR-18)
function settle() external nonReentrant;                                            // CLOSING && now >= deadline; siapa pun
function closeCooperative(uint64 seq, uint128 toProvider, bytes calldata sigClient, bytes calldata sigProvider) external nonReentrant;
    // OPEN atau CLOSING; seq >= latest.seq; dua tanda tangan Close(epoch, seq, toProvider); toProvider <= budget(); toClient = budget() − toProvider
function rollover(uint64 seq, uint128 toProvider, bytes calldata sigClient, bytes calldata sigProvider) external nonReentrant;
    // FR-10: OPEN atau CLOSING; seq >= latest.seq; dua tanda tangan Rollover(epoch, seq, toProvider); toProvider <= budget();
    // epoch++; seq = A = R = deadline = 0; hasProof = false; state = OPEN; anchored: delete filledSubtrees;
    // _send(payoutProvider, provider, toProvider); sisa TETAP di channel; emit RolledOver(newEpoch, seq, toProvider, budget()), PaymentReleased
function sweep() external nonReentrant;                                             // SETTLED: sisa saldo → payoutClient (lewat _send)

function channelIdField() public view returns (uint256) { return uint256(uint160(address(this))); }   // < p_BN254, tanpa reduksi
```

**Alur `settle()`:**
```
1. require state == CLOSING && block.timestamp >= deadline
2. pen = (hasProof && proofSeq == seq) ? payToClient : 0     // bukti hanya berlaku untuk state yang dibuktikannya (FR-15)
3. B = token.balanceOf(this); toProvider = min(A − pen, B);  toClient = B − toProvider
4. state = SETTLED (efek sebelum interaksi)
5. _send(payoutProvider, provider, toProvider); _send(payoutClient, client, toClient)      // transfer + hook (di bawah)
6. emit Settled(seq, A, pen, toProvider, toClient, cooperative=false); emit PaymentReleased(jobId, provider, toProvider); emit Refunded(jobId, client, toClient)   // ERC-8183 (FR-27), jobId = channelIdField()
```
`closeCooperative` memakai `_payout` yang sama dengan `pen = 0`, `cooperative = true`.

**`_send(to, party, amount)` — transfer + hook payout best-effort (P1, FR-26).** `amount == 0` → return. `safeTransfer(to, amount)`; jika `to.code.length > 0`: `try IAegisPayoutHook(to).onPayout{gas: HOOK_GAS}(party, cfg.token, amount) {} catch {}` lalu **`if (gasleft() < HOOK_GAS / 63) revert InsufficientGas();`**. Baris terakhir adalah perbaikan temuan manual **M-1** audit Slither (`docs/audit/slither-2026-09.md` §3.5): `{gas: HOOK_GAS}` hanya batas *atas* — per EIP-150 callee menerima `min(HOOK_GAS, 63/64 · gasleft)`, dan karena `settle`/`sweep` permissionless, pihak ketiga bisa memilih gas limit sehingga hook kehabisan gas tetapi tx luar tetap selesai: token sudah pindah ke payee, atribusinya (untuk router: kredit) tidak pernah terjadi. Pemeriksaan pasca-panggilan bergaya OZ `ERC2771Forwarder._checkForwardedGas` menjamin hook **ditawari** stipend penuh (≥ 63·⌊300.000/63⌋ = 299.943 gas) atau tx revert; hook yang gagal karena ulahnya sendiri (revert, membakar stipend) tetap diabaikan (T20). Jendela sebelum perbaikan terukur hanya untuk hook ≈227k–300k gas; router yang dikirim ≈55k (MockUSDG) / ≈115–120k estimasi proxy USDG bergaya Paxos — karena itu `HOOK_GAS` dinaikkan dari 150k ke 300k (I2). Semua pemanggil `_send` `nonReentrant` dan state sudah final sebelum panggilan (CEI). Uji: `HookGas.t.sol` (5 test, 3 di antaranya gagal pada kode sebelum perbaikan).

**Tanda tangan.** `SignatureChecker.isValidSignatureNow(signer, digest, sig)` (OpenZeppelin) untuk `client` dan `provider` — EOA atau ERC-1271 (`staticcall`, tidak bisa re-enter). Digest EIP-712 dengan `verifyingContract = address(this)`; karena clone, `domainSeparator` dihitung saat `initialize` dan disimpan (bukan immutable bytecode). Catatan clone: konstruktor `ReentrancyGuard` tidak pernah berjalan untuk clone, `_status` mulai 0 bukan 1 — OZ v5 hanya membandingkan dengan `ENTERED` (2), jadi guard bekerja; panggilan terjaga pertama per channel membayar SSTORE 0→2 (≈22k) sekali (audit §3.6).

**Kenapa `channelIdField` = alamat.** Alamat 160-bit selalu < `p` BN254; tidak perlu reduksi, tidak ada tabrakan; dan nilainya identik dengan `verifyingContract` EIP-712 — satu identitas untuk tanda tangan dan bukti.

**Kenapa hanya pihak yang boleh `claimPenalty`.** Bukti valid dari siapa pun menghasilkan angka yang sama (deterministik), jadi pembatasan ini bukan soal kebenaran — ia membatasi permukaan T4 (setup bocor): pihak luar tidak bisa memaksa hasil ke channel orang lain.

**Kenapa `claimPenalty` tidak butuh jendela sendiri.** Bukti terikat ke `(R, seq, A)` saat ini. Jika lawan memegang checkpoint lebih baru, ia mengirimnya (FR-13) dan bukti gugur — dan checkpoint itu adalah state yang pembuat bukti **sendiri** tanda tangani. Tidak ada yang bisa dirugikan oleh state yang ia setujui.

**Events:** `Opened(client, provider, T, challengeWindow)`, `Funded(from, amount)` (dipancarkan oleh `fundWithPermit2`; transfer langsung terlihat lewat `Transfer` USDG), `CheckpointSubmitted(seq, A, R, deadline)`, `PenaltyClaimed(by, seq, payToClient)`, `Settled(seq, A, penalty, toProvider, toClient, cooperative)`, `Swept(amount)`, **P1:** `RolledOver(newEpoch, closedSeq, toProvider, remaining)`, `Acked(seq, leaf, A, root)`, `CloseStarted(by, seq, A, R, deadline)`; plus `JobFunded/PaymentReleased/Refunded` (FR-27). **Errors:** `NotFactory, AlreadyInitialized, BadConfig, BadSignature, WrongState, StaleCheckpoint, SeqTooLarge, NotParty, ExceedsCumulative, InvalidProof, TooEarly, ExceedsBudget, WrongToken, WrongMode, NotClient, AmountDecreased, InsufficientGas`. Ukuran runtime implementasi: 12.411 byte pada Task 5 P1 (ledger; sebelum penambahan `InsufficientGas`/`HOOK_GAS` 300k — ukuran saat ini belum dicatat).

---

### 8.2 `SLASettlementVerifier` (Solidity, ekspor snarkjs)

```solidity
function verifyProof(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[6] input) external view returns (bool);
// input = [channelIdField, termsCommitment, receiptsRoot, seq, cumulativeAmount, payToClient]
```
Verifier hasil `snarkjs zkey export solidityverifier`, dipasang sebagai alamat immutable di factory → channel. Biaya: 194.396 gas untuk 1 input publik (gnark, Foundry, reproduksi `frame-verify-gas`); tiap input publik tambahan ≈ +6,2k gas (`ecMul` 6.000 + `ecAdd` 150) → **≈ 225k gas** untuk 6 input. **Terukur 19 Sep 2026 (Foundry, bukti EX1 asli): 229.241 gas** (V10 ✅).

**Kenapa Solidity, bukan Stylus (D2).** Empat pairing + 6 `ecMul` adalah 100% precompile. zk-sunade — implementasi Stylus yang memanggil precompile yang sama lewat `RawCall` — mencatat 256.334 gas; overhead-nya adalah init program (8.832 gas non-cache / 352 cache) + host I/O per call. Tidak ada yang bisa dimenangkan; ada yang bisa dikalahkan (toolchain, ukuran WASM, expiry program 365 hari).

**P1:** verifier, sirkuit, dan zkey **tidak berubah** (release `v0.1.0-zkey`); anchored mode memakai bukti yang sama atas `R`/`seq`/`A` on-chain. File verifier dibekukan byte-per-byte terhadap ekspor snarkjs — tiga temuan High Slither (`incorrect-return` pada `return(0, 0x20)` Yul) adalah *false positive* idiom snarkjs dan sengaja tidak disentuh (audit ID-0..2).

---

### 8.3 `AegisPoseidon` (Stylus, **P1 — dikirim, D2 ✅**) & anchored mode — sebagaimana dibangun

**Antarmuka on-chain (`contracts/src/interfaces/IPoseidonPath.sol`) — dua implementasi, satu ABI, keluaran identik:**
```solidity
interface IPoseidonPath {
    function hash2(uint256 a, uint256 b) external view returns (uint256);                     // 1 hash t=3; tidak dipakai on-chain (known-answer check deploy saja)
    /// cur = leaf; untuk level i = 0..6: bit i dari `index` 0 → (cur, zeros[i]), nodes[i] = cur; bit 1 → (filled[i], cur), nodes[i] = filled[i];
    /// cur = H(kiri, kanan). Kembalikan (root, nodes). Revert bila input ≥ p_BN254 ("NotField") atau index ≥ 128 ("BadIndex").
    function insertPath(uint256 leaf, uint256 index, uint256[7] calldata filled) external view returns (uint256 root, uint256[7] memory nodes);
}
```
1. **`stylus/aegis-poseidon/` — `AegisPoseidon`** (Rust, `no_std`, `stylus-sdk` 0.10.9): circomlib **Poseidon v1** t=3 (8 full + 57 partial round, S-box x⁵), port 1:1 dari `circomlibjs/src/poseidon_opt.js` — algoritma teroptimasi (konstanta round dilipat, matriks jarang `S` untuk 57 partial round, matriks pra-jarang `P`) di atas `ark-bn254`/`ark-ff` 0.5 (`MontFp!`, `Fr::sum_of_products`; aritmetika `#[inline(never)]` agar hanya satu salinan `Fr::mul`). Konstanta dibangkitkan dari `circomlibjs` oleh `scripts/gen_constants.mjs`; `zeros[0..6]` dari fixture `anchored_ex1.json`. **21,7 KB terkompresi** (batas Stylus 24 KB; ≈12,3 KB di antaranya adalah 384 konstanta field). **Aktif di testnet 46630: `0x1027cf7DC26152012ed9Ef949Aa1432Bf1C7ef34`**, dipakai `factoryAnchored`. Dua build referensi sebelumnya (riwayat): `opt-level=z` `0xd2b67074…37a7` (18,4 KB) dan `opt-level=3` `0x65b059d9…f038` (20,1 KB). Tidak ada CacheManager di chain ini (`cargo stylus cache bid` → "no cache managers found") — setiap panggilan membayar init program uncached (≈8,8k gas).
2. **`contracts/src/PoseidonPathYul.sol`** — implementasi identik di atas `PoseidonT3` (`poseidon-solidity`, Yul, library eksternal via `DELEGATECALL`): dipakai Foundry (tidak ada VM WASM), Anvil lokal, dan **Rencana B** bila `POSEIDON_STYLUS` kosong saat deploy. Di testnet juga di-deploy sebagai pembanding apple-to-apple (`0x804318aE…3766`, `PoseidonT3` `0xd52e2919…3d1`), bukan bagian deployment produksi.

**Kesetaraan keluaran (D3 ✅), diuji silang:** `hash2(1,2) = 7853200120776062878684798364095072458815029376092732009249414926327459813530` (vektor circomlib) dan `insertPath(leaf0, 0, zeros) = 8867972900015110853220544640232097790621643464826894219536805239310374416705` **identik** di Yul dan ketiga build Stylus (on-chain, `cast call`); `cargo test` 9/9 (rantai zeros, 100 root `insertPath` vs SDK, 19 pasangan daun vs `circomlibjs`, penolakan input ≥ p, 20.000 triple `sum_of_products`); `PoseidonPathYul.t.sol` 5 test (128 daun bertahap == root SDK); `Anchored.t.sol` 3 ack == root fixture. `DeployTestnet.s.sol` menjalankan known-answer check `hash2(1,2)` (via `vm.rpc eth_call`, karena Foundry tidak bisa mengeksekusi WASM) terhadap `POSEIDON_STYLUS` **sebelum** men-deploy `factoryAnchored` — wiring yang salah gagal jelas, bukan diam-diam menghasilkan root yang salah.

**Angka D2 final (`docs/benchmarks/poseidon.md` §5; `cast estimate`, gas total termasuk intrinsik, testnet 46630, 20 Sep 2026):**

| Implementasi | `insertPath` (7 hash, jalur `ack`) | `hash2` (1 hash) |
|---|---|---|
| Yul `PoseidonPathYul` | **252.271** | **62.138** |
| Stylus referensi `opt-level=z` | 231.217 | 91.259 |
| Stylus referensi `opt-level=3` | 175.905 (1,43×; ≈1,50× eksekusi) | 83.172 |
| **Stylus teroptimasi (aktif)** | **144.076 → 1,75× total, ≈1,9× eksekusi-saja** | 82.593 |

Foundry (Yul, eksekusi saja, referensi): `insertPath` 222.766. Kesimpulan: pada hash tunggal Yul lebih murah di **ketiga** build Stylus (init program mendominasi satu hash) — karena itu `AegisChannel` tidak pernah memanggil `hash2` on-chain, dan `ack` memakai **satu** panggilan `insertPath` (7 hash), bukan 7× `hash2`. **Angka 2,33× dari benchmark 19–20 Sep berasal dari Poseidon2 (`openzeppelin-crypto`), yang tidak kompatibel circomlib/sirkuit — ditarik dan hanya disimpan sebagai riwayat metodologi** (`docs/benchmarks/poseidon.md` §§0–4). Ambang D2 (≥ 1,5×) terpenuhi dengan hash yang benar-benar dipakai sirkuit.

**`hash5`/`hash6`/`root128` tidak dibangun (berbeda dari v1.0).** Tidak ada pemakainya on-chain: daun (`Poseidon` t=6) dan komitmen syarat (t=7) dihitung di SDK dan sirkuit, tidak pernah di kontrak; `root128` hanya berguna untuk Rencana B3 (commit-reveal), yang tidak pernah diaktifkan (§18). Program Stylus dibatasi pada dua fungsi yang punya jalur on-chain nyata; ukuran WASM dan permukaan audit ikut kecil.

**Anchored mode (FR-25) sebagaimana dibangun.** Untuk job bernilai tinggi & frekuensi rendah di mana kedua pihak ingin setiap ack **on-chain** (tanpa asumsi liveness channel dan tanpa responder tantangan): mode ditentukan **per factory** (`POSEIDON` immutable ≠ 0 ⇒ `ANCHORED`; `Config`/`ChannelTerms`/salt/`predict` tidak berubah). Klien memanggil `ack(seq, leaf, cumulativeAmount, sigProvider)` — `leaf = Poseidon(seq, qty, m1, m2, due)` dihitung **off-chain** oleh keduanya dan ditandatangani provider bersama `A` baru (`Leaf(uint32 epoch,uint64 seq,bytes32 leaf,uint128 cumulativeAmount)`), sehingga metrik tetap privat — dan kontrak memasukkan `leaf` ke pohon inkremental kedalaman 7 (pola Semaphore/Tornado; `zeros[0]=0`, `zeros[i+1]=H(zeros[i],zeros[i])`, `zeros[7]` = root pohon kosong = `merkleRoot([])` SDK) dengan **7 hash t=3 per ack dalam satu panggilan `insertPath`**. `startClose()` (pihak mana pun) membuka jendela tantangan atas state on-chain; selama `CLOSING` pihak boleh `claimPenalty` dengan bukti atas `R/seq/A` on-chain (sirkuit dan verifier tidak berubah, `seq` = jumlah ack), lalu `settle()` permissionless. `submitCheckpoint` → `WrongMode`; `closeCooperative`/`rollover`/`sweep`/`fundWithPermit2` berlaku di kedua mode; `rollover` me-nol-kan `filledSubtrees`. Tiket keluar seq-0 tidak diperlukan. Ini satu-satunya tempat AegisClear menghitung Poseidon di chain — karena itu satu-satunya tempat Stylus punya pekerjaan.

**Gas anchored terukur (testnet 46630 deploy v2, Stylus; README "Alamat kontrak"):** `fund` 57.632 · `ack` pertama **352.421** (storage dingin), lalu **206.615–212.830** stabil (9 `ack` berikutnya) · `startClose` **64.045** · `claimPenalty` 307.625 · `settle` 100.988 (v1, bytecode pra-audit: `ack` pertama 357.028, stabil 211.021–217.237, `startClose` 65.484, `claimPenalty` 312.706). Pembanding Yul di Anvil (bukan testnet): `ack` pertama 449.142, stabil ≈303.400–309.400. Estimasi v1.0 (≈83k Stylus / ≈140k Yul per `ack`) terlalu optimistis: ia mengabaikan init program uncached, 7 SSTORE `filledSubtrees`, dan verifikasi tanda tangan.

**Batas praktis Stylus yang relevan (nilai on-chain 19 Sep 2026, §19 V2):** `inkPrice` 10.000 ink/gas, `freePages` 2, `pageGas` 1.000, `pageLimit` 128 (8 MB), `minInitGas` 8.832 / cached 352 (cache tidak tersedia di chain ini), `expiryDays` 365, `keepaliveDays` 31. Program yang tidak dipanggil ≥ 365 hari harus di-`keepalive` — T15. **Catatan operasional P1 (README M9):** watcher `keepalive` otomatis **belum diimplementasikan** (P2); sampai saat itu `keepalive` manual. Bila `AegisPoseidon` kedaluwarsa, `ack()` berhenti (panggilan `insertPath` gagal) tetapi **dana selalu bisa diselamatkan** lewat jalur EVM murni yang tidak pernah memanggil `POSEIDON`: `startClose()` → `claimPenalty()` (opsional) → `settle()`, atau `closeCooperative()`.

---

### 8.4 `AegisTreasuryRouter` (P1 — dikirim) — hook + buku kredit + `claim`

ERC-20 tidak punya hook penerimaan, jadi "receive → forward" dari v1.0 diwujudkan sebagai **hook yang dipanggil channel** setelah transfer (`_send`, §8.1):

```solidity
interface IAegisPayoutHook { function onPayout(address party, address token, uint256 amount) external; }

contract AegisTreasuryRouter is IAegisPayoutHook, ReentrancyGuard {          // tanpa owner, tanpa upgrade
    mapping(address agent => address treasury) public treasuryOf;
    mapping(address agent => mapping(address token => uint256)) public credit;
    mapping(address token => uint256) public totalCredit;
    function setTreasury(address treasury) external;                          // msg.sender mengatur MILIKNYA SENDIRI (EOA/Safe/4337); address(0) = hapus
    function destinationOf(address agent) public view returns (address);      // treasuryOf[agent] atau agent
    function onPayout(address party, address token, uint256 amount) external nonReentrant;
        // require balanceOf(this) >= totalCredit[token] + amount  (Unbacked) — invarian Σcredit[token] ≤ saldo, juga SELAMA panggilan
        // credit[party][token] += amount; totalCredit += amount; ok = _tryTransfer(token, destinationOf(party), amount);
        // ok → kurangi credit/totalCredit;  gagal (mis. tujuan dibekukan USDG) → kredit tetap; emit PayoutRouted(party, token, dest, amount, ok)
    function claim(address token, address to) external nonReentrant;          // msg.sender menarik credit[msg.sender][token] → to (NothingToClaim)
}
```
Channel dibuka dengan `payoutProvider = router` (SDK: `ProviderOptions.payoutProvider`) dan/atau `payoutClient = router` (klien: `payoutTo`); channel mentransfer ke router lalu memanggil `onPayout` dalam tx yang sama, router meneruskan ke `treasuryOf(agent)` atau ke agen bila belum diset. **Tidak ada custody yang disengaja**: kredit hanya muncul bila penerusan gagal, dan hanya agen itu yang bisa menariknya. `_tryTransfer` adalah `call` tingkat rendah yang **tidak revert** (kembalian kosong = ok, 32 byte = bool, selain itu = gagal) — token yang menolak tujuan menjadi kredit, bukan revert yang men-dampar token di router tanpa jejak. `onPayout` dan `claim` sama-sama `nonReentrant` (satu guard OZ) sehingga jalur re-entrancy lintas-fungsi yang dilaporkan Slither (ID-4, *false positive*) revert; uji `test_onPayout_cross_function_reentrancy_into_claim_is_blocked`. Gas ekstra hanya bagi yang memakai router (SSTORE kredit + transfer); channel dengan payee EOA hanya membayar `extcodesize`.

**Peringatan (I2, NatSpec `onPayout`):** `onPayout` permissionless dan **tidak bisa** membedakan token yang baru masuk dari hook channel dengan token yang sudah ada di saldo. Token yang mendarat di router **di luar** jalur hook (transfer ERC-20 langsung, token non-standar) tidak diatribusikan ke siapa pun dan menjadi *slack* yang bisa diklaim **pemanggil mana pun** lewat `onPayout(party, token, amount)` dengan `party` pilihannya. **Jangan pernah mengirim token langsung ke alamat router** — channel (lewat `_send`) adalah satu-satunya pengirim yang dimaksud. Dengan M-1 diperbaiki (§8.1), jalur hook sendiri tidak lagi bisa menghasilkan slack.

**Status deploy:** router testnet v2 `0xE97dD3879B2aAe737b23B9219E5580EdB5Fae17A` (skenario "13 (FR-26)" suite SDK: treasury dibayar dalam tx `close` yang sama, channel `0x75aC713F…bBfe`; v1 `0xe4A87335…7689`, channel `0x5a57e6ed…fde1`). Bytecode v2 memuat `HOOK_GAS` = 300k **dan** penjaga `InsufficientGas` (v1 = 150k tanpa penjaga). Uji: `TreasuryRouter.t.sol` (11 test: forward ke treasury / ke agen, `setTreasury` per pengirim, payee revert/membakar gas tidak memblokir settle & close, treasury dibekukan → kredit → `claim`, `onPayout` tanpa token masuk → `Unbacked`, kembalian sampah, `sweep`/`rollover` juga lewat hook) + `HookGas.t.sol`. Ini implementasi "Fleet Treasury Router" dari draft — sengaja **kecil**; nilainya adalah menjaga hot wallet robot tetap kosong, bukan logika treasury.

---

### 8.5 `AegisChannelFactory` & `MockUSDG`

```solidity
constructor(address verifier, address permit2, uint32 minChallengeWindow, address poseidonPath);
    // verifier == 0 || permit2 == 0 → ZeroAddress (audit ID-5/ID-7: salah deploy = claimPenalty/fundWithPermit2 mati permanen untuk semua clone)
    // poseidonPath boleh 0 = mode co-signed; ≠ 0 = mode anchored (FR-25) — implementasi AegisChannel di-deploy di sini dengan ketiganya sebagai immutable
address public immutable IMPLEMENTATION; address public immutable VERIFIER; address public immutable PERMIT2;
uint32  public immutable MIN_CHALLENGE_WINDOW;   // 21.600 s (6 jam) produksi / 60 s demo & anchored (D5)
address public immutable POSEIDON;               // 0 = co-signed; kontrak IPoseidonPath = anchored
function salt(Config calldata c) public pure returns (bytes32);        // keccak256(abi.encode(c)) — SELURUH Config, termasuk payout & salt
function predict(Config calldata c) public view returns (address);     // Clones.predictDeterministicAddress(IMPLEMENTATION, salt(c), this)
function open(Config calldata c, bytes calldata sigClient, bytes calldata sigProvider) external returns (address channel);
    // c.challengeWindow >= MIN_CHALLENGE_WINDOW (WindowTooShort); predict(c).code.length != 0 → AlreadyOpen (pra-cek, hemat gas tabrakan CREATE2);
    // cloneDeterministic + initialize(c, msg.sender, sigClient, sigProvider); emit ChannelOpened(channel, client, provider, T)
    // tanda tangan boleh kosong untuk pihak yang == msg.sender
```
`predict()` membuat alamat channel diketahui **sebelum** ada — provider bisa memasukkannya ke 402 `payTo` dan klien mendanainya lewat facilitator apa pun; `open()` bisa terjadi sesudah dana masuk, oleh siapa pun yang memegang tanda tangan kedua pihak (atau salah satu pihak dengan tanda tangan pihak lain). Karena **seluruh** `Config` di-hash ke salt, alamat itu hanya bisa menjadi channel dengan syarat persis yang ditandatangani. Tiga factory di testnet v1 (README "Alamat kontrak"): `factory` demo co-signed 60 s `0x596E9f21…dAfF`, `factoryProd` co-signed 21.600 s `0xf8e93aE5…FE5a`, `factoryAnchored` 60 s + `POSEIDON` = Stylus `0x1fB7d8E1…6147` — kode implementasi identik, hanya immutable-nya berbeda. Uji: `Factory.t.sol` (9 test, termasuk `test_open_twice_same_config_reverts`, `test_constructor_zero_verifier_or_permit2_reverts`). `MockUSDG`: ERC-20 6 desimal, `mint` bebas, hanya testnet (`0x7455E600…94EF`).

---

### 8.6 Peran & kendali (matriks akses)

| Peran | Bisa apa | Tidak bisa apa | Catatan |
|---|---|---|---|
| `client` | mendanai, ack (tanda tangan checkpoint — co-signed; **tx `ack()` sendiri — anchored**), `submitCheckpoint` (co-signed), `startClose` (anchored), `claimPenalty`, `closeCooperative` / `rollover` (dengan provider) | menarik dana sepihak sebelum settle, mengubah `T`, `ack` atas `A` yang turun | satu-satunya pemanggil `ack` (`NotClient`) |
| `provider` | `submitCheckpoint` (co-signed), `startClose` (anchored), `claimPenalty`, `closeCooperative` / `rollover` (dengan klien), menandatangani `Leaf` (anchored) | membuat receipt/daun tanpa persetujuan klien, mengubah `T`, memanggil `ack` | ack anchored tetap butuh tx klien |
| Siapa pun | `fund` (transfer), `open` dengan tanda tangan sah, `settle` setelah deadline, `sweep`, `onPayout` router (dijaga `Unbacked`) | memicu `rollover`/`close` tanpa dua tanda tangan; "mengelaparkan" hook payout (`InsufficientGas`) | watcher bot; pemanggil `settle`/`sweep` dengan payee kontrak harus memberi gas ≥ stipend |
| Agen di router | `setTreasury(treasury)` untuk **dirinya sendiri**, `claim(token, to)` atas kreditnya sendiri | mengatur treasury atau menarik kredit pihak lain | tanpa owner; slack dari transfer langsung bisa diklaim siapa pun (I2) |
| Payee kontrak (hook) | menerima `onPayout(party, token, amount)` dengan stipend 300k | memblokir/menggagalkan `settle`/`close`/`sweep`/`rollover` (try/catch), re-enter fungsi terjaga | T20 |
| Factory deployer | men-deploy factory dengan `VERIFIER`, `PERMIT2`, `MIN_CHALLENGE_WINDOW`, `POSEIDON` (mode) | mengubah apa pun setelah deploy | tidak ada owner; mode adalah sifat factory |
| Koordinator trusted setup | (satu kali) menghasilkan zkey | — | **risiko T4**; ceremony ≥ 3 kontributor sebelum dana mainnet non-demo |

Tidak ada `owner`, `pause`, proxy, atau `upgradeTo` di jalur dana. Matriks ini disalin di README ("Peran & kendali") — kriteria "smart contract quality" akan mencarinya.

---

### 8.7 Anggaran gas (estimasi v1.0 → **terukur 20 Sep 2026**, Foundry + testnet 46630)

| Operasi | Estimasi (v1.0) | Terukur (Foundry / testnet) |
|---|---|---|
| `open` (clone + initialize; klien = `msg.sender`, 1 verifikasi tanda tangan provider) | ≈ 180k | **295.634** (Foundry `--gas-report`, `Cooperative.t.sol`, 8 panggilan identik, 20 Sep 2026); dengan dua tanda tangan / di testnet: belum diukur terpisah |
| Transfer USDG ke channel (proxy Paxos) | ≈ 60k | MockUSDG: **51.577** (Anvil) · **58.413** (testnet 46630); v1: 57.905 (co-signed) · 59.872 (anchored); proxy Paxos di mainnet belum diukur |
| `submitCheckpoint` (2 tanda tangan EOA) | ≈ 80k | **102.825** (Anvil) · **118.929** (testnet v0) · **118.113** (testnet v1) · **119.336** (testnet v2) |
| `closeCooperative` (2 tanda tangan + 2 transfer ke EOA) | ≈ 190k | median **100.191**, maks **109.003** (Foundry `--gas-report`, `Cooperative.t.sol`, 20 Sep 2026); testnet: belum diukur terpisah |
| `claimPenalty` (verifier 6 input + storage) | ≈ 260k | verifier saja: **229.241**; total **293.880** (Anvil) · **309.373** (testnet v0, tx `0x54355aef…`) · **308.256** (testnet v1) · 312.706 (testnet v1, anchored) · **309.342** (testnet v2) · 307.625 (testnet v2, anchored) |
| `settle` (2 transfer) | ≈ 130k | **93.900** (Anvil) · **98.291** (testnet v0) · **102.427** (testnet v1, co-signed dan anchored) · **101.474** / 100.988 (testnet v2, co-signed / anchored) |
| `settle` dengan payee kontrak yang membakar stipend hook (T20, Foundry) | — | **212.572** (ledger P1 Task 3; `HOOK_GAS` saat itu 150k) — dengan router nyata: belum diukur terpisah |
| `rollover` (2 tanda tangan + 1 transfer + reset) | — | belum diukur terpisah (ada di dalam skenario 11 testnet, channel `0x188febd7…37c7`) |
| `ack` anchored (7 hash t=3 + storage) — Stylus / Yul | ≈ 83k / 140k | Stylus (testnet 46630): 357.028 pertama, ≈211k–217k stabil; Yul (Anvil): 449.142 pertama, ≈303k–309k stabil |
| `startClose` (anchored, membuka jendela tantangan) | — | **65.484** (testnet v1) · **64.045** (testnet v2) |
| `insertPath` 7 hash Poseidon t=3 (`cast estimate`, kontrak Poseidon berdiri sendiri) — Stylus teroptimasi / Yul | ≈ 83k / 140k | Stylus **144.076** vs Yul **252.271** (1,75×); `hash2` tunggal Yul 62.138 vs Stylus 82.593 |
| Aktivasi `AegisPoseidon` (sekali) | 1.659.168 + data fee | AegisPoseidon aktif di `0x1027cf7D…ef34`, 21,7 KB; *data fee* estimasi `cargo stylus check` 0,000095 ETH (build referensi) / 0,000091 ETH (build teroptimasi, `stylus/aegis-poseidon/README.md`); gas aktivasi aktual belum dicatat |

Pada gas price mainnet saat diukur (0,0676 gwei), seluruh siklus sengketa (open → checkpoint → claim → settle) ≈ 650k gas ≈ **44 µETH** + fee data L1. Sebutkan dalam ETH, bukan USD, kecuali harga ETH ikut dicatat pada tanggal yang sama. Angka Foundry adalah gas eksekusi EVM (tanpa intrinsik tx); angka testnet adalah `gasUsed` receipt.

---

## 9. SPESIFIKASI SIRKUIT — `sla_settlement.circom`

**Tidak berubah di P1.** Sirkuit, zkey (release `v0.1.0-zkey`), dan verifier identik dengan v1.0; `epoch` sengaja tidak masuk input publik (§6.2), dan anchored mode memakai bukti yang sama atas `R`/`seq`/`A` yang dibangun kontrak dari `ack` (`Anchored.t.sol::test_100_acks_then_dispute_with_real_proof`).

### 9.1 Antarmuka
```
signal input  channelIdField;      // publik  [0]
signal input  termsCommitment;     // publik  [1]
signal input  receiptsRoot;        // publik  [2]
signal input  seq;                 // publik  [3]   jumlah receipt terisi, ≤ 128
signal input  cumulativeAmount;    // publik  [4]
signal input  payToClient;         // publik  [5]   OUTPUT yang dibuktikan

signal input  unitPrice, maxM1, minM2, penaltyBps, capBps, nonce;       // privat
signal input  qty[128], m1[128], m2[128], due[128];                    // privat
```
`channelIdField` tidak dipakai dalam constraint apa pun selain sebagai input publik — cukup untuk mengikat bukti ke satu channel (T5) tanpa biaya constraint.

### 9.2 Constraint (semua wajib)
```
C1  Poseidon(unitPrice, maxM1, minM2, penaltyBps, capBps, nonce) == termsCommitment
C2  ∀i: filled_i = LessThan(8)(i, seq)                       // 1 jika slot terisi
C3  ∀i: due_i == qty_i × unitPrice                            // harga satuan konsisten
C4  ∀i: leaf_i = filled_i × Poseidon(i, qty_i, m1_i, m2_i, due_i)    // slot kosong → 0
C5  MerkleRoot128(leaf) == receiptsRoot                        // 127 Poseidon t=3
C6  Σ filled_i × due_i == cumulativeAmount
C7  ∀i: b_i = OR( GreaterThan(32)(m1_i, maxM1), LessThan(32)(m2_i, minM2) )
C8  ∀i: pen_i = filled_i × b_i × ⌊due_i × penaltyBps / 10000⌋    // pembagian: witness q, r dengan due×π = 10000q + r; r WAJIB diikat Num2Bits(14) SEBELUM komparator r < 10000 (LessThan tanpa bit-bound menerima r negatif)
C9  penRaw = Σ pen_i ;  cap = ⌊cumulativeAmount × capBps / 10000⌋ ;  payToClient == min(penRaw, cap)
C10 range: qty_i, m1_i, m2_i < 2³²; due_i, cumulativeAmount, payToClient < 2⁶⁴; penaltyBps, capBps ≤ 10000; seq ≤ 128
```
Slot dengan `filled_i = 0` harus juga memiliki `qty_i = m1_i = m2_i = due_i = 0` (constraint eksplisit) agar leaf kosong kanonik dan C3/C6 tidak bisa diisi sampah.

### 9.3 Ukuran & kinerja (estimasi dari jumlah round circomlib; **ukur Hari 3**)
| Komponen | Per unit | × | Constraint |
|---|---|---|---|
| Leaf Poseidon t=6 (8 full + 60 partial round, S-box x⁵ = 3 constraint) | 324 | 128 | 41.472 |
| Node Poseidon t=3 (8 full + 57 partial) | 243 | 127 | 30.861 |
| Komparator 2 × LessThan/GreaterThan(32) | ≈ 68 | 128 | 8.704 |
| Range `due` 64-bit + aritmetika C3/C8 | ≈ 67 | 128 | 8.576 |
| Terms Poseidon t=7 + C9 + misc | | | ≈ 860 |
| **Total** | | | **≈ 90.500 (estimasi awal) → terukur 19 Sep 2026: 217.908 pada `--O1` default, 113.224 pada `--O2`, **115.066** pada `--O2` setelah pengikatan rentang `r`/`seq`/bps (celah soundness `DivBps` ditemukan saat review) → ptau 2¹⁷ (131.072)** |

Target: proving < 10 s di laptop dengan `snarkjs` (WASM witness + `groth16 prove`), < 2 s dengan `rapidsnark`; witness generation < 1 s. Jika terukur > 30 s, turunkan `MAX_SEQ` ke 64 (≈ 45k constraint, ptau 2¹⁶) — D4. **Catatan implementasi:** `build.sh` wajib memakai `circom --O2` (simplifikasi linear penuh); tanpa itu jumlah constraint melewati 2¹⁷.

### 9.4 Trusted setup
`powersOfTau28_hez_final_17.ptau` (Hermez, hash dipublikasikan) → `snarkjs groth16 setup` → kontribusi phase-2 → beacon → `zkey`. **Untuk hackathon: satu kontributor (penulis).** Konsekuensi: pemegang toxic waste bisa memalsukan bukti → menuntut `payToClient` hingga `A` (batas FR-18). Mitigasi: (i) transkrip ceremony di repo; (ii) sebelum ada dana non-demo di mainnet, ceremony ≥ 3 kontributor independen; (iii) alternatif PLONK universal (snarkjs, tanpa phase-2 khusus sirkuit) dengan biaya verifikasi ≈ +50–100% gas — D6. **Nyatakan ini di pitch sebelum ditanya.**

### 9.5 Vektor uji
`test/vectors/*.json` dari `tools/settlement_vectors.py` (EX1–EX3 §6.5 + kasus tepi: `seq = 0`, `seq = 128`, semua melanggar, `capBps = 0`, `capBps = 10000`, `qty = 0` pada slot terisi). Tiap vektor dijalankan di **tiga** implementasi: Python (referensi), sirkuit (`snarkjs wtns calculate` + `groth16 fullprove`), dan `AegisChannel.settle()` (Foundry, dengan bukti asli via FFI). Selisih satu unit pun = gagal.

---

## 10. INTEGRASI x402 / PERMIT2 / ERC-8183 / ERC-8004 — SPESIFIKASI TEKNIS

### 10.1 Yang dipakai (semua diverifikasi ada di 4663 **dan** 46630, §19)
- **Permit2** kanonik `0x000000000022D473030F116dDEE9F6B43aC78BA3` — `permitTransferFrom` untuk `fundWithPermit2`; `permitWitnessTransferFrom` dipakai proxy x402.
- **`x402ExactPermit2Proxy`** kanonik `0x402085c248EeA27D92E8b30b2C58ed07f9E20001` — witness `Witness(address to,uint256 validAfter)`; `spender` di tanda tangan adalah proxy; *"This Proxy enforces that funds are only sent to the `witness.to` address"*.
- **EntryPoint ERC-4337** v0.6 `0x5FF137D4…2789` dan v0.7 `0x00000000717…a032`; **Multicall3** `0xcA11bde0…CA11`.
- **USDG** `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (mainnet; 6 desimal; proxy EIP-1967 → impl `0x68184c44…6f8f`; UUPS `upgradeTo` ada; role-based; `paused()` = false; `isFrozen(addr)` menjawab `false` tanpa revert → fungsi freeze **terindikasi ada**, konfirmasi lewat source Blockscout, V4b).

### 10.2 Mendanai channel lewat x402 (FR-23)
```
klien  → provider : GET /job                                  (tanpa pembayaran)
provider → klien : 402, PAYMENT-REQUIRED { scheme: "exact", network: "eip155:4663",
                     asset: USDG, amount: deposit, payTo: factory.predict(cfg),
                     extra: { aegis: { termsCommitment, challengeWindow, salt, sigProvider(ChannelTerms) } } }
klien  → provider : PAYMENT-SIGNATURE (Permit2 witness, to = alamat channel)   ← SDK klien x402 standar, tidak diubah
provider → facilitator: /settle → proxy.settle(...) → USDG masuk ke alamat channel
klien  → provider : ack pertama + sigClient(ChannelTerms)                       ← SDK klien AegisClear
provider → factory.open(cfg, sigClient, "")                                     ← provider adalah msg.sender, tidak perlu sigProvider
```
**Catatan persetujuan klien.** Klien menandatangani Permit2 (dana), bukan `ChannelTerms`. Dua opsi: (a) klien mengembalikan `sigClient(ChannelTerms)` di header tambahan saat membayar (butuh SDK AegisClear sebelum pembayaran pertama) atau (b) **provider** yang membuka channel dengan tanda tangan klien yang dikirim bersama **ack pertama**. Opsi (b) menjaga FR-23: klien x402 polos cukup membayar; persetujuan syarat datang saat ack pertama, yang memang butuh SDK AegisClear di sisi klien. Dana yang sudah masuk ke alamat `predict()` sebelum `open` tetap aman: alamat itu hanya bisa menjadi channel dengan `cfg` persis yang di-hash ke salt — dan sebelum `open`, tidak ada yang bisa memindahkannya (`sweep` butuh `SETTLED`). Rekomendasi: (b) — D7. Sisi lain koin ini adalah T19.

**Tiket keluar (exit ticket) — ditambahkan saat implementasi (Task 14), diperluas ke epoch di P1.** Karena `submitCheckpoint`/`closeCooperative` butuh dua tanda tangan, klien tidak punya jalan keluar sepihak sebelum unit 0 jika provider menghilang setelah dana masuk. Provider karena itu menandatangani `Checkpoint(epoch, 0, 0, emptyRoot)` per sesi dan mengirimnya di 402 sebagai `extra.aegis.exitSig`; SDK klien memverifikasinya (domain = alamat `predict()`) **sebelum** mendanai, dan `exitUnilateral()` memakainya hanya jika klien belum memegang checkpoint co-signed apa pun. Tiket ini tidak membuka kelas serangan baru — klien memang selalu bisa mengirim checkpoint co-signed yang basi — tetapi ia mempertegas kewajiban §11.4: provider **wajib** menjalankan challenge responder yang mengirim `latestCoSigned` saat `seq` on-chain lebih rendah. **Setelah `rollover`** tiket epoch lama mati bersama semua tanda tangan epoch itu; provider karena itu mengembalikan tiket epoch berikutnya (`exitSigNext` = `Checkpoint(epoch+1, 0, 0, emptyRoot)`) **di dalam balasan `POST /rollover`**, sebelum klien mem-broadcast tx apa pun (T25, I1). Mode anchored tidak memakai tiket sama sekali — `startClose()` adalah jalan keluar sepihaknya. 402 juga memuat `extra.aegis.anchored`, tetapi klien **tidak mempercayainya**: mode diturunkan dari `POSEIDON()` factory miliknya sendiri (T23).

**Facilitator.** Tidak ada perubahan: ia memverifikasi `witness.to == payTo` dan menyelesaikan. Uji terhadap facilitator Mesh (`facilitator.meshgateway.co`) apakah menerima `payTo` arbitrer (V8); jika tidak, jalankan facilitator sendiri dari `meshgateway/x402` fork — x402 facilitator adalah server stateless.

### 10.3 Kompatibilitas ERC-8183 (FR-27)
| ERC-8183 | AegisClear |
|---|---|
| `createJob` / `fund` | `open` / transfer USDG ke channel |
| `submit(deliverable)` | receipt + ack (off-chain, co-signed) — banyak per job |
| `evaluator.complete/reject` | bukti (`claimPenalty`) atau default jendela; **tidak ada alamat evaluator** |
| `Completed` / `Rejected` biner | `Settled(toProvider, toClient)` proporsional |
| `claimRefund` setelah `expiredAt` | `settle` setelah `deadline`; sisa budget selalu ke klien |
| `IACPHook` | tidak ada hook yang bisa menggagalkan jalur dana (sesuai peringatan 8183 sendiri tentang `claimRefund`); hook payout P1 (`IAegisPayoutHook`, §8.4) bersifat best-effort — try/catch + stipend, kegagalan diabaikan (T20) |
| Event `JobFunded`, `PaymentReleased`, `Refunded` | dipancarkan dengan nama & parameter sama (`jobId = channelIdField()`); `rollover` memancarkan `PaymentReleased` per epoch |

Konformansi interface penuh (`IACP`) **tidak** diklaim; 8183 masih draft dan semantiknya per-job biner. Yang diklaim: *"AegisClear adalah evaluator yang 8183 bayangkan, dengan escrow yang 8183 belum bisa ekspresikan"*.

### 10.4 ERC-8004 (FR-28, roadmap)
Setelah `Settled`, watcher memanggil `ReputationRegistry.giveFeedback(agentId_provider, value = 10000 − payToClient×10000/A, …, proofOfPayment = txHash)`. Tidak dibangun di MVP; disebut agar juri melihat sambungannya. MeshIdentity memakai ERC-8004 — alamat registry di Robinhood Chain: verifikasi V15.

---

## 11. OFF-CHAIN SERVICES — `aegis-sdk` (TypeScript)

Satu paket `@aegisclear/sdk` (`sdk/`) dengan empat lapisan; nama di bawah adalah nama modulnya. Ini implementasi **referensi** untuk demo/test, bukan server produksi — keterbatasannya yang diketahui dicatat di README ("Keterbatasan SDK referensi").

### 11.1 `core` (`sdk/src/core/`)
- `Terms` → `commitTerms()` (Poseidon t=7 via `circomlibjs`); `nonce` per sesi (kehilangan `nonce` = kehilangan hak klaim, T9)
- `ReceiptTree`: 128 slot, `append()`, `root()`, `reset()` (rollover); `leafHash(receipt)`, `merkleRoot(leaves)` — vektor uji identik dengan sirkuit dan `insertPath` on-chain (INV-11)
- `typedData.ts`: domain `AegisClear`/`1`/`verifyingContract = channel`; `sign*/verify*` untuk `ChannelTerms`, `Checkpoint{epoch,…}`, `CloseMsg`, `RolloverMsg` (tipe terpisah, typehash berbeda), `LeafMsg` (anchored); `TypedDataVerifier` sadar ERC-1271/6492 (`publicClient.verifyTypedData`) untuk klien smart account, `verify*Sig` murni (ecrecover) untuk EOA/offline
- `settle(receipts, terms)` (padanan Python §6.3, dipakai untuk `cumulativeAmount` dan pra-cek sebelum proving); `buildCircuitInput`; `Prover` (snarkjs `groth16 fullprove`, ≈4 s)

### 11.2 `provider` — `createProviderApp(ProviderOptions)` (Hono)
- Opsi P1: `anchored?: boolean` (satu server = satu mode; saat start membaca `POSEIDON()` dari `ctx.factory` dan **melempar error bila tidak cocok** dengan opsi — konfigurasi salah gagal jujur, bukan salah melayani), `payoutProvider?: Address` (default alamat provider; isi alamat router untuk FR-26)
- `GET /job` (header `Aegis-Client`) → 402 dengan `payTo = predict(cfg)` dan `extra.aegis = { config, sigProvider(ChannelTerms), terms, unitQty, exitSig, anchored }` (§10.2)
- `POST /job` — badan handler **diserialkan per klien** (`serializeJob`, rantai promise FIFO per alamat — M6): dua request konkuren untuk sesi yang sama tidak lagi bisa double-append ke pohon. Urutan: (1) buka channel pada `Aegis-Terms-Signature` pertama (D7; provider = `msg.sender`); (2) co-signed: tahan sampai ack checkpoint sebelumnya (`Aegis-Ack` atau `POST /ack`) — anchored: baca on-chain `state == OPEN`, `epoch` sama, `seq() ≥ n` (tidak ada header ack); (3) `409 epoch-full` bila `n ≥ MAX_SEQ`, `409 session-closing` bila `Close`/`Rollover` sudah ditandatangani provider; (4) tolak bila `balanceOf(channel) < A + due` (FR-24, T2); (5) layani unit `n`: co-signed → `{ receipt, checkpoint{epoch, n+1, A', R'}, sigProvider }`, anchored → `{ receipt, leaf{epoch, n, leaf, A'}, sigProvider(Leaf) }`
- `POST /close` dan `POST /rollover` (`countersign`, T-close-hi + F-close-continue): hanya `seq` co-signed **tertinggi** (anchored: `seq()` on-chain), `toProvider` harus persis kumulatif checkpoint itu, dan permintaan **wajib** membawa tanda tangan klien atas pesan yang sama (`Close`/`Rollover`) — bukti identitas & niat, karena header `Aegis-Client` sendiri tidak diautentikasi; setelah ikut menandatangani, sesi ditandai `closing`. `/rollover` (co-signed) juga mengembalikan **`exitSigNext`** = tiket `Checkpoint(epoch+1, 0, 0, emptyRoot)` pra-tanda-tangan (I1, T25); anchored tidak (M5)
- `POST /rollover/confirm` — sinkronisasi **idempoten** berdasarkan state on-chain: `state != OPEN` → `409 rollover-not-onchain`; epoch on-chain == epoch sesi dan tidak `closing` → balas ulang tiket yang ada; epoch on-chain == epoch sesi + 1 dan `seq() == 0` → reset pohon/kumulatif/checkpoint, `epoch++`, `closing = false`, tiket seq-0 baru (co-signed)
- `POST /ack`, `GET /state`; kode 409 lain: `ack-required`, `epoch-mismatch`, `channel-not-open`, `checkpoint-not-acked`, `amount-mismatch`
- `startProviderWatcher` **wajib** dijalankan di proses yang sama (responder T1 memakai memori checkpoint co-signed sesi)

### 11.3 `client` — `AegisClient` (untuk MeshWallet/MCP atau agen apa pun)
- `start()`: verifikasi `payTo == predict(cfg)` (T19), `sigProvider(ChannelTerms)`, `payoutClient == payoutTo`; **mode diturunkan dari `POSEIDON()` factory milik klien sendiri** — flag `anchored` di 402 hanya dicocokkan, ketidakcocokan → tolak sebelum transfer apa pun (T23); `ClientPolicy` (`maxDeposit`, `maxChallengeWindow`, `maxQtyPerUnit` — tanpa batas qty klien menolak mendanai); co-signed: verifikasi `exitSig` seq-0 sebelum mendanai
- `requestUnit()`: verifikasi `due == qty × p`, batas qty, `accept(receipt)` (tempat klien membandingkan metrik dengan pengamatannya sendiri — default menerima semua); co-signed: rekomputasi root/A tentatif harus sama dengan checkpoint provider, verifikasi tanda tangan, **baru** pohon disentuh, tanda tangan klien disimpan sebagai `pendingAck`; anchored: `leaf == leafHash(receipt)`, `A' == settle(receipts ∪ receipt).A`, tanda tangan `Leaf` provider, lalu **tx `ack()`**, lalu `tree.append` (invarian `tree.size == seq()` on-chain)
- `closeCooperative()`: `finalAck()` dulu (M1), klien menandatangani `Close(epoch, seq, A)` **lebih dulu** → `/close` → tx `closeCooperative`
- `rollover()`: `/rollover` → verifikasi `sigProvider` **dan `exitSigNext`** (co-signed) **sebelum** tx `rollover()` dikirim → tx → `/rollover/confirm` (retry ×3) → verifikasi `epoch` on-chain naik 1 → baru commit lokal (reset pohon, `epoch++`, simpan tiket baru). Aman diulang: tx yang sudah tercatat tidak dikirim ulang; bila epoch sudah naik lebih dulu (percobaan sebelumnya terputus), langsung ke confirm
- `dispute()`: co-signed → `submitCheckpoint` dengan checkpoint co-signed tertinggi; anchored → `startClose()` bila `OPEN`, **toleran `CLOSING`** (provider lebih dulu `startClose`) — lalu bukti + `claimPenalty` bila `payToClient > 0`
- `exitUnilateral()`: co-signed → tiket seq-0 hanya bila tidak ada checkpoint co-signed; anchored → `startClose()` (toleran `CLOSING`)

### 11.4 Watcher / settler bot (`sdk/src/watcher/`)
- Mengindeks `ChannelOpened` dari `fromBlock` (wajib diisi di RPC publik); memanggil `settle()` setelah `deadline`, `sweep()` setelah `SETTLED` dengan saldo > 0; CLI permissionless `watcher/cli.ts` (validasi env, SIGINT)
- **Challenge responder (wajib untuk provider, in-process):** untuk setiap channel yang dilayani, jika `state == CLOSING` dan `seq` on-chain < `seq` checkpoint co-signed tertinggi yang dipegang **dengan `epoch` yang sama** (`mine.cp.epoch === view.epoch` — checkpoint epoch lama pasti ditolak kontrak dan seq-nya tidak boleh disalahartikan lebih baru), kirim `submitCheckpoint` sebelum `deadline` — inilah yang menetralkan checkpoint basi maupun tiket keluar seq-0 (T1). Responder selalu merespons dulu tanpa memandang `deadline` (kontrak tidak menggerbangi `submitCheckpoint` dengan deadline), membaca ulang, baru men-settle. Tidak relevan untuk anchored (tidak ada checkpoint co-signed)
- Peringatan untuk klien: channel `CLOSING` dengan `seq` lebih rendah dari yang klien pegang → kirim checkpoint terbaru; dengan `seq` sama & ada pelanggaran → prove & claim sebelum deadline
- **Belum:** `keepalive` otomatis program Stylus (T15, P2)

---

## 12. THREAT MODEL

| # | Ancaman | Vektor | Mitigasi | Residual |
|---|---|---|---|---|
| T1 | Checkpoint basi | pihak mengirim state lama yang menguntungkannya | jendela `challengeWindow`; checkpoint `seq` lebih tinggi menggantikan (FR-13); watcher | Rendah — asumsi liveness lawan dalam jendela (standar channel) |
| T2 | Klien tidak meng-ack unit yang diterima | tidak menandatangani | unit tidak dibayar, provider berhenti melayani (FR-24); kerugian maksimum = 1 unit; provider boleh minta ack sebelum unit berikutnya | **Diterima** — identik dengan API prabayar |
| T3 | Provider memalsukan metrik | header `Aegis-Receipt` bohong | klien tidak meng-ack; tidak ada receipt sepihak; klien membandingkan dengan pengamatan sendiri (§11.3) | Rendah — metrik yang hanya bisa diamati provider butuh attestor (di luar scope) |
| T4 | Trusted setup bocor | bukti palsu → `payToClient` sewenang-wenang | `payToClient ≤ A` di kontrak (FR-18); hanya pihak yang boleh klaim; ceremony ≥ 3 kontributor sebelum dana nyata; alternatif PLONK (D6) | **Terbuka di MVP; dinyatakan** |
| T5 | Replay bukti lintas channel | bukti valid dipakai di channel lain dengan `T`/`R` sama | `channelIdField` = alamat channel di input publik | Nihil |
| T6 | Griefing perpanjangan jendela | checkpoint baru berulang | tiap checkpoint butuh **kedua** tanda tangan — lawan hanya bisa memperpanjang dengan state yang Anda tanda tangani; perpanjangan `responseWindow` ≤ `challengeWindow` | Nihil |
| T7 | Sensor sequencer selama jendela | pihak tidak bisa mengirim checkpoint/bukti | `challengeWindow` produksi ≥ jendela force-inclusion delayed inbox (V13); FCFS tanpa priority fee — tidak ada lelang untuk disalip | Rendah |
| T8 | USDG dibekukan / di-pause / di-upgrade oleh Paxos | alamat channel diblokir; `transfer` revert | tidak bisa dimitigasi on-chain; `settle` gagal → dana tetap di channel sampai unfreeze; dokumentasikan | Rendah, di luar kendali |
| T9 | Klien kehilangan `nonce`/terms | tidak bisa membuktikan | default jendela = bayar `A` (tidak ada penalti); SDK menyimpan terenkripsi + backup; provider juga memegang salinan (tidak membantu klien) | Rendah — kerugian = hak penalti, bukan deposit |
| T10 | Ketidaksesuaian sirkuit ↔ SDK ↔ kontrak | varian Poseidon, urutan input, pembulatan | satu varian (D3); vektor uji diferensial tiga implementasi (§9.5) | Rendah |
| T11 | Overflow / nilai di luar rentang | `due` besar, `seq` > 128 | C10 di sirkuit; `uint128` di kontrak; `MAX_SEQ` | Nihil |
| T12 | Signer ERC-1271 mengubah logika | tanda tangan sah lalu "dicabut" | validitas diperiksa saat submit (`isValidSignatureNow`); state yang sudah masuk tidak bergantung pada validitas ulang | Diterima |
| T13 | Front-running `settle` / `claimPenalty` | mempercepat/menghambat | hasil deterministik; `settle` permissionless; FCFS | Nihil |
| T14 | Reentrancy pada payout | token dengan hook; **P1:** hook payout `_send` adalah satu-satunya panggilan ke kode tak tepercaya | USDG tanpa hook; CEI (state final sebelum `_send`) + `nonReentrant` di `settle`/`closeCooperative`/`rollover`/`sweep`/`fundWithPermit2`; fungsi tak terjaga (`submitCheckpoint`, `ack`, `startClose`, `claimPenalty`) butuh tanda tangan lawan atau hanya boleh oleh pihak dan tidak memindahkan dana; `insertPath`/`verifyProof`/ERC-1271 adalah `STATICCALL`. Router: `onPayout` + `claim` satu guard (Slither ID-4 *false positive*, uji re-entrancy lintas fungsi) | Nihil |
| T15 | Program Stylus kedaluwarsa | 365 hari tanpa panggilan | `keepalive` (31 hari) — **watcher otomatis belum dibangun (P2), manual di P1**; `PoseidonPathYul` sebagai fallback deploy; dana selalu bisa diselamatkan lewat jalur EVM murni (`startClose` → `claimPenalty` → `settle`, atau `closeCooperative`) karena tidak satu pun memanggil `POSEIDON` (§8.3) | Rendah — hanya `ack` baru yang berhenti |
| T16 | Kebocoran metadata | `A/seq`, `payToClient/A`, waktu | §6.7; `qty` bervariasi; **tidak diklaim anonim** | **Diterima & didokumentasikan** |
| T17 | Provider melayani melebihi deposit | mengabaikan FR-24 | `toProvider ≤ B`; kerugian di provider | Diterima |
| T18 | Facilitator jahat | menahan/menolak settle | tidak bisa mengubah jumlah/tujuan (witness); klien bisa mendanai langsung tanpa facilitator | Nihil untuk dana |
| T19 | Dana masuk ke alamat `predict()` untuk `cfg` yang tidak pernah `open` | provider mengirim `payTo` lalu menghilang | siapa pun bisa `open` asalkan memegang tanda tangan **kedua** pihak; jika provider tidak pernah menandatangani `ChannelTerms`, alamat tidak bisa menjadi channel → dana **terkunci** | **Rendah dengan SDK klien** — D7: 402 `extra.aegis` wajib memuat `sigProvider(ChannelTerms)`; SDK klien memverifikasinya sebelum menandatangani Permit2, lalu klien sendiri bisa `open(cfg, "", sigProvider)` kapan saja. Klien x402 **polos** tidak boleh diarahkan ke `payTo` channel. Uji: "T19: payTo palsu (≠ predictChannel(cfg)) ditolak oleh start()" |
| **T20** (P1, T-hook) | Payee kontrak menyandera payout | `payoutClient`/`payoutProvider` adalah kontrak yang revert atau membakar gas di `onPayout` → `settle`/`close`/`sweep`/`rollover` pihak lain gagal | hook dipanggil dalam `try/catch` dengan stipend tetap `HOOK_GAS` (300k) **setelah** transfer; kegagalan hook diabaikan; uji `test_reverting_payee_does_not_block_settle_or_close`, `test_gas_burning_payee_is_capped_and_settle_succeeds` | Nihil untuk dana; payee jahat hanya merugikan dirinya (kehilangan atribusi) |
| **T21** (P1, T-hook-gas, audit M-1) | Pemanggil "mengelaparkan" hook | `settle`/`sweep` permissionless → pemanggil memilih gas limit sehingga hook kehabisan gas (EIP-150: callee dapat `min(HOOK_GAS, 63/64·gasleft)`) tetapi tx luar selesai → token sudah di router tanpa kredit (slack) → siapa pun `onPayout(penyerang, …)` mengambilnya (`Unbacked` lolos karena token memang ada) | pemeriksaan pasca-panggilan `gasleft() < HOOK_GAS/63 → InsufficientGas` (pola OZ `ERC2771Forwarder`): hook dijamin **ditawari** stipend penuh atau tx revert; `eth_estimateGas` monoton, tidak ada yang hardcode gas. Jendela sebelum perbaikan terukur hanya untuk hook ≈227k–300k (PoC Foundry: hook 234k → `sweep{gas: 434.200}` men-dampar 250.000 token; 164k → tidak ada jendela); `settle`/`rollover` punya lebih banyak kerja pasca-hook (ambang > 300k) sehingga tidak bisa dieksploitasi bahkan sebelum perbaikan. Uji `HookGas.t.sol` (5; 3 gagal pada kode lama) | **Diperbaiki di source (commit `5fe05c0`)**; testnet v1 mendahului perbaikan — router yang dikirim ≈55k (MockUSDG) jauh di bawah jendela, jadi tidak tereksploitasi di v1; testnet v2 (V18c) memuat penjaga ini |
| **T22** (P1) | Slack router | transfer ERC-20 **langsung** ke alamat router (bukan lewat hook) atau token non-standar → saldo tak teratribusi, dapat diklaim siapa pun lewat `onPayout` | tidak bisa dibedakan on-chain dari token yang baru masuk lewat hook; peringatan keras di NatSpec + README: **jangan pernah** mengirim token langsung ke router; USDG lewat channel adalah satu-satunya jalur yang dimaksud | Diterima — kesalahan pengguna, didokumentasikan |
| **T23** (P1, T-mode) | 402 berbohong soal mode | provider co-signed mengklaim `anchored: true` → klien anchored melewatkan verifikasi tiket keluar seq-0 → tanpa tiket, klien tidak punya jalan keluar sepihak → deposit terkunci (temuan **Critical** review Task 7, diperbaiki) | klien menurunkan mode dari `POSEIDON()` **factory miliknya sendiri** on-chain; flag 402 hanya dicocokkan, mismatch → `start()` menolak sebelum transfer apa pun; provider juga memverifikasi konfigurasinya sendiri saat start. Uji "T-mode: 402 mengklaim anchored=true padahal factory klien (POSEIDON=0) co-signed → start() menolak" | Nihil |
| **T24** (P1, T-close-continue) | Layanan berlanjut setelah `Close`/`Rollover` ditandatangani | setelah provider ikut menandatangani `Close(epoch, n, A_n)`, sesi terus melayani unit n+1… → pihak mana pun memegang pesan close yang tidak lagi mencerminkan state; atau pihak ketiga memalsukan `/close` lewat header `Aegis-Client` yang tidak diautentikasi | `/close` & `/rollover` **wajib** membawa tanda tangan klien atas pesan yang sama (bukti niat), hanya `seq` co-signed tertinggi dengan jumlah persis (`checkpoint-not-acked`, `amount-mismatch`), lalu `session.closing = true` → `/job` `409 session-closing` sampai rollover terkonfirmasi on-chain; klien `finalAck()` dulu agar unit terakhir tidak hilang (M1) | Rendah |
| **T25** (P1, T-rollover-ticket, I1) | Provider menyandera epoch baru | setelah tx `rollover()` klien ter-mined, epoch+1 tidak punya checkpoint co-signed; bila provider menahan balasan `/rollover/confirm` (tiket seq-0 epoch+1), sisa budget epoch baru terkunci tanpa batas waktu — mode co-signed tidak punya jalan keluar khusus klien | tiket epoch berikutnya (`exitSigNext` = `Checkpoint(epoch+1, 0, 0, emptyRoot)`) ditandatangani **di muka** di balasan `POST /rollover`, dan klien memverifikasinya **sebelum** mem-broadcast tx `rollover()`; tiket itu inert sampai epoch benar-benar naik — dan epoch hanya naik lewat tx yang membawa tanda tangan `Rollover` provider yang sama. `/rollover/confirm` idempoten berdasarkan state on-chain (retry aman). Uji "I1 negatif: countersign /rollover TANPA exitSigNext ditolak SEBELUM tx apa pun dikirim"; skenario 11 di testnet | Rendah — catatan desain **D11**: `startClose()` di mode co-signed akan membuat tiket keluar berlebihan (terbuka) |
| **T26** (P1, anchored) | `A` digelembungkan di mode anchored | provider menandatangani `Leaf(epoch, seq, leaf, A')` dengan `A' > A + due`; kontrak hanya memeriksa `A' ≥ A` (`AmountDecreased`) dan tanda tangan provider | tx `ack` adalah **persetujuan klien** (padanan menandatangani checkpoint): SDK klien memverifikasi `leaf == leafHash(receipt)` dan `A' == settle(receipts ∪ receipt).A` sebelum mengirim tx (`agent.ts` melempar `leaf hash mismatch` / `leaf cumulativeAmount mismatch`; **belum ada test negatif khusus** untuk jalur ini — backlog). Bila klien tetap meng-ack `A'` yang salah, itu kesalahannya sendiri seperti co-sign checkpoint yang salah: default jendela membayar `min(A', B)`, dan **tidak ada bukti** yang bisa dibuat untuk `A'` (C6 `Σ due_i == A`) sehingga klien juga kehilangan hak penalti; provider tidak pernah bisa menaikkan `A` sendirian karena hanya `client` yang boleh `ack` | Diterima — pemeriksaan sisi klien, dinyatakan |
| **T27** (P1, M6) | `POST /job` konkuren untuk satu klien | dua request paralel (atau spoof header) membaca `n = tree.size` yang sama sebelum salah satu `append` → double-append, tabrakan `checkpoints.set(n+1)` | badan handler `/job` diserialkan per alamat klien (rantai promise FIFO); klien berbeda tidak saling menunggu. Uji "M6: dua POST /job konkuren untuk klien yang sama tidak boleh meng-korupsi pohon provider" | Rendah — `/ack` belum diserialkan (liveness saja; backlog) |
| **T28** (P1, anchored) | Lawan lebih dulu `startClose()` | provider memanggil `startClose()` → channel `CLOSING` → `dispute()`/`exitUnilateral()` klien yang memanggil `startClose()` lagi revert `WrongState` → jalur penalti tidak tercapai (temuan Important review Task 7, diperbaiki) | klien toleran `CLOSING`: lewati `startClose`, langsung bukti + `claimPenalty` (bukti atas `R/seq/A` on-chain tetap sah); provider berhenti melayani channel non-`OPEN` (`channel-not-open`). Uji "anchored: provider memanggil startClose() lebih dulu (CLOSING) → dispute() tetap lanjut ke bukti" (lulus di testnet, channel `0x0c7dbeba…27dc`) | Nihil |

T19 layak disorot di README: ia adalah alasan `extra.aegis` di 402 wajib berisi tanda tangan provider, dan alasan klien x402 **polos** (tanpa SDK AegisClear) tidak boleh diarahkan ke `payTo` channel. T20–T22 adalah dua desain yang masing-masing diterima (hook best-effort × `onPayout` permissionless) yang interaksinya baru terlihat saat audit — alasan `InsufficientGas` ada. **Self-audit Slither 0.11.5 (20 Sep 2026, `docs/audit/slither-2026-09.md`):** 77 → 75 hasil atas 7 kontrak + 3 interface (574 SLOC); nol *true positive* High/Medium (3 High = idiom `return` snarkjs, 2 Medium = `amount == 0` dan re-entrancy lintas fungsi yang terjaga); 2 Low diperbaiki (`ZeroAddress` factory) + M-1 manual; `forge test` 118 lulus. Ini audit tim sendiri sebelum tenggat, bukan pengganti audit independen sebelum dana nyata (T4 tetap terbuka).

---

## 13. INVARIANTS & TEST PLAN

### Invariants (fuzz + invariant testing Foundry; sirkuit via vektor)
| ID | Invariant |
|---|---|
| INV-1 | Pada `SETTLED`: `toProvider + toClient == balanceOf(channel)` sesaat sebelum transfer; saldo 0 sesudahnya |
| INV-2 | `latest.seq` monoton naik **dalam satu epoch**; setiap perubahan `(seq, A, R)` disertai dua tanda tangan sah atas nilai persis itu (co-signed) atau tanda tangan provider + tx klien (anchored); reset hanya lewat `rollover` dengan dua tanda tangan `Rollover(epoch, …)` dan `epoch++` |
| INV-3 | `proofSeq == seq` ⇒ `verifyProof(…, [addr, T, R, seq, A, payToClient]) == true` pada saat klaim |
| INV-4 | `payToClient ≤ A` (kontrak) dan `payToClient == min(penRaw, cap)` (sirkuit) |
| INV-5 | `toProvider ≤ min(A, B)`; `toProvider ≥ min(A − ⌊A×κ/10000⌋, B)` untuk setiap jalur settle |
| INV-6 | `settle` hanya jika `CLOSING ∧ now ≥ deadline`; `closeCooperative` hanya dengan dua tanda tangan atas `(seq ≥ latest.seq, toProvider ≤ B)`; `toClient = B − toProvider` |
| INV-7 | Checkpoint baru ⇒ `proofSeq ≠ seq` (bukti lama tidak pernah dipakai) |
| INV-8 | `deadline` tidak pernah berkurang; total perpanjangan ≤ `responseWindow × (jumlah checkpoint co-signed)` |
| INV-9 | Tidak ada fungsi yang memindahkan USDG keluar sebelum `SETTLED`; setelah `SETTLED` hanya `sweep` → `payoutClient` |
| INV-10 | (sirkuit) `Σ due_i == A`; `due_i == qty_i × p`; `leaf_i == 0 ∀ i ≥ seq`; root == `R` |
| INV-11 | (anchored) root on-chain setelah `k` ack == `ReceiptTree.root()` SDK atas leaf yang sama, untuk Stylus dan Yul — ✅ `Anchored.t.sol::test_ack_three_leaves_matches_fixture_roots`, `PoseidonPathYul.t.sol::test_insertPath_128_leaves_incrementally_matches_sdk_roots`, `cargo test` (100 root), on-chain `cast call` identik (§8.3) |
| INV-12 | Tidak ada urutan panggilan oleh **satu** pihak yang mengubah hak pihak lain di bawah `(A − cap)` untuk provider atau di bawah `B − A` untuk klien |
| INV-13 (P1) | Tanda tangan `Checkpoint`/`Close`/`Rollover`/`Leaf` epoch `e` tidak pernah diterima setelah `rollover` ke `e+1` (`BadSignature`) — `test_old_epoch_checkpoint_and_close_rejected_after_rollover`, `test_rollover_signature_not_replayable`, `test_old_epoch_leaf_signature_rejected_after_rollover` |
| INV-14 (P1) | Setelah `rollover`: `seq = A = R = deadline = 0`, `hasProof = false`, `state = OPEN`, `budget()` = saldo sebelumnya − `toProvider`; anchored: `filledSubtrees` nol (ack seq 0 lagi menghasilkan root 1-daun) — `test_rollover_pays_provider_keeps_remainder_and_resets`, `test_rollover_resets_tree` |
| INV-15 (P1, router) | `Σ_agent credit[agent][token] == totalCredit[token] ≤ balanceOf(router, token)` di setiap titik, termasuk selama `onPayout` (`Unbacked`; `test_onPayout_without_backing_reverts`) |
| INV-16 (P1, hook) | Kegagalan `onPayout` payee tidak pernah mengubah hasil `settle`/`closeCooperative`/`sweep`/`rollover`; bila tx sukses dengan payee kontrak, hook telah ditawari ≥ 63·⌊`HOOK_GAS`/63⌋ gas (`HookGas.t.sol`) |

### Skenario test wajib
1. **Jalur bahagia:** 100 request, 0 pelanggaran, cooperative close → provider 2,00; klien 3,00 (sisa). Chain hanya berisi `T`, `R`, jumlah (uji `leak-check`).
2. **EX1 sengketa:** 7 pelanggaran; klien `claimPenalty` dengan bukti asli (FFI `snarkjs`) → setelah deadline `settle` → 1,93 / 0,07 + 3,00.
3. **EX2 cap:** 80 pelanggaran → 1,40 / 0,60 + 3,00.
4. **Checkpoint basi:** provider menutup dengan `seq = 50`; klien mengirim `seq = 100` → state diganti, deadline diperpanjang, bukti (jika ada) gugur; settle memakai `A_100`.
5. **Klien menghilang:** provider menutup dengan checkpoint terakhir; tidak ada respons → settle default, provider `A`, klien sisa.
6. **Provider menghilang:** klien menutup dengan checkpoint terakhir + bukti → settle sesuai bukti tanpa partisipasi provider.
7. **Bukti atas state lama ditolak:** bukti untuk `seq = 50` setelah state `seq = 100` → revert (`publicInputs` tidak cocok).
8. **Bukti palsu ditolak:** ubah satu byte → `verifyProof == false`. FR-18 diuji terpisah dengan verifier mock yang selalu `true`: `payToClient > A` → revert.
9. **ERC-1271:** klien adalah smart account (mock 1271 + SimpleAccount 4337) → semua tanda tangan diterima.
10. **Pendanaan x402:** simulasi `x402ExactPermit2Proxy.settle` (fork mainnet 4663 di Anvil) ke `predict(cfg)` sebelum `open`; lalu `open`; `budget()` benar (V8 untuk facilitator nyata).
11. **Rollover (P1) ✅:** epoch 128 penuh → `rollover` → epoch baru dengan `T` sama, `seq = 0`, budget sisa. Foundry `Rollover.t.sol` (12 test: bayar provider + sisa jadi budget + `epoch 1`/`seq 0`; replay checkpoint/close epoch 0 → `BadSignature`; rollover dari `CLOSING` menghapus bukti tertunda; `ExceedsBudget`; `StaleCheckpoint`; dua rollover berurutan lalu close; `toProvider = 0`; tanda tangan `Close` ditolak `rollover`). SDK integrasi: **"skenario 11 (FR-10): epoch penuh → 409 epoch-full → rollover() → unit lanjut di epoch 1 → close; provider = A0 + A1"** + **"I1 negatif: countersign /rollover TANPA exitSigNext ditolak SEBELUM tx apa pun dikirim"** — lulus di Anvil dan testnet 46630 (channel `0x188febd7…37c7`, tx `open` `0xe2d6e114…bd3a`).
12. **Anchored (P1) ✅:** ack on-chain → root == SDK; gas Stylus vs Yul dicatat (§8.7). Foundry `Anchored.t.sol` (18 test dengan `PoseidonPathYul`: 3 ack == root fixture, seq salah/bukan klien/tanda tangan salah/`A` turun/`WrongMode` kedua arah/`startClose` hanya pihak & hanya `OPEN`/settle tanpa bukti membayar `A`/rollover me-reset pohon/seq 128/daun epoch lama/close kooperatif/**100 ack + bukti asli via FFI**) + `PoseidonPathYul.t.sol` (5). SDK integrasi `describe("skenario 12 (FR-25 anchored): ack on-chain, startClose, bukti atas R on-chain")`: **"sengketa: 10 ack on-chain (1 pelanggaran) → startClose → bukti → settle 190.000 / 810.000; calldata ack tanpa metrik"**, **"anchored: provider memanggil startClose() lebih dulu (CLOSING) → dispute() tetap lanjut ke bukti tanpa startClose lagi"**, **"kooperatif anchored: 5 ack → close (klien menandatangani dulu) → provider +100.000"**, **"keluar unilateral anchored: provider tidak menjawab → startClose → settle → deposit kembali penuh"** — lulus di Anvil (Yul) **dan** testnet 46630 (Stylus; channel `0xa9c8bea6…7ee7`, `0x0c7dbeba…27dc`, `0x2858e618…d6f9`, `0xf63e7199…7bec`).
13. **USDG dibekukan (mock):** `transfer` revert saat settle → state tetap `CLOSING`, tidak ada dana yang hilang, `settle` bisa diulang. **Status:** di tingkat channel perilaku ini mengikuti CEI (`state = SETTLED` ditulis lalu `safeTransfer` revert → seluruh tx batal, state tetap `CLOSING`) tetapi **belum ada test khusus**; di tingkat router ✅ `TreasuryRouter.t.sol::test_frozen_treasury_keeps_credit_then_claim` (`FreezableToken` mock: transfer ke treasury beku → kredit → `claim`).
14. **Fuzz parameter:** `π, κ ∈ [0, 10000]`, `seq ∈ [0, 128]`, `qty, m1, m2 < 2³²` → INV-4, INV-5, INV-10 (sirkuit lewat vektor acak: 200 vektor, Python vs snarkjs). `Invariant.t.sol` (Foundry) + `settlement.test.ts`/`circuits` test.
15. **Treasury router (P1) ✅:** provider `payoutProvider = router`, `setTreasury(treasury)` → treasury dibayar dalam tx `close` yang sama. Foundry `TreasuryRouter.t.sol` (11 test, §8.4). SDK integrasi **"skenario 13 (FR-26): payoutProvider = AegisTreasuryRouter → treasury menerima pembayaran dalam tx close yang sama"** (dinamai "13" di suite SDK) — lulus di testnet (channel `0x5a57e6ed…fde1`, tx `0x848f7823…9c11`).
16. **Hook payout & stipend (P1, audit M-1) ✅:** `HookGas.t.sol` — `test_sweep_caller_cannot_starve_router_hook` (semua gas limit 380k…640k: sweep revert atau router sudah meneruskan), `test_settle_caller_cannot_starve_router_hook`, `test_starved_hook_reverts_InsufficientGas`, `test_hook_needing_full_stipend_is_never_starved`, `test_eoa_payee_has_no_stipend_requirement`; `test_reverting_payee_does_not_block_settle_or_close`, `test_gas_burning_payee_is_capped_and_settle_succeeds`, `test_sweep_and_rollover_go_through_hook`.
17. **Adversarial SDK (P0/P1) ✅:** "T19: payTo palsu … ditolak oleh start()", "T-mode: 402 mengklaim anchored=true …", "M6: dua POST /job konkuren …", "F2: balasan provider dengan tanda tangan checkpoint SALAH ditolak SEBELUM pohon disentuh" (Anvil saja), "F3: ClientPolicy — maxDeposit menolak 402 sebelum transfer; maxQtyPerUnit menolak receipt qty 5 …, lalu klien keluar lewat tiket seq-0" (testnet channel `0x8e6fcb4d…f0b5`), "F5: nonce/termsCommitment berbeda per sesi", "/close menolak seq basi (0 atau tengah)" (Anvil saja), "tiket keluar unilateral: provider mati sebelum unit 0 → deposit klien kembali penuh" (Anvil saja), "Task 15 fix round 1: startProviderWatcher in-process mengganti checkpoint basi" (Anvil saja).

**Status suite (20 Sep 2026):** `forge test` **118 lulus, 0 gagal** (audit §4); pada tip P1 sebelum sub-proyek ship: sdk 50, web 31, circuits 14, demo 3, stylus `cargo test` 5 (ledger P1, "Final re-review") — sub-proyek ship menambah test demo/web untuk baris anchored & rollover. Suite integrasi SDK di **testnet 46630 v2: 15 lulus, 4 dilewati** (test yang memakai kunci Anvil #4/#5, hanya chain id 31337), ≈ 1.000 s; assertion saldo memakai polling eventually-consistent (`expectEventually`, 15 s) karena load balancer RPC publik dapat mengembalikan `balanceOf` basi tepat setelah receipt (v1: 13 lulus, 4 dilewati, 973 s). Target v1.0 (≥ 90% line coverage; invariant run ≥ 50k; 200 vektor acak): coverage % **belum diukur**.

---

## 14. DEMO HARNESS

Dua jalur, satu skrip (`demo/run.ts`), dua agen TypeScript nyata (provider Hono + klien) yang berbicara HTTP 402:

- **Pasar A (kontrol):** `SimpleJobEscrow.sol` — escrow gaya ERC-8183 dengan `evaluator = client`, `complete`/`reject` biner, syarat di calldata (publik).
- **Pasar B (AegisClear):** channel penuh.

Skrip menjalankan skenario 1 dan 2 (§13) di kedua pasar dan mencetak:

| Kolom | A (evaluator biner) | B (AegisClear) |
|---|---|---|
| Hasil klien / provider | 0 / 2,00 **atau** 2,00 / 0 | 0,07 / 1,93 (sengketa) · 0,00 / 2,00 (kooperatif) |
| Siapa yang memutuskan | alamat evaluator | bukti Groth16 · dua tanda tangan |
| Field yang terbaca di explorer | harga, ambang, `reason` (string di calldata) | `T`, `R`, jumlah, `payToClient` |
| Gas siklus penuh (**terukur Anvil, Task 16**) | 347.918 (complete) · 330.781 (reject) | 542.194 (sengketa, 100 unit + bukti) · 162.079 (kooperatif) |
| Waktu proving (**terukur**) | — | 4.245 ms (N=128, snarkjs) |
| `leak-check` calldata+log tx channel B | — | **bocor: 0**, ambigu: 0 |

**Dua skenario P1 (web console & `demo/`, 20 Sep 2026; `demo/test/rows.test.ts`, `web/test/server.test.ts`):**

| Baris (`toRows`) | Hasil klien / provider | Siapa yang memutuskan | Field yang terbaca di explorer | Catatan |
|---|---|---|---|---|
| `B: AegisClear anchored (ack on-chain, sengketa)` — skenario `B-anchored-dispute`, `factoryAnchored`, klien A | **0,02 / 0,38** | bukti Groth16 atas `R` on-chain | hash daun, `A` per ack, `payToClient` | 20 unit × 0,02 USDG (`A` = 0,40), pelanggaran di seq 3 & 17 → penalti 2 × 0,01; `leak-check` anchored mengecualikan `unitPrice` (§6.7), metrik/ambang tetap tidak muncul; gas siklus: belum dicatat di dokumen ini |
| `B: AegisClear rollover (128 + 5 unit, 1 deposit)` — skenario `B-rollover`, klien B | **0,00 / 2,66** | dua tanda tangan ×2 (rollover + close) | `T`, `R`, `epoch`, jumlah | 133 unit dengan satu deposit 5 USDG, `epoch` on-chain berakhir 1; gas siklus: belum dicatat di dokumen ini |

Lingkungan: Anvil **fork mainnet 4663** (USDG asli, Permit2 & proxy x402 asli, `vm.warp` untuk jendela) untuk uji; **testnet 46630** dengan `MockUSDG` untuk bukti liveness; **mainnet 4663** dengan USDG sen-level untuk demo video (D1 — belum, deployer 0 ETH). Kontrak produksi dipakai apa adanya — tidak ada `AegisClock`; jendela pendek datang dari factory demo (`MIN_CHALLENGE_WINDOW = 60 s`, D5), bukan dari kode kontrak yang berbeda.

**Web console (20 Sep 2026, `web/`).** Menjalankan skenario tabel ini dari browser (`pnpm web` → `http://localhost:4040`, `WEB_PORT`; mode `AEGIS_NETWORK=local` (Anvil 31337) / `testnet` (46630, alamat dari `contracts/deployments/testnet-46630.json`)): dashboard channel dari event `ChannelOpened` **ketiga factory** (co-signed demo/prod, anchored — dengan kolom `epoch` dan pill mode `anchored`), drawer detail dengan timeline event (`CheckpointSubmitted`, `PenaltyClaimed`, `Settled`, `Swept`, `Funded`, `Acked`, `CloseStarted`, `RolledOver`) + `gasUsed`, log langkah live per skenario (SSE) dengan tautan explorer, tabel perbandingan di atas (tombol skenario `B-cooperative`, `B-dispute`, `B-anchored-dispute`, `B-rollover`, `A-complete`, `A-reject`, plus `all` yang menjalankan keempat kaki tabel §14), kartu privat-vs-chain (untuk channel anchored: "hash daun + A per ack terlihat on-chain; metrik & ambang tetap privat"), `leak-check` per run, dan JSON 402 mentah yang dilihat klien x402. Kunci demo tetap di server (tidak ada wallet browser; server hanya mendengarkan `127.0.0.1`, semua endpoint tanpa autentikasi); provider co-signed di-mount di `/provider`, provider anchored (instance kedua, `factoryAnchored`) di `/provider-anchored`, masing-masing dengan challenge responder in-process. API: `GET /api/config`, `/api/channels`, `/api/channels/:addr`, `POST /api/demo/run {scenario}`, `GET /api/demo/runs`, `/api/demo/runs/:id`, `/api/demo/runs/:id/events` (SSE), `/api/demo/leak-check/:runId`, `/api/offer?client=A|B`. Bukan wallet dApp dan bukan multi-user; proving Groth16 tetap di Node.

> `block.number` di Robinhood Chain adalah estimasi blok L1 yang update periodik. Semua logika waktu memakai `block.timestamp`; jangan pakai `block.number` untuk deadline.

---

## 15. BUSINESS MODEL

| Item | Isi |
|---|---|
| **Initial user** | Merchant Mesh yang ingin menawarkan *SLA-backed offer* untuk job > $10, dan operator armada/agen pembeli yang saat ini menolak membayar di muka |
| **Buyer** | Provider (fee bps atas volume yang di-settle lewat channel — ia yang mendapat akses ke pembeli bernilai tinggi); klien membayar 0 |
| **Distribution** | Satu alamat `payTo`. Merchant menambah `extra.aegis` di 402; klien memasang SDK ack. Facilitator tidak berubah |
| **Revenue** | `protocolFeeBps` di factory (mis. 25 bps) atas `toProvider` saat settle; 0 di MVP |
| **Unit economics ilustratif** | Pada volume Mesh hari ini (512 USDG seumur hidup) pendapatan ≈ **$0,13**. Pada 1.000 channel × $200/bulan → $200k volume → $500/bulan. **Kecil.** Nilainya adalah membuka **ukuran job** yang rel x402 belum bisa layani, bukan mengambil bps dari volume sen |
| **Expansion** | Attestor/zkTLS untuk metrik yang tidak bisa diamati klien; MPP `session` native; agregasi bukti untuk epoch > 128; sinyal ERC-8004 |

**Jujur soal ekonomi.** Ini bukan bisnis fee pada TVL. Sampaikan sebagai infrastruktur yang membuat kategori "job mesin bernilai tinggi tanpa manusia" mungkin — dan ukur keberhasilan awal dari **ukuran rata-rata settlement**, bukan dari volume.

---

## 16. RENCANA KERJA 15 HARI (SOLO)

| Hari | Deliverable | Go/No-Go |
|---|---|---|
| **1** (19 Sep) | ✅ §19 V1–V7 selesai hari ini. Sisa: V8–V17. Registrasi hackathon. Scaffold: Foundry + circom/snarkjs + `tools/settlement_vectors.py` (ada) | Semua toolchain jalan |
| **2–3** | ✅ Sirkuit `sla_settlement.circom` + vektor EX1–EX3 + 200 vektor acak; ptau 2¹⁷ (lokal, V14); zkey (release `v0.1.0-zkey`); verifier Solidity; constraint 115.066 (`--O2`), proving 4.245 ms (§9.3, §14) | **Go/No-Go sirkuit:** ✅ semua vektor lulus, proving < 30 s |
| **4** | ✅ Benchmark Poseidon: Poseidon2 dulu (2,33×, ditarik), lalu `AegisPoseidon` Poseidon v1 vs `PoseidonPathYul` on-chain — `insertPath` 1,75× (§8.3) | **D2:** ✅ ≥ 1,5× terpenuhi dengan hash yang kompatibel sirkuit |
| **5–7** | ✅ `AegisChannel` + factory + `MockUSDG`; EIP-712; ERC-1271 (`Wallet1271.t.sol`); Foundry: skenario 1–9, INV-1–9; gas §8.7 | ✅ Skenario 2 & 4 lulus end-to-end dengan bukti asli via FFI (`Penalty.t.sol`) |
| **8** | ✅ `aegis-sdk` core + provider middleware + klien; protokol ack; deploy testnet 46630 (v0 20 Sep, v1 20 Sep) | ✅ Dua agen menyelesaikan 100 request + cooperative close di testnet |
| **9** | Sebagian: `Permit2.t.sol` + T19 di SDK; x402 `payTo` di fork mainnet & facilitator Mesh nyata (V8) **menunggu pemilik** | Dana lewat proxy kanonik masuk channel — belum dibuktikan terhadap facilitator nyata |
| **10** | ✅ Watcher/settler + challenge responder (Task 15); skenario 5–8; `Invariant.t.sol`; `leak-check` (bocor 0); skenario 13 sebagian (§13) | INV hijau; coverage % belum diukur |
| **11** | ✅ Demo harness A vs B + tabel (Task 16); `SimpleJobEscrow.sol` kontrol; **P1:** web console `web/` | ✅ Tabel §14 tercetak dari run nyata |
| **12** | ✅ **D2 positif:** anchored mode + `AegisPoseidon` (Stylus, aktif di 46630) + skenario 12 ×4; `AegisTreasuryRouter` + hook; epoch/`rollover` + skenario 11; redeploy testnet v1 (V18b). **Deploy mainnet 4663 (D1): belum — deployer 0 ETH, menunggu pemilik** | ✅ Angka Stylus/Yul terukur masuk §8.7 |
| **13** | ✅ Audit sendiri: Slither 0.11.5 (`docs/audit/slither-2026-09.md`) — nol High/Medium yang benar, 2 Low + M-1 diperbaiki (Aderyn tidak terpasang); README memuat matriks §8.6 & tabel §6.7. Ceremony ≥ 3 kontributor **tidak** dilakukan (T4 dinyatakan, §9.4) | ✅ Nol temuan high yang benar |
| **14** | Spec v1.1 ✅ (dokumen ini); paket submission ✅ `docs/SUBMISSION.md` (runbook demo, skrip video, write-up portal, Q&A juri, checklist DQ — 20 Sep 2026); video ≤ 3 menit itu sendiri (web console testnet → run dispute → tabel → leak-check → explorer) **menunggu pemilik** | |
| **15** | Buffer + submit. **Deadline 4 Okt 2026 15:59 UTC** (22:59 WIB) | |

**Aturan pemangkasan bila tertinggal (v1.0).** Buang dengan urutan ini: `AegisTreasuryRouter` → anchored mode + `AegisPoseidon.rs` → `rollover` → integrasi facilitator Mesh nyata (cukup fork) → deploy mainnet (cukup testnet). Yang **tidak boleh** dibuang: sirkuit + verifier + `AegisChannel` + SDK ack + demo A vs B. Empat hal itu adalah produk yang utuh dan jujur; tanpa Stylus sekalipun ia tetap "escrow yang evaluatornya sirkuit". **Hasil (20 Sep 2026):** tiga item pertama tidak perlu dipangkas — semuanya dikirim; yang tersisa persis dua item terakhir daftar (facilitator Mesh nyata, mainnet), keduanya menunggu pemilik.

---

## 17. PERTANYAAN JURI & JAWABAN SIAP

| Pertanyaan | Jawaban |
|---|---|
| "Ini escrow lagi?" | Escrow-nya standar — sengaja. Yang baru: evaluatornya sirkuit, hasilnya proporsional, syaratnya privat, dan ia hidup di alamat `payTo` x402 sehingga rel yang ada tidak berubah. |
| "Kenapa bukan ERC-8183 dengan evaluator kontrak?" | Itu **persis** yang kami bangun — 8183 menyebut evaluator boleh memverifikasi bukti ZK, tapi semantiknya per-job dan biner. Kami menambah channel banyak unit dan payout proporsional; event-nya tetap berbentuk 8183 agar indexer paham. |
| "Kenapa ZK, bukan TEE atau LLM-as-judge?" | Ketiganya mengganti kepercayaan pada manusia dengan kepercayaan pada sesuatu. TEE: vendor + attestasi; LLM: model + prompt, non-deterministik, dan harus melihat datanya. Sirkuit: hanya matematika, deterministik, dan tidak melihat apa pun. Untuk SLA yang bisa dinyatakan sebagai aritmetika atas metrik co-signed, ZK adalah opsi termurah dalam asumsi. |
| "Kenapa Robinhood Chain?" | Empat hal sekaligus: USDG asli (703 juta supply, 6 desimal) dengan rel Permit2/x402 yang hidup (Mesh), FCFS tanpa priority fee (jendela waktu adalah satu-satunya tuas — desain kami memang berbasis waktu), gas 0,07 gwei yang membuat verifikasi 225k gas ekonomis untuk sengketa sen, dan Stylus untuk hashing on-chain. Base punya USDC, bukan USDG dan ekosistem ini. |
| "Kenapa verifier di Solidity kalau kalian pakai Stylus?" | Karena kami mengukur. Pairing BN254 adalah precompile; Groth16 di Stylus 256k gas vs Solidity 194k (zk-sunade vs frame-verify-gas; verifier kami terukur 229.241 untuk 6 input). Stylus dipakai di tempat ia menang — dan kami mengukurnya sendiri, bukan mengutip. |
| "Stylus di mana, dan kenapa hanya di sana?" | Di **satu** tempat: `AegisPoseidon`, dipanggil `ack()` anchored mode untuk menyisipkan hash daun ke pohon Merkle on-chain — 7 hash Poseidon dalam satu panggilan `insertPath`. Terukur di testnet 46630 dengan hash yang **sama** dengan sirkuit (circomlib Poseidon v1): **144.076 gas vs 252.271 di Yul — 1,75× lebih murah** (≈1,9× eksekusi-saja). Kenapa hanya di sana: itu satu-satunya tempat AegisClear menghitung Poseidon di chain (daun & komitmen dihitung off-chain, verifier Groth16 adalah precompile), dan Stylus hanya menang bila satu panggilan cukup besar — hash tunggal justru lebih mahal (82.593 vs 62.138) karena tiap panggilan membayar init program 8,8k gas (chain ini belum punya CacheManager). Angka 2,33× yang sempat kami catat berasal dari Poseidon2 yang tidak kompatibel sirkuit — kami tarik. Padanan Yul-nya (`PoseidonPathYul`) tetap ada dengan ABI dan keluaran identik. |
| "Trusted setup?" | Satu kontributor untuk hackathon — dinyatakan di README. Pemegang toxic waste bisa memalsukan bukti, karena itu kontrak membatasi `payToClient ≤ A` dan hanya pihak channel yang boleh klaim. Sebelum dana nyata: ceremony ≥ 3 kontributor, atau PLONK universal dengan +50–100% gas. |
| "Bagaimana kalau provider bohong soal metrik?" | Ia tidak bisa membuat receipt sendirian: setiap metrik yang dihitung sirkuit adalah metrik yang klien tanda tangani. Kalau klien tidak setuju, ia tidak ack dan unit itu tidak dibayar. |
| "Bagaimana kalau klien tidak pernah ack?" | Provider berhenti melayani; kerugian maksimum satu unit — sama seperti API prabayar mana pun. Kami tidak berpura-pura menghapus risiko itu; kami membatasinya ke satu unit. |
| "Apa yang bocor?" | Pihak, deposit, total yang di-ack, jumlah unit, jumlah epoch, dan porsi penalti jika ada klaim. Bukan harga, ambang, metrik, atau jumlah pelanggaran. Anchored mode sengaja membocorkan lebih: `A` per ack, jadi harga per unit tersirat — tetap tanpa metrik dan ambang, dan `leak-check` memeriksanya begitu. Tabelnya ada di README; kami tidak mengklaim anonim. |
| "128 receipt per epoch — terlalu kecil?" | Untuk micro-escrow, itu satu hari kerja robot. Rollover kooperatif me-reset epoch tanpa deposit ulang — sudah dikirim dan dibuktikan di testnet (skenario 11: 128 unit → `rollover` → 5 unit lagi → close, satu deposit; web console: 0,00 / 2,66 USDG). Setiap pesan yang ditandatangani memuat `epoch`, jadi checkpoint epoch lama tidak bisa di-replay. Agregasi bukti adalah roadmap, bukan MVP. |
| "Kenapa ada dua mode?" | Co-signed: murah (ack = tanda tangan off-chain), butuh responder tantangan dan tiket keluar. Anchored: setiap ack adalah tx on-chain (≈211k–217k gas dengan Stylus), tidak ada asumsi liveness dan tidak ada tiket — untuk job bernilai tinggi frekuensi rendah. Mode adalah sifat factory (`POSEIDON` immutable), kontrak channel identik; klien menentukan mode dari factory-nya sendiri, bukan dari klaim 402 provider. |
| "Hook payout — bukankah itu yang 8183 peringatkan?" | Ya, karena itu best-effort: dipanggil setelah transfer, dalam try/catch dengan stipend 300k, kegagalan diabaikan — payee yang revert tidak bisa menyandera settle pihak lain. Audit kami menemukan sendiri (M-1) bahwa stipend hanya batas atas: pemanggil `settle` permissionless bisa mengelaparkan hook dan membuat token nyasar di router. Diperbaiki dengan pemeriksaan gas pasca-panggilan gaya OZ; tesnya gagal di kode lama. |
| "Kenapa tidak optimistik saja (UMA) — lebih murah?" | Optimistik butuh bond, jendela sengketa yang bisa diperebutkan, dan data yang **publik** agar orang bisa menantang. Kami tidak punya penantang — kami punya bukti. |
| "Apa yang on-chain?" | Channel, komitmen syarat, root receipt, checkpoint co-signed, verifikasi bukti, pembayaran. Off-chain: receipt, ack, proving. Tidak ada keeper yang dibutuhkan untuk keselamatan — `settle` permissionless dan defaultnya adalah state yang kedua pihak terakhir setujui. |
| "Sudah ada yang bangun ini?" | ERC-8183 (escrow evaluator biner), Kleros/UMA (adjudikasi manusia/optimistik), Mesh (rel tanpa escrow). Tidak ditemukan escrow agen dengan adjudikasi bukti ZK yang terdeploy — kami akan menyebut jika menemukannya. |
| "Kenapa USDG?" | Karena itu uang yang sudah dipakai agen di chain ini (Mesh: 15.718 settlement), dan juri memberi prioritas USDG. USDC secara teknis bisa (EIP-3009 malah lebih mudah); kami tidak mengklaim USDG tak tergantikan. |
| "Apa yang bisa direproduksi tim lain dalam 48 jam?" | Kontrak channel-nya. Yang tidak: sirkuit dengan vektor uji diferensial tiga implementasi, integrasi `payTo` yang tidak menyentuh facilitator, dan tabel kebocoran yang jujur. |

---

## 18. RENCANA B

**B1 — Proving terlalu lambat / ptau 2¹⁷ bermasalah.** `MAX_SEQ = 64` (≈ 45k constraint, ptau 2¹⁶). Narasi tidak berubah.

**B2 — Groth16 toolchain gagal (zkey/verifier).** PLONK di snarkjs dengan sirkuit yang sama; verifier ≈ 300–400k gas; tanpa phase-2 khusus sirkuit (menghapus T4 sebagian). Tambah ≈ 1 hari.

**B3 — ZK gagal total sebelum Hari 7.** *Commit-reveal*: `claimPenalty` membuka `terms` + receipt on-chain, kontrak menghitung ulang `T` dan `R` (Poseidon Yul/Stylus, ≤ 255 hash ≈ 3–5M gas) dan mengevaluasi §6.3 di Solidity. Privasi bertahan **sampai sengketa** — dinyatakan begitu, dan ini satu-satunya jalur di mana Stylus menjadi komponen utama. Semantik §6 dan vektor uji tetap dipakai. **Tidak diaktifkan** (ZK jalan) — karena itu `hash5`/`hash6`/`root128` tidak dibangun di `AegisPoseidon` (§8.3).

**B4 — Jangan lakukan:** membangun "escrow agen generik" tanpa bukti maupun reveal. Itu ERC-8183 tanpa alasan untuk ada.

**B5 — Stylus tidak tersedia, gagal di-deploy, atau kedaluwarsa (P1, ada dan teruji).** `PoseidonPathYul` (`contracts/src/PoseidonPathYul.sol`) adalah kembaran `IPoseidonPath` dengan ABI dan keluaran identik di atas `poseidon-solidity`: `DeployTestnet.s.sol` memakainya otomatis bila `POSEIDON_STYLUS` kosong; Foundry/Anvil selalu memakainya (tidak ada VM WASM). Biaya: `ack` ≈303k–309k gas (Anvil) alih-alih ≈211k–217k (Stylus, testnet) — anchored mode tetap berfungsi, hanya 1,75× lebih mahal di jalur hash. Program yang kedaluwarsa (T15) tidak mengunci dana: semua jalur keluar adalah EVM murni (§8.3).

---

## 19. VERIFICATION CHECKLIST — HARI 1

Item ✅ diverifikasi 19 Sep 2026 dengan perintah yang tercantum (RPC publik), atau 20 Sep 2026 bila disebut (V9–V12, V18, V18b, V19). Masih terbuka: V4b, V8, V13, V15, V16, V17 — semuanya di luar jalur dana atau menunggu pemilik.

| # | Item | Cara | Hasil / Konsekuensi |
|---|---|---|---|
| V1 | Chain ID & RPC | `cast chain-id --rpc-url https://rpc.{testnet,mainnet}.chain.robinhood.com` | ✅ `46630` / `4663`. Explorer: `explorer.testnet.chain.robinhood.com`, `robinhoodchain.blockscout.com` |
| V2 | Stylus aktif & parameter | `cast call 0x…71 "stylusVersion()"`, `"inkPrice()"`, `"pageLimit()"`, `"freePages()"`, `"pageGas()"`, `"minInitGas()"`, `"expiryDays()"`, `"keepaliveDays()"` | ✅ keduanya: `3`, `10000`, `128`, `2`, `1000`, `(8832, 352)`, `365`, `31`. `ArbSys.arbOSVersion()` = 116 (ArbOS 61) |
| V3 | Block time & gas price | `cast block` selisih 1.000 blok; `cast gas-price` | ✅ mainnet **0,101 s/blok**; 0,0676 gwei (testnet 0,01 gwei) |
| V4 | USDG mainnet | `cast call 0x5fc5…d168 "decimals()"`, `"symbol()"`, `"totalSupply()"`, slot EIP-1967 | ✅ `6`, `USDG`, `703.768.785 USDG`, impl `0x68184c44…6f8f`; `paused()=false`, `isFrozen(x)=false`; `transferWithAuthorization` dan `permit` hanya revert kosong (tidak konklusif — dispatch impl tidak terbaca dari bytecode); EIP-3009 dianggap **tidak ada** sesuai pernyataan Mesh sampai V4b |
| V4b | Fungsi freeze/pause USDG & pemegang peran | Blockscout UI (API diblokir Cloudflare untuk curl) — baca source terverifikasi impl | Dokumentasi T8 |
| V4c | USDG **testnet** 46630 | tidak ditemukan di docs Robinhood, Mesh (mainnet-only), maupun faucet | ✗ → `MockUSDG` (FR-22); mainnet untuk demo USDG asli (D1) |
| V5 | Permit2, `x402ExactPermit2Proxy`, EntryPoint 4337 v0.6/v0.7, Multicall3 | `cast code <addr>` di kedua jaringan | ✅ semuanya ada di 4663 **dan** 46630 |
| V6 | Kriteria juri, deadline, syarat deploy | hackquest.io (halaman buildathon) | ✅ 4 kriteria; USDG prioritas; ≥ 1 podium Robinhood Chain; deploy di chain Arbitrum mana pun; **4 Okt 2026 15:59 UTC** |
| V7 | Benchmark referensi ZK | zk-sunade README; frame-verify-gas README; OpenZeppelin blog | ✅ 256.334 / 194.396 / 11.887–19.313–220.244 gas |
| V8 | Facilitator Mesh menerima `payTo` arbitrer? | kirim 402 tiruan dengan `payTo = predict(cfg)` ke `facilitator.meshgateway.co /verify` | Jika tidak → facilitator sendiri (fork `meshgateway/x402`) |
| V9 | Toolchain: `circom` 2.x, `snarkjs`, `rapidsnark`, `cargo-stylus`, `stylus-sdk` versi, Foundry | ✅ (20 Sep 2026): Foundry 1.5.1, Node 22, pnpm 9.15, circom 2.2.3, cargo 1.92.0 + cargo-stylus 0.10.9 + stylus-sdk 0.10.9 + target wasm32; `cargo stylus check --endpoint <testnet>` lolos (`docs/benchmarks/poseidon.md` §2, `stylus/aegis-poseidon/README.md`); `rapidsnark` tidak dipakai (snarkjs cukup: ≈4 s) | Ukuran WASM: batas yang mengikat adalah **24 KB terkompresi** Stylus (bukan 96 KB kode EVM) — `AegisPoseidon` 21,7 KB, sisa ≈2,9 KB (§8.3) |
| V10 | Gas verifier Solidity 6 input publik | Foundry: `verifyProof` dengan bukti asli EX1 | ✅ **229.241** (`Verifier.t.sol`, §8.2) |
| V11 | Constraint & proving time sirkuit | `snarkjs r1cs info`; `time snarkjs groth16 prove` | ✅ 115.066 constraint (`--O2`, ptau 2¹⁷), proving 4.245 ms (§9.3, §14) — D4 tidak diperlukan |
| V12 | Poseidon Yul vs Stylus | Foundry gas `poseidon-solidity` T3/T6; `cargo stylus` deploy + `cast estimate` | ✅ **D2 final (20 Sep 2026, on-chain 46630, Poseidon v1 kompatibel sirkuit):** `insertPath` Yul 252.271 vs Stylus 144.076 → **1,75× total / ≈1,9× eksekusi**; `hash2` Yul 62.138 vs Stylus 82.593 (Yul lebih murah); Foundry Yul referensi T3 32.503, T6 172.418, 7×T3 212.715, `insertPath` 222.766. Angka Poseidon2 (0,70× / 2,33×) = riwayat, ditarik. `docs/benchmarks/poseidon.md` §5 |
| V13 | Jendela force-inclusion delayed inbox Robinhood Chain | docs Arbitrum / kontrak `SequencerInbox` (`maxTimeVariation`) | `challengeWindow` produksi (§6.6) |
| V14 | Powers of Tau 2¹⁷ | ✅ diperiksa 19 Sep 2026: mirror `storage.googleapis.com/zkevm/ptau` **dan** `hermez.s3-eu-west-1.amazonaws.com` mengembalikan HTTP 403 → `circuits/scripts/setup.sh` membangkitkan ptau lokal (`powersoftau new/contribute/beacon/prepare phase2`); jika mirror kembali tersedia, `PTAU_URL=… setup.sh` + cocokkan hash blake2b `6247a343…49345` dari README snarkjs | Setup lokal = kontributor tunggal juga untuk phase 1 (T4 tidak berubah) |
| V15 | Registry ERC-8004 di Robinhood Chain (MeshIdentity) | docs/repo Mesh, explorer | FR-28 roadmap |
| V16 | ZeroStyl — apa yang sudah ia sediakan | github.com/kazai777/zerostyl | Kreditkan jika dipakai/berimpit |
| V17 | Syarat submission: durasi video, repo publik, form | portal HackQuest | DQ jika terlewat |
| V18 | **Deploy testnet 46630** | ✅ 20 Sep 2026: `DeployTestnet.s.sol --broadcast --verify` — 7/7 kontrak terverifikasi Blockscout (factory demo `0x0922ee7D…4ED3`, factory prod `0x201BaC41…7fDD`, verifier `0x5EC99814…7462`, MockUSDG `0xCadd4526…5a83`, escrow `0x5017C9e5…964a`); test integrasi kooperatif + sengketa (bukti Groth16 asli, jendela 120 s nyata) **lulus on-chain** — `claimPenalty` tx `0x54355aef…93a6`, `Settled` `0xd903f389…37bc` | Bukti liveness untuk submission (README) — **deploy v0, digantikan V18b** |
| V18b | **Deploy testnet v1 (epoch/rollover, router, anchored) + Stylus `AegisPoseidon`** | ✅ 20 Sep 2026: `DeployTestnet.s.sol --broadcast --verify` dengan `POSEIDON_STYLUS=0x1027cf7D…ef34` (Stylus di-deploy lebih dulu via `cargo stylus deploy`) — 7/7 kontrak terverifikasi Blockscout blok `121.982.356` (`factory` `0x596E9f21…dAfF`, `factoryProd` `0xf8e93aE5…FE5a`, `factoryAnchored` `0x1fB7d8E1…6147`, `router` `0xe4A87335…7689`, `verifier` `0x7B8ad2d9…6273`, `usdg` `0x7455E600…94EF`, `escrow` `0xC4b08e8F…Ab9C`, `poseidon` `0x1027cf7D…ef34`); suite integrasi SDK **13 lulus, 4 dilewati** (Anvil-key-only, di luar chain id 31337), 973 s; kembaran Yul di testnet untuk D2: `PoseidonT3` `0xd52e2919…3d1`, `PoseidonPathYul` `0x804318aE…3766` | Bukti liveness v1 untuk submission (README); deploy v0 (V18) tetap terdokumentasi sebagai riwayat. **Catatan v1.1:** v1 di-deploy dari source dengan `HOOK_GAS` 150k, **tanpa** penjaga `InsufficientGas` (M-1) dan **tanpa** `ZeroAddress` di konstruktor factory — digantikan v2 (V18c) pada hari yang sama |
| V18c | **Deploy testnet v2 (bytecode teraudit) + suite integrasi ulang** | ✅ 20 Sep 2026: `DeployTestnet.s.sol --broadcast --verify` dengan `POSEIDON_STYLUS=0x1027cf7D…ef34` (program Stylus yang sama dipakai ulang) — 7/7 kontrak terverifikasi Blockscout blok `122.028.843` (`factory` `0x52773ab5…41B6`, `factoryProd` `0xFB20a588…01E0`, `factoryAnchored` `0xa53eC395…2B76`, `router` `0xE97dD387…e17A`, `verifier` `0x2729cbdC…a405`, `usdg` `0x5A9BC144…2382`, `escrow` `0x6ddac1F8…b02E`); suite integrasi SDK **15 lulus, 4 dilewati**: run pertama 14/15 — satu assertion saldo gagal karena `balanceOf` basi dari load balancer RPC publik (settlement on-chain benar: `Settled` 190.000/810.000), diperbaiki dengan polling eventually-consistent (commit `f75f4f0`) dan lulus pada run ulang; gas v2 di §8.3/§8.7 | Source `main` = bytecode explorer untuk juri "smart contract quality"; `contracts/deployments/testnet-46630.json` di-commit (v2) dan dipakai `AEGIS_NETWORK=testnet` |
| V19 | **Self-audit Slither** | `slither . --filter-paths "lib/\|test/\|script/" --exclude-dependencies --checklist` di `contracts/` (0.11.5, solc 0.8.28) | ✅ 20 Sep 2026: 77 → 75 hasil; 3 High + 2 Medium semuanya *false positive* (idiom snarkjs, `amount == 0`, re-entrancy terjaga); 2 Low diperbaiki (`ZeroAddress`), 1 Low by design (`poseidonPath == 0` = mode), 2 Low diterima (`block.timestamp`); M-1 manual diperbaiki; `forge test` 118 lulus (`docs/audit/slither-2026-09.md`, commit `5fe05c0`) |

---

## 20. OPEN DECISIONS

| # | Keputusan | Opsi | Rekomendasi |
|---|---|---|---|
| D1 | Deployment final | testnet 46630 (MockUSDG) saja / + mainnet 4663 (USDG asli, sen-level) | **Keduanya.** Seluruh ekosistem Mesh hanya hidup di mainnet; biaya deploy < $2 pada 0,07 gwei; juri memberi prioritas USDG asli. Dana demo ≤ 5 USDG. **Status 20 Sep 2026:** testnet v1 ✅ (v2 menyusul); **mainnet belum** — deployer 0 ETH di 4663, menunggu pemilik |
| D2 | Stylus | Poseidon di Stylus jika benchmark Hari 4 ≥ 1,5× vs Yul / Yul saja | ✅ **FINAL — Stylus hanya untuk anchored mode (`insertPath`), 1,75× vs Yul dengan Poseidon v1 kompatibel sirkuit.** Riwayat keputusan: **Terukur on-chain 20 Sep 2026 (testnet 46630, `cast estimate` − intrinsik, apple-to-apple):** hash tunggal Yul 39.472 vs Stylus 56.513 (rasio 0,70× — Stylus lebih mahal karena init program 8.832 gas; chain ini **tidak punya CacheManager**, semua panggilan uncached); rantai 7 hash (jalur anchored ack) Yul 223.901 vs Stylus 95.934 (**rasio 2,33×**, marjinal ≈ 6,6k vs ≈ 30,7k gas/hash). Yul (Foundry, referensi): T3 32.503, T6 172.418, 7×T3 212.715. WASM 14,4 KB terkompresi. Perbandingan kelas biaya (Poseidon2 vs v1). **Keputusan (20 Sep 2026, kriteria §16 Hari 4 "≥ 1,5×" terpenuhi pada jalur yang relevan): Stylus untuk anchored mode** — satu-satunya tempat Poseidon dihitung on-chain adalah rantai 7 hash per `ack` (FR-25), dan di situ Stylus 2,33× lebih murah; hash tunggal (0,70×) tidak dipakai on-chain di mana pun. `AegisPoseidon.rs` mengimplementasikan circomlib Poseidon v1 (D3), bukan Poseidon2 seperti program benchmark; lihat `docs/benchmarks/poseidon.md`. **Update 20 Sep 2026 (deploy v1):** angka 2,33× di atas datang dari Poseidon2, yang **bukan** kompatibel sirkuit; dengan port Poseidon **v1** kompatibel sirkuit yang benar-benar aktif (`0x1027cf7D…ef34`, 21,7 KB), rasio terukur turun menjadi **1,75× total (≈1,9× eksekusi-saja)** pada jalur 7-hash `insertPath`/`ack` — tetap di atas ambang 1,5×, jadi keputusan tidak berubah: **Stylus dipertahankan hanya untuk anchored mode**; hash tunggal tetap lebih murah di Yul dan tidak dipakai on-chain. Detail: `docs/benchmarks/poseidon.md` §5 |
| D3 | Varian hash | circomlib Poseidon v1 di semua tempat (port Rust) / Poseidon2 (OZ Rust + template circom baru) | ✅ **v1, dibangun.** `AegisPoseidon` = port `circomlibjs/poseidon_opt.js` (t=3) di atas `ark-ff` 0.5, konstanta dibangkitkan dari `circomlibjs`; keluaran identik dengan sirkuit, SDK, `PoseidonT3` (§8.3). Port generik `ark-ff` pertama hanya 1,43× — algoritma teroptimasi (matriks jarang + `sum_of_products`) yang mencapai 1,75× |
| D4 | `MAX_SEQ` | 64 / 128 / 256 | ✅ **128** — proving 4,2 s, tidak perlu turun |
| D5 | Jendela demo | factory demo terpisah (`MIN_CHALLENGE_WINDOW = 60 s`) / `vm.warp` saja | ✅ **Factory demo terpisah** — testnet v1/v2: `factory` 60 s, `factoryProd` 21.600 s, `factoryAnchored` 60 s; kode kontrak channel identik, hanya immutable |
| D6 | Proof system | Groth16 (194k, phase-2 per sirkuit) / PLONK (≈ +50–100% gas, universal) | **Groth16** untuk MVP dengan T4 dinyatakan; PLONK sebagai B2 & opsi produksi |
| D7 | Persetujuan klien atas `ChannelTerms` di jalur x402 | header tambahan saat bayar / provider membuka + tanda tangan klien saat ack pertama | ✅ **Provider membuka** (`POST /job` pertama dengan `Aegis-Terms-Signature`). Menjaga klien x402 polos tetap bisa membayar; SDK klien memverifikasi `sigProvider` sebelum menandatangani Permit2 (T19) |
| D8 | `payoutClient`/`payoutProvider` | wajib = pihak / bebas | ✅ **Bebas** — itulah "treasury routing"; router adalah gula, dibangun sebagai hook + kredit (§8.4) |
| D9 | Fee protokol | 0 / bps di factory | **0 di MVP**, slot ada |
| D10 | Nama repo publik | — | Hindari "escrow" sebagai nama (generik); pertahankan "AegisClear" — `github.com/mdlog/AegisClear` |
| **D11** (baru, terbuka) | `startClose()` di mode co-signed | hanya anchored (sekarang) / juga co-signed: pihak mana pun boleh membuka jendela tantangan atas state on-chain (`seq` co-signed terakhir yang sudah disubmit, atau 0) | **Terbuka — kandidat untuk deploy berikutnya (tidak masuk v2, yang hanya memuat hardening audit).** Ditemukan saat review Task 2 P1 (ledger): setelah `rollover`, klien co-signed bergantung pada tiket keluar epoch baru dari provider (T25); `startClose()` co-signed memberi jalan keluar sepihak seq-0 tanpa tiket, **aman di bawah asumsi responder** yang sudah wajib (provider menjawab dengan `latestCoSigned` — persis seperti tiket seq-0 hari ini), dan membuat seluruh mekanisme tiket keluar (`exitSig`, `exitSigNext`) berlebihan. Biaya: satu fungsi + test; tidak mengubah semantik §6.4. Belum diputuskan karena butuh redeploy dan perubahan SDK klien |

---

## 21. GLOSARIUM

| Istilah | Arti |
|---|---|
| **x402** | Protokol pembayaran HTTP 402: server menantang, klien menandatangani otorisasi transfer, facilitator menyelesaikan on-chain |
| **Skema `exact` / `upto`** | x402: bayar jumlah pasti / otorisasi maksimum lalu settle aktual (Permit2) |
| **MPP** | Machine Payments Protocol — intent `charge`, `session`, `subscription`; refund, tanpa sengketa |
| **Permit2 witness transfer** | `permitWitnessTransferFrom`: transfer bertanda tangan dengan data tambahan (`Witness{to, validAfter}`) yang mengunci tujuan |
| **`x402ExactPermit2Proxy`** | Kontrak kanonik `0x402085c2…20001` sebagai `spender` Permit2 yang memaksa `to == witness.to` |
| **ERC-8183** | Agentic Commerce: escrow job + evaluator tunggal, `complete`/`reject` biner |
| **ERC-8004** | Trustless Agents: Identity, Reputation, Validation registry |
| **Channel / epoch** | Satu kontrak clone per pasangan agen; epoch = ≤ 128 receipt di bawah satu `receiptsRoot`. `epoch` (`uint32`) adalah penghitung on-chain yang naik satu per `rollover` dan ada di setiap struct yang ditandatangani — tanda tangan epoch lama mati setelah rollover |
| **Rollover** | Penutupan epoch kooperatif (FR-10): dua tanda tangan `Rollover(epoch, seq, toProvider)`, provider dibayar, sisa saldo menjadi budget epoch berikutnya di channel yang sama, `seq/A/R` di-reset, `epoch++` |
| **Receipt / ack** | Unit layanan `(seq, qty, m1, m2, due)`; ack = tanda tangan klien atas checkpoint kumulatif baru (co-signed) atau tx `ack()` klien atas daun yang ditandatangani provider (anchored) |
| **Checkpoint** | `(epoch, seq, cumulativeAmount, receiptsRoot)` dengan tanda tangan kedua pihak |
| **Tiket keluar (exit ticket)** | `Checkpoint(epoch, 0, 0, emptyRoot)` yang ditandatangani provider di muka (di 402 sebagai `exitSig`; untuk epoch berikutnya sebagai `exitSigNext` di balasan `/rollover`) agar klien co-signed punya jalan keluar sepihak sebelum unit pertama; dinetralkan responder bila ada checkpoint lebih tinggi; tidak dipakai di anchored |
| **Hook payout / `IAegisPayoutHook`** | `onPayout(party, token, amount)` yang dipanggil channel pada payee **kontrak** setelah transfer, best-effort (try/catch, stipend `HOOK_GAS` 300k, penjaga `InsufficientGas`); `AegisTreasuryRouter` adalah implementasinya |
| **Slack (router)** | Saldo router yang melebihi `totalCredit` — muncul hanya dari transfer langsung ke router (dilarang) dan bisa diklaim siapa pun lewat `onPayout` |
| **Mode per factory / `POSEIDON`** | Immutable factory (dan implementasi channel): `0` = co-signed, alamat `IPoseidonPath` = anchored; klien menurunkan mode dari factory-nya sendiri (T23) |
| **`insertPath`** | Fungsi `IPoseidonPath`: 7 hash Poseidon t=3 dalam satu panggilan untuk menyisipkan satu daun ke pohon inkremental kedalaman 7; diimplementasikan Stylus (`AegisPoseidon`) dan Yul (`PoseidonPathYul`) dengan keluaran identik |
| **`termsCommitment` (T)** | `Poseidon(p, L*, Q*, π, κ, ν)` — komitmen syarat komersial |
| **`receiptsRoot` (R)** | Root pohon Poseidon 128 slot atas leaf receipt |
| **Cooperative / unilateral close** | Kedua pihak menandatangani pembagian akhir / satu pihak mengirim checkpoint dan membuka jendela |
| **`challengeWindow` / `responseWindow`** | Jendela sebelum `settle` / perpanjangan per checkpoint baru |
| **Klaim penalti** | Bukti Groth16 bahwa `payToClient = min(Σ pen_i, cap)` atas `(T, R, seq, A)` |
| **Anchored mode** | Ack on-chain: klien mengirim tx `ack(seq, leaf, cumulativeAmount, sigProvider)` dan kontrak memelihara pohon Poseidon inkremental (`insertPath`, Stylus di Robinhood Chain / Yul di Anvil); `startClose()` membuka jendela; tanpa checkpoint co-signed, responder, atau tiket keluar — untuk job bernilai tinggi frekuensi rendah; membocorkan `A` per ack (§6.7) |
| **Poseidon** | Hash aritmetika ramah-SNARK atas field BN254; circomlib v1 di dokumen ini |
| **Groth16 / ptau / zkey** | Proof system; Powers of Tau universal; kunci phase-2 khusus sirkuit |
| **FCFS** | First-come-first-served sequencing — tidak ada priority fee di Robinhood Chain |
| **Ink** | Satuan metering Stylus; 1 gas = 10.000 ink (on-chain `inkPrice`) |

---

## 22. SUMBER TEKNIS YANG DIPAKAI DOKUMEN INI

- Arbitrum Open House Singapore — Buildathon (kriteria, hadiah, deadline, USDG prioritas): `https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon`; pengumuman: `https://blog.arbitrum.foundation/builders-block-025-arbitrums-buildathon-starts-next-week-heres-how-to-stand-out-in-open-house/`
- Robinhood Chain — About, Connecting (chain ID, RPC, explorer), Differences from Ethereum (FCFS, `block.number`, 96 KB), Contracts (USDG, WETH): `https://docs.robinhood.com/chain/`
- Robinhood Chain RPC publik (semua verifikasi ✅ §19): `https://rpc.mainnet.chain.robinhood.com`, `https://rpc.testnet.chain.robinhood.com`
- MeshGateway — produk & metrik: `https://meshgateway.co`; docs: `https://docs.meshgateway.co`; SDK/konstanta (USDG, Permit2, proxy, facilitator): `https://github.com/meshgateway/x402-client`, `https://github.com/meshgateway/wallet`, `https://github.com/meshgateway/mpp-client`
- x402 — spesifikasi skema `exact` EVM (EIP-3009 vs Permit2, proxy kanonik, witness): `https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md`; skema `upto`: `https://github.com/coinbase/x402/blob/main/specs/schemes/upto/scheme_upto_evm.md`
- MPP — intent & refund: `https://mpp.dev`
- ERC-8183 Agentic Commerce: `https://eips.ethereum.org/EIPS/eip-8183`
- ERC-8004 Trustless Agents: `https://eips.ethereum.org/EIPS/eip-8004`
- Stylus — gas & ink, memory pages, aktivasi, init cost: `https://docs.arbitrum.io/stylus/concepts/gas-metering`, `https://docs.arbitrum.io/stylus/concepts/stylus-gas`
- zk-sunade — Groth16 di Stylus (256.334 gas, `RawCall` ke precompile): `https://github.com/supernovahs/zk-sunade`
- frame-verify-gas — Groth16 BN254 Solidity 194.396 gas (reproduksi Foundry): `https://github.com/manusw7/frame-verify-gas`
- OpenZeppelin — Poseidon di Stylus 11.887 vs Yul 19.313 vs Solidity 220.244 gas (Feb 2025): `https://www.openzeppelin.com/news/poseidon-go-brr-with-stylus-cryptographic-functions-are-18x-more-gas-efficient-via-rust-on-arbitrum`; pustaka: `https://github.com/OpenZeppelin/rust-contracts-stylus`
- poseidon-solidity (Yul, circomlib-compatible, PoseidonT3 21.124 gas): `https://github.com/chancehudson/poseidon-solidity`
- Renegade — PLONK verifier produksi di Stylus (case study): `https://blog.arbitrum.io/renegade-stylus-case-study/`
- circomlib (Poseidon, komparator), snarkjs (Groth16/PLONK, ekspor verifier): `https://github.com/iden3/circomlib`, `https://github.com/iden3/snarkjs`
- Permit2 (`ISignatureTransfer`): `https://github.com/Uniswap/permit2`
- OpenZeppelin `SignatureChecker` (ERC-1271), Clones (EIP-1167): `https://docs.openzeppelin.com/contracts/5.x/`
- Servo Protocol (koreksi draft — RWA revenue share, bukan M2M): `https://www.servoprotocol.xyz/app/`
- **Ditambahkan v1.1 (P1):** circomlibjs `poseidon_opt.js` / `poseidon_constants_opt.json` (algoritma & konstanta yang di-port `AegisPoseidon`): `https://github.com/iden3/circomlibjs`; arkworks `ark-bn254`/`ark-ff` 0.5 (aritmetika field di Stylus): `https://github.com/arkworks-rs/algebra`; `stylus-sdk-rs` 0.10.9 & `cargo-stylus`: `https://github.com/OffchainLabs/stylus-sdk-rs`; OpenZeppelin `ERC2771Forwarder._checkForwardedGas` (pola pemeriksaan gas pasca-panggilan EIP-150 yang dipakai `InsufficientGas`): `https://docs.openzeppelin.com/contracts/5.x/`; Slither 0.11.5: `https://github.com/crytic/slither`; pengukuran & audit internal: `docs/benchmarks/poseidon.md`, `docs/audit/slither-2026-09.md`, `docs/superpowers/ledger-2026-09-20-aegisclear-protocol-p1.md`, `docs/superpowers/ledger-2026-09-20-aegisclear-web-console.md`

**Belum bersumber primer (wajib dilengkapi sebelum pitch):** klaim OKX APP "escrow & dispute coming soon" (§2.3); alamat registry ERC-8004 di Robinhood Chain (V15); jendela force-inclusion Robinhood Chain (V13); ZeroStyl (V16).

---

## 23. RIWAYAT PERUBAHAN

### v1.1 — 20 September 2026 (sistem sebagaimana dibangun setelah P1)

Sumber angka: `README.md`, `docs/benchmarks/poseidon.md`, `docs/audit/slither-2026-09.md`, ledger P1 & web console (`docs/superpowers/`), kode di `contracts/src`, `sdk/src`, `stylus/aegis-poseidon`; dua angka Foundry `--gas-report` (`open`, `closeCooperative`) diukur saat menulis v1.1. Tidak ada angka yang diperkirakan; yang tidak terukur ditulis "belum diukur".

| # | Perubahan | Bagian | Alasan / sumber |
|---|---|---|---|
| 1 | Header & status: v1.1, P0 + P1 dikirim, testnet v1, yang masih menunggu pemilik (mainnet, facilitator Mesh, video), redeploy v2 tertunda | Header, §0, §1, §16 | README "Status implementasi"; design spec §C "Di luar cakupan" |
| 2 | Scope table diberi ✅ per item; P1 tidak lagi "digerbangi" — D2 terpenuhi 1,75×; web console masuk scope | §1 | README; `docs/benchmarks/poseidon.md` §5 |
| 3 | Angka Stylus yang dikutip (OZ 11.887/19.313, "1,6×/18×") diganti angka terukur sendiri: `insertPath` 144.076 vs 252.271 (1,75× total, ≈1,9× eksekusi), `hash2` 82.593 vs 62.138; 2,33× (Poseidon2) **ditarik** | §0, §1, §2.1 P6, §2.4, §8.3, §17, §19 V12, §20 D2 | `docs/benchmarks/poseidon.md` §5; ledger P1 Task 9/6b |
| 4 | FR-8/FR-11 memuat `epoch`; FR-10, FR-25, FR-26, FR-27 → ✅ dengan semantik yang dikirim dan nama test | §5 | `AegisChannel.sol`, `AegisTreasuryRouter.sol`, `Rollover.t.sol`, `Anchored.t.sol`, `TreasuryRouter.t.sol`, `Events.t.sol` |
| 5 | Struct EIP-712 ditulis ulang persis seperti typehash on-chain: `epoch` di `Checkpoint`/`Close`/`Rollover`, `Leaf(uint32 epoch,uint64 seq,bytes32 leaf,uint128 cumulativeAmount)`; rasional replay-setelah-rollover dan `A` di `Leaf`; protokol ack anchored; tipe SDK (`RolloverMsg`, `LeafMsg`) | §6.2 | `AegisChannel.sol` baris typehash; `sdk/src/core/typedData.ts`; design spec §B.1/B.3 |
| 6 | Parameter baru `epoch`, `HOOK_GAS`; baris hash diperbarui (port Rust dibangun) | §6.6 | kode |
| 7 | Tabel kebocoran: baris `epoch`/`RolledOver` dan baris **anchored** (hash daun + `A` per ack ⇒ `due_i` per unit, harga tersirat); `leak-check` anchored mengecualikan `unitPrice` | §6.7, §17 | design spec §B.3; plan ship "Global Constraints"; `demo/test/rows.test.ts` |
| 8 | Diagram & prinsip desain: `rollover`, `ack/startClose`, `_send` hook, `PoseidonPathYul`; prinsip 6–8 (mode = sifat factory; Stylus terukur; hook tidak menyandera) | §7 | kode |
| 9 | §8.1 ditulis ulang sebagaimana dibangun: immutable `POSEIDON`/`ANCHORED`, storage datar + `epoch`/`hasProof`/`filledSubtrees`, `hash*`, `ack`, `startClose`, `rollover`, `sweep` lewat `_send`, alur `settle` dengan `hasProof && proofSeq == seq`, `_send` + `HOOK_GAS` 300k + `InsufficientGas` (M-1), event/error lengkap, catatan `ReentrancyGuard` di clone | §8.1 | `AegisChannel.sol`; audit §3.5–3.6 |
| 10 | §8.2: verifier/zkey tidak berubah; 3 High Slither = idiom snarkjs (false positive) | §8.2 | audit ID-0..2 |
| 11 | §8.3 ditulis ulang: `IPoseidonPath` (`hash2`, `insertPath`), `AegisPoseidon` v1 teroptimasi (poseidon_opt, ark-ff 0.5, 21,7 KB, `0x1027cf7D…ef34`), kembaran Yul, kesetaraan keluaran, tabel D2 final, **`hash5`/`hash6`/`root128` tidak dibangun** (tidak ada pemakai on-chain, B3 tidak aktif), anchored mode sebagaimana dibangun, gas anchored terukur, T15 = catatan ops P2 | §8.3 | `docs/benchmarks/poseidon.md` §5; `stylus/aegis-poseidon/README.md`; README "Alamat kontrak"; README M9 |
| 12 | §8.4 router sebagaimana dibangun: hook `IAegisPayoutHook`, `setTreasury` diri sendiri, `onPayout` + `Unbacked`, `_tryTransfer` non-revert, `claim`, `nonReentrant`, peringatan transfer langsung (I2), status deploy (v1 150k → source 300k) | §8.4 | `AegisTreasuryRouter.sol`; README; audit ID-4/ID-16 |
| 13 | §8.5 factory: konstruktor `(verifier, permit2, minChallengeWindow, poseidonPath)` + `ZeroAddress`, `salt = keccak256(abi.encode(c))` (seluruh Config), `AlreadyOpen`, tiga factory testnet | §8.5 | `AegisChannelFactory.sol`; audit ID-5/7 |
| 14 | Matriks akses: baris `ack`/`startClose`/`rollover`, agen di router, payee kontrak (hook), deployer dengan `POSEIDON` | §8.6 | kode |
| 15 | §8.7: `open` 295.634 dan `closeCooperative` 100.191/109.003 (Foundry `--gas-report`, diukur 20 Sep 2026), `settle` dengan payee pembakar gas 212.572 (ledger), angka v1 anchored/co-signed, `hash2`, data fee per build; `rollover` & settle-dengan-router "belum diukur terpisah" | §8.7 | pengukuran sendiri; README; ledger P1 Task 3 |
| 16 | §9 tidak berubah (dicatat); §10.2 tiket keluar ber-epoch + `exitSigNext` + anchored tanpa tiket + flag `anchored` 402 tidak dipercaya; §10.3 baris `IACPHook` disesuaikan dengan hook best-effort | §9, §10.2, §10.3 | `server.ts`, `agent.ts` |
| 17 | §11 ditulis ulang sebagaimana dibangun: rute provider (`/job` diserialkan per klien, `/close`, `/rollover` + `exitSigNext`, `/rollover/confirm` idempoten, kode 409), opsi `anchored`/`payoutProvider` + asersi mode saat start, klien (`start()` mode dari factory sendiri, `ClientPolicy`, `requestUnit` anchored, `rollover()` verifikasi-sebelum-broadcast, `dispute()`/`exitUnilateral()` toleran `CLOSING`), watcher dengan guard epoch, keepalive belum | §11 | `sdk/src/provider/server.ts`, `sdk/src/client/agent.ts`, `sdk/src/watcher/watcher.ts`; README "Keterbatasan SDK referensi" |
| 18 | Threat model: T14/T15 diperbarui; **T20** T-hook, **T21** T-hook-gas (M-1), **T22** slack router, **T23** T-mode, **T24** T-close-continue, **T25** T-rollover-ticket (I1) → D11, **T26** `A` digelembungkan (anchored), **T27** `/job` konkuren (M6), **T28** lawan `startClose` dulu; ringkasan audit Slither | §12 | audit; ledger P1 (review Task 2, Task 7, final review I1/I2/M1–M9) |
| 19 | Invarian INV-2 ber-epoch, INV-11 ✅, INV-13–16 baru; skenario 11 ✅, 12 ✅ (nama test SDK & Foundry, channel testnet), 13 status jujur (router ✅, channel belum ada test khusus), 15 router ✅, 16 hook-gas ✅, 17 adversarial SDK; status suite (forge 118; testnet 13/4) | §13 | `sdk/test/integration.test.ts`; `contracts/test/*`; audit §4; README |
| 20 | §14: dua baris skenario P1 — anchored **0,02 / 0,38** dan rollover **0,00 / 2,66** — dan paragraf web console lengkap (tiga factory, `/provider-anchored`, kolom `epoch`, pill mode, API) | §14 | `demo/test/rows.test.ts`, `web/test/server.test.ts`, plan ship; README "Lihat di browser" |
| 21 | Rencana 15 hari: baris 2–8, 10–13 ✅ dengan bukti; 9 & 14 sebagian (menunggu pemilik); hasil aturan pemangkasan | §16 | README; §19 |
| 22 | Q&A: jawaban Stylus diperbarui (229.241 verifier) + Q baru "Stylus di mana & kenapa hanya di sana" (1,75×), "Kenapa dua mode", "Hook payout"; jawaban kebocoran & rollover diperbarui | §17 | `docs/benchmarks/poseidon.md` §5 |
| 23 | Rencana B: B3 tidak aktif (alasan tanpa `hash5/6/root128`); **B5** baru: `PoseidonPathYul` fallback (`POSEIDON_STYLUS` kosong) | §18 | `DeployTestnet.s.sol` via README "Deploy ke testnet" |
| 24 | Checklist: V9–V12 ✅ final (V12 = angka D2), V18b + catatan v1 mendahului M-1/`ZeroAddress`/300k, **V19** self-audit Slither | §19 | audit; README |
| 25 | Keputusan: D1 status (mainnet belum), D2 ✅ FINAL, D3/D4/D5/D7/D8 ✅, D10 URL repo, **D11** baru: `startClose()` co-signed (terbuka, kandidat v2) | §20 | ledger P1 Task 2 "design note" |
| 26 | Glosarium: epoch, rollover, tiket keluar, hook payout, slack, mode per factory, `insertPath`, anchored mode diperbarui | §21 | — |
| 27 | Sumber: circomlibjs, arkworks, stylus-sdk, OZ `ERC2771Forwarder`, Slither, dokumen internal | §22 | — |
| 29 | Deploy testnet v2 (bytecode teraudit) pada hari yang sama: status header, `HOOK_GAS` 300k + penjaga on-chain, alamat & gas v2 (§8.3, §8.4, §8.7), status suite (§13), **V18c**, D5 | Header, §1, §6.6, §8.3, §8.4, §8.7, §13, §19, §20 | README "Alamat kontrak"; ledger ship Task 6 |
| 28 | String basi v1.0 dihapus: `Rollover(uint64 seq,uint128 toProvider)`, `Leaf(uint64 seq,bytes32 leaf)`, `Checkpoint(uint64 seq,…)`, pseudo-code `hash5/hash6/root128`, "Hari 7/12" sebagai tenggat pengukuran; semua hanya tersisa di baris changelog ini | §6.2, §8.3, §8.7, §3 | — |

### v1.0 — 19 September 2026 (menggantikan draft §3.1–3.2)

Backup draft: `.backup/aegisclear-prd-arsitektur.v0-draft.md`.

| # | Perubahan | Bagian | Alasan |
|---|---|---|---|
| 1 | "Servo Protocol" dihapus sebagai fondasi; problem statement dibangun di atas x402/MPP/MeshGateway | §0, §1, §2, §4, §10 | Servo = RWA revenue share; M2M nyata di chain ini adalah Mesh (1.030 storefront, 15.718 settlement) |
| 2 | Verifier ZK dipindah ke Solidity; Stylus dibatasi ke Poseidon on-chain, digerbangi benchmark | §0, §2.4, §8.2, §8.3, D2 | Groth16 Stylus 256k > Solidity 194k gas — pairing adalah precompile |
| 3 | Model bukti didefinisikan: receipt co-signed, ack = checkpoint, klien membuktikan penalti | §6, §9 | Draft tidak menyatakan siapa membuktikan apa, atas data apa |
| 4 | Skedul penalti dengan `π`, `κ`, contoh terhitung terverifikasi integer | §6.3–6.5 | Payout proporsional adalah pembeda vs ERC-8183 dan butuh definisi eksak |
| 5 | Posisi terhadap ERC-8183/ERC-8004/x402 `upto`/MPP/Kleros/UMA dinyatakan | §1, §10.3 | Prior art harus disebut, bukan disembunyikan |
| 6 | Channel = clone per pasangan; alamat = atribusi; `payTo` x402 tanpa mengubah proxy/facilitator | §7, §8.1, §8.5, §10.2 | Witness Permit2 hanya `{to, validAfter}` |
| 7 | Tabel kebocoran (§6.7) dan T16 | §6.7, §12 | "Privacy-preserving" harus dikualifikasi |
| 8 | Trusted setup dinyatakan sebagai T4 dengan batas kerusakan di kontrak (FR-18) | §9.4, §12, D6 | Groth16 phase-2 satu kontributor |
| 9 | Parameter Stylus, USDG (6 desimal, proxy, tanpa EIP-3009), Permit2/proxy/4337, block time diverifikasi on-chain | §19 | Menggantikan asumsi draft ("page limit", dsb.) |
| 10 | T19 (dana ke alamat `predict()` tanpa `open`) dan D7 | §12, §20 | Ditemukan saat merancang jalur x402 |
| 11 | Rencana 15 hari, urutan pemangkasan, Rencana B1–B4, Q&A juri | §16–18 | Format setara Vigil/Equinox |
