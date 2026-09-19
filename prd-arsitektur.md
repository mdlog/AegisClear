# AEGISCLEAR — PRD & TECHNICAL ARCHITECTURE

**Produk:** AegisClear — escrow & penyelesaian sengketa privacy-preserving untuk pembayaran agen-ke-agen (x402/MPP) dalam USDG, diadili oleh bukti zero-knowledge
**Chain:** Robinhood Chain (Arbitrum Dedicated Chain / Nitro) — mainnet `4663`, testnet `46630`. **Stylus aktif di keduanya (diverifikasi on-chain 19 Sep 2026, §19)**
**Event:** Arbitrum Open House Singapore: Online Buildathon (submission **4 Okt 2026 15:59 UTC**)
**Versi:** 1.0 — 19 September 2026 (menggantikan draft §3.1–3.2; daftar koreksi di §23)
**Status:** draft implementasi. Item yang bertanda ✅ di §19 sudah diverifikasi hari ini dengan `cast`/`curl`; sisanya **wajib diverifikasi sebelum Hari 2**. Semua angka gas kontrak sendiri adalah estimasi sampai diukur (§8.7). Angka model penyelesaian di §6 sudah diverifikasi numerik (Python, aritmetika integer) dan menjadi vektor uji.

---

## 0. RINGKASAN EKSEKUTIF

Agen otonom di Robinhood Chain sudah saling membayar hari ini: MeshGateway menjalankan rel x402/MPP dalam USDG dengan 1.030 storefront dan 15.718 settlement on-chain (§2.3). Rel itu memakai skema x402 `exact`: **bayar dulu, terima kemudian, tanpa recourse**. Untuk layanan seharga sen itu benar. Untuk pekerjaan mesin bernilai puluhan hingga ribuan dolar — armada robot membeli rute, charging, atau komputasi; agen B2B membeli data dan inferensi — pola *pay-first* membuat pembeli menanggung seluruh risiko wanprestasi, dan begitu ada sengketa, satu-satunya jalan adalah audit pihak ketiga yang membuka harga satuan, ambang SLA, dan telemetri ke chain publik.

Standar yang sedang lahir untuk celah ini, **ERC-8183 (Agentic Commerce)**, memberi escrow per job dengan satu *evaluator* yang memutuskan `complete` atau `reject`: biner, evaluator dipercaya penuh, dan seluruh syarat terlihat. Spesifikasinya sendiri menyebut evaluator *"MAY be a smart contract … verifying a zero-knowledge proof"* — tetapi tidak ada yang membangunnya.

AegisClear adalah evaluator itu. Ia adalah **sirkuit**, bukan manusia atau LLM:

1. **Micro-escrow state channel** — klien mendanai satu channel USDG per pasangan agen; setiap unit layanan menghasilkan *receipt* yang ditandatangani kedua pihak dan terakumulasi off-chain. Chain hanya melihat komitmen.
2. **ZK settlement** — jika klien menuntut penalti SLA, ia mengirim bukti Groth16 bahwa *"di bawah syarat yang berkomitmen di `termsCommitment` dan receipt di bawah `receiptsRoot` yang kami berdua tanda tangani, penalti yang sah adalah X"*. Kontrak memverifikasi (~194k gas) dan membagi dana **proporsional** — tanpa pernah melihat harga, ambang, atau metrik.
3. **Treasury routing** — payout diarahkan ke brankas armada / smart account ERC-4337, bukan ke hot wallet agen.

**Satu perbandingan yang menjelaskan seluruh produk.** 100 request seharga 0,02 USDG, 7 di antaranya melanggar SLA latensi (§6.5):

| Rel | Hasil untuk klien | Yang terlihat di chain |
|---|---|---|
| x402 `exact` (hari ini) | 2,00 USDG hilang, tanpa recourse | semua transfer |
| ERC-8183 dengan evaluator | 0 **atau** 2,00 — biner, tergantung kepercayaan pada evaluator | syarat & bukti (`reason`) |
| **AegisClear** | **1,93 ke provider / 0,07 kembali ke klien**, deterministik | dua komitmen + pembagian akhir |

**Dua koreksi jujur terhadap draft** yang menjadi fondasi dokumen ini: (i) "Servo Protocol" bukan infrastruktur M2M — ia protokol revenue-share RWA; rel M2M yang nyata di chain ini adalah MeshGateway/x402; (ii) verifier Groth16 di Stylus **tidak lebih murah** dari Solidity (256.334 vs 194.396 gas — pairing sudah precompile). Stylus dipakai hanya di tempat ia terbukti menang: hashing Poseidon on-chain (11.887 vs 19.313 gas Yul), digerbangi benchmark Hari 4 (D2). Klaim gas Stylus **tidak boleh** masuk pitch selain angka yang diukur sendiri.

---

## 1. SCOPE & DOCUMENT CONTROL

### Di dalam scope (MVP hackathon)
- `AegisChannel` (EVM, EIP-1167 clone per pasangan agen): open, fund (transfer/Permit2/x402 `payTo`), checkpoint co-signed, cooperative close, unilateral close dengan jendela tantangan, klaim penalti dengan bukti ZK, settle permissionless, sweep
- `AegisChannelFactory` (CREATE2, alamat channel deterministik)
- `SLASettlementVerifier` (Solidity, ekspor snarkjs Groth16 BN254)
- Sirkuit `sla_settlement.circom`: komitmen syarat (Poseidon), pohon receipt 128 slot, evaluasi skedul penalti, konservasi jumlah
- `aegis-sdk` (TypeScript): pertukaran receipt/ack EIP-712, checkpoint, prover (snarkjs/rapidsnark), middleware provider x402-compatible, klien agen
- `MockUSDG` (6 desimal) untuk testnet 46630; USDG asli di mainnet 4663 (D1)
- Demo harness: cooperative close vs sengketa dengan bukti, dibandingkan dengan escrow gaya ERC-8183 evaluator-biner sebagai kontrol
- **P1, digerbangi:** `AegisPoseidon.rs` (Stylus) untuk *anchored mode* (ack on-chain, pohon Merkle inkremental) — hanya jika benchmark Hari 4 ≥ 1,5× vs Yul (D2); `AegisTreasuryRouter`; event berbentuk ERC-8183

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
| ZK di Stylus | **Renegade** (PLONK verifier produksi di Stylus), **zk-sunade** (Groth16 di Stylus, 256k gas), **ZeroStyl** (toolkit privasi Stylus — verifikasi Hari 1, V16), **OpenZeppelin `openzeppelin-crypto` Poseidon2** (11.887 gas) | AegisClear memakai Stylus hanya untuk Poseidon on-chain, dengan angka yang diukur sendiri |
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
| P6 | Stylus aktif (`stylusVersion()=3`), tetapi pairing BN254 sudah precompile EVM: verifier Groth16 Stylus 256k vs Solidity 194k gas; Poseidon Stylus 11.887 vs Yul 19.313 vs Solidity polos 220.244 gas | Stylus menang hanya di komputasi **tanpa precompile** — hashing, bukan pairing |
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
1. **"ZK verification di Stylus lebih murah dari EVM."** Salah untuk Groth16/PLONK atas BN254: bagian mahal (pairing, ecMul) adalah precompile `0x06–0x08` yang dipanggil kedua implementasi. zk-sunade memanggilnya lewat `RawCall` dan membayar 32% lebih mahal karena overhead host I/O. Yang benar dan terukur: **hashing Poseidon** 1,6× lebih murah dari Yul terbaik, 18× dari Solidity polos. Pitch memakai angka kedua, bukan yang pertama.
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
| G6 | Setiap klaim gas diukur, bukan dikutip | Tabel §8.7 terisi dari Foundry/`cargo stylus` sebelum Hari 12 |

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
| FR-1 | Setiap channel MUST berupa kontrak sendiri (EIP-1167 clone) dengan alamat deterministik (CREATE2 dari `client, provider, termsCommitment, salt`), sehingga transfer USDG apa pun ke alamat itu — termasuk settlement x402 — teratribusi tanpa data tambahan | P0 |
| FR-2 | `open` MUST mengikat `(client, provider, token, termsCommitment, challengeWindow, responseWindow, payoutClient, payoutProvider, salt)` dan MUST disetujui kedua pihak: untuk masing-masing pihak, `msg.sender == pihak` **atau** tanda tangan EIP-712 `ChannelTerms` yang sah | P0 |
| FR-3 | Pendanaan MUST permissionless dan berulang: saldo USDG kontrak adalah `budget`; `fundWithPermit2` disediakan untuk klien tanpa allowance | P0 |
| FR-4 | State: `OPEN → CLOSING → SETTLED`; transisi hanya lewat fungsi §8.1; tidak ada `pause`, tidak ada upgrade | P0 |
| FR-5 | Semua pemeriksaan tanda tangan MUST menerima EOA **dan** ERC-1271 (agen di smart account ERC-4337; EntryPoint v0.6/v0.7 ada di kedua jaringan, §19 V5) | P0 |
| FR-6 | Setelah `SETTLED`, USDG yang masih masuk MUST bisa di-`sweep` ke `payoutClient` oleh siapa pun | P0 |

