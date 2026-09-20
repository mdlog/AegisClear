import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { foundry } from "viem/chains";
import { createProviderApp } from "../src/provider/server.js";
import { AegisClient } from "../src/client/agent.js";
import {
  randomNonce, defaultArtifacts, erc20Balance, erc20Abi, erc20Transfer, commitTerms, signChannelTerms, signCheckpoint,
  signClose, signRollover, rootHex, predictChannel, merkleRoot, submitCheckpointTx, startCloseTx, routerAbi, type ChainCtx, type ChannelConfig,
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
  deployer: (process.env.PK_DEPLOYER ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as Hex, // anvil #0; di testnet: PK_DEPLOYER (faucet ETH + mint MockUSDG untuk kunci segar)
  provider: (process.env.PK_PROVIDER ?? "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a") as Hex, // anvil #2
  clientA: (process.env.PK_CLIENT_A ?? "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as Hex,  // anvil #1
  clientB: (process.env.PK_CLIENT_B ?? "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6") as Hex,  // anvil #3
  clientC: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as Hex,  // anvil #5 — uji gating /close (lokal saja, tidak diparametrisasi PK_*)
  clientD: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as Hex,  // anvil #4 — uji tiket keluar unilateral (lokal saja, tidak diparametrisasi PK_*)
};
const art = defaultArtifacts(new URL("../..", import.meta.url).pathname);
// ETH gas untuk kunci segar: 1 ETH di Anvil; 0,0005 ETH di testnet (≈ 150 tx pada 0,01 gwei × 300k gas).
const FUND_ETH = CHAIN_ID === 31337 ? 1_000_000_000_000_000_000n : 500_000_000_000_000n;
// Tes yang memakai kunci Anvil #4/#5 (clientC/clientD) hanya bisa jalan di 31337.
const LOCAL_ONLY = CHAIN_ID !== 31337;
const j = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

const DEPLOY_EXISTS = existsSync(DEPLOY);
if (!DEPLOY_EXISTS) console.warn(`integration: deploy file not found at ${DEPLOY} — suite skipped`);

describe.skipIf(!DEPLOY_EXISTS)("integrasi Anvil: provider ↔ klien ↔ AegisChannel", () => {
  let d: { usdg: Address; factory: Address; router?: Address };
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

  it.skipIf(LOCAL_ONLY)("/close menolak seq basi (0 atau tengah); hanya seq tertinggi ter-ack diterima", async () => {
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
    const post = async (seq: number, toProvider: bigint, signer = privateKeyToAccount(PK.clientC)) => {
      const sigClient = await signClose(signer, c.channel, CHAIN_ID, { epoch: c.epoch, seq, toProvider });
      return fetch("http://127.0.0.1:4020/close", { method: "POST", headers: hdr, body: JSON.stringify({ seq, toProvider: toProvider.toString(), sigClient }) });
    };
    expect((await post(0, 0n)).status).toBe(409);
    expect((await post(5, 100_000n)).status).toBe(409);
    expect((await post(10, 199_999n)).status).toBe(409);                                   // jumlah salah
    expect((await post(10, 200_000n, privateKeyToAccount(PK.clientD))).status).toBe(400);  // tanda tangan bukan klien ini
    const r10 = await post(10, 200_000n);
    expect(r10.status).toBe(200);
    expect(((await r10.json()) as any).toProvider).toBe("200000");
    // F-close-continue: setelah provider ikut menandatangani Close, tidak ada unit baru lagi
    await expect(c.requestUnit()).rejects.toThrow(/session-closing/);
    // Cermin adversarial untuk /rollover — gating bersama yang sama (`countersign()`) harus menolak
    // jumlah salah (409) dan tanda tangan bukan klien ini (400), persis seperti /close di atas.
    const postRollover = async (seq: number, toProvider: bigint, signer = privateKeyToAccount(PK.clientC)) => {
      const sigClient = await signRollover(signer, c.channel, CHAIN_ID, { epoch: c.epoch, seq, toProvider });
      return fetch("http://127.0.0.1:4020/rollover", { method: "POST", headers: hdr, body: JSON.stringify({ seq, toProvider: toProvider.toString(), sigClient }) });
    };
    expect((await postRollover(10, 199_999n)).status).toBe(409);                                   // jumlah salah
    expect((await postRollover(10, 200_000n, privateKeyToAccount(PK.clientD))).status).toBe(400);  // tanda tangan bukan klien ini
    // jalur yang benar tetap bisa menutup channel secara normal (tanda tangan baru atas pesan yang sama)
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

  it("T-mode: 402 mengklaim anchored=true padahal factory klien (POSEIDON=0) co-signed → start() menolak /mode mismatch/; tidak ada transfer", async () => {
    const me = privateKeyToAccount(PK.clientB).address; // sesi asli klien ini di provider utama sudah SETTLED; app jahat ini terpisah
    const { cfg, terms } = await buildCfgAndTerms(me);
    const realPayTo = await predictChannel(ctxOf(PK.provider), cfg); // sah di factory co-signed (default ctxOf → d.factory)
    const sigProvider = await signChannelTerms(providerAccount, realPayTo, CHAIN_ID, cfg);
    const evilApp = new Hono();
    evilApp.get("/job", (c) => c.json({
      x402Version: 1,
      accepts: [{ scheme: "exact", network: `eip155:${CHAIN_ID}`, asset: d.usdg, payTo: realPayTo, maxAmountRequired: "1000000",
        // jahat: mengklaim anchored meski cfg/payTo/sigProvider di atas sah untuk factory CO-SIGNED klien (ctxOf → d.factory).
        extra: { aegis: { config: j(cfg), sigProvider, terms: j(terms), exitSig: "0x", anchored: true } } }],
    }, 402));
    const evilServer = serve({ fetch: evilApp.fetch, port: 4029 });
    try {
      const c = new AegisClient({ ctx: ctxOf(PK.clientB), account: privateKeyToAccount(PK.clientB), providerUrl: "http://127.0.0.1:4029", usdg: d.usdg, artifacts: art });
      const before = await bal(me);
      await expect(c.start()).rejects.toThrow(/mode mismatch/);
      expect(await bal(me)).toBe(before);
    } finally { evilServer.close(); }
  });

  it.skipIf(LOCAL_ONLY)("tiket keluar unilateral: provider mati sebelum unit 0 → deposit klien kembali penuh", async () => {
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

  it.skipIf(LOCAL_ONLY)("Task 15 fix round 1: startProviderWatcher in-process mengganti checkpoint basi klien (seq 5) dengan seq 10 co-signed asli, lalu settle membayar 200.000", async () => {
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

  it("F5: nonce/termsCommitment berbeda per sesi — dua klien di provider yang sama tidak berbagi komitmen", async () => {
    const get = async (addr: Address) => {
      const res = await fetch("http://127.0.0.1:4020/job", { headers: { "Aegis-Client": addr } });
      expect(res.status).toBe(402);
      return ((await res.json()) as any).accepts[0].extra.aegis;
    };
    const a1 = await get(privateKeyToAccount(generatePrivateKey()).address);
    const a2 = await get(privateKeyToAccount(generatePrivateKey()).address);
    expect(a1.config.termsCommitment).not.toBe(a2.config.termsCommitment);
    expect(a1.terms.nonce).not.toBe(a2.terms.nonce);
    // harga/ambang/penalti/cap tetap sama (hanya nonce yang per sesi), dan komitmen tiap sesi konsisten dengan terms-nya
    for (const k of ["unitPrice", "maxM1", "minM2", "penaltyBps", "capBps"]) expect(a1.terms[k]).toBe(a2.terms[k]);
    for (const a of [a1, a2]) {
      const t = { unitPrice: BigInt(a.terms.unitPrice), maxM1: BigInt(a.terms.maxM1), minM2: BigInt(a.terms.minM2), penaltyBps: BigInt(a.terms.penaltyBps), capBps: BigInt(a.terms.capBps), nonce: BigInt(a.terms.nonce) };
      expect(rootHex(await commitTerms(t))).toBe(a.config.termsCommitment);
    }
    expect(a1.unitQty).toBe("1");   // F3: provider mengiklankan qty per unit
  });

  it("skenario 11 (FR-10): epoch penuh → 409 epoch-full → rollover() → unit lanjut di epoch 1 → close; provider = A0 + A1", async () => {
    const pk = generatePrivateKey(); const acct = privateKeyToAccount(pk);
    const eth = await ctxOf(PK.deployer).walletClient.sendTransaction({ to: acct.address, value: FUND_ETH });
    await publicClient.waitForTransactionReceipt({ hash: eth });
    await mintUsdg(acct.address, 10_000_000n);
    const c = new AegisClient({ ctx: ctxOf(pk), account: acct, providerUrl: "http://127.0.0.1:4020", usdg: d.usdg, artifacts: art });
    const p0 = await bal(providerAddr); const c0 = await bal(acct.address);
    await c.start();                                             // deposit 1.000.000 (provider utama)
    for (let i = 0; i < 50; i++) await c.requestUnit();          // 50 × 20.000 = 1.000.000 = seluruh deposit
    await c.finalAck();
    await expect(c.requestUnit()).rejects.toThrow(/402/);        // budget habis (FR-24) — bukan epoch-full; deposit ulang dulu
    await erc20Transfer(ctxOf(pk), d.usdg, c.channel, 2_000_000n);
    for (let i = 50; i < 128; i++) await c.requestUnit();        // sampai MAX_SEQ
    await c.finalAck();
    await expect(c.requestUnit()).rejects.toThrow(/epoch-full/);
    expect(c.epoch).toBe(0);
    await c.rollover();                                          // bayar 2.560.000, sisa 440.000 jadi budget epoch 1
    expect(c.epoch).toBe(1); expect(c.tree.size).toBe(0);
    expect((await c.view()).epoch).toBe(1);
    expect((await bal(providerAddr)) - p0).toBe(2_560_000n);
    // Idempotensi /rollover/confirm (resiliency review): panggilan kedua manual (mis. mensimulasikan
    // retry klien setelah balasan pertama putus di jalan) harus 200 dengan exitSig PERSIS SAMA, tanpa
    // menyentuh sesi lagi — epoch tidak berubah dan provider tetap melayani (dibuktikan oleh 5 unit +
    // close di bawah yang menghasilkan saldo akhir persis sama seolah confirm hanya dipanggil sekali).
    const confirmAgain = await fetch("http://127.0.0.1:4020/rollover/confirm", { method: "POST", headers: { "Aegis-Client": acct.address, "content-type": "application/json" } });
    expect(confirmAgain.status).toBe(200);
    expect(((await confirmAgain.json()) as any).exitSig).toBe(c.exitSig);
    expect((await c.view()).epoch).toBe(1);
    for (let i = 0; i < 5; i++) await c.requestUnit();           // epoch 1: seq 0..4
    await c.finalAck();
    await c.closeCooperative();                                  // 100.000 ke provider, 340.000 kembali
    expect((await c.view()).state).toBe("SETTLED");
    expect((await bal(providerAddr)) - p0).toBe(2_660_000n);
    expect(c0 - (await bal(acct.address))).toBe(2_660_000n);
    expect(c.txs.map((t) => t.label)).toEqual(["fund", "rollover", "closeCooperative"]);
  });

  it.skipIf(LOCAL_ONLY)("F2: balasan provider dengan tanda tangan checkpoint SALAH ditolak SEBELUM pohon disentuh; dispute() tetap bisa memakai checkpoint co-signed sebelumnya", async () => {
    // Provider ASLI (jujur) dipanggil in-process; proxy di port 4041 meneruskan semuanya apa adanya,
    // kecuali balasan POST /job ke-K: `sigProvider` diganti tanda tangan atas checkpoint yang sama dari
    // KUNCI LAIN (anvil #6) — format sah, penandatangan salah.
    const K = 4;
    const terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
    const honest = createProviderApp({
      ctx: ctxOf(PK.provider), account: providerAccount, usdg: d.usdg, terms,
      unitQty: 1n, deposit: 1_000_000n, challengeWindow: 60, responseWindow: 30,
      metrics: () => ({ m1: 300n, m2: 95n }),   // tanpa pelanggaran — dispute() tanpa bukti
    });
    const wrongSigner = privateKeyToAccount("0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"); // anvil #6
    let posts = 0;
    const tamper = new Hono();
    tamper.all("/*", async (c) => {
      const url = new URL(c.req.url);
      const headers: Record<string, string> = {};
      for (const h of ["Aegis-Client", "Aegis-Terms-Signature", "Aegis-Ack", "content-type"]) { const v = c.req.header(h); if (v) headers[h] = v; }
      const init: RequestInit = { method: c.req.method, headers };
      if (c.req.method === "POST") init.body = await c.req.text();
      const res = await honest.app.request(url.pathname, init);
      if (c.req.method === "POST" && url.pathname === "/job" && res.status === 200 && ++posts === K) {
        const body = (await res.json()) as any;
        const cp = { epoch: Number(body.checkpoint.epoch), seq: Number(body.checkpoint.seq), cumulativeAmount: BigInt(body.checkpoint.cumulativeAmount), receiptsRoot: BigInt(body.checkpoint.receiptsRoot) };
        body.sigProvider = await signCheckpoint(wrongSigner, body.channel, CHAIN_ID, cp);
        return c.json(body, 200);
      }
      return new Response(res.body, { status: res.status, headers: res.headers });
    });
    const tamperServer = serve({ fetch: tamper.fetch, port: 4041 });
    try {
      const c = new AegisClient({ ctx: ctxOf(PK.clientD), account: privateKeyToAccount(PK.clientD), providerUrl: "http://127.0.0.1:4041", usdg: d.usdg, artifacts: art });
      const me = privateKeyToAccount(PK.clientD).address;
      const c0 = await bal(me); const p0 = await bal(providerAddr);
      await c.start();
      for (let i = 0; i < K - 1; i++) await c.requestUnit();
      expect(c.tree.size).toBe(K - 1);
      const txsBefore = c.txs.length;

      await expect(c.requestUnit()).rejects.toThrow(/bad provider checkpoint signature/);
      // Tidak ada mutasi: pohon, checkpoint co-signed, dan tx klien persis seperti sebelum balasan cacat.
      expect(c.tree.size).toBe(K - 1);
      expect(c.checkpoints.size).toBe(K - 1);
      expect(Math.max(...c.checkpoints.keys())).toBe(K - 1);
      expect(c.txs.length).toBe(txsBefore);

      // Jalur keluar tetap hidup: dispute() memakai checkpoint co-signed tertinggi (K-1), bukan tree.size+1 yang tidak ada.
      const { payToClient } = await c.dispute();
      expect(payToClient).toBe(0n);
      const v = await c.view();
      expect(v.state).toBe("CLOSING");
      expect(v.seq).toBe(K - 1);
      if (CHAIN_ID === 31337) { await publicClient.request({ method: "evm_increaseTime", params: [61] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any); }
      else await new Promise((r) => setTimeout(r, 65_000));
      await c.settle();
      expect((await c.view()).state).toBe("SETTLED");
      expect((await bal(providerAddr)) - p0).toBe(BigInt(K - 1) * 20_000n);   // hanya unit yang di-ack klien yang dibayar
      expect(c0 - (await bal(me))).toBe(BigInt(K - 1) * 20_000n);
    } finally { tamperServer.close(); }
  });

  it("F3: ClientPolicy — maxDeposit menolak 402 sebelum transfer; maxQtyPerUnit menolak receipt qty 5 tanpa tanda tangan, lalu klien keluar lewat tiket seq-0", async () => {
    const terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
    const { app: app3, latestCoSigned: lcs3, sessions: sessions3 } = createProviderApp({
      ctx: ctxOf(PK.provider), account: providerAccount, usdg: d.usdg, terms,
      unitQty: 5n, deposit: 1_000_000n, challengeWindow: 60, responseWindow: 30,   // provider menagih qty 5 per unit
      metrics: () => ({ m1: 300n, m2: 95n }),
    });
    const server3 = serve({ fetch: app3.fetch, port: 4042 });
    try {
      // (a) deposit yang diminta (1.000.000) > policy.maxDeposit (500.000) → start() menolak, saldo tidak berubah
      const a = new AegisClient({ ctx: ctxOf(PK.clientA), account: privateKeyToAccount(PK.clientA), providerUrl: "http://127.0.0.1:4042", usdg: d.usdg, artifacts: art, policy: { maxDeposit: 500_000n } });
      const meA = privateKeyToAccount(PK.clientA).address;
      const a0 = await bal(meA);
      await expect(a.start()).rejects.toThrow(/maxDeposit/);
      expect(await bal(meA)).toBe(a0);
      expect(a.txs.length).toBe(0);
      // (a') jendela tantangan 60 s > policy.maxChallengeWindow 30 → juga ditolak sebelum transfer
      const a2 = new AegisClient({ ctx: ctxOf(PK.clientA), account: privateKeyToAccount(PK.clientA), providerUrl: "http://127.0.0.1:4042", usdg: d.usdg, artifacts: art, policy: { maxChallengeWindow: 30 } });
      await expect(a2.start()).rejects.toThrow(/maxChallengeWindow/);
      expect(await bal(meA)).toBe(a0);

      // (b) provider unitQty 5 vs klien maxQtyPerUnit 1 → start() lolos (deposit/jendela OK), requestUnit() menolak
      //     receipt qty 5: tidak ada tanda tangan klien yang dibuat, pohon tidak berubah.
      const b = new AegisClient({ ctx: ctxOf(PK.clientB), account: privateKeyToAccount(PK.clientB), providerUrl: "http://127.0.0.1:4042", usdg: d.usdg, artifacts: art, policy: { maxQtyPerUnit: 1n } });
      const meB = privateKeyToAccount(PK.clientB).address;
      const b0 = await bal(meB);
      await b.start();
      await expect(b.requestUnit()).rejects.toThrow(/qty 5 exceeds maxQtyPerUnit 1/);
      expect(b.tree.size).toBe(0);
      expect(b.checkpoints.size).toBe(0);
      expect(lcs3(meB)).toBeUndefined();                                        // provider tidak pernah menerima ack/tanda tangan klien
      expect(sessions3.get(meB.toLowerCase())!.checkpoints.get(1)!.sigClient).toBeUndefined();
      // Klien keluar: tanpa checkpoint co-signed, tiket keluar seq-0 sah → seluruh deposit kembali.
      await b.exitUnilateral();
      if (CHAIN_ID === 31337) { await publicClient.request({ method: "evm_increaseTime", params: [61] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any); }
      else await new Promise((r) => setTimeout(r, 65_000));
      await b.settle();
      expect((await b.view()).state).toBe("SETTLED");
      expect(await bal(meB)).toBe(b0);
    } finally { server3.close(); }
  });

  it("skenario 13 (FR-26): payoutProvider = AegisTreasuryRouter → treasury menerima pembayaran dalam tx close yang sama", async () => {
    const dd = d as typeof d & { router: Address };
    expect(dd.router).toMatch(/^0x/);
    const treasury = privateKeyToAccount(generatePrivateKey()).address;
    const setT = await ctxOf(PK.provider).walletClient.writeContract({ address: dd.router, abi: routerAbi, functionName: "setTreasury", args: [treasury] });
    await publicClient.waitForTransactionReceipt({ hash: setT });
    const terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
    const { app: app3 } = createProviderApp({
      ctx: ctxOf(PK.provider), account: providerAccount, usdg: d.usdg, terms, payoutProvider: dd.router,
      unitQty: 1n, deposit: 1_000_000n, challengeWindow: 60, responseWindow: 30, metrics: () => ({ m1: 300n, m2: 95n }),
    });
    const server3 = serve({ fetch: app3.fetch, port: 4028 });
    try {
      const pk = generatePrivateKey(); const acct = privateKeyToAccount(pk);
      const eth = await ctxOf(PK.deployer).walletClient.sendTransaction({ to: acct.address, value: FUND_ETH });
      await publicClient.waitForTransactionReceipt({ hash: eth });
      await mintUsdg(acct.address, 2_000_000n);
      const c = new AegisClient({ ctx: ctxOf(pk), account: acct, providerUrl: "http://127.0.0.1:4028", usdg: d.usdg, artifacts: art });
      await c.start();
      expect(c.cfg.payoutProvider.toLowerCase()).toBe(dd.router.toLowerCase());
      for (let i = 0; i < 5; i++) await c.requestUnit();
      await c.finalAck();
      const p0 = await bal(providerAddr);
      await c.closeCooperative();
      expect(await bal(treasury)).toBe(100_000n);              // 5 × 20.000 langsung ke treasury
      expect(await bal(providerAddr)).toBe(p0);                // EOA provider tidak tersentuh
      expect(await bal(dd.router)).toBe(0n);
    } finally { server3.close(); }
  });

  describe("skenario 12 (FR-25 anchored): ack on-chain, startClose, bukti atas R on-chain", () => {
    let server4: ReturnType<typeof serve>;
    const PORT = 4027;
    const fresh = async (usdgAmount: bigint) => {
      const pk = generatePrivateKey(); const acct = privateKeyToAccount(pk);
      const eth = await ctxOf(PK.deployer).walletClient.sendTransaction({ to: acct.address, value: FUND_ETH });
      await publicClient.waitForTransactionReceipt({ hash: eth });
      await mintUsdg(acct.address, usdgAmount);
      return { pk, acct };
    };
    const mkAnchoredClient = (pk: Hex) => new AegisClient({
      ctx: { ...ctxOf(pk), factory: (d as any).factoryAnchored }, account: privateKeyToAccount(pk), providerUrl: `http://127.0.0.1:${PORT}`, usdg: d.usdg, artifacts: art,
    });
    const words = (hex: string) => { const h = hex.replace(/^0x/, ""); const o: bigint[] = []; for (let i = 0; i + 64 <= h.length; i += 64) o.push(BigInt("0x" + h.slice(i, i + 64))); return o; };

    beforeAll(() => {
      expect((d as any).factoryAnchored).toMatch(/^0x/);
      const terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
      const { app } = createProviderApp({
        ctx: { ...ctxOf(PK.provider), factory: (d as any).factoryAnchored }, account: providerAccount, usdg: d.usdg, terms, anchored: true,
        unitQty: 1n, deposit: 1_000_000n, challengeWindow: 120, responseWindow: 60,
        metrics: (seq) => ({ m1: seq === 3 ? 1200n : 300n, m2: 95n }),
      });
      server4 = serve({ fetch: app.fetch, port: PORT });
    });
    afterAll(() => { server4?.close(); });

    it("sengketa: 10 ack on-chain (1 pelanggaran) → startClose → bukti → settle 190.000 / 810.000; calldata ack tanpa metrik", async () => {
      const { pk, acct } = await fresh(2_000_000n);
      const c = mkAnchoredClient(pk);
      const c0 = await bal(acct.address); const p0 = await bal(providerAddr);
      await c.start();
      expect(c.anchored).toBe(true);
      for (let i = 0; i < 10; i++) await c.requestUnit();
      expect(c.txs.filter((t) => t.label === "ack").length).toBe(10);
      const v = await c.view();
      expect(v.seq).toBe(10); expect(v.receiptsRoot).toBe(await c.tree.root()); expect(v.cumulativeAmount).toBe(200_000n);
      const { payToClient } = await c.dispute();
      expect(payToClient).toBe(10_000n);
      expect(c.txs.map((t) => t.label)).toEqual(expect.arrayContaining(["startClose", "claimPenalty"]));
      expect((await c.view()).hasProof).toBe(true);
      if (CHAIN_ID === 31337) { await publicClient.request({ method: "evm_increaseTime", params: [121] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any); }
      else await new Promise((r) => setTimeout(r, 125_000));
      await c.settle();
      expect((await bal(providerAddr)) - p0).toBe(190_000n);
      expect(c0 - (await bal(acct.address))).toBe(190_000n);
      // Privasi anchored (spec §6.7): metrik & ambang tidak pernah masuk calldata/log ack — hanya hash daun + kumulatif.
      for (const t of c.txs.filter((x) => x.label === "ack")) {
        const tx = await publicClient.getTransaction({ hash: t.hash }); const rc = await publicClient.getTransactionReceipt({ hash: t.hash });
        const ws = [...words("0x" + tx.input.slice(10)), ...rc.logs.flatMap((l) => words(l.data))];
        for (const secret of [1200n, 300n, 95n, 800n, 90n, 5000n, 3000n]) expect(ws).not.toContain(secret);
      }
      console.table(c.txs.map((t) => ({ label: t.label, gasUsed: t.gasUsed.toString() })));
    });

    it("anchored: provider memanggil startClose() lebih dulu (CLOSING) → dispute() tetap lanjut ke bukti tanpa startClose lagi", async () => {
      const { pk, acct } = await fresh(2_000_000n);
      const c = mkAnchoredClient(pk);
      const c0 = await bal(acct.address); const p0 = await bal(providerAddr);
      await c.start();
      for (let i = 0; i < 10; i++) await c.requestUnit();
      // Provider (bukan klien) membuka jendela tantangan lebih dulu — channel sudah CLOSING sebelum dispute().
      await startCloseTx({ ...ctxOf(PK.provider), factory: (d as any).factoryAnchored }, c.channel);
      expect((await c.view()).state).toBe("CLOSING");
      const { payToClient } = await c.dispute();
      expect(payToClient).toBe(10_000n);
      expect((await c.view()).hasProof).toBe(true);
      expect(c.txs.map((t) => t.label)).toContain("claimPenalty");
      expect(c.txs.map((t) => t.label)).not.toContain("startClose");
      if (CHAIN_ID === 31337) { await publicClient.request({ method: "evm_increaseTime", params: [121] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any); }
      else await new Promise((r) => setTimeout(r, 125_000));
      await c.settle();
      expect((await bal(providerAddr)) - p0).toBe(190_000n);
      expect(c0 - (await bal(acct.address))).toBe(190_000n);
    });

    it("kooperatif anchored: 5 ack → close (klien menandatangani dulu) → provider +100.000", async () => {
      const { pk, acct } = await fresh(2_000_000n);
      const c = mkAnchoredClient(pk);
      const p0 = await bal(providerAddr); const c0 = await bal(acct.address);
      await c.start();
      for (let i = 0; i < 5; i++) await c.requestUnit();
      await c.finalAck();                                  // no-op di anchored
      await c.closeCooperative();
      expect((await c.view()).state).toBe("SETTLED");
      expect((await bal(providerAddr)) - p0).toBe(100_000n);
      expect(c0 - (await bal(acct.address))).toBe(100_000n);
    });

    it("keluar unilateral anchored: provider tidak menjawab → startClose → settle → deposit kembali penuh", async () => {
      const { pk, acct } = await fresh(2_000_000n);
      const c = mkAnchoredClient(pk);
      const c0 = await bal(acct.address);
      await c.start();
      await c.exitUnilateral();
      expect((await c.view()).state).toBe("CLOSING");
      if (CHAIN_ID === 31337) { await publicClient.request({ method: "evm_increaseTime", params: [121] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any); }
      else await new Promise((r) => setTimeout(r, 125_000));
      await c.settle();
      expect(await bal(acct.address)).toBe(c0);
    });
  });
});
