// Memindai calldata & log setiap tx channel Pasar B: tidak boleh ada kata 32-byte yang sama dengan nilai privat (FR-19/G2).
import type { Address, Hex, PublicClient } from "viem";
import { factoryAbi } from "@aegisclear/sdk";

export interface LeakReport { txs: Hex[]; leaks: number; ambiguous: number; details: { txHash: Hex; word: string; kind: "leak" | "ambiguous" }[] }

const words = (hex: string): bigint[] => {
  const h = hex.replace(/^0x/, ""); const out: bigint[] = [];
  for (let i = 0; i + 64 <= h.length; i += 64) out.push(BigInt("0x" + h.slice(i, i + 64)));
  return out;
};

/**
 * `txs` = tx klien (AegisClient.txs). Tx `factory.open(...)` dikirim SERVER provider, bukan klien, jadi
 * dicari lewat event ChannelOpened di factory dan ikut dipindai. Kata < 4096 kelipatan 32 dihitung
 * "ambigu" (bisa offset ABI), selebihnya "bocor".
 */
export async function leakCheck(pc: PublicClient, factory: Address, channel: Address, txs: Hex[], priv: bigint[], fromBlock = 0n): Promise<LeakReport> {
  const openLogs = await pc.getContractEvents({ address: factory, abi: factoryAbi, eventName: "ChannelOpened", args: { channel }, fromBlock });
  if (openLogs.length === 0) throw new Error(`tidak ada event ChannelOpened untuk channel ${channel} di factory ${factory}`);
  const all: Hex[] = [openLogs[0].transactionHash, ...txs];
  const set = new Set(priv);
  const details: LeakReport["details"] = [];
  let leaks = 0, ambiguous = 0;
  for (const hash of all) {
    const tx = await pc.getTransaction({ hash }); const rc = await pc.getTransactionReceipt({ hash });
    const ws = [...words("0x" + tx.input.slice(10)), ...rc.logs.flatMap((l) => [...l.topics.map((t) => BigInt(t)), ...words(l.data)])];
    for (const w of ws) if (set.has(w)) {
      if (w < 4096n && w % 32n === 0n) { ambiguous++; details.push({ txHash: hash, word: w.toString(), kind: "ambiguous" }); }
      else { leaks++; details.push({ txHash: hash, word: w.toString(), kind: "leak" }); }
    }
  }
  return { txs: all, leaks, ambiguous, details };
}