### 5.2 Receipt & checkpoint
| ID | Requirement | Prioritas |
|---|---|---|
| FR-7 | Leaf receipt MUST = `Poseidon(seq, qty, m1, m2, due)` atas field BN254 (§6.2); pohon biner 128 slot, `EMPTY_LEAF = 0`; slot `≥ seq` MUST kosong | P0 |
| FR-8 | Checkpoint MUST = EIP-712 `Checkpoint(channelId, seq, cumulativeAmount, receiptsRoot)` ditandatangani **kedua** pihak; `seq` strictly increasing; checkpoint dengan `seq` lebih tinggi MUST menggantikan yang lebih rendah | P0 |
| FR-9 | Kontrak MUST menerima checkpoint hanya dari tanda tangan — tidak pernah memerlukan receipt | P0 |
| FR-10 | Satu epoch MUST ≤ 128 receipt (`MAX_SEQ`); `rollover` kooperatif membayar epoch dan me-reset `seq/root` dengan syarat & sisa budget yang sama | P1 (MVP: close & reopen) |

### 5.3 Penyelesaian & sengketa
| ID | Requirement | Prioritas |
|---|---|---|
| FR-11 | Cooperative close: kedua pihak menandatangani `Close(seq, toProvider)` → settle seketika, tanpa jendela; `toClient = budget − toProvider` | P0 |
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
| FR-23 | Provider middleware MUST bisa menjawab 402 dengan `payTo = alamat channel` memakai skema `exact`/Permit2 standar; proxy kanonik dan facilitator **tidak dimodifikasi** | P1 |
| FR-24 | Provider middleware MUST menolak melayani jika `budget − cumulativeAmount − due < 0` | P1 (SDK) |

### 5.6 Anchored mode, treasury, ekosistem
| ID | Requirement | Prioritas |
|---|---|---|
| FR-25 | Anchored mode: ack on-chain `ack(seq, leaf, sigProvider)` — hanya **hash** leaf yang naik (metrik tetap privat) — + pohon Poseidon inkremental di kontrak; hash node di Stylus **jika** D2 positif, selain itu Yul (`poseidon-solidity`) | P1 |
| FR-26 | `payoutClient`/`payoutProvider` MUST bebas dipilih saat open (treasury, Safe, 4337); `AegisTreasuryRouter` opsional memetakan agen → treasury per armada | P1 |
| FR-27 | Kontrak SHOULD memancarkan event berbentuk ERC-8183 (`JobFunded`, `PaymentReleased`, `Refunded`) agar indexer 8183/8004 memahaminya | P1 |
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

**Off-chain (SDK):**
```
Terms     { unitPrice, maxM1, minM2, penaltyBps, capBps, nonce }      → T (disimpan kedua pihak)
Receipt   { channelId, seq, qty, m1, m2, due }                         → ℓ
Checkpoint{ channelId, seq, cumulativeAmount, receiptsRoot }           → ditandatangani kedua pihak
```

**EIP-712 (domain `AegisClear`, versi `1`, `chainId`, `verifyingContract = channel`):**
```
ChannelTerms(address client,address provider,address token,bytes32 termsCommitment,uint32 challengeWindow,uint32 responseWindow,address payoutClient,address payoutProvider,bytes32 salt)
Checkpoint(uint64 seq,uint128 cumulativeAmount,bytes32 receiptsRoot)
Close(uint64 seq,uint128 toProvider)
Rollover(uint64 seq,uint128 toProvider)
Leaf(uint64 seq,bytes32 leaf)                                   // hanya anchored mode (P1)
```
`channelId` tidak perlu ada di struct karena `verifyingContract` = alamat channel itu sendiri (satu channel = satu kontrak) — replay lintas channel mustahil by construction. `receiptsRoot` disimpan sebagai `bytes32` dengan nilai `< p_BN254`. `Close`/`Rollover` hanya memuat `toProvider`: sisa saldo **selalu** ke klien, sehingga transfer debu dari pihak ketiga setelah penandatanganan tidak bisa menggagalkan close (dan tidak ada yang bisa menandatangani "lebih dari saldo" untuk dirinya).

**Protokol ack (setiap unit):**
```
1. provider → klien : resource + header Aegis-Receipt { seq, qty, m1, m2, due, sigProvider(Checkpoint_seq) }
2. klien   → provider: sigClient(Checkpoint_seq)      // ack = tanda tangan checkpoint kumulatif baru
3. keduanya menyimpan Checkpoint_seq lengkap (dua tanda tangan) + receipt
```
Ack **adalah** checkpoint: setiap unit yang diterima langsung menghasilkan state co-signed terbaru. Tidak ada langkah checkpoint terpisah; provider selalu memegang bukti tagihan untuk semua unit yang di-ack; klien tidak pernah menandatangani metrik yang tidak ia setujui (b_i dihitung dari metrik yang **dua-duanya** tanda tangani).

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
| Hash | circomlib Poseidon (v1) parameter standar, t ∈ {3, 6, 7} | satu varian di sirkuit, SDK (`circomlibjs`), Yul (`poseidon-solidity`), dan Rust (port, D3) |
| `protocolFeeBps` | 0 di MVP | fee bukan bagian tesis; slot ada di factory (§15) |

### 6.7 Apa yang tetap bocor — dan apa yang tidak

