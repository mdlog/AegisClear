/**
 * Bot settle/sweep PERMISSIONLESS — siapa pun boleh menjalankan proses ini (klien, provider, atau
 * pihak ketiga mana pun) untuk men-settle channel setelah deadline dan menyapu dana yang masuk
 * belakangan. Proses terpisah ini TIDAK memiliki akses ke co-signed checkpoint store provider (itu
 * hanya hidup di memori proses provider/`createProviderApp`), sehingga TIDAK BISA menjalankan
 * challenge responder. Seorang provider WAJIB menjalankan `startProviderWatcher(...)` (diekspor dari
 * `provider/server.ts`) di proses provider itu sendiri untuk mendapat perlindungan T1 terhadap
 * checkpoint basi (Task 15) — menjalankan CLI ini saja TIDAK cukup untuk keamanan dana provider.
 *
 * Task 8 Step 4: parsing env dipindah ke `./env.js` (`parseWatcherEnv`, murni — tanpa efek samping)
 * supaya bisa diuji (`sdk/test/cli.test.ts`) tanpa proses/RPC. `main()` di bawah hanya berjalan bila
 * file ini adalah entry point proses (`tsx sdk/src/watcher/cli.ts`) — mengimpornya (mis. dari test)
 * TIDAK lagi memvalidasi env atau menyalakan watcher sebagai efek samping.
 */
import path from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Watcher } from "./watcher.js";
import { parseWatcherEnv } from "./env.js";

function main(): void {
  let env: ReturnType<typeof parseWatcherEnv>;
  try {
    env = parseWatcherEnv(process.env);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
    return; // unreachable — keeps TS control-flow analysis happy regardless of @types/node's `never` typing
  }
  const chain = defineChain({
    id: env.chainId, name: `chain-${env.chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [env.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(env.rpcUrl) });
  const walletClient = createWalletClient({ account: privateKeyToAccount(env.privateKey), chain, transport: http(env.rpcUrl) });
  const w = new Watcher({
    ctx: { publicClient, walletClient, factory: env.factory as Address, chainId: env.chainId },
    fromBlock: env.fromBlock, log: console.log, intervalMs: 10_000,
  });
  w.start();
  process.on("SIGINT", () => { w.stop(); process.exit(0); });
  console.log(`watcher: factory ${env.factory} on ${env.chainId} from block ${env.fromBlock ?? 0n} (settle/sweep only — no challenge responder; run startProviderWatcher in-process for that)`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}
