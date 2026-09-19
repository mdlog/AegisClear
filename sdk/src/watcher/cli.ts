/**
 * Bot settle/sweep PERMISSIONLESS — siapa pun boleh menjalankan proses ini (klien, provider, atau
 * pihak ketiga mana pun) untuk men-settle channel setelah deadline dan menyapu dana yang masuk
 * belakangan. Proses terpisah ini TIDAK memiliki akses ke co-signed checkpoint store provider (itu
 * hanya hidup di memori proses provider/`createProviderApp`), sehingga TIDAK BISA menjalankan
 * challenge responder. Seorang provider WAJIB menjalankan `startProviderWatcher(...)` (diekspor dari
 * `provider/server.ts`) di proses provider itu sendiri untuk mendapat perlindungan T1 terhadap
 * checkpoint basi (Task 15) — menjalankan CLI ini saja TIDAK cukup untuk keamanan dana provider.
 */
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Watcher } from "./watcher.js";

const RPC = process.env.RPC_URL; const FACTORY = process.env.FACTORY; const PK = process.env.PRIVATE_KEY; const CHAIN_ID_RAW = process.env.CHAIN_ID;
if (!RPC || !FACTORY || !PK || !CHAIN_ID_RAW) throw new Error("watcher: RPC_URL, FACTORY, PRIVATE_KEY, CHAIN_ID required");
const CHAIN_ID = Number(CHAIN_ID_RAW);
// FROM_BLOCK (opsional): blok deployment factory. scan() memanggil eth_getLogs(ChannelOpened) dari sini sampai latest
// tiap tick; default 0 memindai seluruh riwayat dan biasanya ditolak RPC publik (batas rentang blok / jumlah log).
const FROM_BLOCK = process.env.FROM_BLOCK ? BigInt(process.env.FROM_BLOCK) : undefined;
const chain = defineChain({ id: CHAIN_ID, name: `chain-${CHAIN_ID}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ account: privateKeyToAccount(PK as Hex), chain, transport: http(RPC) });
new Watcher({ ctx: { publicClient, walletClient, factory: FACTORY as Address, chainId: CHAIN_ID }, fromBlock: FROM_BLOCK, log: console.log, intervalMs: 10_000 }).start();
console.log(`watcher: factory ${FACTORY} on ${CHAIN_ID} from block ${FROM_BLOCK ?? 0n} (settle/sweep only — no challenge responder; run startProviderWatcher in-process for that)`);