| Terlihat di chain | Tersembunyi |
|---|---|
| Alamat klien, provider, payout; token | `p`, `L*`, `Q*`, `π`, `κ`, `ν` |
| `B` (deposit), `A` (total yang di-ack), `seq` (jumlah unit) | `qty_i`, `m1_i`, `m2_i`, `due_i` per unit |
| `payToClient` (jika ada klaim), waktu setiap transaksi | Berapa unit yang melanggar, pelanggaran jenis apa |
| `termsCommitment`, `receiptsRoot` | Isi keduanya |

Inferensi yang **masih mungkin**: `A / seq` = harga rata-rata per receipt (bukan `p` jika `qty` bervariasi); `payToClient / A` = porsi penalti (bukan jumlah pelanggaran, karena `π`, `κ` privat); pola waktu ack = ritme layanan. Mitigasi yang disediakan SDK: `qty` bervariasi dan agregasi beberapa unit per receipt; **bukan** klaim "anonim". Sebutkan tabel ini apa adanya di README dan pitch.

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
 │ middleware x402      │                        │        settle() permissionless        │    (Groth16, Solidity)
 │ Aegis-Receipt header │                        │        ack() [anchored, P1] ──────────┼──► AegisPoseidon.rs (Stylus, D2)
 └──────────────────────┘                        │        payout → payoutClient/Provider ┼──► AegisTreasuryRouter [P1]
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
6. **Immutable, tanpa admin di jalur dana.** Tidak ada proxy, `pause`, atau peran yang bisa menyentuh saldo channel. Factory hanya memegang parameter minimum dan alamat verifier **saat deploy**; channel menyalinnya ke immutable.
7. **Stylus hanya jika diukur.** Setiap komponen Stylus punya padanan Yul yang di-benchmark di hari yang sama (D2).

---

## 8. CONTRACT SPECIFICATIONS

### 8.1 `AegisChannel` (implementasi untuk EIP-1167 clone)

```solidity
enum State { UNINIT, OPEN, CLOSING, SETTLED }

struct Config {                 // ditulis sekali oleh factory saat initialize
    address client;
    address provider;
    address token;              // USDG
    bytes32 termsCommitment;    // T
    uint32  challengeWindow;
    uint32  responseWindow;
    address payoutClient;
    address payoutProvider;
}
struct Latest {                 // state yang berubah
    uint64  seq;
    uint128 cumulativeAmount;   // A
    bytes32 receiptsRoot;       // R
    uint64  deadline;           // hanya di CLOSING
    uint128 payToClient;        // hasil bukti yang tertunda; valid hanya jika proofSeq == seq
    uint64  proofSeq;
    State   state;
}

function initialize(Config calldata c, address opener, bytes calldata sigClient, bytes calldata sigProvider) external;
    // factory-only; untuk tiap pihak: opener == pihak ATAU tanda tangan EIP-712 ChannelTerms sah (FR-2)
function fundWithPermit2(ISignatureTransfer.PermitTransferFrom calldata p, bytes calldata sig) external;   // opsional; transfer biasa juga sah
function budget() external view returns (uint256);                                  // token.balanceOf(this)

function submitCheckpoint(uint64 seq, uint128 A, bytes32 R, bytes calldata sigClient, bytes calldata sigProvider) external;
    // OPEN  : mulai CLOSING, deadline = now + challengeWindow
    // CLOSING: require seq > latest.seq; ganti state; deadline = max(deadline, now + responseWindow); hapus bukti tertunda
function claimPenalty(uint256[8] calldata proof, uint128 payToClient) external;     // hanya client/provider; state CLOSING
    // publicInputs = [channelIdField, T, R, seq, A, payToClient]; require verifier.verifyProof; require payToClient <= A (FR-18)
function settle() external;                                                         // CLOSING && now >= deadline; siapa pun
function closeCooperative(uint64 seq, uint128 toProvider, bytes calldata sigClient, bytes calldata sigProvider) external;
    // OPEN atau CLOSING; require seq >= latest.seq; require toProvider <= budget(); toClient = budget() − toProvider
function rollover(uint64 seq, uint128 toProvider, bytes calldata sigClient, bytes calldata sigProvider) external;  // P1: bayar epoch, seq/R reset, OPEN
function ack(uint64 seq, bytes32 leaf, bytes calldata sigProvider) external;        // P1 anchored mode; hanya client; require seq == latest.seq
function sweep() external;                                                          // SETTLED: sisa saldo → payoutClient

function channelIdField() public view returns (uint256) { return uint256(uint160(address(this))); }   // < p_BN254, tanpa reduksi
```

**Alur `settle()`:**
```
1. require state == CLOSING && block.timestamp >= deadline
2. B = token.balanceOf(this)
3. pen = (proofSeq == seq) ? payToClient : 0            // bukti hanya berlaku untuk state yang dibuktikannya (FR-15)
4. toProvider = min(A − pen, B);  toClient = B − toProvider
5. state = SETTLED (efek sebelum interaksi)
6. token.safeTransfer(payoutProvider, toProvider); token.safeTransfer(payoutClient, toClient)
7. emit Settled(seq, A, pen, toProvider, toClient); emit PaymentReleased(...); emit Refunded(...)   // bentuk ERC-8183 (FR-27)
```

**Tanda tangan.** `SignatureChecker.isValidSignatureNow(signer, digest, sig)` (OpenZeppelin) untuk `client` dan `provider` — EOA atau ERC-1271. Digest EIP-712 dengan `verifyingContract = address(this)`; karena clone, `DOMAIN_SEPARATOR` dihitung saat `initialize` dan disimpan (bukan immutable bytecode).

**Kenapa `channelIdField` = alamat.** Alamat 160-bit selalu < `p` BN254; tidak perlu reduksi, tidak ada tabrakan; dan nilainya identik dengan `verifyingContract` EIP-712 — satu identitas untuk tanda tangan dan bukti.

**Kenapa hanya pihak yang boleh `claimPenalty`.** Bukti valid dari siapa pun menghasilkan angka yang sama (deterministik), jadi pembatasan ini bukan soal kebenaran — ia membatasi permukaan T4 (setup bocor): pihak luar tidak bisa memaksa hasil ke channel orang lain.

**Kenapa `claimPenalty` tidak butuh jendela sendiri.** Bukti terikat ke `(R, seq, A)` saat ini. Jika lawan memegang checkpoint lebih baru, ia mengirimnya (FR-13) dan bukti gugur — dan checkpoint itu adalah state yang pembuat bukti **sendiri** tanda tangani. Tidak ada yang bisa dirugikan oleh state yang ia setujui.

**Events:** `Opened(client, provider, T, challengeWindow)`, `Funded(from, amount)` (dipancarkan oleh `fundWithPermit2`; transfer langsung terlihat lewat `Transfer` USDG), `CheckpointSubmitted(seq, A, R, deadline)`, `PenaltyClaimed(by, seq, payToClient)`, `Settled(...)`, `Swept(amount)`, plus `JobFunded/PaymentReleased/Refunded` (FR-27).

---

### 8.2 `SLASettlementVerifier` (Solidity, ekspor snarkjs)

