import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { createProviderApp } from "../src/provider/server.js";
import { AegisClient } from "../src/client/agent.js";
import { randomNonce, defaultArtifacts, erc20Balance, type ChainCtx } from "../src/index.js";

const DEPLOY = new URL("../../contracts/deployments/local.json", import.meta.url).pathname;
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const PK = {
  provider: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex, // anvil #2
  clientA: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex,  // anvil #1
  clientB: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex,  // anvil #3
};
const art = defaultArtifacts(new URL("../..", import.meta.url).pathname);

describe.skipIf(!existsSync(DEPLOY))("integrasi Anvil: provider ↔ klien ↔ AegisChannel", () => {
  let d: { usdg: Address; factory: Address };
  let server: ReturnType<typeof serve>;
  const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
  const ctxOf = (pk: Hex): ChainCtx => ({
    publicClient, chainId: 31337, factory: d.factory,
    walletClient: createWalletClient({ account: privateKeyToAccount(pk), chain: foundry, transport: http(RPC) }),
  });
  const mkClient = (pk: Hex) => new AegisClient({ ctx: ctxOf(pk), account: privateKeyToAccount(pk), providerUrl: "http://127.0.0.1:4020", usdg: d.usdg, artifacts: art });
  const bal = (who: Address) => erc20Balance(ctxOf(PK.provider), d.usdg, who);
  const providerAddr = privateKeyToAccount(PK.provider).address;

  beforeAll(async () => {
    d = JSON.parse(readFileSync(DEPLOY, "utf8"));
    const terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
    const { app } = createProviderApp({
      ctx: ctxOf(PK.provider), account: privateKeyToAccount(PK.provider), usdg: d.usdg, terms,
      unitQty: 1n, deposit: 1_000_000n, challengeWindow: 120, responseWindow: 60,
      metrics: (seq) => ({ m1: seq === 3 ? 1200n : 300n, m2: 95n }),   // satu pelanggaran latensi di seq 3
    });
    server = serve({ fetch: app.fetch, port: 4020 });
  });
  afterAll(() => { server?.close(); });

  it("kooperatif: 10 unit → provider +200.000, sisa 800.000 kembali", async () => {
    const c = mkClient(PK.clientA); const me = privateKeyToAccount(PK.clientA).address;
    const c0 = await bal(me); const p0 = await bal(providerAddr);
    await c.start();
    for (let i = 0; i < 10; i++) await c.requestUnit();
    await c.finalAck();
    await c.closeCooperative();
    expect((await c.view()).state).toBe("SETTLED");
    expect((await bal(providerAddr)) - p0).toBe(200_000n);
    expect(c0 - (await bal(me))).toBe(200_000n);
  });

  it("sengketa: 1 pelanggaran → bukti → 190.000 / refund 810.000", async () => {
    const c = mkClient(PK.clientB); const me = privateKeyToAccount(PK.clientB).address;
    const c0 = await bal(me); const p0 = await bal(providerAddr);
    await c.start();
    for (let i = 0; i < 10; i++) await c.requestUnit();
    await c.finalAck();
    const { payToClient } = await c.dispute();
    expect(payToClient).toBe(10_000n);
    expect((await c.view()).hasProof).toBe(true);
    await publicClient.request({ method: "evm_increaseTime", params: [121] } as any);
    await publicClient.request({ method: "evm_mine", params: [] } as any);
    await c.settle();
    expect((await bal(providerAddr)) - p0).toBe(190_000n);
    expect(c0 - (await bal(me))).toBe(190_000n);
    expect(c.provingMs).toBeGreaterThan(0);
    console.table(c.txs.map((t) => ({ label: t.label, gasUsed: t.gasUsed.toString() })));
  });
});
