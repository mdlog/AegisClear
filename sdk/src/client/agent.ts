import type { Address, Hex, PrivateKeyAccount } from "viem";
import { type Terms, type Receipt, ReceiptTree, settle, buildCircuitInput, commitTerms, merkleRoot, leafHash } from "../core/index.js";
import {
  type ChannelConfig, type Checkpoint, type TypedDataVerifier, signCheckpoint, signChannelTerms, signClose, rootHex,
  makeTypedDataVerifier,
} from "../core/typedData.js";
import {
  type ChainCtx, erc20Transfer, predictChannel, openChannel, submitCheckpointTx, claimPenaltyTx, settleTx,
  closeCooperativeTx, readChannel,
} from "../chain/channel.js";
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

export class AegisClient {
  cfg!: ChannelConfig; channel!: Address; terms!: Terms; deposit = 0n;
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

  /** GET /job → 402 → verifikasi cfg/payTo/sigProvider(ChannelTerms) (T19) → danai → siapkan tanda tangan ChannelTerms */
  async start(): Promise<void> {
    const res = await fetch(`${this.o.providerUrl}/job`, { headers: this.hdr() });
    if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
    const offer = ((await res.json()) as any).accepts[0];
    const a = offer.extra.aegis;
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
    const cp0: Checkpoint = { seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
    if (!(await this.verify.verifyCheckpointSig(cfg.provider, predicted, this.chainId, cp0, a.exitSig))) throw new Error("bad provider exit ticket (seq-0)");
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
    this.providerTermsSig = a.sigProvider as Hex; this.exitSigProvider = a.exitSig as Hex;
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
    const cp: Checkpoint = { seq: Number(b.checkpoint.seq), cumulativeAmount: bi(b.checkpoint.cumulativeAmount), receiptsRoot: bi(b.checkpoint.receiptsRoot) };
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
    if (!this.pendingAck) return;
    const res = await fetch(`${this.o.providerUrl}/ack`, { method: "POST", headers: this.hdr(), body: JSON.stringify(this.pendingAck) });
    if (res.status !== 200) throw new Error(`POST /ack ${res.status}`);
    this.pendingAck = undefined;
  }

  async closeCooperative(): Promise<void> {
    const seq = this.tree.size;
    const res = await fetch(`${this.o.providerUrl}/close`, { method: "POST", headers: this.hdr(), body: JSON.stringify({ seq }) });
    if (res.status !== 200) throw new Error(`POST /close ${res.status}: ${await res.text()}`);
    const b = (await res.json()) as any;
    const toProvider = bi(b.toProvider);
    if (toProvider !== settle(this.tree.receipts, this.terms).cumulativeAmount) throw new Error("close amount mismatch");
    if (!(await this.verify.verifyCloseSig(this.cfg.provider, this.channel, this.chainId, { seq, toProvider }, b.sigProvider))) throw new Error("bad provider close signature");
    const sigClient = await signClose(this.o.account, this.channel, this.chainId, { seq, toProvider });
    this.txs.push({ label: "closeCooperative", ...(await closeCooperativeTx(this.o.ctx, this.channel, seq, toProvider, sigClient, b.sigProvider)) });
  }

  /** Unilateral: checkpoint co-signed TERTINGGI yang dipegang, lalu bukti penalti bila ada (§6.4) */
  async dispute(): Promise<{ payToClient: bigint }> {
    if (this.checkpoints.size === 0) throw new Error("no co-signed checkpoint");
    // Kunci tertinggi di `checkpoints`, bukan `tree.size` — keduanya sama berkat invarian requestUnit(),
    // tetapi jalur keluar tidak boleh bergantung pada pohon yang mungkin tidak sinkron.
    const seq = Math.max(...this.checkpoints.keys());
    const cs = this.checkpoints.get(seq)!;
    this.txs.push({ label: "submitCheckpoint", ...(await submitCheckpointTx(this.o.ctx, this.channel, cs.cp, cs.sigClient, cs.sigProvider)) });
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
    const cp0: Checkpoint = { seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
    const sigClient0 = await signCheckpoint(this.o.account, this.channel, this.chainId, cp0);
    this.txs.push({ label: "exitUnilateral", ...(await submitCheckpointTx(this.o.ctx, this.channel, cp0, sigClient0, this.exitSigProvider!)) });
  }

  async settle(): Promise<void> { this.txs.push({ label: "settle", ...(await settleTx(this.o.ctx, this.channel)) }); }
  view() { return readChannel(this.o.ctx, this.channel); }
}