```solidity
function verifyProof(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[6] input) external view returns (bool);
// input = [channelIdField, termsCommitment, receiptsRoot, seq, cumulativeAmount, payToClient]
```
Verifier hasil `snarkjs zkey export solidityverifier`, dipasang sebagai alamat immutable di factory → channel. Biaya: 194.396 gas untuk 1 input publik (gnark, Foundry, reproduksi `frame-verify-gas`); tiap input publik tambahan ≈ +6,2k gas (`ecMul` 6.000 + `ecAdd` 150) → **≈ 225k gas** untuk 6 input. **Terukur 19 Sep 2026 (Foundry, bukti EX1 asli): 229.241 gas** (V10 ✅).

**Kenapa Solidity, bukan Stylus (D2).** Empat pairing + 6 `ecMul` adalah 100% precompile. zk-sunade — implementasi Stylus yang memanggil precompile yang sama lewat `RawCall` — mencatat 256.334 gas; overhead-nya adalah init program (8.832 gas non-cache / 352 cache) + host I/O per call. Tidak ada yang bisa dimenangkan; ada yang bisa dikalahkan (toolchain, ukuran WASM, expiry program 365 hari).

---

### 8.3 `AegisPoseidon.rs` (Stylus, **P1, digerbangi D2**) & anchored mode

```rust
#[public] impl AegisPoseidon {
    pub fn hash2(&self, a: U256, b: U256) -> U256;                 // node
    pub fn hash5(&self, x: [U256; 5]) -> U256;                     // leaf
    pub fn hash6(&self, x: [U256; 6]) -> U256;                     // terms
    pub fn root128(&self, leaves: Vec<U256>) -> U256;              // rekomputasi penuh (≤ 255 hash)
}
```
`no_std`, `ark-bn254` + `ark-ff` (fitur `no_std`), konstanta round circomlib Poseidon v1 (D3), stateless & `view`. Padanan Yul: `poseidon-solidity` (PoseidonT3 21.124 gas, circomlib-compatible) — **di-benchmark bersamaan pada Hari 4**.

**Anchored mode (FR-25).** Untuk job bernilai tinggi & frekuensi rendah di mana kedua pihak ingin setiap ack **on-chain** (tanpa asumsi liveness channel): klien memanggil `ack(seq, leaf, sigProvider)` — `leaf = Poseidon(seq, qty, m1, m2, due)` dihitung **off-chain** oleh keduanya dan ditandatangani provider (`Leaf(uint64 seq,bytes32 leaf)` EIP-712), sehingga metrik tetap privat — dan kontrak memasukkan `leaf` ke pohon inkremental kedalaman 7 (pola Semaphore/Tornado): **7 hash t=3 per ack**. Estimasi: Stylus ≈ 7 × 11,9k ≈ **83k gas**, Yul ≈ 7 × 20k ≈ **140k**, Solidity polos ≈ 1,5M. Sirkuit yang sama membaca `R` on-chain (`seq` = jumlah ack). Ini satu-satunya tempat AegisClear menghitung Poseidon di chain — karena itu satu-satunya tempat Stylus punya pekerjaan. `hash5`/`hash6` tetap disediakan untuk Rencana B3 (commit-reveal). Jika D2 negatif, anchored mode tetap dikirim dengan Yul; jika waktu habis, anchored mode dipangkas (§16) dan `AegisPoseidon.rs` menjadi benchmark terpublikasi saja.

**Batas praktis Stylus yang relevan (nilai on-chain 19 Sep 2026, §19 V2):** `inkPrice` 10.000 ink/gas, `freePages` 2, `pageGas` 1.000, `pageLimit` 128 (8 MB), `minInitGas` 8.832 / cached 352, `expiryDays` 365, `keepaliveDays` 31. Program yang tidak dipanggil ≥ 365 hari harus di-`keepalive` — dicatat sebagai T15.

---

### 8.4 `AegisTreasuryRouter` (P1)

```solidity
function setTreasury(address agent, address treasury) external;    // hanya agent (atau pemilik 4337-nya) untuk dirinya sendiri
function treasuryOf(address agent) external view returns (address);
```
Channel dibuka dengan `payoutClient = router` / `payoutProvider = router`; router meneruskan `onPayout` ke `treasuryOf(agent)` atau, jika tidak ada, ke agen. Tidak ada custody: `receive` → forward dalam transaksi yang sama. Ini implementasi "Fleet Treasury Router" dari draft — sengaja **kecil**; nilainya adalah menjaga hot wallet robot tetap kosong, bukan logika treasury.

---

### 8.5 `AegisChannelFactory` & `MockUSDG`

```solidity
function open(Config calldata c, bytes calldata sigClient, bytes calldata sigProvider) external returns (address channel);
    // tanda tangan boleh kosong untuk pihak yang == msg.sender
function predict(Config calldata c) external view returns (address);   // CREATE2: salt = keccak(client, provider, T, c.salt)
uint32 public immutable MIN_CHALLENGE_WINDOW;   // 6 jam produksi / 60 s demo (D5)
address public immutable VERIFIER; address public immutable IMPLEMENTATION;
```
`predict()` membuat alamat channel diketahui **sebelum** ada — provider bisa memasukkannya ke 402 `payTo` dan klien mendanainya lewat facilitator apa pun; `open()` bisa terjadi sesudah dana masuk, oleh siapa pun yang memegang tanda tangan kedua pihak (atau salah satu pihak dengan tanda tangan pihak lain). Karena `Config` di-hash ke salt, alamat itu hanya bisa menjadi channel dengan syarat persis yang ditandatangani. `MockUSDG`: ERC-20 6 desimal, `mint` bebas, hanya testnet.

---

### 8.6 Peran & kendali (matriks akses)

| Peran | Bisa apa | Tidak bisa apa | Catatan |
|---|---|---|---|
| `client` | mendanai, ack (tanda tangan), `submitCheckpoint`, `claimPenalty`, `closeCooperative` (dengan provider) | menarik dana sepihak sebelum settle, mengubah `T` | — |
| `provider` | `submitCheckpoint`, `claimPenalty`, `closeCooperative`, `rollover` | membuat receipt tanpa tanda tangan klien, mengubah `T` | — |
| Siapa pun | `fund` (transfer), `open` dengan tanda tangan sah, `settle` setelah deadline, `sweep` | — | watcher bot |
| Factory deployer | men-deploy factory dengan `VERIFIER`, `IMPLEMENTATION`, `MIN_CHALLENGE_WINDOW` | mengubah apa pun setelah deploy | tidak ada owner |
| Koordinator trusted setup | (satu kali) menghasilkan zkey | — | **risiko T4**; ceremony ≥ 3 kontributor sebelum dana mainnet non-demo |

Tidak ada `owner`, `pause`, proxy, atau `upgradeTo` di jalur dana. Tulis matriks ini di README — kriteria "smart contract quality" akan mencarinya.

---

### 8.7 Anggaran gas (estimasi → **diisi dari pengukuran Hari 7 & 12**)

