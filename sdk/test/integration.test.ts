import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { createProviderApp } from "../src/provider/server.js";
import { AegisClient } from "../src/client/agent.js";
import {
  randomNonce, defaultArtifacts, erc20Balance, erc20Abi, commitTerms, signChannelTerms, signCheckpoint,
  rootHex, predictChannel, merkleRoot, submitCheckpointTx, type ChainCtx, type ChannelConfig,
} from "../src/index.js";

// DEPLOY_FILE (env) diresolve relatif terhadap REPO ROOT, bukan cwd proses: `pnpm --filter
// @aegisclear/sdk test` menjalankan vitest dengan cwd = sdk/, jadi string relatif mentah (mis.
// "contracts/deployments/testnet-46630.json", seperti didokumentasikan README) akan salah resolve
// jadi sdk/contracts/... dan diam-diam bikin describe.skipIf men-skip seluruh suite tanpa error.
// path.resolve(REPO_ROOT, x) membuat x relatif selalu dari root repo, dan membiarkan x absolut tetap
// absolut (path.resolve mengabaikan REPO_ROOT begitu segmen berikutnya sudah absolut).
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DEPLOY = process.env.DEPLOY_FILE
  ? path.resolve(REPO_ROOT, process.env.DEPLOY_FILE)
  : path.join(REPO_ROOT, "contracts", "deployments", "local.json");
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);
const chain = CHAIN_ID === 31337 ? foundry : defineChain({ id: CHAIN_ID, name: "robinhood-testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const PK = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex, // anvil #0
  provider: (process.env.PK_PROVIDER ?? "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a") as Hex, // anvil #2
  clientA: (process.env.PK_CLIENT_A ?? "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as Hex,  // anvil #1
  clientB: (process.env.PK_CLIENT_B ?? "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6") as Hex,  // anvil #3
  clientC: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as Hex,  // anvil #5 — uji gating /close (lokal saja, tidak diparametrisasi PK_*)
  clientD: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as Hex,  // anvil #4 — uji tiket keluar unilateral (lokal saja, tidak diparametrisasi PK_*)
};
const art = defaultArtifacts(new URL("../..", import.meta.url).pathname);
const j = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

const DEPLOY_EXISTS = existsSync(DEPLOY);
if (!DEPLOY_EXISTS) console.warn(`integration: deploy file not found at ${DEPLOY} — suite skipped`);

describe.skipIf(!DEPLOY_EXISTS)("integrasi Anvil: provider ↔ klien ↔ AegisChannel", () => {
  let d: { usdg: Address; factory: Address };
  let server: ReturnType<typeof serve>;
  let latestCoSigned: ReturnType<typeof createProviderApp>["latestCoSigned"];
  let latestCoSignedByChannel: ReturnType<typeof createProviderApp>["latestCoSignedByChannel"];
  const publicClient = createPublicClient({ chain, transport: http(RPC) });
  const ctxOf = (pk: Hex): ChainCtx => ({
    publicClient, chainId: CHAIN_ID, factory: d.factory,
    walletClient: createWalletClient({ account: privateKeyToAccount(pk), chain, transport: http(RPC) }),
  });
  const mkClient = (pk: Hex) => new AegisClient({ ctx: ctxOf(pk), account: privateKeyToAccount(pk), providerUrl: "http://127.0.0.1:4020", usdg: d.usdg, artifacts: art });
  const bal = (who: Address) => erc20Balance(ctxOf(PK.provider), d.usdg, who);
  const providerAccount = privateKeyToAccount(PK.provider);
  const providerAddr = providerAccount.address;
  const mintUsdg = async (to: Address, amount: bigint) => {
    const hash = await ctxOf(PK.deployer).walletClient.writeContract({ address: d.usdg, abi: erc20Abi, functionName: "mint", args: [to, amount] });
    await publicClient.waitForTransactionReceipt({ hash });
  };
  /** cfg+terms sah untuk membangun tawaran 402 "jahat" langsung di test (tidak lewat createProviderApp). */
  const buildCfgAndTerms = async (clientAddr: Address) => {
    const terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
    const cfg: ChannelConfig = {
      client: clientAddr, provider: providerAddr, token: d.usdg, termsCommitment: rootHex(await commitTerms(terms)),
      challengeWindow: 120, responseWindow: 60, payoutClient: clientAddr, payoutProvider: providerAddr,
      salt: ("0x" + randomBytes(32).toString("hex")) as Hex,
    };
    return { cfg, terms };
  };

  beforeAll(async () => {
    d = JSON.parse(readFileSync(DEPLOY, "utf8"));
    // clientC/clientD tetap kunci Anvil hardcode (di luar scope PK_* Task 17) dan hanya dipakai tes
    // lokal (gating /close, tiket keluar unilateral) — mint ini memakai PK.deployer (kunci publik
    // Anvil #0), yang tidak punya ETH gas nyata di testnet; lewati di luar 31337 agar beforeAll tidak
    // gagal sebelum tes kooperatif/sengketa (clientA/clientB, PK_* asli) sempat berjalan.
    if (CHAIN_ID === 31337) {
      await mintUsdg(privateKeyToAccount(PK.clientC).address, 100_000_000n);
      await mintUsdg(privateKeyToAccount(PK.clientD).address, 100_000_000n);
    }
    const terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
    const { app, latestCoSigned: lcs, latestCoSignedByChannel: lcsByChannel } = createProviderApp({
      ctx: ctxOf(PK.provider), account: privateKeyToAccount(PK.provider), usdg: d.usdg, terms,
      unitQty: 1n, deposit: 1_000_000n, challengeWindow: 120, responseWindow: 60,
      metrics: (seq) => ({ m1: seq === 3 ? 1200n : 300n, m2: 95n }),   // satu pelanggaran latensi di seq 3
    });
    latestCoSigned = lcs;
    latestCoSignedByChannel = lcsByChannel;
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
    if (CHAIN_ID === 31337) { await publicClient.request({ method: "evm_increaseTime", params: [121] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any); }
    else await new Promise((r) => setTimeout(r, 125_000));   // jendela demo 120 s nyata di testnet
    await c.settle();
    expect((await bal(providerAddr)) - p0).toBe(190_000n);
    expect(c0 - (await bal(me))).toBe(190_000n);
    expect(c.provingMs).toBeGreaterThan(0);
    console.table(c.txs.map((t) => ({ label: t.label, gasUsed: t.gasUsed.toString() })));
  });

  it("/close menolak seq basi (0 atau tengah); hanya seq tertinggi ter-ack diterima", async () => {
    const c = mkClient(PK.clientC); const me = privateKeyToAccount(PK.clientC).address;
    const c0 = await bal(me); const p0 = await bal(providerAddr);
    await c.start();
    for (let i = 0; i < 10; i++) await c.requestUnit();
    await c.finalAck();
    // latestCoSigned (Task 15 hook): checkpoint co-signed tertinggi milik klien ini, kedua tanda tangan ada.
    const latest = latestCoSigned(me);
    expect(latest?.cp.seq).toBe(c.tree.size);
    expect(latest?.sigClient).toBeTruthy();
    expect(latest?.sigProvider).toBeTruthy();
    expect(latest?.channel).toBe(c.channel);
    // latestCoSignedByChannel (Task 15 fix round 1): fungsi ASLI (bukan stub) — sama seperti
    // latestCoSigned tapi diindeks per alamat channel; ini yang dipasang Watcher sebagai `coSigned`.
    const byChannel = latestCoSignedByChannel(c.channel);
    expect(byChannel?.cp.seq).toBe(10);
    expect(byChannel?.sigClient).toBeTruthy();
    expect(byChannel?.sigProvider).toBeTruthy();
    // Fix round 2: setelah unit terkonsumsi, tiket keluar seq-0 harus ditolak (bukan lagi jalan keluar
    // yang sah) — tidak ada tx yang terkirim akibat percobaan ini.
    const txCountBeforeExit = c.txs.length;
    await expect(c.exitUnilateral()).rejects.toThrow(/co-signed checkpoints exist/);
    expect(c.txs.length).toBe(txCountBeforeExit);
    const hdr = { "Aegis-Client": me, "content-type": "application/json" };
    const r0 = await fetch("http://127.0.0.1:4020/close", { method: "POST", headers: hdr, body: JSON.stringify({ seq: 0 }) });
    expect(r0.status).toBe(409);
    const r5 = await fetch("http://127.0.0.1:4020/close", { method: "POST", headers: hdr, body: JSON.stringify({ seq: 5 }) });
    expect(r5.status).toBe(409);
    const r10 = await fetch("http://127.0.0.1:4020/close", { method: "POST", headers: hdr, body: JSON.stringify({ seq: 10 }) });
    expect(r10.status).toBe(200);
    expect(((await r10.json()) as any).toProvider).toBe("200000");
    // jalur yang benar (seq tertinggi) tetap bisa menutup channel secara normal
    await c.closeCooperative();
    expect((await c.view()).state).toBe("SETTLED");
    expect((await bal(providerAddr)) - p0).toBe(200_000n);
    expect(c0 - (await bal(me))).toBe(200_000n);
  });

  it("T19: payTo palsu (≠ predictChannel(cfg)) ditolak oleh start(); tidak ada transfer", async () => {
    const me = privateKeyToAccount(PK.clientB).address; // sesi asli klien ini sudah SETTLED; app jahat ini terpisah/tidak menyentuhnya
    const { cfg, terms } = await buildCfgAndTerms(me);
    const fakePayTo = providerAddr; // jahat: arahkan dana ke EOA provider sendiri, bukan alamat channel CREATE2
    const sigProvider = await signChannelTerms(providerAccount, fakePayTo, CHAIN_ID, cfg); // sah, tapi ditandatangani di atas domain yang SALAH
    const evilApp = new Hono();
    evilApp.get("/job", (c) => c.json({
      x402Version: 1,
      accepts: [{ scheme: "exact", network: `eip155:${CHAIN_ID}`, asset: d.usdg, payTo: fakePayTo, maxAmountRequired: "1000000",
        extra: { aegis: { config: j(cfg), sigProvider, terms: j(terms), exitSig: "0x" } } }],
    }, 402));
    const evilServer = serve({ fetch: evilApp.fetch, port: 4023 });
    try {
      const c = new AegisClient({ ctx: ctxOf(PK.clientB), account: privateKeyToAccount(PK.clientB), providerUrl: "http://127.0.0.1:4023", usdg: d.usdg, artifacts: art });
      const before = await bal(me);
      await expect(c.start()).rejects.toThrow(/T19/);
      expect(await bal(me)).toBe(before);
    } finally { evilServer.close(); }
  });

  it("payoutClient bukan klien sendiri ditolak oleh start(); tidak ada transfer", async () => {
    const me = privateKeyToAccount(PK.clientB).address;
    const { cfg, terms } = await buildCfgAndTerms(me);
    const tamperedCfg: ChannelConfig = { ...cfg, payoutClient: providerAddr }; // jahat: sisa dana klien diarahkan ke provider
    const realPayTo = await predictChannel(ctxOf(PK.provider), tamperedCfg); // payTo tetap benar untuk cfg yang sudah ditempel ini
    const sigProvider = await signChannelTerms(providerAccount, realPayTo, CHAIN_ID, tamperedCfg);
    const evilApp = new Hono();
    evilApp.get("/job", (c) => c.json({
      x402Version: 1,
      accepts: [{ scheme: "exact", network: `eip155:${CHAIN_ID}`, asset: d.usdg, payTo: realPayTo, maxAmountRequired: "1000000",
        extra: { aegis: { config: j(tamperedCfg), sigProvider, terms: j(terms), exitSig: "0x" } } }],
    }, 402));
    const evilServer = serve({ fetch: evilApp.fetch, port: 4024 });
    try {
      const c = new AegisClient({ ctx: ctxOf(PK.clientB), account: privateKeyToAccount(PK.clientB), providerUrl: "http://127.0.0.1:4024", usdg: d.usdg, artifacts: art });
      const before = await bal(me);
      await expect(c.start()).rejects.toThrow(/payoutClient/);
      expect(await bal(me)).toBe(before);
    } finally { evilServer.close(); }
  });

  it("tiket keluar unilateral: provider mati sebelum unit 0 → deposit klien kembali penuh", async () => {
    const c = mkClient(PK.clientD); const me = privateKeyToAccount(PK.clientD).address;
    const c0 = await bal(me);
    await c.start(); // hanya danai + verifikasi tiket keluar — TIDAK ada requestUnit() (provider dianggap tidak pernah menjawab)
    await c.exitUnilateral();
    if (CHAIN_ID === 31337) { await publicClient.request({ method: "evm_increaseTime", params: [121] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any); }
    else await new Promise((r) => setTimeout(r, 125_000));   // jendela demo 120 s nyata di testnet
    await c.settle();
    expect((await c.view()).state).toBe("SETTLED");
    expect(await bal(me)).toBe(c0);
  });

  it("Task 15 fix round 1: startProviderWatcher in-process mengganti checkpoint basi klien (seq 5) dengan seq 10 co-signed asli, lalu settle membayar 200.000", async () => {
    // Sesi/provider app TERPISAH (port sendiri) agar tidak bentrok dengan sesi clientC yang sudah
    // SETTLED di test "/close menolak seq basi" di atas — akun anvil #5 yang sama boleh dipakai lagi
    // karena ini adalah `createProviderApp` (dan karenanya `sessions`) yang baru/kosong.
    await mintUsdg(privateKeyToAccount(PK.clientC).address, 100_000_000n);
    const terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
    const { app: app2, startProviderWatcher } = createProviderApp({
      ctx: ctxOf(PK.provider), account: providerAccount, usdg: d.usdg, terms,
      unitQty: 1n, deposit: 1_000_000n, challengeWindow: 60, responseWindow: 30,
      metrics: () => ({ m1: 300n, m2: 95n }),   // tanpa pelanggaran — jalur settle() tanpa bukti
    });
    const server2 = serve({ fetch: app2.fetch, port: 4026 });
    try {
      const c = new AegisClient({ ctx: ctxOf(PK.clientC), account: privateKeyToAccount(PK.clientC), providerUrl: "http://127.0.0.1:4026", usdg: d.usdg, artifacts: art });
      await c.start();
      for (let i = 0; i < 10; i++) await c.requestUnit();
      await c.finalAck();

      // Klien men-submit checkpoint co-signed miliknya SENDIRI yang BASI (seq 5) langsung on-chain —
      // melewati gating /close server (yang hanya mau menandatangani Close di seq tertinggi ter-ack).
      const cs5 = c.checkpoints.get(5)!;
      await submitCheckpointTx(ctxOf(PK.clientC), c.channel, cs5.cp, cs5.sigClient, cs5.sigProvider);
      expect((await c.view()).seq).toBe(5);

      // Watcher IN-PROCESS milik provider (startProviderWatcher, Task 15 fix round 1): coSigned =
      // latestCoSignedByChannel ASLI dari sesi provider ini (bukan stub) — inilah yang memberi T1.
      const w = startProviderWatcher({ intervalMs: 60_000 });
      try {
        const r1 = await w.tick();
        expect(r1.responded).toContain(c.channel);
        expect((await c.view()).seq).toBe(10);

        if (CHAIN_ID === 31337) { await publicClient.request({ method: "evm_increaseTime", params: [61] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any); }
        else await new Promise((r) => setTimeout(r, 65_000));   // jendela 60 s nyata di testnet (challengeWindow tes ini)
        const p0 = await bal(providerAddr);
        const r2 = await w.tick();
        expect(r2.settled).toContain(c.channel);
        expect((await c.view()).state).toBe("SETTLED");
        expect((await bal(providerAddr)) - p0).toBe(200_000n);
      } finally {
        w.stop();
      }
    } finally {
      server2.close();
    }
  });
});
