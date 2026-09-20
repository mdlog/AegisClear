import { getAddress, type Address, type Hex } from "viem";
import { channelAbi, factoryAbi, readChannel, type ChainCtx } from "@aegisclear/sdk";
import type { ChannelDetail, ChannelEvent, ChannelSummary } from "../shared/types.js";
import type { WebConfig } from "./config.js";

const FACTORY_KEYS = ["factory", "factoryProd", "factoryAnchored"] as const;

/** Indeks channel dari event ChannelOpened semua factory di deployment; view on-chain per channel; cache `ttlMs`. */
export class ChannelIndex {
  private cache?: { at: number; data: ChannelSummary[] };
  private readonly gas = new Map<Hex, bigint>();
  constructor(
    private readonly cfg: WebConfig, private readonly ctx: ChainCtx,
    private readonly runIdOf: (channel: Address) => string | undefined = () => undefined, private readonly ttlMs = 3000,
  ) {}
  factories(): { name: string; address: Address }[] {
    return FACTORY_KEYS.flatMap((k) => (this.cfg.deployment[k] ? [{ name: k, address: this.cfg.deployment[k]! }] : []));
  }
  async list(force = false): Promise<ChannelSummary[]> {
    if (!force && this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.data;
    const out: ChannelSummary[] = [];
    for (const f of this.factories()) {
      const logs = await this.ctx.publicClient.getContractEvents({ address: f.address, abi: factoryAbi, eventName: "ChannelOpened", fromBlock: this.cfg.deployBlock });
      for (const l of logs) {
        if (!l.args.channel || !l.args.client || !l.args.provider || !l.args.termsCommitment) continue;
        const channel = getAddress(l.args.channel);
        const v = await readChannel(this.ctx, channel);
        out.push({
          channel, factory: f.address, factoryName: f.name, client: getAddress(l.args.client), provider: getAddress(l.args.provider), termsCommitment: l.args.termsCommitment,
          state: v.state, seq: v.seq, cumulativeAmount: v.cumulativeAmount.toString(), budget: v.budget.toString(), deadline: v.deadline, hasProof: v.hasProof, payToClient: v.payToClient.toString(),
          openedTx: l.transactionHash, openedBlock: l.blockNumber.toString(), runId: this.runIdOf(channel),
        });
      }
    }
    out.sort((a, b) => (BigInt(b.openedBlock) > BigInt(a.openedBlock) ? 1 : BigInt(b.openedBlock) < BigInt(a.openedBlock) ? -1 : 0));
    this.cache = { at: Date.now(), data: out };
    return out;
  }
  async detail(addr: string): Promise<ChannelDetail | undefined> {
    let channel: Address;
    try { channel = getAddress(addr); } catch { return undefined; }
    const s = (await this.list()).find((c) => c.channel === channel) ?? (await this.list(true)).find((c) => c.channel === channel);
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