| Operasi | Estimasi | Terukur (Foundry / testnet) |
|---|---|---|
| `open` (clone + initialize + 2 verifikasi tanda tangan) | ≈ 180k | _Hari 7_ |
| Transfer USDG ke channel (proxy Paxos) | ≈ 60k | MockUSDG: **51.577** (Anvil) · **58.413** (testnet 46630); proxy Paxos di mainnet belum diukur |
| `submitCheckpoint` (2 tanda tangan EOA) | ≈ 80k | **102.825** (Anvil) · **118.929** (testnet 46630) |
| `closeCooperative` (2 tanda tangan + 2 transfer) | ≈ 190k | _Hari 7_ |
| `claimPenalty` (verifier 6 input + storage) | ≈ 260k | verifier saja: **229.241**; total **293.880** (Anvil) · **309.373** (testnet 46630, tx `0x54355aef…`) |
| `settle` (2 transfer) | ≈ 130k | **93.900** (Anvil) · **98.291** (testnet 46630) |
| `ack` anchored (7 hash t=3 + storage) — Stylus / Yul | ≈ 83k / 140k | _Hari 4 (benchmark) & Hari 12_ |
| Aktivasi `AegisPoseidon.rs` (sekali) | 1.659.168 + data fee | _Hari 4_ |

Pada gas price mainnet saat diukur (0,0676 gwei), seluruh siklus sengketa (open → checkpoint → claim → settle) ≈ 650k gas ≈ **44 µETH** + fee data L1. Sebutkan dalam ETH, bukan USD, kecuali harga ETH ikut dicatat pada tanggal yang sama.

---

## 9. SPESIFIKASI SIRKUIT — `sla_settlement.circom`

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

**Tiket keluar (exit ticket) — ditambahkan saat implementasi (Task 14).** Karena `submitCheckpoint`/`closeCooperative` butuh dua tanda tangan, klien tidak punya jalan keluar sepihak sebelum unit 0 jika provider menghilang setelah dana masuk. Provider karena itu menandatangani `Checkpoint(0, 0, root_kosong)` per sesi dan mengirimnya di 402 sebagai `extra.aegis.exitSig`; SDK klien memverifikasinya (domain = alamat `predict()`) **sebelum** mendanai, dan `exitUnilateral()` memakainya hanya jika klien belum memegang checkpoint co-signed apa pun. Tiket ini tidak membuka kelas serangan baru — klien memang selalu bisa mengirim checkpoint co-signed yang basi — tetapi ia mempertegas kewajiban §11.4: provider **wajib** menjalankan challenge responder yang mengirim `latestCoSigned` saat `seq` on-chain lebih rendah.

**Facilitator.** Tidak ada perubahan: ia memverifikasi `witness.to == payTo` dan menyelesaikan. Uji terhadap facilitator Mesh (`facilitator.meshgateway.co`) apakah menerima `payTo` arbitrer (V8); jika tidak, jalankan facilitator sendiri dari `meshgateway/x402` fork — x402 facilitator adalah server stateless.

### 10.3 Kompatibilitas ERC-8183 (FR-27)
| ERC-8183 | AegisClear |
|---|---|
| `createJob` / `fund` | `open` / transfer USDG ke channel |
| `submit(deliverable)` | receipt + ack (off-chain, co-signed) — banyak per job |
| `evaluator.complete/reject` | bukti (`claimPenalty`) atau default jendela; **tidak ada alamat evaluator** |
| `Completed` / `Rejected` biner | `Settled(toProvider, toClient)` proporsional |
| `claimRefund` setelah `expiredAt` | `settle` setelah `deadline`; sisa budget selalu ke klien |
| `IACPHook` | tidak ada (jalur dana tanpa hook, sesuai peringatan 8183 sendiri tentang `claimRefund`) |
| Event `JobFunded`, `PaymentReleased`, `Refunded` | dipancarkan dengan nama & parameter sama |

Konformansi interface penuh (`IACP`) **tidak** diklaim; 8183 masih draft dan semantiknya per-job biner. Yang diklaim: *"AegisClear adalah evaluator yang 8183 bayangkan, dengan escrow yang 8183 belum bisa ekspresikan"*.

### 10.4 ERC-8004 (FR-28, roadmap)
Setelah `Settled`, watcher memanggil `ReputationRegistry.giveFeedback(agentId_provider, value = 10000 − payToClient×10000/A, …, proofOfPayment = txHash)`. Tidak dibangun di MVP; disebut agar juri melihat sambungannya. MeshIdentity memakai ERC-8004 — alamat registry di Robinhood Chain: verifikasi V15.

---

## 11. OFF-CHAIN SERVICES — `aegis-sdk` (TypeScript)

### 11.1 `@aegisclear/core`
- `Terms` → `commit()` (Poseidon t=7 via `circomlibjs`), serialisasi & penyimpanan terenkripsi lokal (kehilangan `nonce` = kehilangan hak klaim, T9)
- `ReceiptTree`: 128 slot, `append()`, `root()`, vektor uji identik dengan sirkuit
- `Checkpoint`: EIP-712 sign/verify (viem), `latest()`, `merge(remote)` (ambil `seq` tertinggi yang punya dua tanda tangan sah)
- `Prover`: `prove(terms, receipts, seq) → {proof, publicSignals}` (snarkjs; opsional `rapidsnark` binary), `settlement(terms, receipts)` (Python-equivalent, dipakai untuk pra-cek sebelum proving)

### 11.2 `@aegisclear/provider` (middleware Express/Hono)
- Menjawab 402 dengan `payTo = predict(cfg)` (§10.2)
- Per request berbayar: hitung `due`, lampirkan `Aegis-Receipt` + `sigProvider(Checkpoint_seq)`, **tahan respons berikutnya sampai ack `seq` sebelumnya diterima** (FR-24, T2)
- Menolak jika `budget − A − due < 0` (baca `balanceOf` dengan cache per blok)
- Menutup channel sepihak setelah `idleTimeout` (checkpoint terakhir)

### 11.3 `@aegisclear/client` (untuk MeshWallet/MCP atau agen apa pun)
- Meng-ack hanya jika metrik di header sesuai pengamatan sendiri dalam toleransi yang dikonfigurasi (mis. latensi server ≤ RTT klien) — kalau tidak, tidak ack dan unit tidak dibayar
- Menyimpan setiap `Checkpoint` co-signed; `claimPenalty()` = prove + kirim; `settle()` setelah deadline

### 11.4 Watcher / settler bot
- Mengindeks event factory; memanggil `settle()` setelah `deadline`, `sweep()` setelah `SETTLED` dengan saldo > 0
- **Challenge responder (wajib untuk provider):** untuk setiap channel yang dilayani, jika `state == CLOSING` dan `seq` on-chain < `seq` checkpoint co-signed tertinggi yang dipegang (`latestCoSigned`), kirim `submitCheckpoint` dengan checkpoint itu sebelum `deadline` — inilah yang menetralkan checkpoint basi maupun tiket keluar seq-0 (T1)
- Peringatan untuk klien: channel `CLOSING` dengan `seq` lebih rendah dari yang klien pegang → kirim checkpoint terbaru; dengan `seq` sama & ada pelanggaran → prove & claim sebelum deadline

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
| T14 | Reentrancy pada payout | token dengan hook | USDG tanpa hook; tetap CEI + `nonReentrant` | Nihil |
| T15 | Program Stylus kedaluwarsa | 365 hari tanpa panggilan | `keepalive` (31 hari) oleh watcher; anchored mode Yul sebagai fallback | Rendah |
| T16 | Kebocoran metadata | `A/seq`, `payToClient/A`, waktu | §6.7; `qty` bervariasi; **tidak diklaim anonim** | **Diterima & didokumentasikan** |
| T17 | Provider melayani melebihi deposit | mengabaikan FR-24 | `toProvider ≤ B`; kerugian di provider | Diterima |
| T18 | Facilitator jahat | menahan/menolak settle | tidak bisa mengubah jumlah/tujuan (witness); klien bisa mendanai langsung tanpa facilitator | Nihil untuk dana |
| T19 | Dana masuk ke alamat `predict()` untuk `cfg` yang tidak pernah `open` | provider mengirim `payTo` lalu menghilang | siapa pun bisa `open` asalkan memegang tanda tangan **kedua** pihak; jika provider tidak pernah menandatangani `ChannelTerms`, alamat tidak bisa menjadi channel → dana **terkunci** | **Rendah dengan SDK klien** — D7: 402 `extra.aegis` wajib memuat `sigProvider(ChannelTerms)`; SDK klien memverifikasinya sebelum menandatangani Permit2, lalu klien sendiri bisa `open(cfg, "", sigProvider)` kapan saja. Klien x402 **polos** tidak boleh diarahkan ke `payTo` channel |

