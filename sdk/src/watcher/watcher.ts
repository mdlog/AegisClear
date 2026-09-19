import type { Address, Hex } from "viem";
import { factoryAbi } from "../chain/abi.js";
import { type ChainCtx, readChannel, settleTx, sweepTx, submitCheckpointTx } from "../chain/channel.js";
import type { Checkpoint } from "../core/typedData.js";

export interface WatcherOptions {
  ctx: ChainCtx;
  fromBlock?: bigint;
  intervalMs?: number;
  log?: (s: string) => void;
  /**
   * Challenge responder (fund safety provider, Task 15): lookup provider atas co-signed checkpoint
   * TERTINGGI miliknya untuk sebuah channel (mis. `latestCoSignedByChannel` dari `createProviderApp`).
   * Bila checkpoint on-chain (CLOSING) lebih basi dari ini dan window respons belum lewat, tick()
   * meng-counter-submit checkpoint ini — inilah yang membuat provider aman dari checkpoint basi klien
   * (termasuk tiket keluar seq-0 dari Task 14).
   */
  coSigned?: (channel: Address) => { cp: Checkpoint; sigClient: Hex; sigProvider: Hex } | undefined;
}

/** Mengindeks ChannelOpened; settle() setelah deadline; sweep() sisa setelah SETTLED. Permissionless — siapa pun boleh menjalankannya. */
export class Watcher {
  readonly channels = new Set<Address>();
  private timer?: NodeJS.Timeout;
  constructor(private readonly o: WatcherOptions) {}

  async scan(): Promise<void> {
    const logs = await this.o.ctx.publicClient.getContractEvents({
      address: this.o.ctx.factory, abi: factoryAbi, eventName: "ChannelOpened", fromBlock: this.o.fromBlock ?? 0n,
    });
    for (const l of logs) if (l.args.channel) this.channels.add(l.args.channel);
  }

  async tick(): Promise<{ settled: Address[]; swept: Address[]; responded: Address[] }> {
    await this.scan();
    const now = Number((await this.o.ctx.publicClient.getBlock()).timestamp);
    const settled: Address[] = [], swept: Address[] = [], responded: Address[] = [];
    for (const ch of this.channels) {
      // Satu channel yang gagal (revert, RPC error, dst.) tidak boleh menghentikan channel lain.
      try {
        const v = await readChannel(this.o.ctx, ch);
        if (v.state === "CLOSING") {
          const mine = this.o.coSigned?.(ch);
          if (mine && mine.cp.seq > v.seq && now < v.deadline) {
            await submitCheckpointTx(this.o.ctx, ch, mine.cp, mine.sigClient, mine.sigProvider);
            responded.push(ch);
            this.o.log?.(`responded ${ch} seq ${mine.cp.seq}`);
          }
          if (now >= v.deadline) { await settleTx(this.o.ctx, ch); settled.push(ch); this.o.log?.(`settled ${ch}`); }
        } else if (v.state === "SETTLED" && v.budget > 0n) {
          await sweepTx(this.o.ctx, ch); swept.push(ch); this.o.log?.(`swept ${ch}`);
        }
      } catch (e) {
        this.o.log?.(`tick error ${ch}: ${String(e)}`);
      }
    }
    return { settled, swept, responded };
  }

  start(): void { this.timer = setInterval(() => this.tick().catch((e) => this.o.log?.(String(e))), this.o.intervalMs ?? 5_000); }
  stop(): void { if (this.timer) clearInterval(this.timer); }
}
