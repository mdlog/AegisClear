// Demo §14: Pasar A (SimpleJobEscrow, evaluator = klien, biner) vs Pasar B (AegisClear). Prasyarat: anvil + DeployLocal.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { createProviderApp, defaultArtifacts, type ChainCtx } from "@aegisclear/sdk";
import { runMarketA, runMarketB, toRows, metricsFor, privateValues, TERMS_BASE, DEPOSIT_B, type ScenarioEnv, type StepInput } from "./src/index.js";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const d = JSON.parse(readFileSync(new URL("../contracts/deployments/local.json", import.meta.url), "utf8")) as { usdg: Address; factory: Address; escrow: Address };
const PK = { provider: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex, a: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex, b: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex };
const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
const ctx = (pk: Hex): ChainCtx => ({ publicClient, chainId: 31337, factory: d.factory, walletClient: createWalletClient({ account: privateKeyToAccount(pk), chain: foundry, transport: http(RPC) }) });
const provider = privateKeyToAccount(PK.provider);
const emit = (s: StepInput) => console.log(`[${s.phase}] ${s.label}${s.txHash ? ` ${s.txHash}` : ""}${s.detail ? ` (${s.detail})` : ""}`);
const env: ScenarioEnv = {
  ctx, publicClient, d, art: defaultArtifacts(new URL("..", import.meta.url).pathname), providerUrl: "http://127.0.0.1:4031",
  providerAddress: provider.address, providerPk: PK.provider, challengeWindow: 120,
  timeTravel: async (seconds) => {
    await publicClient.request({ method: "evm_increaseTime", params: [seconds] } as any);
    await publicClient.request({ method: "evm_mine", params: [] } as any);
  },
};

async function main() {
  const { app } = createProviderApp({ ctx: ctx(PK.provider), account: provider, usdg: d.usdg, terms: TERMS_BASE, unitQty: 1n, deposit: DEPOSIT_B, challengeWindow: 120, responseWindow: 60, metrics: metricsFor });
  const server = serve({ fetch: app.fetch, port: 4031 });
  try {
    const bCoop = await runMarketB(env, PK.a, false, emit);
    const bDisp = await runMarketB(env, PK.b, true, emit);
    const aOk = await runMarketA(env, PK.a, true, emit);
    const aRej = await runMarketA(env, PK.b, false, emit);
    const table = toRows({ aOk, aRej, bCoop, bDisp });
    console.table(table.map(({ txs: _txs, ...r }) => r));
    mkdirSync(new URL("./out", import.meta.url), { recursive: true });
    // terms sesi channel B sengketa (nonce per sesi) — nilai privat yang benar-benar di-commit on-chain
    const priv = privateValues(bDisp.terms).map(String);
    writeFileSync(new URL("./out/result.json", import.meta.url), JSON.stringify({ channelB: bDisp.channel, factory: d.factory, txs: bDisp.txs.map((t) => t.hash), private: priv, table }, null, 2));
    console.log("ditulis: demo/out/result.json");
  } finally { server.close(); }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
