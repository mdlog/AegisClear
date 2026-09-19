import type { Address, Hex, PrivateKeyAccount } from "viem";
import { type Terms, type Receipt, ReceiptTree, settle, buildCircuitInput, commitTerms } from "../core/index.js";
import {
  type ChannelConfig, type Checkpoint, signCheckpoint, verifyCheckpointSig, signChannelTerms, verifyChannelTermsSig,
  signClose, verifyCloseSig, rootHex,
} from "../core/typedData.js";
import { type ChainCtx, erc20Transfer, submitCheckpointTx, claimPenaltyTx, settleTx, closeCooperativeTx, readChannel } from "../chain/channel.js";
import { prove, toCalldata, type Artifacts } from "../core/prover.js";

export interface ClientOptions {
  ctx: ChainCtx; account: PrivateKeyAccount; providerUrl: string; usdg: Address; artifacts: Artifacts;
  /** kebijakan ack: false = tolak unit (tidak dibayar). Default: terima semua metrik yang provider laporkan. */
  accept?: (r: Receipt) => boolean;
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

  constructor(private readonly o: ClientOptions) {}
  private hdr(extra: Record<string, string> = {}) {
    return { "Aegis-Client": this.o.account.address, "content-type": "application/json", ...extra };
  }
  private get chainId() { return this.o.ctx.chainId; }

  /** GET /job → 402 → verifikasi sigProvider(ChannelTerms) (T19) → danai → siapkan tanda tangan ChannelTerms */
  async start(): Promise<void> {
    const res = await fetch(`${this.o.providerUrl}/job`, { headers: this.hdr() });
    if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
    const offer = ((await res.json()) as any).accepts[0];
    const a = offer.extra.aegis;
    const cfg: ChannelConfig = { ...a.config, challengeWindow: Number(a.config.challengeWindow), responseWindow: Number(a.config.responseWindow) };
    if (cfg.client.toLowerCase() !== this.o.account.address.toLowerCase()) throw new Error("config.client mismatch");
    if (cfg.token.toLowerCase() !== this.o.usdg.toLowerCase()) throw new Error("config.token mismatch");
    const terms: Terms = { unitPrice: bi(a.terms.unitPrice), maxM1: bi(a.terms.maxM1), minM2: bi(a.terms.minM2), penaltyBps: bi(a.terms.penaltyBps), capBps: bi(a.terms.capBps), nonce: bi(a.terms.nonce) };
    if (rootHex(await commitTerms(terms)) !== cfg.termsCommitment) throw new Error("termsCommitment mismatch");
    const predicted = offer.payTo as Address;
    if (!(await verifyChannelTermsSig(cfg.provider, predicted, this.chainId, cfg, a.sigProvider))) throw new Error("bad provider terms signature (T19)");
    this.cfg = cfg; this.channel = predicted; this.terms = terms; this.deposit = bi(offer.maxAmountRequired);
    // MVP: transfer langsung ke alamat channel. Rel x402/Permit2 menghasilkan efek identik (Task 11).
    this.txs.push({ label: "fund", ...(await erc20Transfer(this.o.ctx, this.o.usdg, predicted, this.deposit)) });
    this.termsSig = await signChannelTerms(this.o.account, predicted, this.chainId, cfg);
  }

  /** POST /job dengan ack sebelumnya; verifikasi receipt, root, jumlah, tanda tangan provider; tanda tangani checkpoint baru */
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
    if (this.o.accept && !this.o.accept(r)) throw new Error(`receipt ${r.seq} rejected by policy`);
    await this.tree.append(r);
    const cp: Checkpoint = { seq: Number(b.checkpoint.seq), cumulativeAmount: bi(b.checkpoint.cumulativeAmount), receiptsRoot: bi(b.checkpoint.receiptsRoot) };
    const local = settle(this.tree.receipts, this.terms);
    if (cp.seq !== this.tree.size || cp.receiptsRoot !== (await this.tree.root()) || cp.cumulativeAmount !== local.cumulativeAmount) throw new Error("checkpoint mismatch");
    if (!(await verifyCheckpointSig(this.cfg.provider, this.channel, this.chainId, cp, b.sigProvider))) throw new Error("bad provider checkpoint signature");
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
    if (!(await verifyCloseSig(this.cfg.provider, this.channel, this.chainId, { seq, toProvider }, b.sigProvider))) throw new Error("bad provider close signature");
    const sigClient = await signClose(this.o.account, this.channel, this.chainId, { seq, toProvider });
    this.txs.push({ label: "closeCooperative", ...(await closeCooperativeTx(this.o.ctx, this.channel, seq, toProvider, sigClient, b.sigProvider)) });
  }

  /** Unilateral: checkpoint co-signed terakhir, lalu bukti penalti bila ada (§6.4) */
  async dispute(): Promise<{ payToClient: bigint }> {
    const seq = this.tree.size;
    const cs = this.checkpoints.get(seq);
    if (!cs) throw new Error("no co-signed checkpoint");
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

  async settle(): Promise<void> { this.txs.push({ label: "settle", ...(await settleTx(this.o.ctx, this.channel)) }); }
  view() { return readChannel(this.o.ctx, this.channel); }
}
