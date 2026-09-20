import { zeroAddress, type Address, type Hex, type PrivateKeyAccount } from "viem";
import { type Terms, type Receipt, ReceiptTree, settle, buildCircuitInput, commitTerms, merkleRoot, leafHash } from "../core/index.js";
import {
  type ChannelConfig, type Checkpoint, type LeafMsg, type TypedDataVerifier, signCheckpoint, signChannelTerms, signClose, signRollover, rootHex,
  makeTypedDataVerifier,
} from "../core/typedData.js";
import {
  type ChainCtx, erc20Transfer, predictChannel, openChannel, submitCheckpointTx, claimPenaltyTx, settleTx,
  closeCooperativeTx, rolloverTx, readChannel, ackTx, startCloseTx,
} from "../chain/channel.js";
import { factoryAbi } from "../chain/abi.js";
import { prove, toCalldata, type Artifacts } from "../core/prover.js";

/**
 * Pagar ekonomi klien. Tanpa ini klien SDK menerima berapa pun deposit, jendela tantangan, dan qty per
 * unit yang provider tawarkan — setiap unit tetap butuh ack (tanda tangan) klien, tetapi klien otomatis
 * yang tidak membandingkan tawaran dengan batasnya sendiri akan mendanai dan meng-ack apa saja.
 */
export interface ClientPolicy {
  /** deposit (402 `maxAmountRequired`) maksimum yang bersedia klien kunci di channel. */
  maxDeposit?: bigint;
  /** `cfg.challengeWindow` maksimum (detik) — lamanya dana klien bisa tertahan setelah checkpoint. */
  maxChallengeWindow?: number;
  /**
   * qty maksimum per receipt yang bersedia klien ack. Default: `unitQty` yang provider iklankan di
   * 402 (`extra.aegis.unitQty`); bila 402 tidak memuatnya dan ini tidak diisi, `start()` menolak
   * (klien tidak boleh mendanai channel tanpa batas tagihan per unit yang ia ketahui).
   */
  maxQtyPerUnit?: bigint;
}
export interface ClientOptions {
  ctx: ChainCtx; account: PrivateKeyAccount; providerUrl: string; usdg: Address; artifacts: Artifacts;
  /** alamat yang berhak menerima sisa dana klien (cfg.payoutClient). Default: account.address. */
  payoutTo?: Address;
  /** bila diisi, cfg.provider dari tawaran 402 WAJIB sama dengan ini. */
  expectedProvider?: Address;
  /** kebijakan ack: false = tolak unit (tidak dibayar). Default: terima semua metrik yang provider laporkan. */
  accept?: (r: Receipt) => boolean;
  /** batas ekonomi (deposit, jendela tantangan, qty per unit). Lihat `ClientPolicy`. */
  policy?: ClientPolicy;
}
export interface TxLog { label: string; hash: Hex; gasUsed: bigint }
const bi = (x: string | number | bigint) => BigInt(x);
// RPC publik 46630 ber-load-balancer bisa membalas eth_call dari node yang belum menerapkan block
// terbaru; dipakai oleh rollover()'s confirm-retry di bawah (lihat dokumentasi method itu).
const ROLLOVER_CONFIRM_MS = 15_000;
const ROLLOVER_CONFIRM_EVERY_MS = 750;

export class AegisClient {
  cfg!: ChannelConfig; channel!: Address; terms!: Terms; deposit = 0n; epoch = 0;
  /**
   * Mode anchored (FR-25): ack unit = tx `ack()` on-chain, tidak ada checkpoint co-signed. Diturunkan dari
   * `ctx.factory` milik KLIEN SENDIRI on-chain (T-mode) di `start()` — bukan dari flag `anchored` yang
   * diklaim provider di 402, yang hanya dipakai sebagai cross-check (mismatch ditolak).
   */
  anchored = false;
  readonly tree = new ReceiptTree();
  readonly checkpoints = new Map<number, { cp: Checkpoint; sigProvider: Hex; sigClient: Hex }>();
  readonly txs: TxLog[] = [];
  provingMs = 0;
  private termsSig?: Hex;
  private pendingAck?: { seq: number; signature: Hex };
  /** sigProvider(ChannelTerms) dari 402 — disimpan agar klien bisa membuka channel sendiri (exitUnilateral). */
  private providerTermsSig?: Hex;
  /** tiket keluar unilateral: sigProvider(Checkpoint(0,0,merkleRoot([]))) dari 402. */
  private exitSigProvider?: Hex;
  /** batas qty per receipt yang berlaku: policy.maxQtyPerUnit ?? unitQty yang diiklankan provider (402). */
  private maxQtyPerUnit?: bigint;
  /** verifikasi tanda tangan sadar ERC-1271/6492 (provider boleh smart account) — konsisten dengan kontrak. */
  private readonly verify: TypedDataVerifier;