T19 layak disorot di README: ia adalah alasan `extra.aegis` di 402 wajib berisi tanda tangan provider, dan alasan klien x402 **polos** (tanpa SDK AegisClear) tidak boleh diarahkan ke `payTo` channel.

---

## 13. INVARIANTS & TEST PLAN

### Invariants (fuzz + invariant testing Foundry; sirkuit via vektor)
| ID | Invariant |
|---|---|
| INV-1 | Pada `SETTLED`: `toProvider + toClient == balanceOf(channel)` sesaat sebelum transfer; saldo 0 sesudahnya |
| INV-2 | `latest.seq` monoton naik; setiap perubahan `(seq, A, R)` disertai dua tanda tangan sah atas nilai persis itu |
| INV-3 | `proofSeq == seq` ⇒ `verifyProof(…, [addr, T, R, seq, A, payToClient]) == true` pada saat klaim |
| INV-4 | `payToClient ≤ A` (kontrak) dan `payToClient == min(penRaw, cap)` (sirkuit) |
| INV-5 | `toProvider ≤ min(A, B)`; `toProvider ≥ min(A − ⌊A×κ/10000⌋, B)` untuk setiap jalur settle |
| INV-6 | `settle` hanya jika `CLOSING ∧ now ≥ deadline`; `closeCooperative` hanya dengan dua tanda tangan atas `(seq ≥ latest.seq, toProvider ≤ B)`; `toClient = B − toProvider` |
| INV-7 | Checkpoint baru ⇒ `proofSeq ≠ seq` (bukti lama tidak pernah dipakai) |
| INV-8 | `deadline` tidak pernah berkurang; total perpanjangan ≤ `responseWindow × (jumlah checkpoint co-signed)` |
| INV-9 | Tidak ada fungsi yang memindahkan USDG keluar sebelum `SETTLED`; setelah `SETTLED` hanya `sweep` → `payoutClient` |
| INV-10 | (sirkuit) `Σ due_i == A`; `due_i == qty_i × p`; `leaf_i == 0 ∀ i ≥ seq`; root == `R` |
| INV-11 | (anchored) root on-chain setelah `k` ack == `ReceiptTree.root()` SDK atas leaf yang sama, untuk Stylus dan Yul |
| INV-12 | Tidak ada urutan panggilan oleh **satu** pihak yang mengubah hak pihak lain di bawah `(A − cap)` untuk provider atau di bawah `B − A` untuk klien |

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
11. **Rollover (P1):** epoch 128 penuh → `rollover` → epoch baru dengan `T` sama, `seq = 0`, budget sisa.
12. **Anchored (P1):** 8 `ack` on-chain → root == SDK; gas Stylus vs Yul dicatat.
13. **USDG dibekukan (mock):** `transfer` revert saat settle → state tetap `CLOSING`, tidak ada dana yang hilang, `settle` bisa diulang.
14. **Fuzz parameter:** `π, κ ∈ [0, 10000]`, `seq ∈ [0, 128]`, `qty, m1, m2 < 2³²` → INV-4, INV-5, INV-10 (sirkuit lewat vektor acak: 200 vektor, Python vs snarkjs).

Target: ≥ 90% line coverage kontrak inti; invariant run ≥ 50k; 200 vektor acak sirkuit lulus.

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

Lingkungan: Anvil **fork mainnet 4663** (USDG asli, Permit2 & proxy x402 asli, `vm.warp` untuk jendela) untuk uji; **testnet 46630** dengan `MockUSDG` untuk bukti liveness; **mainnet 4663** dengan USDG sen-level untuk demo video (D1). Kontrak produksi dipakai apa adanya — tidak ada `AegisClock`; jendela pendek datang dari factory demo (`MIN_CHALLENGE_WINDOW = 60 s`, D5), bukan dari kode kontrak yang berbeda.

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
| **2–3** | Sirkuit `sla_settlement.circom` + vektor EX1–EX3 + 200 vektor acak; ptau 2¹⁷; zkey; verifier Solidity; ukur constraint & proving | **Go/No-Go sirkuit:** semua vektor lulus, proving < 30 s (D4 jika tidak) |
| **4** | Benchmark Poseidon: `poseidon-solidity` (Yul) vs `AegisPoseidon.rs` (`cargo stylus` ke testnet 46630) — hash t=3/t=6 dan 8 hash berantai | **D2:** Stylus lanjut hanya jika ≥ 1,5× |
| **5–7** | `AegisChannel` + factory + `MockUSDG`; EIP-712; ERC-1271; Foundry: skenario 1–9, INV-1–9; ukur gas §8.7 | Skenario 2 & 4 lulus end-to-end dengan bukti asli via FFI |
| **8** | `aegis-sdk` core + provider middleware + klien; protokol ack; deploy testnet 46630 | Dua agen menyelesaikan 100 request + cooperative close di testnet |
| **9** | x402 `payTo` (§10.2) di fork mainnet; uji facilitator Mesh (V8) atau facilitator sendiri; skenario 10 | Dana lewat proxy kanonik masuk channel |
| **10** | Watcher/settler; skenario 5–8, 13; fuzz 14; `leak-check` | INV semua hijau; coverage ≥ 90% |
| **11** | Demo harness A vs B + tabel; `SimpleJobEscrow.sol` kontrol | Tabel §14 tercetak dari run nyata |
| **12** | **Jika D2 positif:** anchored mode + `AegisPoseidon.rs` + skenario 12. **Jika tidak:** anchored Yul atau pangkas. `AegisTreasuryRouter`. Deploy mainnet 4663 (D1) | Angka Stylus/Yul terukur masuk §8.7 |
| **13** | Audit sendiri: Slither/Aderyn, checklist SWC, review ulang T4/T19; ceremony transkrip; README (matriks §8.6, tabel §6.7) | Nol temuan high |
| **14** | Video ≤ 3 menit (skrip §14), doc arsitektur final, submission draft di HackQuest | |
| **15** | Buffer + submit. **Deadline 4 Okt 2026 15:59 UTC** (22:59 WIB) | |

**Aturan pemangkasan bila tertinggal.** Buang dengan urutan ini: `AegisTreasuryRouter` → anchored mode + `AegisPoseidon.rs` → `rollover` → integrasi facilitator Mesh nyata (cukup fork) → deploy mainnet (cukup testnet). Yang **tidak boleh** dibuang: sirkuit + verifier + `AegisChannel` + SDK ack + demo A vs B. Empat hal itu adalah produk yang utuh dan jujur; tanpa Stylus sekalipun ia tetap "escrow yang evaluatornya sirkuit".

