import { getAddress, type Address, type Hex } from "viem";
import { channelAbi, factoryAbi, readChannel, rootHex, type ChainCtx } from "@aegisclear/sdk";
import type { ChannelDetail, ChannelEvent, ChannelSummary } from "../shared/types.js";
import type { WebConfig } from "./config.js";

const FACTORY_KEYS = ["factory", "factoryProd", "factoryAnchored"] as const;

/** Indeks channel dari event ChannelOpened semua factory di deployment; view on-chain per channel; cache `ttlMs`. */
export class ChannelIndex {
  private cache?: { at: number; data: ChannelSummary[] };
  /** Dedupe pemindaian bersamaan: pemanggil `list()` yang tiba selagi satu scan berjalan menunggu promise yang sama alih-alih memicu scan on-chain kedua. */
  private pending?: Promise<ChannelSummary[]>;
  /**
   * Channel yang sudah pernah teramati SETTLED: state itu terminal, jadi `readChannel` tidak perlu
   * diulang untuknya di setiap scan berikutnya — ini yang membuat indeks tetap murah seiring jumlah
   * channel bertambah (skala), bukan O(channel) `readChannel` per scan selamanya. `runId` TETAP
   * di-re-attach dari `runIdOf` tiap kali dibaca (map itu bisa terisi belakangan setelah cache ini dibuat).
   */
  private readonly settled = new Map<Address, ChannelSummary>();
  private readonly gas = new Map<Hex, bigint>();
  constructor(
    private readonly cfg: WebConfig, private readonly ctx: ChainCtx,
    private readonly runIdOf: (channel: Address) => string | undefined = () => undefined, private readonly ttlMs = 3000,
  ) {}
  /** Buang cache: pembaca berikutnya (`list()`) akan memindai ulang on-chain. */
  invalidate(): void { this.cache = undefined; }
  factories(): { name: string; address: Address }[] {
    return FACTORY_KEYS.flatMap((k) => (this.cfg.deployment[k] ? [{ name: k, address: this.cfg.deployment[k]! }] : []));
  }
  /** Cache `ttlMs` dipakai apa adanya untuk SEMUA pembaca (termasuk `detail()` yang tidak menemukan alamatnya) — tidak ada jalur "paksa" yang melewati TTL, supaya alamat asing/typo tidak bisa memicu scan penuh di setiap panggilan (lihat `detail`). */
  async list(): Promise<ChannelSummary[]> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.data;
    if (this.pending) return this.pending;
    this.pending = this.scan().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async scan(): Promise<ChannelSummary[]> {
    // Per factory, lalu per log DALAM factory itu — dua-duanya paralel (Promise.all), bukan satu
    // readChannel sekuensial per channel seperti sebelumnya (itulah bottleneck skala indeks channel).
    const perFactory = await Promise.all(this.factories().map((f) => this.scanFactory(f)));
    const out = perFactory.flat();
    out.sort((a, b) => (BigInt(b.openedBlock) > BigInt(a.openedBlock) ? 1 : BigInt(b.openedBlock) < BigInt(a.openedBlock) ? -1 : 0));
    this.cache = { at: Date.now(), data: out };
    return out;
  }
  private async scanFactory(f: { name: string; address: Address }): Promise<ChannelSummary[]> {
    const logs = await this.ctx.publicClient.getContractEvents({ address: f.address, abi: factoryAbi, eventName: "ChannelOpened", fromBlock: this.cfg.deployBlock });
    const tasks: Promise<ChannelSummary>[] = [];
    for (const l of logs) {
      if (!l.args.channel || !l.args.client || !l.args.provider || !l.args.termsCommitment) continue;
      const channel = getAddress(l.args.channel);
      const client = getAddress(l.args.client);
      const provider = getAddress(l.args.provider);
      const termsCommitment = l.args.termsCommitment;
      const { transactionHash, blockNumber } = l;
      tasks.push((async () => {
        const cached = this.settled.get(channel);
        if (cached) return { ...cached, runId: this.runIdOf(channel) };
        const v = await readChannel(this.ctx, channel);
        const summary: ChannelSummary = {
          channel, factory: f.address, factoryName: f.name, client, provider, termsCommitment,
          state: v.state, seq: v.seq, epoch: v.epoch, cumulativeAmount: v.cumulativeAmount.toString(), receiptsRoot: rootHex(v.receiptsRoot), budget: v.budget.toString(), deadline: v.deadline, hasProof: v.hasProof, payToClient: v.payToClient.toString(),
          openedTx: transactionHash, openedBlock: blockNumber.toString(), runId: this.runIdOf(channel),
          mode: f.name === "factoryAnchored" ? "anchored" : "co-signed",
        };
        // Hanya channel yang terminal DAN kosong yang dibekukan: dana telat bisa masuk ke channel SETTLED
        // (budget() = saldo hidup) dan disapu watcher lewat sweep(); selama saldo ≠ 0, tetap dibaca ulang tiap scan.
        if (v.state === "SETTLED" && v.budget === 0n) this.settled.set(channel, summary);
        return summary;
      })());
    }
    return Promise.all(tasks);
  }
  async detail(addr: string): Promise<ChannelDetail | undefined> {
    let channel: Address;
    try { channel = getAddress(addr); } catch { return undefined; }
    const s = (await this.list()).find((c) => c.channel === channel);
    if (!s) return undefined;
    const c = await this.ctx.publicClient.readContract({ address: channel, abi: channelAbi, functionName: "cfg" });
    const cfg: ChannelDetail["cfg"] = { client: c[0], provider: c[1], token: c[2], termsCommitment: c[3], challengeWindow: c[4], responseWindow: c[5], payoutClient: c[6], payoutProvider: c[7], salt: c[8] };
    const logs = await this.ctx.publicClient.getContractEvents({ address: channel, abi: channelAbi, fromBlock: BigInt(s.openedBlock) });
    const events: ChannelEvent[] = [];
    for (const l of logs) {
      events.push({
        name: l.eventName, args: Object.fromEntries(Object.entries((l.args ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)])),
        txHash: l.transactionHash, blockNumber: l.blockNumber.toString(), gasUsed: (await this.gasUsed(l.transactionHash)).toString(),
      });
    }
    return { ...s, cfg, events };
  }
  private async gasUsed(hash: Hex): Promise<bigint> {
    const c = this.gas.get(hash);
    if (c !== undefined) return c;
    const r = await this.ctx.publicClient.getTransactionReceipt({ hash });
    this.gas.set(hash, r.gasUsed);
    return r.gasUsed;
  }
}
