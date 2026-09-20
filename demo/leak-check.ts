// Memindai calldata & log setiap tx channel Pasar B (demo/out/result.json) — lihat src/leak.ts.
import { readFileSync } from "node:fs";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { foundry } from "viem/chains";
import { leakCheck } from "./src/index.js";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const r = JSON.parse(readFileSync(new URL("./out/result.json", import.meta.url), "utf8")) as { channelB: Address; factory: Address; txs: Hex[]; private: string[] };
const pc = createPublicClient({ chain: foundry, transport: http(RPC) });
const rep = await leakCheck(pc, r.factory, r.channelB, r.txs, r.private.map((x) => BigInt(x)));
console.log(`open tx: ${rep.txs[0]}`);
for (const d of rep.details) console.log(d.kind === "leak" ? `BOCOR: nilai privat ${d.word} muncul di ${d.txHash}` : `ambigu (kelipatan 32, bisa offset ABI): ${d.word} di ${d.txHash}`);
console.log(`tx diperiksa: ${rep.txs.length}, bocor: ${rep.leaks}, ambigu: ${rep.ambiguous}`);
process.exit(rep.leaks ? 1 : 0);