---

## 17. PERTANYAAN JURI & JAWABAN SIAP

| Pertanyaan | Jawaban |
|---|---|
| "Ini escrow lagi?" | Escrow-nya standar — sengaja. Yang baru: evaluatornya sirkuit, hasilnya proporsional, syaratnya privat, dan ia hidup di alamat `payTo` x402 sehingga rel yang ada tidak berubah. |
| "Kenapa bukan ERC-8183 dengan evaluator kontrak?" | Itu **persis** yang kami bangun — 8183 menyebut evaluator boleh memverifikasi bukti ZK, tapi semantiknya per-job dan biner. Kami menambah channel banyak unit dan payout proporsional; event-nya tetap berbentuk 8183 agar indexer paham. |
| "Kenapa ZK, bukan TEE atau LLM-as-judge?" | Ketiganya mengganti kepercayaan pada manusia dengan kepercayaan pada sesuatu. TEE: vendor + attestasi; LLM: model + prompt, non-deterministik, dan harus melihat datanya. Sirkuit: hanya matematika, deterministik, dan tidak melihat apa pun. Untuk SLA yang bisa dinyatakan sebagai aritmetika atas metrik co-signed, ZK adalah opsi termurah dalam asumsi. |
| "Kenapa Robinhood Chain?" | Empat hal sekaligus: USDG asli (703 juta supply, 6 desimal) dengan rel Permit2/x402 yang hidup (Mesh), FCFS tanpa priority fee (jendela waktu adalah satu-satunya tuas — desain kami memang berbasis waktu), gas 0,07 gwei yang membuat verifikasi 225k gas ekonomis untuk sengketa sen, dan Stylus untuk hashing on-chain. Base punya USDC, bukan USDG dan ekosistem ini. |
| "Kenapa verifier di Solidity kalau kalian pakai Stylus?" | Karena kami mengukur. Pairing BN254 adalah precompile; Groth16 di Stylus 256k gas vs Solidity 194k. Stylus dipakai di tempat ia menang: Poseidon 11,9k vs 19,3k gas (Yul). Kami tidak akan mengklaim angka yang tidak kami ukur sendiri. |
| "Trusted setup?" | Satu kontributor untuk hackathon — dinyatakan di README. Pemegang toxic waste bisa memalsukan bukti, karena itu kontrak membatasi `payToClient ≤ A` dan hanya pihak channel yang boleh klaim. Sebelum dana nyata: ceremony ≥ 3 kontributor, atau PLONK universal dengan +50–100% gas. |
| "Bagaimana kalau provider bohong soal metrik?" | Ia tidak bisa membuat receipt sendirian: setiap metrik yang dihitung sirkuit adalah metrik yang klien tanda tangani. Kalau klien tidak setuju, ia tidak ack dan unit itu tidak dibayar. |
| "Bagaimana kalau klien tidak pernah ack?" | Provider berhenti melayani; kerugian maksimum satu unit — sama seperti API prabayar mana pun. Kami tidak berpura-pura menghapus risiko itu; kami membatasinya ke satu unit. |
| "Apa yang bocor?" | Pihak, deposit, total yang di-ack, jumlah unit, dan porsi penalti jika ada klaim. Bukan harga, ambang, metrik, atau jumlah pelanggaran. Tabelnya ada di README; kami tidak mengklaim anonim. |
| "128 receipt per epoch — terlalu kecil?" | Untuk micro-escrow, itu satu hari kerja robot. Rollover kooperatif me-reset epoch tanpa deposit ulang. Agregasi bukti adalah roadmap, bukan MVP. |
| "Kenapa tidak optimistik saja (UMA) — lebih murah?" | Optimistik butuh bond, jendela sengketa yang bisa diperebutkan, dan data yang **publik** agar orang bisa menantang. Kami tidak punya penantang — kami punya bukti. |
| "Apa yang on-chain?" | Channel, komitmen syarat, root receipt, checkpoint co-signed, verifikasi bukti, pembayaran. Off-chain: receipt, ack, proving. Tidak ada keeper yang dibutuhkan untuk keselamatan — `settle` permissionless dan defaultnya adalah state yang kedua pihak terakhir setujui. |
| "Sudah ada yang bangun ini?" | ERC-8183 (escrow evaluator biner), Kleros/UMA (adjudikasi manusia/optimistik), Mesh (rel tanpa escrow). Tidak ditemukan escrow agen dengan adjudikasi bukti ZK yang terdeploy — kami akan menyebut jika menemukannya. |
| "Kenapa USDG?" | Karena itu uang yang sudah dipakai agen di chain ini (Mesh: 15.718 settlement), dan juri memberi prioritas USDG. USDC secara teknis bisa (EIP-3009 malah lebih mudah); kami tidak mengklaim USDG tak tergantikan. |
| "Apa yang bisa direproduksi tim lain dalam 48 jam?" | Kontrak channel-nya. Yang tidak: sirkuit dengan vektor uji diferensial tiga implementasi, integrasi `payTo` yang tidak menyentuh facilitator, dan tabel kebocoran yang jujur. |

---

## 18. RENCANA B

**B1 — Proving terlalu lambat / ptau 2¹⁷ bermasalah.** `MAX_SEQ = 64` (≈ 45k constraint, ptau 2¹⁶). Narasi tidak berubah.

**B2 — Groth16 toolchain gagal (zkey/verifier).** PLONK di snarkjs dengan sirkuit yang sama; verifier ≈ 300–400k gas; tanpa phase-2 khusus sirkuit (menghapus T4 sebagian). Tambah ≈ 1 hari.

**B3 — ZK gagal total sebelum Hari 7.** *Commit-reveal*: `claimPenalty` membuka `terms` + receipt on-chain, kontrak menghitung ulang `T` dan `R` (Poseidon Yul/Stylus, ≤ 255 hash ≈ 3–5M gas) dan mengevaluasi §6.3 di Solidity. Privasi bertahan **sampai sengketa** — dinyatakan begitu, dan ini satu-satunya jalur di mana Stylus menjadi komponen utama. Semantik §6 dan vektor uji tetap dipakai.

**B4 — Jangan lakukan:** membangun "escrow agen generik" tanpa bukti maupun reveal. Itu ERC-8183 tanpa alasan untuk ada.

---

## 19. VERIFICATION CHECKLIST — HARI 1

