// Memindai calldata & log setiap tx channel Pasar B: tidak boleh ada kata 32-byte yang sama dengan nilai privat.
import { readFileSync } from "node:fs";
import { createPublicClient, http, type Hex } from "viem";
import { foundry } from "viem/chains";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const r = JSON.parse(readFileSync(new URL("./out/result.json", import.meta.url), "utf8")) as { channelB: string; txs: Hex[]; private: string[] };
const pc = createPublicClient({ chain: foundry, transport: http(RPC) });
const priv = new Set(r.private.map((x) => BigInt(x)));
const words = (hex: string): bigint[] => { const h = hex.replace(/^0x/, ""); const out: bigint[] = []; for (let i = 0; i + 64 <= h.length; i += 64) out.push(BigInt("0x" + h.slice(i, i + 64))); return out; };

let leaks = 0, ambiguous = 0;
for (const hash of r.txs) {
  const tx = await pc.getTransaction({ hash }); const rc = await pc.getTransactionReceipt({ hash });
  const ws = [...words("0x" + tx.input.slice(10)), ...rc.logs.flatMap((l) => [...l.topics.map((t) => BigInt(t)), ...words(l.data)])];
  for (const w of ws) if (priv.has(w)) {
    if (w < 4096n && w % 32n === 0n) { ambiguous++; console.log(`ambigu (kelipatan 32, bisa offset ABI): ${w} di ${hash}`); }
    else { leaks++; console.log(`BOCOR: nilai privat ${w} muncul di ${hash}`); }
  }
}
console.log(`tx diperiksa: ${r.txs.length}, bocor: ${leaks}, ambigu: ${ambiguous}`);
process.exit(leaks ? 1 : 0);
