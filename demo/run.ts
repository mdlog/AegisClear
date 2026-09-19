// Demo §14: Pasar A (SimpleJobEscrow, evaluator = klien, biner) vs Pasar B (AegisClear). Prasyarat: anvil + DeployLocal.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { createProviderApp, AegisClient, randomNonce, defaultArtifacts, erc20Balance, settle, type ChainCtx, type Terms } from "@aegisclear/sdk";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const d = JSON.parse(readFileSync(new URL("../contracts/deployments/local.json", import.meta.url), "utf8")) as { usdg: Address; factory: Address; escrow: Address };
const PK = { provider: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex, a: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex, b: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex };
const BREACHES = new Set([3, 17, 29, 44, 58, 71, 90]);           // EX1
const TERMS: Terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
const ctx = (pk: Hex): ChainCtx => ({ publicClient, chainId: 31337, factory: d.factory, walletClient: createWalletClient({ account: privateKeyToAccount(pk), chain: foundry, transport: http(RPC) }) });
const art = defaultArtifacts(new URL("..", import.meta.url).pathname);
const escrowAbi = parseAbi(["function nextId() view returns (uint256)", "function createJob(address provider, address evaluator, string description) returns (uint256)", "function fund(uint256 id, uint256 amount)", "function submit(uint256 id, bytes32 d)", "function complete(uint256 id, bytes32 r)", "function reject(uint256 id, bytes32 r)", "function approve(address,uint256) returns (bool)"]);
const provider = privateKeyToAccount(PK.provider);
const gas = async (hash: Hex) => (await publicClient.waitForTransactionReceipt({ hash })).gasUsed;

async function marketB(pk: Hex, dispute: boolean) {
  const c = new AegisClient({ ctx: ctx(pk), account: privateKeyToAccount(pk), providerUrl: "http://127.0.0.1:4031", usdg: d.usdg, artifacts: art });
  const me = privateKeyToAccount(pk).address; const c0 = await erc20Balance(ctx(pk), d.usdg, me); const p0 = await erc20Balance(ctx(pk), d.usdg, provider.address);
  await c.start();
  for (let i = 0; i < 100; i++) await c.requestUnit();
  await c.finalAck();
  if (dispute) {
    await c.dispute();
    await publicClient.request({ method: "evm_increaseTime", params: [121] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any);
    await c.settle();
  } else await c.closeCooperative();
  const gasTotal = c.txs.reduce((s, t) => s + t.gasUsed, 0n);
  return { channel: c.channel, txs: c.txs, gasTotal, provingMs: c.provingMs, clientDelta: c0 - (await erc20Balance(ctx(pk), d.usdg, me)), providerDelta: (await erc20Balance(ctx(pk), d.usdg, provider.address)) - p0, local: settle(c.tree.receipts, c.terms) };
}

async function marketA(pk: Hex, accept: boolean) {
  const w = ctx(pk).walletClient; const me = privateKeyToAccount(pk).address; let g = 0n;
  g += await gas(await w.writeContract({ address: d.usdg, abi: escrowAbi, functionName: "approve", args: [d.escrow, 2_000_000n] }));
  const desc = "100 units @ 0.02 USDG; maxLatency 800ms; minQuality 90; penalty 50%; cap 30%";  // syarat bocor di calldata
  const id = await publicClient.readContract({ address: d.escrow, abi: escrowAbi, functionName: "nextId" });   // id job yang akan dibuat
  g += await gas(await w.writeContract({ address: d.escrow, abi: escrowAbi, functionName: "createJob", args: [provider.address, me, desc] }));
  g += await gas(await w.writeContract({ address: d.escrow, abi: escrowAbi, functionName: "fund", args: [id, 2_000_000n] }));
  g += await gas(await ctx(PK.provider).walletClient.writeContract({ address: d.escrow, abi: escrowAbi, functionName: "submit", args: [id, ("0x" + "1".padStart(64, "0")) as Hex] }));
  g += await gas(await w.writeContract({ address: d.escrow, abi: escrowAbi, functionName: accept ? "complete" : "reject", args: [id, ("0x" + "0".padStart(64, "0")) as Hex] }));
  return { gasTotal: g, result: accept ? "0 / 2.00" : "2.00 / 0" };
}

async function main() {
  const { app } = createProviderApp({ ctx: ctx(PK.provider), account: provider, usdg: d.usdg, terms: TERMS, unitQty: 1n, deposit: 5_000_000n, challengeWindow: 120, responseWindow: 60, metrics: (seq) => ({ m1: BREACHES.has(seq) ? 1200n : 300n, m2: 95n }) });
  const server = serve({ fetch: app.fetch, port: 4031 });
  try {
    const bCoop = await marketB(PK.a, false);
    const bDisp = await marketB(PK.b, true);
    const aOk = await marketA(PK.a, true);
    const aRej = await marketA(PK.b, false);
    const fmt = (x: bigint) => (Number(x) / 1e6).toFixed(2);
    const table = [
      { pasar: "A: evaluator biner (complete)", klien_provider: aOk.result, penentu: "alamat evaluator", terlihat: "harga, ambang, penalti (string)", gas: aOk.gasTotal.toString(), proving_ms: "-" },
      { pasar: "A: evaluator biner (reject)", klien_provider: aRej.result, penentu: "alamat evaluator", terlihat: "harga, ambang, penalti (string)", gas: aRej.gasTotal.toString(), proving_ms: "-" },
      { pasar: "B: AegisClear kooperatif", klien_provider: `${fmt(0n)} / ${fmt(bCoop.providerDelta)}`, penentu: "dua tanda tangan", terlihat: "T, R, jumlah", gas: bCoop.gasTotal.toString(), proving_ms: "-" },
      { pasar: "B: AegisClear sengketa (bukti)", klien_provider: `${fmt(bDisp.local.payToClient)} / ${fmt(bDisp.providerDelta)}`, penentu: "bukti Groth16", terlihat: "T, R, jumlah, payToClient", gas: bDisp.gasTotal.toString(), proving_ms: String(bDisp.provingMs) },
    ];
    console.table(table);
    mkdirSync(new URL("./out", import.meta.url), { recursive: true });
    const priv = [TERMS.unitPrice, TERMS.maxM1, TERMS.minM2, TERMS.penaltyBps, TERMS.capBps, TERMS.nonce, 1200n, 300n, 95n].map(String);
    writeFileSync(new URL("./out/result.json", import.meta.url), JSON.stringify({ channelB: bDisp.channel, txs: bDisp.txs.map((t) => t.hash), private: priv, table }, null, 2));
    console.log("ditulis: demo/out/result.json");
  } finally { server.close(); }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