Item ✅ diverifikasi 19 Sep 2026 dengan perintah yang tercantum (RPC publik). Sisanya wajib sebelum Hari 2.

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
| V9 | Toolchain: `circom` 2.x, `snarkjs`, `rapidsnark`, `cargo-stylus`, `stylus-sdk` versi, Foundry | ✅ sebagian (19 Sep 2026): Foundry 1.5.1, Node 22.23, pnpm 9.15, cargo 1.92 + cargo-stylus 0.10.9 + target wasm32 ada; **circom belum terinstal** (binari v2.2.3, plan Task 1); `cargo stylus check --endpoint <testnet>` belum | Ukuran WASM: batas kode 96 KB di Robinhood Chain berlaku untuk Stylus? cek `cargo stylus check` |
| V10 | Gas verifier Solidity 6 input publik | Foundry: `verifyProof` dengan bukti asli EX1 | Mengisi §8.7; target ≈ 225k |
| V11 | Constraint & proving time sirkuit | `snarkjs r1cs info`; `time snarkjs groth16 prove` | D4 jika > 30 s |
| V12 | Poseidon Yul vs Stylus | Foundry gas `poseidon-solidity` T3/T6; `cargo stylus` deploy + `cast estimate` | **D2** |
| V13 | Jendela force-inclusion delayed inbox Robinhood Chain | docs Arbitrum / kontrak `SequencerInbox` (`maxTimeVariation`) | `challengeWindow` produksi (§6.6) |
| V14 | Powers of Tau 2¹⁷ | ✅ diperiksa 19 Sep 2026: mirror `storage.googleapis.com/zkevm/ptau` **dan** `hermez.s3-eu-west-1.amazonaws.com` mengembalikan HTTP 403 → `circuits/scripts/setup.sh` membangkitkan ptau lokal (`powersoftau new/contribute/beacon/prepare phase2`); jika mirror kembali tersedia, `PTAU_URL=… setup.sh` + cocokkan hash blake2b `6247a343…49345` dari README snarkjs | Setup lokal = kontributor tunggal juga untuk phase 1 (T4 tidak berubah) |
| V15 | Registry ERC-8004 di Robinhood Chain (MeshIdentity) | docs/repo Mesh, explorer | FR-28 roadmap |
| V16 | ZeroStyl — apa yang sudah ia sediakan | github.com/kazai777/zerostyl | Kreditkan jika dipakai/berimpit |
| V17 | Syarat submission: durasi video, repo publik, form | portal HackQuest | DQ jika terlewat |
| V18 | **Deploy testnet 46630** | ✅ 20 Sep 2026: `DeployTestnet.s.sol --broadcast --verify` — 7/7 kontrak terverifikasi Blockscout (factory demo `0x0922ee7D…4ED3`, factory prod `0x201BaC41…7fDD`, verifier `0x5EC99814…7462`, MockUSDG `0xCadd4526…5a83`, escrow `0x5017C9e5…964a`); test integrasi kooperatif + sengketa (bukti Groth16 asli, jendela 120 s nyata) **lulus on-chain** — `claimPenalty` tx `0x54355aef…93a6`, `Settled` `0xd903f389…37bc` | Bukti liveness untuk submission (README) |

---

## 20. OPEN DECISIONS

| # | Keputusan | Opsi | Rekomendasi |
|---|---|---|---|
| D1 | Deployment final | testnet 46630 (MockUSDG) saja / + mainnet 4663 (USDG asli, sen-level) | **Keduanya.** Seluruh ekosistem Mesh hanya hidup di mainnet; biaya deploy < $2 pada 0,07 gwei; juri memberi prioritas USDG asli. Dana demo ≤ 5 USDG |
| D2 | Stylus | Poseidon di Stylus jika benchmark Hari 4 ≥ 1,5× vs Yul / Yul saja | **Terbuka — sebagian terukur (19 Sep 2026).** Yul terukur penuh via Foundry: T3=32.503, T6=172.418, 7×T3(anchored)=212.715 gas — cocok circomlibjs (D3 ✅). Stylus (OZ Poseidon2) dibangun & lolos `cargo stylus check` di testnet 46630 (WASM terkompresi 14,4 KB, batas 96 KB); belum di-deploy. Gas on-chain Stylus (`cast estimate`) menunggu deploy oleh pemilik `$PK_DEPLOYER` (tidak tersedia saat ini) — keputusan ≥1,5×/<1,5× baru bisa diambil setelah itu, **dari rasio on-chain vs on-chain** (angka Yul Foundry di atas hanya referensi — termasuk overhead DELEGATECALL library, bukan pembilang rasio; Yul juga harus diukur on-chain, `forge create` + `cast estimate`, untuk pembanding yang adil). Detail & perintah: `docs/benchmarks/poseidon.md` |
| D3 | Varian hash | circomlib Poseidon v1 di semua tempat (port Rust) / Poseidon2 (OZ Rust + template circom baru) | **v1.** circomlib & `poseidon-solidity` sudah teruji dan kompatibel; port Rust ≈ 150 baris + konstanta publik, diuji terhadap `circomlibjs` |
| D4 | `MAX_SEQ` | 64 / 128 / 256 | **128**, turun ke 64 jika proving > 30 s |
| D5 | Jendela demo | factory demo terpisah (`MIN_CHALLENGE_WINDOW = 60 s`) / `vm.warp` saja | **Factory demo terpisah** — deploy testnet & mainnet demo perlu jendela pendek nyata; kode kontrak channel identik |
| D6 | Proof system | Groth16 (194k, phase-2 per sirkuit) / PLONK (≈ +50–100% gas, universal) | **Groth16** untuk MVP dengan T4 dinyatakan; PLONK sebagai B2 & opsi produksi |
| D7 | Persetujuan klien atas `ChannelTerms` di jalur x402 | header tambahan saat bayar / provider membuka + tanda tangan klien saat ack pertama | **Provider membuka.** Menjaga klien x402 polos tetap bisa membayar; SDK klien memverifikasi `sigProvider` sebelum menandatangani Permit2 (T19) |
| D8 | `payoutClient`/`payoutProvider` | wajib = pihak / bebas | **Bebas** — itulah "treasury routing"; router adalah gula |
| D9 | Fee protokol | 0 / bps di factory | **0 di MVP**, slot ada |
| D10 | Nama repo publik | — | Hindari "escrow" sebagai nama (generik); pertahankan "AegisClear" |

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
| **Channel / epoch** | Satu kontrak clone per pasangan agen; epoch = ≤ 128 receipt di bawah satu `receiptsRoot` |
| **Receipt / ack** | Unit layanan `(seq, qty, m1, m2, due)`; ack = tanda tangan klien atas checkpoint kumulatif baru |
| **Checkpoint** | `(seq, cumulativeAmount, receiptsRoot)` dengan tanda tangan kedua pihak |
| **`termsCommitment` (T)** | `Poseidon(p, L*, Q*, π, κ, ν)` — komitmen syarat komersial |
| **`receiptsRoot` (R)** | Root pohon Poseidon 128 slot atas leaf receipt |
| **Cooperative / unilateral close** | Kedua pihak menandatangani pembagian akhir / satu pihak mengirim checkpoint dan membuka jendela |
| **`challengeWindow` / `responseWindow`** | Jendela sebelum `settle` / perpanjangan per checkpoint baru |
| **Klaim penalti** | Bukti Groth16 bahwa `payToClient = min(Σ pen_i, cap)` atas `(T, R, seq, A)` |
| **Anchored mode** | Ack on-chain dengan pohon Poseidon inkremental (Stylus/Yul) — untuk job bernilai tinggi frekuensi rendah |
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

**Belum bersumber primer (wajib dilengkapi sebelum pitch):** klaim OKX APP "escrow & dispute coming soon" (§2.3); alamat registry ERC-8004 di Robinhood Chain (V15); jendela force-inclusion Robinhood Chain (V13); ZeroStyl (V16).

---

## 23. RIWAYAT PERUBAHAN

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
