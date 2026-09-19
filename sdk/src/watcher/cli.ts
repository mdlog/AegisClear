import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Watcher } from "./watcher.js";

const RPC = process.env.RPC_URL!; const FACTORY = process.env.FACTORY as Address; const PK = process.env.PRIVATE_KEY as Hex; const CHAIN_ID = Number(process.env.CHAIN_ID ?? 46630);
const chain = defineChain({ id: CHAIN_ID, name: `chain-${CHAIN_ID}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ account: privateKeyToAccount(PK), chain, transport: http(RPC) });
new Watcher({ ctx: { publicClient, walletClient, factory: FACTORY, chainId: CHAIN_ID }, log: console.log, intervalMs: 10_000 }).start();
console.log(`watcher: factory ${FACTORY} on ${CHAIN_ID}`);
