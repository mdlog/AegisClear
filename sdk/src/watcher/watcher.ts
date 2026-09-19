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
   * Bila checkpoint on-chain (CLOSING) lebih basi dari ini, tick() meng-counter-submit checkpoint ini
   * — inilah yang membuat provider aman dari checkpoint basi klien (termasuk tiket keluar seq-0 dari
   * Task 14). Respons dikirim TANPA memandang `deadline`: `AegisChannel.submitCheckpoint` menerima seq
   * lebih tinggi di CLOSING sampai `settle()` benar-benar dipanggil (tidak ada cek deadline di sana),
   * jadi selama belum ada yang men-settle, respons yang "terlambat" tetap sah dan tetap menang.
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
    // scan() gagal (mis. RPC turun sesaat) tidak boleh menghentikan tick sepenuhnya — channel yang
    // sudah dikenal dari scan sebelumnya tetap diproses (Task 15 fix round 1).
    try {
      await this.scan();
    } catch (e) {
      this.o.log?.(`scan error: ${String(e)}`);
    }
    const now = Number((await this.o.ctx.publicClient.getBlock()).timestamp);
    const settled: Address[] = [], swept: Address[] = [], responded: Address[] = [];
    for (const ch of this.channels) {
      // Satu channel yang gagal (revert, RPC error, dst.) tidak boleh menghentikan channel lain.
      try {
        const v = await readChannel(this.o.ctx, ch);
        if (v.state === "CLOSING") {
          // Responder dulu, settle kemudian — dan JANGAN pernah men-settle state basi hanya karena
          // `now >= deadline`: kontrak masih menerima checkpoint seq lebih tinggi di CLOSING sampai
          // settle(), jadi respons wajib dikirim dulu (tanpa syarat deadline). Setelah merespons, view
          // dibaca ulang: submitCheckpoint memperpanjang deadline (≤ responseWindow), sehingga settle di
          // tick yang sama hanya terjadi bila deadline HASIL BACA ULANG pun sudah lewat. Bila respons
          // gagal (throw), settle dilewati untuk channel ini di tick ini — dicoba lagi tick berikutnya,
          // karena men-settle state basi adalah hasil terburuk bagi pemegang checkpoint yang lebih baru.
          const mine = this.o.coSigned?.(ch);
          let view = v;
          if (mine && mine.cp.seq > v.seq) {
            await submitCheckpointTx(this.o.ctx, ch, mine.cp, mine.sigClient, mine.sigProvider);
            responded.push(ch);
            this.o.log?.(`responded ${ch} seq ${mine.cp.seq}`);
            view = await readChannel(this.o.ctx, ch);
          }
          if (view.state === "CLOSING" && now >= view.deadline) { await settleTx(this.o.ctx, ch); settled.push(ch); this.o.log?.(`settled ${ch}`); }
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