  constructor(private readonly o: ClientOptions) { this.verify = makeTypedDataVerifier(o.ctx.publicClient); }
  private hdr(extra: Record<string, string> = {}) {
    return { "Aegis-Client": this.o.account.address, "content-type": "application/json", ...extra };
  }
  private get chainId() { return this.o.ctx.chainId; }
  /** Tiket keluar seq-0 (epoch saat ini) yang sedang dipegang klien — baca-saja, untuk pengujian/observabilitas. */
  get exitSig(): Hex | undefined { return this.exitSigProvider; }

  /** GET /job → 402 → verifikasi cfg/payTo/sigProvider(ChannelTerms) (T19) → danai → siapkan tanda tangan ChannelTerms */
  async start(): Promise<void> {
    const res = await fetch(`${this.o.providerUrl}/job`, { headers: this.hdr() });
    if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
    const offer = ((await res.json()) as any).accepts[0];
    const a = offer.extra.aegis;
    // T-mode (review round 1, CRITICAL): mode (anchored vs co-signed) TIDAK BOLEH dipercaya dari klaim
    // provider di 402 — provider jahat bisa berbohong soal mode untuk membuat klien melewati verifikasi
    // tiket keluar co-signed di bawah. Kebenaran satu-satunya adalah `POSEIDON()` pada factory milik KLIEN
    // SENDIRI (`ctx.factory`, yang klien pilih sendiri) — dibaca SEBELUM transfer apa pun. Klaim provider
    // hanya dipakai sebagai cross-check; ketidakcocokan ditolak sebelum efek samping apa pun.
    const poseidon = await this.o.ctx.publicClient.readContract({ address: this.o.ctx.factory, abi: factoryAbi, functionName: "POSEIDON" });
    const anchored = poseidon !== zeroAddress;
    if (!!a.anchored !== anchored) throw new Error(`mode mismatch: 402 says anchored=${!!a.anchored} but factory POSEIDON=${poseidon} (T-mode)`);
    this.anchored = anchored;
    const cfg: ChannelConfig = { ...a.config, challengeWindow: Number(a.config.challengeWindow), responseWindow: Number(a.config.responseWindow) };
    if (cfg.client.toLowerCase() !== this.o.account.address.toLowerCase()) throw new Error("config.client mismatch");
    if (cfg.token.toLowerCase() !== this.o.usdg.toLowerCase()) throw new Error("config.token mismatch");
    // Sisa dana klien (payoutClient) tidak boleh diarahkan ke pihak lain (mis. provider) tanpa sepengetahuan klien.
    const payoutTo = this.o.payoutTo ?? this.o.account.address;
    if (cfg.payoutClient.toLowerCase() !== payoutTo.toLowerCase()) throw new Error("config.payoutClient mismatch");
    if (this.o.expectedProvider && cfg.provider.toLowerCase() !== this.o.expectedProvider.toLowerCase())
      throw new Error("config.provider mismatch");
    const terms: Terms = { unitPrice: bi(a.terms.unitPrice), maxM1: bi(a.terms.maxM1), minM2: bi(a.terms.minM2), penaltyBps: bi(a.terms.penaltyBps), capBps: bi(a.terms.capBps), nonce: bi(a.terms.nonce) };
    if (rootHex(await commitTerms(terms)) !== cfg.termsCommitment) throw new Error("termsCommitment mismatch");
    // T19: payTo yang diklaim provider WAJIB persis predictChannel(cfg) on-chain — jangan pernah percaya
    // offer.payTo mentah, atau provider bisa mengarahkan dana ke alamat sembarang (mis. EOA-nya sendiri).
    const predicted = await predictChannel(this.o.ctx, cfg);
    if (predicted.toLowerCase() !== String(offer.payTo).toLowerCase()) throw new Error("payTo != predictChannel(cfg) (T19)");
    if (!(await this.verify.verifyChannelTermsSig(cfg.provider, predicted, this.chainId, cfg, a.sigProvider))) throw new Error("bad provider terms signature (T19)");
    // Tiket keluar unilateral (seq 0): harus tervalidasi SEBELUM klien mendanai channel (§6.2/T-exit0).
    // Anchored (FR-25): tidak ada tiket terpisah — state on-chain (default nol) sudah otoritatif, dan
    // `exitUnilateral()`/`dispute()` anchored memakai `startClose()` langsung; klien mengabaikan `exitSig`.
    if (!this.anchored) {
      const cp0: Checkpoint = { epoch: 0, seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
      if (!(await this.verify.verifyCheckpointSig(cfg.provider, predicted, this.chainId, cp0, a.exitSig))) throw new Error("bad provider exit ticket (seq-0)");
      this.exitSigProvider = a.exitSig as Hex;
    }
    // Pagar ekonomi (ClientPolicy) — SEBELUM transfer apa pun. Tanpa ini klien mendanai berapa pun yang
    // diminta dan menerima jendela tantangan sepanjang apa pun (dana tertahan selama itu bila sengketa).
    const deposit = bi(offer.maxAmountRequired);
    const policy = this.o.policy ?? {};
    if (policy.maxDeposit !== undefined && deposit > policy.maxDeposit)
      throw new Error(`deposit ${deposit} exceeds policy.maxDeposit ${policy.maxDeposit}`);
    if (policy.maxChallengeWindow !== undefined && cfg.challengeWindow > policy.maxChallengeWindow)
      throw new Error(`challengeWindow ${cfg.challengeWindow} exceeds policy.maxChallengeWindow ${policy.maxChallengeWindow}`);
    const advertisedUnitQty = a.unitQty !== undefined ? bi(a.unitQty) : undefined;
    const maxQtyPerUnit = policy.maxQtyPerUnit ?? advertisedUnitQty;
    if (maxQtyPerUnit === undefined) throw new Error("402 offer has no unitQty and policy.maxQtyPerUnit is unset — refusing to fund without a per-unit qty bound");
    this.cfg = cfg; this.channel = predicted; this.terms = terms; this.deposit = deposit; this.maxQtyPerUnit = maxQtyPerUnit;
    this.providerTermsSig = a.sigProvider as Hex;
    // MVP: transfer langsung ke alamat channel. Rel x402/Permit2 menghasilkan efek identik (Task 11).
    this.txs.push({ label: "fund", ...(await erc20Transfer(this.o.ctx, this.o.usdg, predicted, this.deposit)) });
    this.termsSig = await signChannelTerms(this.o.account, predicted, this.chainId, cfg);
  }

  /**
   * POST /job dengan ack sebelumnya; verifikasi receipt, root, jumlah, tanda tangan provider; tanda tangani checkpoint baru.
   * SEMUA pemeriksaan (seq, due, kebijakan, rekomputasi checkpoint atas pohon TENTATIF, tanda tangan
   * provider) dilakukan SEBELUM `this.tree` disentuh — satu balasan provider yang cacat tidak boleh
   * meninggalkan pohon lokal satu langkah di depan checkpoint co-signed tertinggi (dulu itu membuat
   * `dispute()`/`closeCooperative()` tidak bisa dipakai: tree.size = k+1 tapi checkpoint k+1 tidak ada).
   * Invarian setelah return/throw: `tree.size` == seq checkpoint co-signed tertinggi di `checkpoints`.
   */
  async requestUnit(): Promise<Receipt> {
    const headers = this.hdr() as Record<string, string>;
    if (this.termsSig) { headers["Aegis-Terms-Signature"] = this.termsSig; }
    if (this.pendingAck) headers["Aegis-Ack"] = JSON.stringify(this.pendingAck);
    const res = await fetch(`${this.o.providerUrl}/job`, { method: "POST", headers });
    if (res.status !== 200) throw new Error(`POST /job ${res.status}: ${await res.text()}`);
    this.termsSig = undefined;
    const b = (await res.json()) as any;
    const r: Receipt = { seq: Number(b.receipt.seq), qty: bi(b.receipt.qty), m1: bi(b.receipt.m1), m2: bi(b.receipt.m2), due: bi(b.receipt.due) };
    if (r.seq !== this.tree.size) throw new Error("seq mismatch");
    if (r.due !== r.qty * this.terms.unitPrice) throw new Error("due mismatch");
    if (this.maxQtyPerUnit !== undefined && r.qty > this.maxQtyPerUnit)
      throw new Error(`receipt ${r.seq} qty ${r.qty} exceeds maxQtyPerUnit ${this.maxQtyPerUnit}`);
    if (this.o.accept && !this.o.accept(r)) throw new Error(`receipt ${r.seq} rejected by policy`);
    if (this.anchored) {
      if (!b?.leaf || typeof b.sigProvider !== "string") throw new Error("anchored reply missing leaf/sigProvider");
      const lf: LeafMsg = { epoch: Number(b.leaf.epoch), seq: Number(b.leaf.seq), leaf: b.leaf.leaf as Hex, cumulativeAmount: bi(b.leaf.cumulativeAmount) };
      if (lf.epoch !== this.epoch || lf.seq !== this.tree.size) throw new Error("leaf epoch/seq mismatch");
      if (rootHex(await leafHash(r)) !== lf.leaf) throw new Error("leaf hash mismatch");
      if (lf.cumulativeAmount !== settle([...this.tree.receipts, r], this.terms).cumulativeAmount) throw new Error("leaf cumulativeAmount mismatch");
      if (!(await this.verify.verifyLeafSig(this.cfg.provider, this.channel, this.chainId, lf, b.sigProvider))) throw new Error("bad provider leaf signature");
      // Ack = tx on-chain (FR-25). Baru setelah tx sukses pohon lokal disentuh — invarian: tree.size == seq on-chain.
      this.txs.push({ label: "ack", ...(await ackTx(this.o.ctx, this.channel, lf, b.sigProvider)) });
      await this.tree.append(r);
      return r;
    }
    const cp: Checkpoint = { epoch: Number(b.checkpoint.epoch), seq: Number(b.checkpoint.seq), cumulativeAmount: bi(b.checkpoint.cumulativeAmount), receiptsRoot: bi(b.checkpoint.receiptsRoot) };
    if (cp.epoch !== this.epoch) throw new Error("checkpoint epoch mismatch");
    // Rekomputasi atas pohon tentatif (leaves + leaf(r), receipts + r) — belum ada mutasi.
    const tentativeRoot = await merkleRoot([...this.tree.leaves, await leafHash(r)]);
    const tentativeCumulative = settle([...this.tree.receipts, r], this.terms).cumulativeAmount;
    if (cp.seq !== this.tree.size + 1 || cp.receiptsRoot !== tentativeRoot || cp.cumulativeAmount !== tentativeCumulative) throw new Error("checkpoint mismatch");
    if (!(await this.verify.verifyCheckpointSig(this.cfg.provider, this.channel, this.chainId, cp, b.sigProvider))) throw new Error("bad provider checkpoint signature");
    // Semua cek lolos — baru sekarang pohon disentuh, ditandatangani, dan disimpan.
    await this.tree.append(r);
    const sigClient = await signCheckpoint(this.o.account, this.channel, this.chainId, cp);
    this.checkpoints.set(cp.seq, { cp, sigProvider: b.sigProvider, sigClient });
    this.pendingAck = { seq: cp.seq, signature: sigClient };
    return r;
  }

  async finalAck(): Promise<void> {
    if (this.anchored || !this.pendingAck) return;
    const res = await fetch(`${this.o.providerUrl}/ack`, { method: "POST", headers: this.hdr(), body: JSON.stringify(this.pendingAck) });
    if (res.status !== 200) throw new Error(`POST /ack ${res.status}`);
    this.pendingAck = undefined;
  }

  async closeCooperative(): Promise<void> {
    // M1 (final-fix brief): flush ack tertunda LEBIH DULU — tanpa ini, provider bisa saja belum menerima
    // tanda tangan klien atas checkpoint TERTINGGI (`pendingAck`, diisi `requestUnit()` tapi baru
    // dikirim `POST /ack` oleh `finalAck()`), dan gating `/close` di server (`countersign()`) jatuh balik
    // ke seq TERTINGGI YANG SUDAH TER-ACK (n-1) alih-alih n — klien kehilangan pembayaran unit terakhir
    // padahal tanda tangannya sendiri sudah ada, hanya belum sempat dikirim.
    await this.finalAck();
    const seq = this.tree.size;
    const toProvider = settle(this.tree.receipts, this.terms).cumulativeAmount;
    const msg = { epoch: this.epoch, seq, toProvider };
    const sigClient = await signClose(this.o.account, this.channel, this.chainId, msg);
    const res = await fetch(`${this.o.providerUrl}/close`, { method: "POST", headers: this.hdr(), body: JSON.stringify({ seq, toProvider: toProvider.toString(), sigClient }) });
    if (res.status !== 200) throw new Error(`POST /close ${res.status}: ${await res.text()}`);
    const b = (await res.json()) as any;
    if (Number(b.epoch) !== this.epoch || Number(b.seq) !== seq || bi(b.toProvider) !== toProvider) throw new Error("close reply mismatch");
    if (!(await this.verify.verifyCloseSig(this.cfg.provider, this.channel, this.chainId, msg, b.sigProvider))) throw new Error("bad provider close signature");
    this.txs.push({ label: "closeCooperative", ...(await closeCooperativeTx(this.o.ctx, this.channel, seq, toProvider, sigClient, b.sigProvider)) });
  }

  /**
   * Rollover kooperatif (FR-10): bayar epoch berjalan, sisa deposit jadi budget epoch baru, seq/R/A reset,
   * epoch++. Klien menandatangani dulu (identitas + niat), provider ikut menandatangani, klien mengirim tx,
   * lalu memberi tahu provider (`/rollover/confirm`) — sinkronisasi idempoten sisi provider.
   *
   * I1 (final-fix brief, plan-level): dulu tiket keluar seq-0 epoch BERIKUTNYA hanya datang dari
   * `/rollover/confirm`, YAITU SETELAH tx `rollover()` klien sendiri ter-mined — provider yang menahan
   * balasan confirm bisa menyandera sisa budget epoch baru tanpa batas waktu (klien sudah membayar epoch
   * lama lewat tx, tapi tidak pernah punya jalan keluar unilateral untuk epoch baru). Sekarang provider
   * WAJIB menyertakan `exitSigNext` — tiket `Checkpoint(epoch+1, 0, 0, emptyRoot)` — dalam balasan
   * `POST /rollover` itu sendiri (mode co-signed saja; lihat M5 untuk anchored), dan klien
   * MEMVERIFIKASINYA SEBELUM mem-broadcast tx `rollover()` sama sekali: tanda tangan cacat/hilang berarti
   * TIDAK ADA tx yang dikirim (`this.txs` tidak bertambah). Tiket ini aman ditandatangani di muka karena
   * INERT sampai epoch benar-benar naik on-chain — yang mensyaratkan tanda tangan Rollover provider
   * sendiri (jadi provider tetap "membayar" dengan tanda tangannya) — dan begitu hidup, ia persis tiket
   * keluar seq-0 epoch manapun yang sudah dinetralkan responder tantangan (Task 15 Watcher).
   *
   * M3: `readChannel` dibaca LEBIH DULU — bila epoch on-chain sudah `this.epoch + 1` dengan `seq === 0`
   * (rollover sudah ter-mined lebih dulu, mis. percobaan `rollover()` sebelumnya sempat mengirim tx tapi
   * terputus sebelum commit), tx TIDAK dikirim ulang (dan tidak ada tanda tangan baru diminta) — langsung
   * lanjut ke `/rollover/confirm`, yang tetap berlaku sebagai fallback sumber tiket keluar untuk kasus ini
   * (lihat M5: fallback ini tidak berlaku di anchored).
   *
   * Setelah `rolloverTx` masuk, epoch SUDAH naik on-chain — tidak bisa dibatalkan lagi. `/rollover/confirm`
   * di sisi provider idempoten dan tidak butuh tanda tangan (murni turunan state on-chain, lihat
   * `provider/server.ts`), jadi confirm+verifikasi di bawah aman dicoba ulang (budget waktu, bukan lagi
   * hitungan tetap — lihat `ROLLOVER_CONFIRM_MS`/`ROLLOVER_CONFIRM_EVERY_MS` di atas) bila balasannya gagal
   * transien (koneksi putus, RPC publik yang basi, dst.) — tidak ada risiko provider mereset sesi dua kali.
   * `this.epoch`/`this.tree`/`this.checkpoints`/`this.pendingAck` BARU di-commit sebagai satu blok SETELAH
   * tiket keluar epoch baru terverifikasi: bila semua percobaan retry habis, method ini melempar dan state
   * klien persis seperti sebelum confirm dipanggil. Pemanggil boleh memanggil `rollover()` lagi dengan
   * aman — tx rollover tidak dikirim ulang di sini (sudah tercatat di `this.txs`); percobaan berikutnya
   * akan gagal di `/rollover` (checkpoint-not-acked) bila `seq`/`toProvider` sudah berubah, tapi
   * `/rollover/confirm` sendiri cukup dipanggil ulang untuk kasus umum (balasan pertama yang tidak pernah
   * sampai ke klien).
   */
  async rollover(): Promise<void> {
    // M1: flush ack tertunda LEBIH DULU — sama seperti closeCooperative(), provider baru mau
    // menandatangani Rollover di seq TERTINGGI bila sudah menerima ack klien atas checkpoint itu.
    await this.finalAck();

    // M3: someone else's rollover tx may already be mined (retried call, dsb.) — jangan kirim tx/minta
    // tanda tangan baru lagi bila begitu; langsung ke confirm/verify di bawah.
    const pre = await readChannel(this.o.ctx, this.channel);
    let exitSigNext: Hex | undefined;
    if (!(pre.epoch === this.epoch + 1 && pre.seq === 0)) {
      const seq = this.tree.size;
      const toProvider = settle(this.tree.receipts, this.terms).cumulativeAmount;
      const msg = { epoch: this.epoch, seq, toProvider };
      const sigClient = await signRollover(this.o.account, this.channel, this.chainId, msg);
      const res = await fetch(`${this.o.providerUrl}/rollover`, { method: "POST", headers: this.hdr(), body: JSON.stringify({ seq, toProvider: toProvider.toString(), sigClient }) });
      if (res.status !== 200) throw new Error(`POST /rollover ${res.status}: ${await res.text()}`);
      const b = (await res.json()) as any;
      if (Number(b.epoch) !== this.epoch || Number(b.seq) !== seq || bi(b.toProvider) !== toProvider) throw new Error("rollover reply mismatch");
      if (!(await this.verify.verifyRolloverSig(this.cfg.provider, this.channel, this.chainId, msg, b.sigProvider))) throw new Error("bad provider rollover signature");
      if (!this.anchored) {
        // I1: tiket epoch berikutnya WAJIB ada dan sah SEBELUM tx dikirim (lihat dokumentasi method di atas).
        const cp0Next: Checkpoint = { epoch: this.epoch + 1, seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
        if (!b.exitSigNext || !(await this.verify.verifyCheckpointSig(this.cfg.provider, this.channel, this.chainId, cp0Next, b.exitSigNext)))
          throw new Error("bad provider exit ticket for next epoch");
        exitSigNext = b.exitSigNext as Hex;
      }
      this.txs.push({ label: "rollover", ...(await rolloverTx(this.o.ctx, this.channel, seq, toProvider, sigClient, b.sigProvider)) });
    }

    // RPC publik 46630 ber-load-balancer: eth_call tepat setelah tx bisa mengenai node yang belum
    // menerapkan block terbaru, jadi readChannel() di bawah bisa membaca epoch basi (stale
    // read-after-write) — dan provider sendiri re-read chain di TIAP panggilan /rollover/confirm (409
    // rollover-not-onchain bila basi di sisinya), jadi budget retry ini menutupi basi di kedua sisi.
    let lastErr: unknown;
    const t0 = Date.now();
    for (;;) {
      try {
        const confirm = await fetch(`${this.o.providerUrl}/rollover/confirm`, { method: "POST", headers: this.hdr() });
        if (confirm.status !== 200) throw new Error(`POST /rollover/confirm ${confirm.status}: ${await confirm.text()}`);
        const cb = (await confirm.json()) as any;
        const onchain = await readChannel(this.o.ctx, this.channel);
        if (onchain.epoch !== this.epoch + 1 || Number(cb.epoch) !== onchain.epoch) throw new Error("epoch mismatch after rollover");
        // M5: anchored tidak punya tiket co-signed sama sekali (exit unilateral = startClose() langsung).
        let finalExitSig: Hex | undefined;
        if (!this.anchored) {
          // I1: pakai tiket yang SUDAH terverifikasi di atas bila ada ("prefers the pre-signed one") —
          // confirm hanya dipakai sebagai fallback sumber tiket untuk jalur skip-tx M3 (di mana tidak
          // ada `exitSigNext` dari langkah /rollover, karena langkah itu tidak pernah dipanggil).
          if (exitSigNext) {
            finalExitSig = exitSigNext;
          } else {
            const cp0: Checkpoint = { epoch: onchain.epoch, seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
            if (!(await this.verify.verifyCheckpointSig(this.cfg.provider, this.channel, this.chainId, cp0, cb.exitSig))) throw new Error("bad provider exit ticket (new epoch)");
            finalExitSig = cb.exitSig as Hex;
          }
        }
        // Tiket keluar epoch baru terverifikasi (atau tidak relevan, anchored) — baru sekarang commit, sebagai satu blok.
        this.epoch = onchain.epoch; this.exitSigProvider = finalExitSig;
        this.tree.reset(); this.checkpoints.clear(); this.pendingAck = undefined;
        return;
      } catch (e) {
        lastErr = e;
        if (Date.now() - t0 >= ROLLOVER_CONFIRM_MS) break;
        await new Promise((r) => setTimeout(r, ROLLOVER_CONFIRM_EVERY_MS));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /** Unilateral: anchored → `startClose()` (state on-chain sudah otoritatif); co-signed → checkpoint TERTINGGI yang dipegang. Lalu bukti penalti bila ada (§6.4). */
  async dispute(): Promise<{ payToClient: bigint }> {
    if (this.anchored) {
      const view = await readChannel(this.o.ctx, this.channel);
      // M2 (final-fix brief): cek desync SEBELUM mengirim tx apa pun — dulu urutan ini terbalik (cek
      // dilakukan setelah startClose() dikirim untuk state OPEN), jadi klien yang pohon lokalnya sudah
      // tidak sinkron dengan chain tetap membayar gas untuk startClose() yang toh akan diikuti throw di
      // bawah. Minor 6: pohon lokal harus persis mencerminkan seq on-chain sebelum membangun bukti — bila
      // tidak, input sirkuit (dibangun dari this.tree.receipts) tidak akan cocok dengan receiptsRoot on-chain.
      if (view.seq !== this.tree.size) throw new Error(`tree desynced from chain (seq ${view.seq}) — reconcile acks first`);
      // Review round 1 (IMPORTANT): channel bisa sudah CLOSING karena pihak lain (mis. provider) lebih
      // dulu memanggil startClose() — dispute() tetap harus bisa lanjut ke bukti tanpa memanggil
      // startClose() lagi (yang akan revert WrongState di kontrak).
      if (view.state === "OPEN") {
        this.txs.push({ label: "startClose", ...(await startCloseTx(this.o.ctx, this.channel)) });
      } else if (view.state === "CLOSING") {
        // sudah dibuka pihak lain — lanjut langsung ke bukti di bawah.
      } else {
        throw new Error(`cannot dispute in state ${view.state}`);
      }
    } else {
      if (this.checkpoints.size === 0) throw new Error("no co-signed checkpoint");
      // Kunci tertinggi di `checkpoints`, bukan `tree.size` — keduanya sama berkat invarian requestUnit(),
      // tetapi jalur keluar tidak boleh bergantung pada pohon yang mungkin tidak sinkron.
      const seq = Math.max(...this.checkpoints.keys());
      const cs = this.checkpoints.get(seq)!;
      this.txs.push({ label: "submitCheckpoint", ...(await submitCheckpointTx(this.o.ctx, this.channel, cs.cp, cs.sigClient, cs.sigProvider)) });
    }
    const s = settle(this.tree.receipts, this.terms);
    if (s.payToClient > 0n) {
      const input = await buildCircuitInput(this.channel, this.terms, this.tree.receipts);
      const { proof, publicSignals, provingMs } = await prove(input, this.o.artifacts.wasm, this.o.artifacts.zkey);
      this.provingMs = provingMs;
      this.txs.push({ label: "claimPenalty", ...(await claimPenaltyTx(this.o.ctx, this.channel, await toCalldata(proof, publicSignals))) });
    }
    return { payToClient: s.payToClient };
  }

  /**
   * Keluar unilateral di seq 0 (§6.2/T-exit0): jika provider menghilang sebelum unit pertama pernah
   * dilayani, tidak ada checkpoint co-signed apa pun untuk didisputekan. Tiket keluar yang sudah
   * ditandatangani provider di muka (diverifikasi di start(), sebelum dana dikirim) mengizinkan
   * klien membuka channel-nya sendiri (permissionless via factory, dengan tanda tangan provider yang
   * sudah dimiliki) lalu men-submit Checkpoint(0,0,merkleRoot([])) co-signed — settle() sesudah jendela
   * tantangan lalu mengembalikan seluruh deposit ke klien.
   */
  async exitUnilateral(): Promise<void> {
    // Guard (Task 14 fix round 2): sekali ada checkpoint co-signed (unit terkonsumsi), tiket keluar
    // seq-0 tidak lagi boleh dipakai — itu hanya memperluas balapan checkpoint basi yang sudah ada
    // (klien bisa submit checkpoint k lama mana pun selagi OPEN) ke k=0. Mitigasi sebenarnya adalah
    // provider menjalankan challenge responder (Task 15 Watcher) yang meng-counter dengan
    // latestCoSigned() dalam challengeWindow; di sini kita hanya menutup jalan paling mudah.
    if (this.checkpoints.size > 0)
      throw new Error("exitUnilateral: co-signed checkpoints exist — use dispute() or closeCooperative()");
    const code = await this.o.ctx.publicClient.getCode({ address: this.channel });
    if (!code || code === "0x") {
      const { hash, gasUsed } = await openChannel(this.o.ctx, this.cfg, "0x", this.providerTermsSig!);
      this.txs.push({ label: "openViaExit", hash, gasUsed });
    }
    if (this.anchored) {
      // Anchored (FR-25): state on-chain (seq/cumulativeAmount default nol sebelum ack apa pun) sudah
      // otoritatif — tidak ada tiket Checkpoint(0,0,...) terpisah untuk dibangun/ditandatangani; startClose()
      // langsung membuka jendela tantangan atas state itu (deployment channel di atas tetap wajib: `startClose()`
      // adalah panggilan kontrak, bukan tx transfer biasa).
      // Review round 1 (IMPORTANT): channel bisa sudah CLOSING (mis. provider lebih dulu memanggil
      // startClose()) — tidak ada lagi yang perlu dilakukan di sini, memanggil startClose() lagi akan revert.
      const view = await readChannel(this.o.ctx, this.channel);
      if (view.state === "OPEN") {
        this.txs.push({ label: "startClose", ...(await startCloseTx(this.o.ctx, this.channel)) });
      } else if (view.state === "CLOSING") {
        // sudah dibuka pihak lain — tidak ada yang perlu dilakukan.
      } else {
        // Task 8 Step 4b: teks error milik exitUnilateral() sendiri — sebelumnya menyalin pesan dispute()
        // (copy-paste), membingungkan pemanggil yang membaca error dari exitUnilateral().
        throw new Error(`cannot exit in state ${view.state}`);
      }
      return;
    }
    const cp0: Checkpoint = { epoch: this.epoch, seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
    const sigClient0 = await signCheckpoint(this.o.account, this.channel, this.chainId, cp0);
    this.txs.push({ label: "exitUnilateral", ...(await submitCheckpointTx(this.o.ctx, this.channel, cp0, sigClient0, this.exitSigProvider!)) });
  }

  async settle(): Promise<void> { this.txs.push({ label: "settle", ...(await settleTx(this.o.ctx, this.channel)) }); }
  view() { return readChannel(this.o.ctx, this.channel); }
}
