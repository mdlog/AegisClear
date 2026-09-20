# AegisClear Web Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-viewable console (`http://localhost:4040`) that lists AegisClear channels on the selected network, runs the A-vs-B demo scenarios server-side with a live step log, and shows what stays private vs what the chain sees.

**Architecture:** New pnpm package `web/`: a Hono server (`web/server`) that serves the built Vite/React page, mounts the SDK provider app at `/provider` (with the in-process challenge responder), and exposes `/api/*` (config, channel index built from `ChannelOpened` logs, demo runs with SSE, leak-check, raw 402 offer). The demo logic in `demo/run.ts` is refactored into a library (`demo/src/scenarios.ts`, `demo/src/leak.ts`) shared by the CLI and the web server. No wallet in the browser: demo keys (provider, client A, client B, faucet) live in the server process exactly like `demo/run.ts` / `sdk/test/integration.test.ts`.

**Tech Stack:** Node 22, pnpm 9.15, TypeScript 5.9, Hono 4 + `@hono/node-server` 2, viem 2.56, Vite 6 + React 18, vitest 5, `@aegisclear/sdk` + `@aegisclear/demo` (workspace).

**Spec:** `docs/superpowers/specs/2026-09-20-aegisclear-p1-design.md` §A (Web console). Parent spec: `prd-arsitektur.md` §14 (demo harness table columns).

## Global Constraints

- Ports: web server **4040** (`WEB_PORT`), Vite dev **4043**, tests use **4042**. Never use 4020 (SDK integration tests), 4031 (demo CLI), 8545 (a foreign Anvil may run there — use a private Anvil on **8547** with `RPC_URL=http://127.0.0.1:8547` for every test run in this plan).
- `AEGIS_NETWORK ∈ {local, testnet}`; `local` keys = Anvil defaults (#0 faucet, #1 client A, #2 provider, #3 client B — same as `demo/run.ts`); `testnet` keys from `.env` (`PK_PROVIDER`, `PK_CLIENT_A`, `PK_CLIENT_B`, `PK_DEPLOYER`) — the server may read `.env` but must never log or return any private key.
- Provider windows: local 120 s / 60 s (`evm_increaseTime`), testnet 60 s / 30 s (real wait). Deposit Pasar B = 5 USDG (`5_000_000n`), escrow Pasar A = 2 USDG. Breach seqs `[3,17,29,44,58,71,90]` (EX1), breach metrics m1 1200 / normal 300, m2 95 — identical to `demo/run.ts` so the §14 numbers (0,07 / 1,93 USDG) still hold.
- JSON responses: every `bigint` serialised as decimal string; addresses checksummed (viem `getAddress`).
- All relative imports in Node (server, demo library, tests) use `.js` extensions (NodeNext); the Vite client uses extensionless imports (`moduleResolution: bundler`).
- No new runtime dependency beyond: hono, @hono/node-server, viem, react, react-dom (+ dev: vite, @vitejs/plugin-react, vitest, typescript, tsx, @types/*).
- Tests that need a chain use `describe.skipIf(!DEPLOY_EXISTS)` with `DEPLOY_FILE` resolved against the repo root (same pattern as `sdk/test/integration.test.ts`), and print a `console.warn` when skipped. Never silently skip.
- The existing suites must stay green: `pnpm test:sdk` (34), `pnpm test:circuits` (14), `cd contracts && forge test` (63). `demo/run.ts` + `demo/leak-check.ts` must keep producing `demo/out/result.json` with fields `channelB, factory, txs, private, table` and `bocor: 0`.
- Commit messages: plain, no AI attribution trailers (user's global rule).

## File Structure

```
demo/
  package.json                 (+ "exports", "test" script)
  src/index.ts                 re-exports scenarios + leak
  src/scenarios.ts             BREACHES, TERMS_BASE, METRICS, runMarketB, runMarketA, toRows, escrowAbi
  src/leak.ts                  leakCheck(publicClient, factory, channel, txs, priv)
  run.ts                       CLI (unchanged behaviour, uses src/)
  leak-check.ts                CLI (unchanged behaviour, uses src/leak.ts)
  test/rows.test.ts            toRows / metricsFor
sdk/src/chain/abi.ts           + cfg() view, + events Funded/Swept/Opened on channelAbi (additive)
web/
  package.json, tsconfig.json (client), tsconfig.server.json, vite.config.ts, vitest.config.ts, index.html
  shared/types.ts              API types shared by server and client
  server/index.ts              entry: loadDotEnv → loadConfig → createWebServer → listen
  server/config.ts             network profiles, .env loader, deployment file
  server/chain.ts              viem clients, ctx(pk), faucet (mint MockUSDG)
  server/channels.ts           ChannelIndex (ChannelOpened scan, view+cfg, events, 3 s cache)
  server/runs.ts               RunStore (in-memory, 50, subscribe/replay)
  server/demo.ts               scenario orchestration (session pre-check, faucet, timeTravel, rows)
  server/app.ts                createWebServer(cfg): Hono app, /provider mount, /api routes, SSE, static
  src/main.tsx, App.tsx, api.ts, format.ts, styles.css
  src/components/{Header,ChannelsTable,ChannelDrawer,DemoPanel,PrivacyCards}.tsx
  test/config.test.ts, runstore.test.ts, format.test.ts, server.test.ts
README.md                      "Lihat di browser" section; root package.json scripts web / web:dev
.env.example                   + AEGIS_NETWORK, WEB_PORT, FACTORY_BLOCK
```

---

### Task 1: Refactor `demo/` into a library + CLI

**Files:**
- Create: `demo/src/scenarios.ts`, `demo/src/leak.ts`, `demo/src/index.ts`, `demo/test/rows.test.ts`
- Modify: `demo/run.ts`, `demo/leak-check.ts`, `demo/package.json`, `sdk/src/chain/abi.ts`

**Interfaces:**
- Consumes: `@aegisclear/sdk` — `AegisClient`, `erc20Balance`, `settle`, `TxLog`, `Terms`, `Settlement`, `Artifacts`, `ChainCtx`, `factoryAbi`.
- Produces (used by Task 4/5): `runMarketB(env, pk, dispute, emit, units?)`, `runMarketA(env, pk, accept, emit)`, `toRows({aOk?, aRej?, bCoop?, bDisp?})`, `leakCheck(...)`, constants `BREACHES`, `TERMS_BASE`, `METRICS`, `metricsFor`, `DEPOSIT_B`, `ESCROW_AMOUNT_A`, `privateValues(terms)`, types `ScenarioEnv`, `Emit`, `StepInput`, `Phase`, `Row`, `MarketBResult`, `MarketAResult`, `Deployment`.

- [ ] **Step 1: Add `cfg()` and missing events to the SDK channel ABI (additive)**

In `sdk/src/chain/abi.ts`, inside `channelAbi = parseAbi([...])`, add these entries after `"function budget() view returns (uint256)"`:

```ts
  "function cfg() view returns (address client, address provider, address token, bytes32 termsCommitment, uint32 challengeWindow, uint32 responseWindow, address payoutClient, address payoutProvider, bytes32 salt)",
  "event Opened(address indexed client, address indexed provider, bytes32 termsCommitment, uint32 challengeWindow)",
  "event Funded(address indexed from, uint256 amount)",
  "event Swept(uint256 amount)",
```

Run: `pnpm --filter @aegisclear/sdk typecheck && pnpm --filter @aegisclear/sdk test -- test/typedData.test.ts`
Expected: typecheck clean; tests pass (ABI change is additive).

- [ ] **Step 2: Write the failing test for `toRows` / `metricsFor`**

Create `demo/test/rows.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toRows, metricsFor, BREACHES, privateValues, TERMS_BASE, type MarketAResult, type MarketBResult } from "../src/index.js";

test("metricsFor: pelanggaran hanya di seq EX1", () => {
  assert.deepEqual(metricsFor(3), { m1: 1200n, m2: 95n });
  assert.deepEqual(metricsFor(4), { m1: 300n, m2: 95n });
  assert.equal(BREACHES.size, 7);
});

test("toRows: urutan §14 dan format USDG 2 desimal", () => {
  const tx = { label: "x", hash: "0x01" as const, gasUsed: 10n };
  const b = (payToClient: bigint, providerDelta: bigint, provingMs: number): MarketBResult => ({
    channel: "0x0000000000000000000000000000000000000001", txs: [tx], gasTotal: 542_194n, provingMs, clientDelta: 0n, providerDelta,
    local: { cumulativeAmount: 2_000_000n, breaches: 7, penRaw: 70_000n, cap: 600_000n, payToClient, payToProvider: 2_000_000n - payToClient },
    terms: { ...TERMS_BASE, nonce: 1n },
  });
  const a = (result: string): MarketAResult => ({ gasTotal: 347_918n, result, txs: [tx] });
  const rows = toRows({ aOk: a("0 / 2.00"), aRej: a("2.00 / 0"), bCoop: b(0n, 2_000_000n, 0), bDisp: b(70_000n, 1_930_000n, 4245) });
  assert.deepEqual(rows.map((r) => r.pasar), [
    "A: evaluator biner (complete)", "A: evaluator biner (reject)", "B: AegisClear kooperatif", "B: AegisClear sengketa (bukti)",
  ]);
  assert.equal(rows[2].klien_provider, "0.00 / 2.00");
  assert.equal(rows[3].klien_provider, "0.07 / 1.93");
  assert.equal(rows[3].proving_ms, "4245");
  assert.equal(rows[3].gas, "542194");
  assert.deepEqual(rows[3].txs, [{ label: "x", hash: "0x01" }]);
  // baris yang hasilnya tidak ada dilewati
  assert.equal(toRows({ bCoop: b(0n, 2_000_000n, 0) }).length, 1);
});

test("privateValues: 6 syarat + 3 metrik demo", () => {
  const v = privateValues({ ...TERMS_BASE, nonce: 7n });
  assert.deepEqual(v, [20_000n, 800n, 90n, 5000n, 3000n, 7n, 1200n, 300n, 95n]);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd demo && node --import tsx --test test/*.test.ts`
Expected: FAIL — `Cannot find module '../src/index.js'`.

- [ ] **Step 4: Write `demo/src/scenarios.ts`**

```ts
// Logika demo §14 (Pasar A: SimpleJobEscrow biner vs Pasar B: AegisClear) sebagai library.
// Dipakai oleh demo/run.ts (CLI, cetak tabel) dan web/server (console browser, stream langkah).
import { parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AegisClient, erc20Balance, settle, type Artifacts, type ChainCtx, type Settlement, type Terms, type TxLog } from "@aegisclear/sdk";

export const BREACHES = new Set([3, 17, 29, 44, 58, 71, 90]);           // EX1
export const TERMS_BASE: Omit<Terms, "nonce"> = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n };
export const METRICS = { breachM1: 1200n, okM1: 300n, m2: 95n } as const;
export const metricsFor = (seq: number) => ({ m1: BREACHES.has(seq) ? METRICS.breachM1 : METRICS.okM1, m2: METRICS.m2 });
export const DEPOSIT_B = 5_000_000n;        // 5 USDG (ProviderOptions.deposit)
export const ESCROW_AMOUNT_A = 2_000_000n;  // 2 USDG (SimpleJobEscrow.fund)
/** Nilai privat sesi Pasar B yang TIDAK boleh muncul di calldata/log mana pun (leak-check). */
export const privateValues = (t: Terms): bigint[] => [t.unitPrice, t.maxM1, t.minM2, t.penaltyBps, t.capBps, t.nonce, METRICS.breachM1, METRICS.okM1, METRICS.m2];

export interface Deployment { usdg: Address; factory: Address; escrow: Address }
export type Phase = "fund" | "open" | "serve" | "ack" | "close" | "dispute" | "prove" | "wait" | "settle" | "escrow";
export interface StepInput { phase: Phase; label: string; detail?: string; txHash?: Hex; gasUsed?: string; channel?: Address; progress?: { done: number; total: number } }
export type Emit = (s: StepInput) => void;
export interface ScenarioEnv {
  ctx: (pk: Hex) => ChainCtx; publicClient: PublicClient; d: Deployment; art: Artifacts;
  providerUrl: string; providerAddress: Address; providerPk: Hex; challengeWindow: number;
  /** local: evm_increaseTime + evm_mine; testnet: tunggu nyata sambil memancarkan step "wait". */
  timeTravel: (seconds: number, emit: Emit) => Promise<void>;
}
export interface MarketBResult { channel: Address; txs: TxLog[]; gasTotal: bigint; provingMs: number; clientDelta: bigint; providerDelta: bigint; local: Settlement; terms: Terms }
export interface MarketAResult { gasTotal: bigint; result: string; txs: TxLog[] }
export interface Row { pasar: string; klien_provider: string; penentu: string; terlihat: string; gas: string; proving_ms: string; txs: { label: string; hash: Hex }[] }

export const escrowAbi = parseAbi([
  "function nextId() view returns (uint256)",
  "function createJob(address provider, address evaluator, string description) returns (uint256)",
  "function fund(uint256 id, uint256 amount)",
  "function submit(uint256 id, bytes32 d)",
  "function complete(uint256 id, bytes32 r)",
  "function reject(uint256 id, bytes32 r)",
  "function approve(address,uint256) returns (bool)",
]);
export const fmtUsdg = (x: bigint) => (Number(x) / 1e6).toFixed(2);
const B32 = (d: string) => ("0x" + d.padStart(64, "0")) as Hex;

/** Pasar B: 402 → dana → `units` unit di-ack → sengketa (bukti + settle) atau cooperative close. */
export async function runMarketB(env: ScenarioEnv, pk: Hex, dispute: boolean, emit: Emit, units = 100): Promise<MarketBResult> {
  const ctx = env.ctx(pk);
  const me = privateKeyToAccount(pk).address;
  const c = new AegisClient({ ctx, account: privateKeyToAccount(pk), providerUrl: env.providerUrl, usdg: env.d.usdg, artifacts: env.art });
  const c0 = await erc20Balance(ctx, env.d.usdg, me);
  const p0 = await erc20Balance(ctx, env.d.usdg, env.providerAddress);
  let seen = 0;
  const flush = (phase: Phase) => {
    for (const t of c.txs.slice(seen)) emit({ phase, label: t.label, txHash: t.hash, gasUsed: t.gasUsed.toString(), channel: c.channel });
    seen = c.txs.length;
  };
  await c.start();
  emit({ phase: "fund", label: `402 diterima: payTo ${c.channel}, deposit ${fmtUsdg(c.deposit)} USDG`, channel: c.channel });
  flush("fund");
  emit({ phase: "open", label: "provider membuka channel saat ack pertama (tx provider, lihat kolom channel)", channel: c.channel });
  for (let i = 0; i < units; i++) {
    await c.requestUnit();
    if ((i + 1) % 10 === 0 || i + 1 === units)
      emit({ phase: "serve", label: `${i + 1}/${units} unit dilayani & di-ack (checkpoint co-signed)`, progress: { done: i + 1, total: units }, channel: c.channel });
  }
  await c.finalAck();
  emit({ phase: "ack", label: "ack terakhir dikirim (POST /ack)", channel: c.channel });
  if (dispute) {
    emit({ phase: "dispute", label: "sengketa: submit checkpoint co-signed tertinggi, lalu bukti penalti", channel: c.channel });
    const { payToClient } = await c.dispute();
    flush("dispute");
    emit({ phase: "prove", label: `bukti Groth16: payToClient ${fmtUsdg(payToClient)} USDG`, detail: `${c.provingMs} ms proving`, channel: c.channel });
    await env.timeTravel(env.challengeWindow + 1, emit);
    await c.settle();
    flush("settle");
  } else {
    await c.closeCooperative();
    flush("close");
  }
  const gasTotal = c.txs.reduce((s, t) => s + t.gasUsed, 0n);
  // c.terms = terms sesi ini (nonce per sesi dari provider) — nilai privat yang benar-benar ter-commit on-chain.
  return {
    channel: c.channel, txs: c.txs, gasTotal, provingMs: c.provingMs,
    clientDelta: c0 - (await erc20Balance(ctx, env.d.usdg, me)),
    providerDelta: (await erc20Balance(ctx, env.d.usdg, env.providerAddress)) - p0,
    local: settle(c.tree.receipts, c.terms), terms: c.terms,
  };
}

/** Pasar A (kontrol): escrow ERC-8183 biner, evaluator = klien, syarat bocor di calldata. */
export async function runMarketA(env: ScenarioEnv, pk: Hex, accept: boolean, emit: Emit): Promise<MarketAResult> {
  const ctx = env.ctx(pk); const w = ctx.walletClient; const me = privateKeyToAccount(pk).address;
  const txs: TxLog[] = [];
  const step = async (label: string, hash: Hex) => {
    const r = await env.publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`tx ${label} reverted`);
    txs.push({ label, hash, gasUsed: r.gasUsed });
    emit({ phase: "escrow", label, txHash: hash, gasUsed: r.gasUsed.toString() });
  };
  await step("approve", await w.writeContract({ address: env.d.usdg, abi: escrowAbi, functionName: "approve", args: [env.d.escrow, ESCROW_AMOUNT_A] }));
  const desc = "100 units @ 0.02 USDG; maxLatency 800ms; minQuality 90; penalty 50%; cap 30%";  // syarat bocor di calldata
  const id = await env.publicClient.readContract({ address: env.d.escrow, abi: escrowAbi, functionName: "nextId" });
  await step("createJob (syarat di calldata)", await w.writeContract({ address: env.d.escrow, abi: escrowAbi, functionName: "createJob", args: [env.providerAddress, me, desc] }));
  await step("fund", await w.writeContract({ address: env.d.escrow, abi: escrowAbi, functionName: "fund", args: [id, ESCROW_AMOUNT_A] }));
  const providerPk = env.providerPk;
  await step("submit (provider)", await env.ctx(providerPk).walletClient.writeContract({ address: env.d.escrow, abi: escrowAbi, functionName: "submit", args: [id, B32("1")] }));
  await step(accept ? "complete (evaluator = klien)" : "reject (evaluator = klien)",
    await w.writeContract({ address: env.d.escrow, abi: escrowAbi, functionName: accept ? "complete" : "reject", args: [id, B32("0")] }));
  return { gasTotal: txs.reduce((s, t) => s + t.gasUsed, 0n), result: accept ? "0 / 2.00" : "2.00 / 0", txs };
}

/** Tabel §14 dalam urutan tetap; baris yang hasilnya tidak diberikan dilewati. */
export function toRows(r: { aOk?: MarketAResult; aRej?: MarketAResult; bCoop?: MarketBResult; bDisp?: MarketBResult }): Row[] {
  const links = (txs: TxLog[]) => txs.map((t) => ({ label: t.label, hash: t.hash }));
  const rows: Row[] = [];
  if (r.aOk) rows.push({ pasar: "A: evaluator biner (complete)", klien_provider: r.aOk.result, penentu: "alamat evaluator", terlihat: "harga, ambang, penalti (string)", gas: r.aOk.gasTotal.toString(), proving_ms: "-", txs: links(r.aOk.txs) });
  if (r.aRej) rows.push({ pasar: "A: evaluator biner (reject)", klien_provider: r.aRej.result, penentu: "alamat evaluator", terlihat: "harga, ambang, penalti (string)", gas: r.aRej.gasTotal.toString(), proving_ms: "-", txs: links(r.aRej.txs) });
  if (r.bCoop) rows.push({ pasar: "B: AegisClear kooperatif", klien_provider: `${fmtUsdg(0n)} / ${fmtUsdg(r.bCoop.providerDelta)}`, penentu: "dua tanda tangan", terlihat: "T, R, jumlah", gas: r.bCoop.gasTotal.toString(), proving_ms: "-", txs: links(r.bCoop.txs) });
  if (r.bDisp) rows.push({ pasar: "B: AegisClear sengketa (bukti)", klien_provider: `${fmtUsdg(r.bDisp.local.payToClient)} / ${fmtUsdg(r.bDisp.providerDelta)}`, penentu: "bukti Groth16", terlihat: "T, R, jumlah, payToClient", gas: r.bDisp.gasTotal.toString(), proving_ms: String(r.bDisp.provingMs), txs: links(r.bDisp.txs) });
  return rows;
}
```

- [ ] **Step 5: Write `demo/src/leak.ts`**

```ts
// Memindai calldata & log setiap tx channel Pasar B: tidak boleh ada kata 32-byte yang sama dengan nilai privat (FR-19/G2).
import type { Address, Hex, PublicClient } from "viem";
import { factoryAbi } from "@aegisclear/sdk";

export interface LeakReport { txs: Hex[]; leaks: number; ambiguous: number; details: { txHash: Hex; word: string; kind: "leak" | "ambiguous" }[] }

const words = (hex: string): bigint[] => {
  const h = hex.replace(/^0x/, ""); const out: bigint[] = [];
  for (let i = 0; i + 64 <= h.length; i += 64) out.push(BigInt("0x" + h.slice(i, i + 64)));
  return out;
};

/**
 * `txs` = tx klien (AegisClient.txs). Tx `factory.open(...)` dikirim SERVER provider, bukan klien, jadi
 * dicari lewat event ChannelOpened di factory dan ikut dipindai. Kata < 4096 kelipatan 32 dihitung
 * "ambigu" (bisa offset ABI), selebihnya "bocor".
 */
export async function leakCheck(pc: PublicClient, factory: Address, channel: Address, txs: Hex[], priv: bigint[], fromBlock = 0n): Promise<LeakReport> {
  const openLogs = await pc.getContractEvents({ address: factory, abi: factoryAbi, eventName: "ChannelOpened", args: { channel }, fromBlock });
  if (openLogs.length === 0) throw new Error(`tidak ada event ChannelOpened untuk channel ${channel} di factory ${factory}`);
  const all: Hex[] = [openLogs[0].transactionHash, ...txs];
  const set = new Set(priv);
  const details: LeakReport["details"] = [];
  let leaks = 0, ambiguous = 0;
  for (const hash of all) {
    const tx = await pc.getTransaction({ hash }); const rc = await pc.getTransactionReceipt({ hash });
    const ws = [...words("0x" + tx.input.slice(10)), ...rc.logs.flatMap((l) => [...l.topics.map((t) => BigInt(t)), ...words(l.data)])];
    for (const w of ws) if (set.has(w)) {
      if (w < 4096n && w % 32n === 0n) { ambiguous++; details.push({ txHash: hash, word: w.toString(), kind: "ambiguous" }); }
      else { leaks++; details.push({ txHash: hash, word: w.toString(), kind: "leak" }); }
    }
  }
  return { txs: all, leaks, ambiguous, details };
}
```

- [ ] **Step 6: Write `demo/src/index.ts`**

```ts
export * from "./scenarios.js";
export * from "./leak.js";
```

- [ ] **Step 7: Rewrite `demo/run.ts` on top of the library (same console output and `demo/out/result.json`)**

```ts
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
```

- [ ] **Step 8: Rewrite `demo/leak-check.ts` on top of `leakCheck`**

```ts
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
```

- [ ] **Step 9: Update `demo/package.json`**

```json
{
  "name": "@aegisclear/demo",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "demo": "tsx run.ts", "leak-check": "tsx leak-check.ts", "test": "node --import tsx --test test/*.test.ts" },
  "dependencies": { "@aegisclear/sdk": "workspace:*", "@hono/node-server": "^2.1.1", "viem": "^2.56.8" },
  "devDependencies": { "tsx": "^4.23.13", "typescript": "^5.9.3" }
}
```

(Keep the exact existing versions from the current file if they differ from the above — do not upgrade dependencies in this task.)

- [ ] **Step 10: Run the unit test, then the real demo on a private Anvil**

Run: `cd demo && node --import tsx --test test/*.test.ts`
Expected: 3 passing.

Run (from repo root; requires `circuits/build/sla_final.zkey` present):
```bash
anvil --port 8547 --silent & sleep 2
(cd contracts && forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8547 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 >/dev/null)
RPC_URL=http://127.0.0.1:8547 pnpm --filter @aegisclear/demo demo
RPC_URL=http://127.0.0.1:8547 pnpm --filter @aegisclear/demo leak-check
```
Expected: the 4-row table (B sengketa `0.07 / 1.93`, proving ms > 0), `ditulis: demo/out/result.json`, then `bocor: 0, ambigu: 0`. Leave the Anvil running for later tasks (or kill it with `pkill -f "anvil --port 8547"`).

Also run `pnpm test:sdk` (34 pass, with `RPC_URL=http://127.0.0.1:8547`) to prove the ABI change is harmless.

- [ ] **Step 11: Commit**

```bash
git add demo sdk/src/chain/abi.ts
git commit -m "demo: extract scenarios + leak-check into a library shared by CLI and web console; channel ABI gains cfg() and events"
```

---

### Task 2: `web/` package scaffold, network config, static server skeleton

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/tsconfig.server.json`, `web/vite.config.ts`, `web/vitest.config.ts`, `web/index.html`, `web/shared/types.ts`, `web/server/config.ts`, `web/server/app.ts`, `web/server/index.ts`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles.css`, `web/test/config.test.ts`
- Modify: `pnpm-workspace.yaml` (add `web`), root `package.json` (scripts `web`, `web:dev`, `test:web`), `.env.example`

**Interfaces:**
- Consumes: nothing from earlier tasks except `@aegisclear/demo` constants (`TERMS_BASE`, `BREACHES`, `DEPOSIT_B`) for `/api/config`.
- Produces: `loadDotEnv(file?, env?)`, `loadConfig(env?) → WebConfig`, `REPO_ROOT`, `ANVIL_KEYS`, `TESTNET`, `createWebServer(cfg) → { app, start(): Promise<{port}>, stop(): Promise<void> }` (Task 3–5 extend `app.ts`), shared API types.

- [ ] **Step 1: Workspace + package files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - sdk
  - circuits
  - demo
  - web
```

`web/package.json`:
```json
{
  "name": "@aegisclear/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite --port 4043 --strictPort",
    "serve": "tsx server/index.ts",
    "start": "vite build && tsx server/index.ts",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@aegisclear/demo": "workspace:*",
    "@aegisclear/sdk": "workspace:*",
    "@hono/node-server": "^2.1.1",
    "hono": "^4.13.8",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "viem": "^2.56.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.5.0",
    "tsx": "^4.23.13",
    "typescript": "^5.9.3",
    "vite": "^6.3.5",
    "vitest": "^5.0.1"
  }
}
```

`web/tsconfig.json` (client, Vite):
```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"], "module": "ESNext", "moduleResolution": "bundler",
    "jsx": "react-jsx", "strict": true, "skipLibCheck": true, "noEmit": true, "isolatedModules": true, "types": ["vite/client"]
  },
  "include": ["src", "shared"]
}
```

`web/tsconfig.server.json` (Node):
```json
{ "extends": "../tsconfig.base.json", "compilerOptions": { "rootDir": ".", "noEmit": true, "types": ["node"] }, "include": ["server", "shared", "test"] }
```

`web/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// dev: halaman di :4043, API & provider di-proxy ke server :4040 (`pnpm --filter @aegisclear/web serve`).
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 4043, proxy: { "/api": "http://127.0.0.1:4040", "/provider": "http://127.0.0.1:4040" } },
});
```

`web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
// server.test.ts menjalankan skenario demo nyata di Anvil (proving Groth16 ≈ 4 s + 100 unit) — timeout besar,
// fileParallelism false karena semua file berbagi satu Anvil dan port 4042.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 300_000, hookTimeout: 300_000, fileParallelism: false, reporters: ["default"] } });
```

`web/index.html`:
```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AegisClear console</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Root `package.json` scripts — add:
```json
    "test:web": "pnpm --filter @aegisclear/web test",
    "web": "pnpm --filter @aegisclear/web start",
    "web:dev": "pnpm --filter @aegisclear/web dev"
```
and extend `"test"` to `"pnpm test:sdk && pnpm test:circuits && pnpm test:contracts && pnpm test:web"`.

`.env.example` — append:
```bash
# Web console (web/): AEGIS_NETWORK=local memakai Anvil 8545 + kunci default; testnet memakai RPC_URL & PK_* di atas.
AEGIS_NETWORK=local
WEB_PORT=4040
# Blok deploy factory di testnet (fallback bila deployments/testnet-46630.json tidak punya "deployBlock"); 0 = scan dari genesis.
FACTORY_BLOCK=121731938
```

- [ ] **Step 2: Shared API types — `web/shared/types.ts`**

```ts
import type { Address, Hex } from "viem";

export type Network = "local" | "testnet";
export type ScenarioId = "B-cooperative" | "B-dispute" | "A-complete" | "A-reject" | "all";
export const SCENARIOS: ScenarioId[] = ["B-cooperative", "B-dispute", "A-complete", "A-reject", "all"];
export type ChannelState = "UNINIT" | "OPEN" | "CLOSING" | "SETTLED";

export interface ConfigResponse {
  network: Network; chainId: number; rpcUrl: string; explorerBase?: string; deployBlock: string;
  addresses: Record<string, Address>;
  provider: Address; clients: { label: "A" | "B"; address: Address }[];
  windows: { challenge: number; response: number };
  /** nilai privat off-chain (ditampilkan sebagai "hanya diketahui kedua pihak"); nonce sesi tidak pernah dikirim */
  terms: { unitPrice: string; maxM1: string; minM2: string; penaltyBps: string; capBps: string };
  breaches: number[]; deposit: string;
}
export interface Step {
  i: number; t: number; phase: string; label: string; detail?: string; txHash?: Hex; gasUsed?: string; channel?: Address;
  progress?: { done: number; total: number };
}
export interface Row { pasar: string; klien_provider: string; penentu: string; terlihat: string; gas: string; proving_ms: string; txs: { label: string; hash: Hex }[] }
export type RunStatus = "running" | "done" | "error";
export interface RunSnapshot {
  id: string; scenario: ScenarioId; status: RunStatus; startedAt: number; endedAt?: number;
  steps: Step[]; result?: Row[]; error?: string; channels: Address[];
}
export interface ChannelSummary {
  channel: Address; factory: Address; factoryName: string; client: Address; provider: Address; termsCommitment: Hex;
  state: ChannelState; seq: number; cumulativeAmount: string; budget: string; deadline: number; hasProof: boolean; payToClient: string;
  openedTx: Hex; openedBlock: string; runId?: string;
}
export interface ChannelEvent { name: string; args: Record<string, string>; txHash: Hex; blockNumber: string; gasUsed: string }
export interface ChannelDetail extends ChannelSummary {
  cfg: { client: Address; provider: Address; token: Address; termsCommitment: Hex; challengeWindow: number; responseWindow: number; payoutClient: Address; payoutProvider: Address; salt: Hex };
  events: ChannelEvent[];
}
export interface LeakResponse { channel: Address; txs: Hex[]; leaks: number; ambiguous: number; details: { txHash: Hex; word: string; kind: "leak" | "ambiguous" }[] }
export type SseEvent = { type: "step"; data: Step } | { type: "done"; data: RunSnapshot } | { type: "error"; data: RunSnapshot };
```

- [ ] **Step 3: Write the failing config tests — `web/test/config.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, loadDotEnv, REPO_ROOT, ANVIL_KEYS } from "../server/config.js";

const dir = mkdtempSync(path.join(tmpdir(), "aegis-web-"));
const dep = (name: string, obj: object) => { const f = path.join(dir, name); writeFileSync(f, JSON.stringify(obj)); return f; };
const LOCAL = dep("local.json", { chainId: 31337, usdg: "0x5fbdb2315678afecb367f032d93f642f64180aa3", verifier: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512", factory: "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0", escrow: "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9" });
const TESTNET = dep("testnet.json", { chainId: 46630, usdg: "0xCadd4526b6E7Beb640c3e920e80Ff28B327B5a83", verifier: "0x5EC99814dF5A78ECB4dbC83f066FB62970847462", factory: "0x0922ee7D6D518681Fd94E98e56D3f161A0574ED3", factoryProd: "0x201BaC41758a45925E1eD7a9Ad79757F19337fDD", escrow: "0x5017C9e556bF750aEE1aB9e74aA094a91924964a", deployBlock: 121731938 });
const PK = "0x" + "11".repeat(32);

describe("loadConfig", () => {
  it("local: default Anvil, kunci default, jendela 120/60, tanpa explorer", () => {
    const c = loadConfig({ DEPLOY_FILE: LOCAL });
    expect(c.network).toBe("local"); expect(c.chainId).toBe(31337); expect(c.port).toBe(4040);
    expect(c.rpcUrl).toBe("http://127.0.0.1:8545"); expect(c.explorerBase).toBeUndefined(); expect(c.deployBlock).toBe(0n);
    expect(c.keys).toEqual(ANVIL_KEYS); expect(c.windows).toEqual({ challenge: 120, response: 60 });
    expect(c.deployment.factory).toBe("0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"); // checksum
  });
  it("local: RPC_URL, WEB_PORT dan DEPLOY_FILE relatif (terhadap root repo) dihormati", () => {
    const rel = path.relative(REPO_ROOT, LOCAL);
    const c = loadConfig({ DEPLOY_FILE: rel, RPC_URL: "http://127.0.0.1:8547", WEB_PORT: "4042" });
    expect(c.rpcUrl).toBe("http://127.0.0.1:8547"); expect(c.port).toBe(4042); expect(c.deployFile).toBe(LOCAL);
  });
  it("testnet: env wajib disebutkan bila hilang", () => {
    expect(() => loadConfig({ AEGIS_NETWORK: "testnet", DEPLOY_FILE: TESTNET, RPC_URL: "x" })).toThrow(/PK_PROVIDER, PK_CLIENT_A, PK_CLIENT_B, PK_DEPLOYER/);
  });
  it("testnet: chain 46630, explorer, deployBlock dari JSON lalu FACTORY_BLOCK, jendela 60/30", () => {
    const env = { AEGIS_NETWORK: "testnet", DEPLOY_FILE: TESTNET, RPC_URL: "https://rpc.testnet.chain.robinhood.com", PK_PROVIDER: PK, PK_CLIENT_A: PK, PK_CLIENT_B: PK, PK_DEPLOYER: PK };
    const c = loadConfig(env);
    expect(c.chainId).toBe(46630); expect(c.chain.id).toBe(46630);
    expect(c.explorerBase).toBe("https://explorer.testnet.chain.robinhood.com");
    expect(c.deployBlock).toBe(121731938n); expect(c.windows).toEqual({ challenge: 60, response: 30 });
    expect(c.keys.faucet).toBe(PK);
    const noBlock = dep("testnet2.json", { chainId: 46630, usdg: "0xCadd4526b6E7Beb640c3e920e80Ff28B327B5a83", verifier: "0x5EC99814dF5A78ECB4dbC83f066FB62970847462", factory: "0x0922ee7D6D518681Fd94E98e56D3f161A0574ED3", escrow: "0x5017C9e556bF750aEE1aB9e74aA094a91924964a" });
    expect(loadConfig({ ...env, DEPLOY_FILE: noBlock, FACTORY_BLOCK: "5" }).deployBlock).toBe(5n);
    expect(loadConfig({ ...env, DEPLOY_FILE: noBlock }).deployBlock).toBe(0n);
  });
  it("testnet: deployment dengan chainId lain ditolak", () => {
    expect(() => loadConfig({ AEGIS_NETWORK: "testnet", DEPLOY_FILE: LOCAL, RPC_URL: "x", PK_PROVIDER: PK, PK_CLIENT_A: PK, PK_CLIENT_B: PK, PK_DEPLOYER: PK })).toThrow(/chainId 31337/);
  });
  it("AEGIS_NETWORK tidak dikenal ditolak", () => {
    expect(() => loadConfig({ AEGIS_NETWORK: "mainnet", DEPLOY_FILE: LOCAL })).toThrow(/local\|testnet/);
  });
});

describe("loadDotEnv", () => {
  it("mengisi hanya variabel yang belum ada, membuang kutip & komentar", () => {
    const f = path.join(dir, ".env");
    writeFileSync(f, `# komentar\nFOO=bar\nexport BAR="baz qux"\nBAZ='q'\nEXISTING=new\n\nINVALID LINE\n`);
    const env: NodeJS.ProcessEnv = { EXISTING: "old" };
    expect(loadDotEnv(f, env)).toBe(3);
    expect(env).toEqual({ EXISTING: "old", FOO: "bar", BAR: "baz qux", BAZ: "q" });
    expect(loadDotEnv(path.join(dir, "missing.env"), env)).toBe(0);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm install && pnpm --filter @aegisclear/web test -- test/config.test.ts`
Expected: FAIL — cannot resolve `../server/config.js`.

- [ ] **Step 5: Write `web/server/config.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineChain, getAddress, type Address, type Chain, type Hex } from "viem";
import { foundry } from "viem/chains";
import type { Network } from "../shared/types.js";

/** web/server/config.ts → root repo (dua tingkat ke atas). */
export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export interface Deployment {
  chainId: number; usdg: Address; factory: Address; factoryProd?: Address; factoryAnchored?: Address; escrow: Address; verifier: Address;
  router?: Address; poseidon?: Address; deployBlock?: number;
}
export interface WebConfig {
  network: Network; chainId: number; rpcUrl: string; chain: Chain; explorerBase?: string; port: number;
  deployment: Deployment; deployFile: string; deployBlock: bigint;
  /** kunci demo — TIDAK PERNAH dikembalikan lewat API atau ditulis ke log */
  keys: { provider: Hex; a: Hex; b: Hex; faucet: Hex };
  windows: { challenge: number; response: number };
}

// anvil #0 (faucet/deployer), #1 (klien A), #2 (provider), #3 (klien B) — sama dengan demo/run.ts & DeployLocal.
export const ANVIL_KEYS = {
  faucet: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  a: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  provider: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  b: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
} as const satisfies WebConfig["keys"];
export const TESTNET = { chainId: 46630, explorerBase: "https://explorer.testnet.chain.robinhood.com", deployFile: "contracts/deployments/testnet-46630.json" } as const;
const ADDRESS_KEYS = ["usdg", "factory", "factoryProd", "factoryAnchored", "escrow", "verifier", "router", "poseidon"] as const;

/** Memuat KEY=VALUE dari file .env ke `env` — hanya variabel yang belum ada. Mengembalikan jumlah yang diisi. */
export function loadDotEnv(file = path.join(REPO_ROOT, ".env"), env: NodeJS.ProcessEnv = process.env): number {
  if (!existsSync(file)) return 0;
  let n = 0;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (env[m[1]] === undefined) { env[m[1]] = v; n++; }
  }
  return n;
}

export function readDeployment(file: string): Deployment {
  if (!existsSync(file)) throw new Error(`deployment file tidak ada: ${file} (jalankan DeployLocal/DeployTestnet dulu)`);
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  for (const k of ["usdg", "factory", "escrow", "verifier"]) if (!raw[k]) throw new Error(`deployment ${file}: field ${k} hilang`);
  const d: Record<string, unknown> = { ...raw };
  for (const k of ADDRESS_KEYS) if (typeof raw[k] === "string") d[k] = getAddress(raw[k] as string);
  return d as unknown as Deployment;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  const network = env.AEGIS_NETWORK ?? "local";
  if (network !== "local" && network !== "testnet") throw new Error(`AEGIS_NETWORK harus local|testnet, dapat "${network}"`);
  const port = Number(env.WEB_PORT ?? 4040);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`WEB_PORT tidak valid: ${env.WEB_PORT}`);
  if (network === "local") {
    const deployFile = path.resolve(REPO_ROOT, env.DEPLOY_FILE ?? "contracts/deployments/local.json");
    return {
      network, chainId: 31337, rpcUrl: env.RPC_URL ?? "http://127.0.0.1:8545", chain: foundry, port,
      deployment: readDeployment(deployFile), deployFile, deployBlock: 0n, keys: { ...ANVIL_KEYS }, windows: { challenge: 120, response: 60 },
    };
  }
  const missing = ["RPC_URL", "PK_PROVIDER", "PK_CLIENT_A", "PK_CLIENT_B", "PK_DEPLOYER"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`AEGIS_NETWORK=testnet butuh env: ${missing.join(", ")}`);
  const deployFile = path.resolve(REPO_ROOT, env.DEPLOY_FILE ?? TESTNET.deployFile);
  const deployment = readDeployment(deployFile);
  if (Number(deployment.chainId) !== TESTNET.chainId) throw new Error(`deployment ${deployFile} untuk chainId ${deployment.chainId}, bukan ${TESTNET.chainId}`);
  const rpcUrl = env.RPC_URL!;
  const chain = defineChain({
    id: TESTNET.chainId, name: "robinhood-testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }, blockExplorers: { default: { name: "Blockscout", url: TESTNET.explorerBase } },
  });
  return {
    network, chainId: TESTNET.chainId, rpcUrl, chain, explorerBase: TESTNET.explorerBase, port, deployment, deployFile,
    deployBlock: BigInt(deployment.deployBlock ?? env.FACTORY_BLOCK ?? 0),
    keys: { provider: env.PK_PROVIDER as Hex, a: env.PK_CLIENT_A as Hex, b: env.PK_CLIENT_B as Hex, faucet: env.PK_DEPLOYER as Hex },
    windows: { challenge: 60, response: 30 },
  };
}
```

- [ ] **Step 6: Run the config tests**

Run: `pnpm --filter @aegisclear/web test -- test/config.test.ts`
Expected: 7 passing.

- [ ] **Step 7: Write `web/server/app.ts` (skeleton: `/api/config` + static) and `web/server/index.ts`**

`web/server/app.ts`:
```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import { privateKeyToAccount } from "viem/accounts";
import { BREACHES, DEPOSIT_B, TERMS_BASE } from "@aegisclear/demo";
import type { ConfigResponse } from "../shared/types.js";
import type { WebConfig } from "./config.js";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
  ".json": "application/json", ".ico": "image/x-icon", ".map": "application/json", ".woff2": "font/woff2", ".png": "image/png",
};
/** JSON dengan bigint → string desimal. */
export const j = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

export interface WebServer { app: Hono; cfg: WebConfig; start(): Promise<{ port: number }>; stop(): Promise<void> }

export function createWebServer(cfg: WebConfig): WebServer {
  const app = new Hono();
  const provider = privateKeyToAccount(cfg.keys.provider).address;
  const clients = [{ label: "A" as const, address: privateKeyToAccount(cfg.keys.a).address }, { label: "B" as const, address: privateKeyToAccount(cfg.keys.b).address }];
  const { chainId: _c, deployBlock: _b, ...addresses } = cfg.deployment as unknown as Record<string, unknown>;

  app.get("/api/config", (c) => {
    const body: ConfigResponse = {
      network: cfg.network, chainId: cfg.chainId, rpcUrl: cfg.rpcUrl, explorerBase: cfg.explorerBase, deployBlock: cfg.deployBlock.toString(),
      addresses: addresses as ConfigResponse["addresses"], provider, clients, windows: cfg.windows,
      terms: j({ unitPrice: TERMS_BASE.unitPrice, maxM1: TERMS_BASE.maxM1, minM2: TERMS_BASE.minM2, penaltyBps: TERMS_BASE.penaltyBps, capBps: TERMS_BASE.capBps }),
      breaches: [...BREACHES].sort((a, b) => a - b), deposit: DEPOSIT_B.toString(),
    };
    return c.json(body);
  });

  // ---- static (web/dist) dengan fallback SPA; selalu terdaftar TERAKHIR ----
  app.get("/*", (c) => {
    let p = decodeURIComponent(new URL(c.req.url).pathname);
    if (p === "/" || !path.extname(p)) p = "/index.html";
    const file = path.join(DIST, path.normalize(p));
    if (!file.startsWith(DIST)) return c.text("forbidden", 403);
    if (!existsSync(file)) return c.text(p === "/index.html" ? "web/dist belum ada — jalankan `pnpm --filter @aegisclear/web build`" : "not found", 404);
    return c.body(readFileSync(file), 200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  });

  let server: ServerType | undefined;
  return {
    app, cfg,
    start: () => new Promise((resolve) => { server = serve({ fetch: app.fetch, port: cfg.port }, (info) => resolve({ port: info.port })); }),
    stop: () => new Promise((resolve) => (server ? server.close(() => resolve()) : resolve())),
  };
}
```

`web/server/index.ts`:
```ts
import { loadConfig, loadDotEnv } from "./config.js";
import { createWebServer } from "./app.js";

loadDotEnv();
const cfg = loadConfig();
const srv = createWebServer(cfg);
const { port } = await srv.start();
console.log(`AegisClear console: http://localhost:${port}  (network ${cfg.network}, chain ${cfg.chainId}, factory ${cfg.deployment.factory})`);
process.on("SIGINT", () => { void srv.stop().then(() => process.exit(0)); });
```

- [ ] **Step 8: Minimal page (replaced in Task 6) — `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles.css`**

`web/src/main.tsx`:
```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
```

`web/src/App.tsx`:
```tsx
import { useEffect, useState } from "react";
import type { ConfigResponse } from "../shared/types";
export function App() {
  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/config").then((r) => r.json()).then(setCfg).catch((e) => setErr(String(e))); }, []);
  return (
    <main className="wrap">
      <h1>AegisClear console</h1>
      {err && <p className="banner error">server tidak jalan: <code>pnpm --filter @aegisclear/web start</code> ({err})</p>}
      {cfg && <p>network <span className="pill">{cfg.network} · {cfg.chainId}</span> factory <code>{cfg.addresses.factory}</code></p>}
    </main>
  );
}
```

`web/src/styles.css` (starter; Task 6 extends it):
```css
:root { color-scheme: dark; --bg: #0b0f14; --panel: #121821; --line: #1f2a37; --fg: #e6edf3; --muted: #8b98a5; --accent: #4cc2ff; --ok: #3fb950; --warn: #d29922; --bad: #f85149; --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
.wrap { max-width: 1280px; margin: 0 auto; padding: 16px; }
code { font-family: var(--mono); font-size: 12.5px; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); font-family: var(--mono); font-size: 12px; }
.banner { padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); }
.banner.error { border-color: var(--bad); }
```

- [ ] **Step 9: Build, typecheck, and smoke the server**

Run:
```bash
pnpm --filter @aegisclear/web typecheck
pnpm --filter @aegisclear/web build
# server needs a deployment file: use the Anvil 8547 + local.json from Task 1
RPC_URL=http://127.0.0.1:8547 WEB_PORT=4042 pnpm --filter @aegisclear/web serve & sleep 3
curl -s http://127.0.0.1:4042/api/config | head -c 400; echo
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:4042/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4042/nonexistent.png
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:4042/..%2F..%2Fpackage.json"
kill %1
```
Expected: typecheck clean; `dist/` built; config JSON with `"network":"local"`, `"chainId":31337`, clients A/B, `terms.unitPrice = "20000"`, `breaches = [3,17,29,44,58,71,90]`, and **no** key material; `200 text/html; charset=utf-8`; `404`; `403` or `404` (never file contents outside dist).

- [ ] **Step 10: Commit**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml .env.example web
git commit -m "web: package scaffold — network config (local/testnet), .env loader, /api/config, static SPA server"
```

---

### Task 3: Chain services, provider mount, channel index + `/api/channels`

**Files:**
- Create: `web/server/chain.ts`, `web/server/channels.ts`, `web/test/server.test.ts`
- Modify: `web/server/app.ts`

**Interfaces:**
- Consumes: `createProviderApp` (SDK) — `{ app, sessions, startProviderWatcher }`; `readChannel`, `channelAbi`, `factoryAbi`, `erc20Abi`, `erc20Balance`; demo constants `TERMS_BASE`, `DEPOSIT_B`, `metricsFor`.
- Produces: `makeChain(cfg) → ChainServices { publicClient, ctx(pk), addressOf(pk), ensureUsdg(who, min), timeTravel(seconds, emit) }`; `ChannelIndex { list(force?), detail(addr), factories() }`; `WebServer` gains `services: { chain, index, provider }` (used by Task 4/5); routes `GET /api/channels`, `GET /api/channels/:addr`; provider app mounted at `/provider` and its watcher started in `start()`, stopped in `stop()`.

- [ ] **Step 1: `web/server/chain.ts`**

```ts
import { createPublicClient, createWalletClient, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { erc20Abi, erc20Balance, type ChainCtx } from "@aegisclear/sdk";
import type { StepInput } from "@aegisclear/demo";
import type { WebConfig } from "./config.js";

export interface ChainServices {
  publicClient: PublicClient;
  ctx: (pk: Hex) => ChainCtx;
  addressOf: (pk: Hex) => Address;
  /** MockUSDG.mint (permissionless) dari kunci faucet bila saldo `who` < `min`; 50 USDG per mint. */
  ensureUsdg: (who: Address, min: bigint) => Promise<{ minted: bigint }>;
  /** local: evm_increaseTime + evm_mine; testnet: tunggu nyata, step "wait" tiap 10 s. */
  timeTravel: (seconds: number, emit: (s: StepInput) => void) => Promise<void>;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const MINT_AMOUNT = 50_000_000n;

export function makeChain(cfg: WebConfig): ChainServices {
  const publicClient = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl) });
  const ctx = (pk: Hex): ChainCtx => ({
    publicClient, chainId: cfg.chainId, factory: cfg.deployment.factory,
    walletClient: createWalletClient({ account: privateKeyToAccount(pk), chain: cfg.chain, transport: http(cfg.rpcUrl) }),
  });
  const addressOf = (pk: Hex) => privateKeyToAccount(pk).address;
  const ensureUsdg: ChainServices["ensureUsdg"] = async (who, min) => {
    const faucet = ctx(cfg.keys.faucet);
    if ((await erc20Balance(faucet, cfg.deployment.usdg, who)) >= min) return { minted: 0n };
    const hash = await faucet.walletClient.writeContract({ address: cfg.deployment.usdg, abi: erc20Abi, functionName: "mint", args: [who, MINT_AMOUNT] });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`mint ke ${who} gagal (${hash})`);
    return { minted: MINT_AMOUNT };
  };
  const timeTravel: ChainServices["timeTravel"] = cfg.network === "local"
    ? async (seconds, emit) => {
        emit({ phase: "wait", label: `Anvil: evm_increaseTime(${seconds}) + evm_mine` });
        await publicClient.request({ method: "evm_increaseTime", params: [seconds] } as any);
        await publicClient.request({ method: "evm_mine", params: [] } as any);
      }
    : async (seconds, emit) => {
        for (let left = seconds; left > 0; left -= 10) {
          emit({ phase: "wait", label: `menunggu jendela tantangan: ${left} s tersisa`, progress: { done: seconds - left, total: seconds } });
          await sleep(Math.min(10, left) * 1000);
        }
      };
  return { publicClient, ctx, addressOf, ensureUsdg, timeTravel };
}
```

- [ ] **Step 2: `web/server/channels.ts`**

```ts
import { getAddress, type Address, type Hex } from "viem";
import { channelAbi, factoryAbi, readChannel, type ChainCtx } from "@aegisclear/sdk";
import type { ChannelDetail, ChannelEvent, ChannelSummary } from "../shared/types.js";
import type { WebConfig } from "./config.js";

const FACTORY_KEYS = ["factory", "factoryProd", "factoryAnchored"] as const;

/** Indeks channel dari event ChannelOpened semua factory di deployment; view on-chain per channel; cache `ttlMs`. */
export class ChannelIndex {
  private cache?: { at: number; data: ChannelSummary[] };
  private readonly gas = new Map<Hex, bigint>();
  constructor(
    private readonly cfg: WebConfig, private readonly ctx: ChainCtx,
    private readonly runIdOf: (channel: Address) => string | undefined = () => undefined, private readonly ttlMs = 3000,
  ) {}
  factories(): { name: string; address: Address }[] {
    return FACTORY_KEYS.flatMap((k) => (this.cfg.deployment[k] ? [{ name: k, address: this.cfg.deployment[k]! }] : []));
  }
  async list(force = false): Promise<ChannelSummary[]> {
    if (!force && this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.data;
    const out: ChannelSummary[] = [];
    for (const f of this.factories()) {
      const logs = await this.ctx.publicClient.getContractEvents({ address: f.address, abi: factoryAbi, eventName: "ChannelOpened", fromBlock: this.cfg.deployBlock });
      for (const l of logs) {
        if (!l.args.channel || !l.args.client || !l.args.provider || !l.args.termsCommitment) continue;
        const channel = getAddress(l.args.channel);
        const v = await readChannel(this.ctx, channel);
        out.push({
          channel, factory: f.address, factoryName: f.name, client: getAddress(l.args.client), provider: getAddress(l.args.provider), termsCommitment: l.args.termsCommitment,
          state: v.state, seq: v.seq, cumulativeAmount: v.cumulativeAmount.toString(), budget: v.budget.toString(), deadline: v.deadline, hasProof: v.hasProof, payToClient: v.payToClient.toString(),
          openedTx: l.transactionHash, openedBlock: l.blockNumber.toString(), runId: this.runIdOf(channel),
        });
      }
    }
    out.sort((a, b) => (BigInt(b.openedBlock) > BigInt(a.openedBlock) ? 1 : BigInt(b.openedBlock) < BigInt(a.openedBlock) ? -1 : 0));
    this.cache = { at: Date.now(), data: out };
    return out;
  }
  async detail(addr: string): Promise<ChannelDetail | undefined> {
    let channel: Address;
    try { channel = getAddress(addr); } catch { return undefined; }
    const s = (await this.list()).find((c) => c.channel === channel) ?? (await this.list(true)).find((c) => c.channel === channel);
    if (!s) return undefined;
    const c = await this.ctx.publicClient.readContract({ address: channel, abi: channelAbi, functionName: "cfg" });
    const cfg: ChannelDetail["cfg"] = { client: c[0], provider: c[1], token: c[2], termsCommitment: c[3], challengeWindow: c[4], responseWindow: c[5], payoutClient: c[6], payoutProvider: c[7], salt: c[8] };
    const logs = await this.ctx.publicClient.getContractEvents({ address: channel, abi: channelAbi, fromBlock: BigInt(s.openedBlock) });
    const events: ChannelEvent[] = [];
    for (const l of logs) {
      events.push({
        name: l.eventName, args: Object.fromEntries(Object.entries((l.args ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)])),
        txHash: l.transactionHash, blockNumber: l.blockNumber.toString(), gasUsed: (await this.gasUsed(l.transactionHash)).toString(),
      });
    }
    return { ...s, cfg, events };
  }
  private async gasUsed(hash: Hex): Promise<bigint> {
    const c = this.gas.get(hash);
    if (c !== undefined) return c;
    const r = await this.ctx.publicClient.getTransactionReceipt({ hash });
    this.gas.set(hash, r.gasUsed);
    return r.gasUsed;
  }
}
```

- [ ] **Step 3: Extend `web/server/app.ts`** — provider mount + channel routes + services

Replace the body of `createWebServer` so it becomes (keep the `/api/config` handler and the static handler exactly as in Task 2; the static handler must remain the last route):

```ts
import { createProviderApp, type Watcher } from "@aegisclear/sdk";
import { metricsFor } from "@aegisclear/demo";
import { makeChain, type ChainServices } from "./chain.js";
import { ChannelIndex } from "./channels.js";

export interface WebServer {
  app: Hono; cfg: WebConfig;
  services: { chain: ChainServices; index: ChannelIndex; provider: ReturnType<typeof createProviderApp>; runIdOf: Map<Address, string> };
  start(): Promise<{ port: number }>; stop(): Promise<void>;
}

export function createWebServer(cfg: WebConfig): WebServer {
  const app = new Hono();
  const chain = makeChain(cfg);
  const providerAccount = privateKeyToAccount(cfg.keys.provider);
  const provider = providerAccount.address;
  const clients = [ /* unchanged */ ];
  const runIdOf = new Map<Address, string>();   // channel → runId (diisi Task 4)
  const index = new ChannelIndex(cfg, chain.ctx(cfg.keys.provider), (ch) => runIdOf.get(ch));
  const providerApp = createProviderApp({
    ctx: chain.ctx(cfg.keys.provider), account: providerAccount, usdg: cfg.deployment.usdg, terms: TERMS_BASE, unitQty: 1n, deposit: DEPOSIT_B,
    challengeWindow: cfg.windows.challenge, responseWindow: cfg.windows.response, metrics: metricsFor,
  });
  app.route("/provider", providerApp.app);

  app.get("/api/config", /* unchanged */);
  app.get("/api/channels", async (c) => c.json({ scannedAt: Date.now(), channels: await index.list() }));
  app.get("/api/channels/:addr", async (c) => {
    const d = await index.detail(c.req.param("addr"));
    return d ? c.json(d) : c.json({ error: "unknown channel" }, 404);
  });

  /* static handler unchanged, last */

  let server: ServerType | undefined; let watcher: Watcher | undefined;
  return {
    app, cfg, services: { chain, index, provider: providerApp, runIdOf },
    start: () => new Promise((resolve) => {
      // Responder T1 in-process (README §(d)): wajib berjalan di proses provider ini.
      watcher = providerApp.startProviderWatcher({ intervalMs: cfg.network === "local" ? 2_000 : 15_000, fromBlock: cfg.deployBlock, log: (s) => console.log(`[watcher] ${s}`) });
      server = serve({ fetch: app.fetch, port: cfg.port }, (info) => resolve({ port: info.port }));
    }),
    stop: () => new Promise((resolve) => { watcher?.stop(); server ? server.close(() => resolve()) : resolve(); }),
  };
}
```

Import `type Address` from viem. Do not leave the old `WebServer` interface — replace it.

- [ ] **Step 4: Write the failing integration test — `web/test/server.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { AegisClient, defaultArtifacts } from "@aegisclear/sdk";
import { loadConfig, REPO_ROOT } from "../server/config.js";
import { createWebServer, type WebServer } from "../server/app.js";
import type { ChannelSummary, ConfigResponse } from "../shared/types.js";

const DEPLOY = path.resolve(REPO_ROOT, process.env.DEPLOY_FILE ?? "contracts/deployments/local.json");
const DEPLOY_EXISTS = existsSync(DEPLOY);
if (!DEPLOY_EXISTS) console.warn(`web server.test: deploy file not found at ${DEPLOY} — suite skipped`);
const PORT = 4042;
const BASE = `http://127.0.0.1:${PORT}`;
const get = async <T>(p: string): Promise<T> => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(`${p} → ${r.status} ${await r.text()}`); return r.json() as Promise<T>; };

describe.skipIf(!DEPLOY_EXISTS)("web console server (Anvil)", () => {
  let srv: WebServer;
  beforeAll(async () => {
    srv = createWebServer(loadConfig({ ...process.env, AEGIS_NETWORK: "local", WEB_PORT: String(PORT), DEPLOY_FILE: DEPLOY }));
    await srv.start();
  });
  afterAll(async () => { await srv?.stop(); });

  it("GET /api/config: bentuk, tanpa kunci privat", async () => {
    const c = await get<ConfigResponse>("/api/config");
    expect(c.network).toBe("local"); expect(c.chainId).toBe(31337);
    expect(c.clients.map((x) => x.label)).toEqual(["A", "B"]);
    expect(c.terms.unitPrice).toBe("20000"); expect(c.breaches).toEqual([3, 17, 29, 44, 58, 71, 90]); expect(c.deposit).toBe("5000000");
    expect(JSON.stringify(c)).not.toMatch(/0x[0-9a-f]{64}/i);
  });

  it("provider di /provider: klien SDK membuka channel; /api/channels & /api/channels/:addr melihatnya", async () => {
    const cfg = srv.cfg; const chain = srv.services.chain;
    const c = new AegisClient({ ctx: chain.ctx(cfg.keys.a), account: privateKeyToAccount(cfg.keys.a), providerUrl: `${BASE}/provider`, usdg: cfg.deployment.usdg, artifacts: defaultArtifacts(REPO_ROOT) });
    await c.start();
    await c.requestUnit(); await c.requestUnit(); await c.finalAck();
    const list = await get<{ channels: ChannelSummary[] }>("/api/channels");
    const mine = list.channels.find((x) => x.channel === c.channel);
    expect(mine).toBeDefined();
    expect(mine!.state).toBe("OPEN"); expect(mine!.client).toBe(privateKeyToAccount(cfg.keys.a).address);
    expect(mine!.budget).toBe("5000000"); expect(mine!.factoryName).toBe("factory");
    await c.closeCooperative();
    const d = await get<any>(`/api/channels/${c.channel}`);   // detail memaksa refresh cache bila perlu
    expect(d.cfg.client).toBe(mine!.client); expect(d.cfg.challengeWindow).toBe(120);
    expect(d.events.map((e: any) => e.name)).toContain("Settled");
    expect(d.events.find((e: any) => e.name === "Settled").args.cooperative).toBe("true");
    expect((await get<{ channels: ChannelSummary[] }>("/api/channels")).channels.find((x) => x.channel === c.channel)?.state).toBe("SETTLED");
  });

  it("GET /api/channels/:addr untuk alamat asing → 404", async () => {
    const r = await fetch(`${BASE}/api/channels/0x0000000000000000000000000000000000000001`);
    expect(r.status).toBe(404);
    expect((await fetch(`${BASE}/api/channels/not-an-address`)).status).toBe(404);
  });
});
```

Note the detail call happens right after `closeCooperative` while the 3 s cache may still say OPEN: `detail()` falls back to `list(true)` only when the channel is missing, so the summary fields in `d` may be stale — assert on `d.cfg`/`d.events` (fresh) as written, and on the state via the later `/api/channels` call; if that call is within the cache window, poll: wrap the last expectation in a small loop (`for (let i = 0; i < 10; i++) { … if (state === "SETTLED") break; await new Promise((r) => setTimeout(r, 500)); }`).

- [ ] **Step 5: Run the tests**

Run: `RPC_URL=http://127.0.0.1:8547 pnpm --filter @aegisclear/web test`
Expected: config tests pass; server tests pass (3). If the suite prints `deploy file not found`, run `DeployLocal` against the 8547 Anvil first (Task 1 Step 10).

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "web: chain services, provider mounted at /provider with in-process responder, channel index + /api/channels"
```

---

### Task 4: Run store, scenario runner, `/api/demo/*` with SSE

**Files:**
- Create: `web/server/runs.ts`, `web/server/demo.ts`, `web/test/runstore.test.ts`
- Modify: `web/server/app.ts`, `web/server/channels.ts` (+ `receiptsRoot`), `web/shared/types.ts` (+ `receiptsRoot`), `web/test/server.test.ts`

**Interfaces:**
- Consumes: Task 1 library (`runMarketB`, `runMarketA`, `toRows`, `privateValues`, `DEPOSIT_B`, `ESCROW_AMOUNT_A`, `ScenarioEnv`, `StepInput`), Task 3 services.
- Produces: `RunStore` (`create`, `emit`, `finish`, `fail`, `get`, `list`, `subscribe`, `busy`, `active`), `makeRunner(deps) → { start(scenario), resetSession(client), privateOf(runId) }`, routes `POST /api/demo/run`, `GET /api/demo/runs`, `GET /api/demo/runs/:id`, `GET /api/demo/runs/:id/events` (SSE). `WebServer.services` gains `store`, `runner`.

- [ ] **Step 1: Add `receiptsRoot` to `ChannelSummary`**

In `web/shared/types.ts` add `receiptsRoot: Hex;` after `cumulativeAmount: string;` in `ChannelSummary`. In `web/server/channels.ts` `list()` add `receiptsRoot: rootHex(v.receiptsRoot),` (import `rootHex` from `@aegisclear/sdk`).

- [ ] **Step 2: Write the failing RunStore test — `web/test/runstore.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { RunStore } from "../server/runs.js";
import type { SseEvent } from "../shared/types.js";

const CH = "0x0000000000000000000000000000000000000abc" as const;

describe("RunStore", () => {
  it("satu run aktif; step diberi nomor & waktu; channel dikumpulkan", () => {
    const s = new RunStore();
    const r = s.create("B-cooperative");
    expect(s.busy).toBe(true); expect(s.active?.id).toBe(r.id);
    expect(() => s.create("A-reject")).toThrow(/busy/);
    const st = s.emit(r.id, { phase: "fund", label: "x", channel: CH });
    expect(st.i).toBe(0); expect(st.t).toBeGreaterThanOrEqual(0);
    expect(s.emit(r.id, { phase: "serve", label: "y" }).i).toBe(1);
    expect(s.get(r.id)!.channels).toEqual([CH]);
    s.finish(r.id, []);
    expect(s.busy).toBe(false); expect(s.get(r.id)!.status).toBe("done"); expect(s.get(r.id)!.endedAt).toBeDefined();
  });
  it("subscribe: replay step lama, lalu live, lalu done; pelanggan telat dapat replay + done", () => {
    const s = new RunStore(); const r = s.create("B-dispute");
    s.emit(r.id, { phase: "fund", label: "a" });
    const got: SseEvent[] = []; const unsub = s.subscribe(r.id, (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["step"]);
    s.emit(r.id, { phase: "serve", label: "b" }); s.finish(r.id, [{ pasar: "p", klien_provider: "k", penentu: "x", terlihat: "y", gas: "1", proving_ms: "-", txs: [] }]);
    expect(got.map((e) => e.type)).toEqual(["step", "step", "done"]);
    unsub();
    const late: SseEvent[] = []; s.subscribe(r.id, (e) => late.push(e));
    expect(late.map((e) => e.type)).toEqual(["step", "step", "done"]);
    expect((late[2] as any).data.result[0].pasar).toBe("p");
  });
  it("fail → error event; unsubscribe menghentikan notifikasi", () => {
    const s = new RunStore(); const r = s.create("all");
    const got: SseEvent[] = []; const unsub = s.subscribe(r.id, (e) => got.push(e)); unsub();
    s.emit(r.id, { phase: "fund", label: "a" }); s.fail(r.id, "boom");
    expect(got).toEqual([]); expect(s.get(r.id)!.status).toBe("error"); expect(s.get(r.id)!.error).toBe("boom"); expect(s.busy).toBe(false);
  });
  it("kapasitas: run tertua (yang sudah selesai) dibuang; list() terbaru dulu tanpa steps", () => {
    const s = new RunStore(3); const ids: string[] = [];
    for (let i = 0; i < 5; i++) { const r = s.create("A-complete"); ids.push(r.id); s.emit(r.id, { phase: "escrow", label: String(i) }); s.finish(r.id, []); }
    expect(s.get(ids[0])).toBeUndefined(); expect(s.get(ids[1])).toBeUndefined(); expect(s.get(ids[4])).toBeDefined();
    const l = s.list(); expect(l.length).toBe(3); expect(l[0].id).toBe(ids[4]); expect(l[0].steps).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @aegisclear/web test -- test/runstore.test.ts`
Expected: FAIL — cannot resolve `../server/runs.js`.

- [ ] **Step 4: Write `web/server/runs.ts`**

```ts
import { randomBytes } from "node:crypto";
import type { StepInput } from "@aegisclear/demo";
import type { Row, RunSnapshot, ScenarioId, SseEvent, Step } from "../shared/types.js";

type Listener = (ev: SseEvent) => void;

/** Run demo di memori proses: satu run aktif, maksimum `max` run tersimpan (yang selesai, tertua dibuang). */
export class RunStore {
  private readonly runs = new Map<string, RunSnapshot>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private activeId?: string;
  constructor(private readonly max = 50) {}
  get busy(): boolean { return this.activeId !== undefined; }
  get active(): RunSnapshot | undefined { return this.activeId ? this.runs.get(this.activeId) : undefined; }

  create(scenario: ScenarioId): RunSnapshot {
    if (this.busy) throw new Error("busy");
    const id = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
    const run: RunSnapshot = { id, scenario, status: "running", startedAt: Date.now(), steps: [], channels: [] };
    this.runs.set(id, run); this.activeId = id;
    for (const old of this.runs.keys()) {
      if (this.runs.size <= this.max) break;
      if (old === this.activeId) continue;
      this.runs.delete(old); this.listeners.delete(old);
    }
    return run;
  }
  emit(id: string, s: StepInput): Step {
    const run = this.must(id);
    const step: Step = { ...s, i: run.steps.length, t: Date.now() - run.startedAt };
    run.steps.push(step);
    if (s.channel && !run.channels.includes(s.channel)) run.channels.push(s.channel);
    this.notify(id, { type: "step", data: step });
    return step;
  }
  finish(id: string, result: Row[]): void {
    const run = this.must(id); run.status = "done"; run.result = result; run.endedAt = Date.now();
    this.release(id); this.notify(id, { type: "done", data: run });
  }
  fail(id: string, error: string): void {
    const run = this.must(id); run.status = "error"; run.error = error; run.endedAt = Date.now();
    this.release(id); this.notify(id, { type: "error", data: run });
  }
  get(id: string): RunSnapshot | undefined { return this.runs.get(id); }
  /** Terbaru dulu, tanpa steps (ringkas). */
  list(): RunSnapshot[] { return [...this.runs.values()].reverse().map((r) => ({ ...r, steps: [] })); }
  /** Replay step yang ada dulu; run yang sudah selesai langsung diakhiri dengan done/error. */
  subscribe(id: string, fn: Listener): () => void {
    const run = this.must(id);
    for (const st of run.steps) fn({ type: "step", data: st });
    if (run.status !== "running") { fn(run.status === "done" ? { type: "done", data: run } : { type: "error", data: run }); return () => {}; }
    let set = this.listeners.get(id);
    if (!set) { set = new Set(); this.listeners.set(id, set); }
    set.add(fn);
    return () => { set!.delete(fn); };
  }
  private must(id: string): RunSnapshot { const r = this.runs.get(id); if (!r) throw new Error(`run ${id} tidak ada`); return r; }
  private release(id: string): void { if (this.activeId === id) this.activeId = undefined; }
  private notify(id: string, ev: SseEvent): void {
    for (const fn of this.listeners.get(id) ?? []) fn(ev);
    if (ev.type !== "step") this.listeners.delete(id);
  }
}
```

- [ ] **Step 5: Run the RunStore tests** — `pnpm --filter @aegisclear/web test -- test/runstore.test.ts` → 4 passing.

- [ ] **Step 6: Write `web/server/demo.ts`**

```ts
import type { Address, Hex } from "viem";
import { defaultArtifacts, readChannel, type createProviderApp } from "@aegisclear/sdk";
import {
  runMarketA, runMarketB, toRows, privateValues, DEPOSIT_B, ESCROW_AMOUNT_A,
  type MarketAResult, type MarketBResult, type ScenarioEnv, type StepInput,
} from "@aegisclear/demo";
import type { ScenarioId } from "../shared/types.js";
import { REPO_ROOT, type WebConfig } from "./config.js";
import type { ChainServices } from "./chain.js";
import type { RunStore } from "./runs.js";

export type StartResult = { runId: string } | { error: "busy" } | { error: "unknown-scenario" } | { error: "client-has-open-channel"; channel: Address };
export interface RunnerDeps {
  cfg: WebConfig; chain: ChainServices; store: RunStore; provider: ReturnType<typeof createProviderApp>;
  runIdOf: Map<Address, string>; providerUrl: string;
}
export interface PrivateRecord { channel: Address; values: bigint[]; txs: Hex[] }
type Single = Exclude<ScenarioId, "all">;
const CLIENT_OF: Record<Single, "a" | "b"> = { "B-cooperative": "a", "B-dispute": "b", "A-complete": "a", "A-reject": "b" };
const ALL: Single[] = ["B-cooperative", "B-dispute", "A-complete", "A-reject"];   // urutan tabel §14 dijaga oleh toRows

export function makeRunner(d: RunnerDeps) {
  const privates = new Map<string, PrivateRecord[]>();
  const env: ScenarioEnv = {
    ctx: d.chain.ctx, publicClient: d.chain.publicClient, d: d.cfg.deployment, art: defaultArtifacts(REPO_ROOT),
    providerUrl: d.providerUrl, providerAddress: d.chain.addressOf(d.cfg.keys.provider), providerPk: d.cfg.keys.provider,
    challengeWindow: d.cfg.windows.challenge, timeTravel: d.chain.timeTravel,
  };

  /**
   * Sesi provider (`createProviderApp().sessions`) dikunci per alamat klien; run baru untuk klien yang sama
   * butuh sesi baru. Hapus sesi bila belum punya channel atau channel-nya SETTLED; bila channel masih
   * OPEN/CLOSING kembalikan alamatnya (JANGAN hapus — co-signed checkpoint di sesi itu dibutuhkan responder T1).
   */
  async function resetSession(client: Address): Promise<Address | undefined> {
    const key = client.toLowerCase();
    const s = d.provider.sessions.get(key);
    if (!s) return undefined;
    if (s.channel && (await readChannel(d.chain.ctx(d.cfg.keys.provider), s.channel)).state !== "SETTLED") return s.channel;
    d.provider.sessions.delete(key);
    return undefined;
  }

  async function start(scenario: ScenarioId): Promise<StartResult> {
    if (scenario !== "all" && !(scenario in CLIENT_OF)) return { error: "unknown-scenario" };
    if (d.store.busy) return { error: "busy" };
    const parts: Single[] = scenario === "all" ? ALL : [scenario];
    for (const p of parts) {
      if (!p.startsWith("B-")) continue;
      const open = await resetSession(d.chain.addressOf(d.cfg.keys[CLIENT_OF[p]]));
      if (open) return { error: "client-has-open-channel", channel: open };
    }
    const run = d.store.create(scenario);
    void execute(run.id, parts)
      .then((rows) => d.store.finish(run.id, rows))
      .catch((e) => d.store.fail(run.id, e instanceof Error ? e.message : String(e)));
    return { runId: run.id };
  }

  async function execute(runId: string, parts: Single[]) {
    const emit = (s: StepInput) => { if (s.channel) d.runIdOf.set(s.channel, runId); d.store.emit(runId, s); };
    const res: { aOk?: MarketAResult; aRej?: MarketAResult; bCoop?: MarketBResult; bDisp?: MarketBResult } = {};
    for (const p of parts) {
      const pk = d.cfg.keys[CLIENT_OF[p]]; const who = d.chain.addressOf(pk); const isB = p.startsWith("B-");
      const { minted } = await d.chain.ensureUsdg(who, isB ? DEPOSIT_B : ESCROW_AMOUNT_A);
      if (minted) emit({ phase: isB ? "fund" : "escrow", label: `faucet: mint ${Number(minted) / 1e6} USDG ke klien ${CLIENT_OF[p].toUpperCase()}` });
      emit({ phase: isB ? "fund" : "escrow", label: `▶ ${p} — klien ${CLIENT_OF[p].toUpperCase()} ${who}` });
      if (isB) {
        const r = await runMarketB(env, pk, p === "B-dispute", emit);
        privates.set(runId, [...(privates.get(runId) ?? []), { channel: r.channel, values: privateValues(r.terms), txs: r.txs.map((t) => t.hash) }]);
        if (p === "B-dispute") res.bDisp = r; else res.bCoop = r;
      } else {
        const r = await runMarketA(env, pk, p === "A-complete", emit);
        if (p === "A-complete") res.aOk = r; else res.aRej = r;
      }
    }
    return toRows(res);
  }

  const privateOf = (runId: string): PrivateRecord[] | undefined => privates.get(runId);
  return { start, resetSession, privateOf };
}
```

- [ ] **Step 7: Routes in `web/server/app.ts`**

Add imports:
```ts
import { streamSSE } from "hono/streaming";
import type { ScenarioId, SseEvent } from "../shared/types.js";
import { RunStore } from "./runs.js";
import { makeRunner } from "./demo.js";
```
After `app.route("/provider", providerApp.app);` create:
```ts
  const store = new RunStore();
  const runner = makeRunner({ cfg, chain, store, provider: providerApp, runIdOf, providerUrl: `http://127.0.0.1:${cfg.port}/provider` });
```
Routes (before the static handler):
```ts
  app.post("/api/demo/run", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { scenario?: string };
    const r = await runner.start(body.scenario as ScenarioId);
    if ("runId" in r) return c.json(r, 202);
    return c.json(r, r.error === "unknown-scenario" ? 400 : 409);
  });
  app.get("/api/demo/runs", (c) => c.json(store.list()));
  app.get("/api/demo/runs/:id", (c) => { const r = store.get(c.req.param("id")); return r ? c.json(r) : c.json({ error: "unknown run" }, 404); });
  app.get("/api/demo/runs/:id/events", (c) => {
    const id = c.req.param("id");
    if (!store.get(id)) return c.json({ error: "unknown run" }, 404);
    return streamSSE(c, async (stream) => {
      const queue: SseEvent[] = []; let finished = false; let aborted = false;
      const unsub = store.subscribe(id, (ev) => { queue.push(ev); if (ev.type !== "step") finished = true; });
      stream.onAbort(() => { aborted = true; });
      while (!aborted) {
        while (queue.length) { const ev = queue.shift()!; await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev.data), id: ev.type === "step" ? String(ev.data.i) : "end" }); }
        if (finished) break;
        await stream.sleep(200);
      }
      unsub();
    });
  });
```
Add `store, runner` to `services` (and to the `WebServer` interface: `store: RunStore; runner: ReturnType<typeof makeRunner>`).

- [ ] **Step 8: Extend `web/test/server.test.ts`** — append inside the `describe`:

```ts
  const waitRun = async (id: string) => {
    for (let i = 0; i < 600; i++) { const r = await get<RunSnapshot>(`/api/demo/runs/${id}`); if (r.status !== "running") return r; await new Promise((res) => setTimeout(res, 500)); }
    throw new Error("run timeout");
  };
  const post = (scenario: string) => fetch(`${BASE}/api/demo/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }) });

  it("POST /api/demo/run B-cooperative → 202; run selesai dengan 1 baris; channel bertanda runId", async () => {
    const r = await post("B-cooperative"); expect(r.status).toBe(202);
    const { runId } = (await r.json()) as { runId: string };
    const run = await waitRun(runId);
    expect(run.status, run.error).toBe("done");
    expect(run.result!.map((x) => x.pasar)).toEqual(["B: AegisClear kooperatif"]);
    expect(run.result![0].klien_provider).toBe("0.00 / 2.00");
    expect(run.steps.some((s) => s.phase === "serve" && s.progress?.total === 100)).toBe(true);
    expect(run.channels.length).toBe(1);
    const ch = (await get<{ channels: ChannelSummary[] }>("/api/channels")).channels.find((x) => x.channel === run.channels[0]);
    expect(ch?.runId).toBe(runId);
  });

  it("B-dispute: busy saat berjalan; hasil 0.07 / 1.93 dengan bukti; SSE replay + done", async () => {
    const r = await post("B-dispute"); expect(r.status).toBe(202);
    const { runId } = (await r.json()) as { runId: string };
    expect((await post("A-complete")).status).toBe(409);
    const run = await waitRun(runId);
    expect(run.status, run.error).toBe("done");
    expect(run.result![0].klien_provider).toBe("0.07 / 1.93");
    expect(Number(run.result![0].proving_ms)).toBeGreaterThan(0);
    expect(run.steps.map((s) => s.phase)).toEqual(expect.arrayContaining(["fund", "serve", "dispute", "prove", "wait", "settle"]));
    expect(run.steps.filter((s) => s.txHash).map((s) => s.label)).toEqual(expect.arrayContaining(["fund", "submitCheckpoint", "claimPenalty", "settle"]));
    const sse = await (await fetch(`${BASE}/api/demo/runs/${runId}/events`)).text();
    expect(sse).toMatch(/event: step\n/); expect(sse).toMatch(/event: done\n/);
    expect(sse.split("event: step").length - 1).toBe(run.steps.length);
  });

  it("skenario tidak dikenal → 400; run ulang untuk klien yang sesinya SETTLED diterima", async () => {
    expect((await post("nope")).status).toBe(400);
    const r = await post("A-reject"); expect(r.status).toBe(202);
    const run = await waitRun(((await r.json()) as { runId: string }).runId);
    expect(run.status, run.error).toBe("done"); expect(run.result![0].klien_provider).toBe("2.00 / 0");
    expect(run.steps.filter((s) => s.phase === "escrow" && s.txHash).length).toBe(5);
  });
```
Add `RunSnapshot` to the type import.

- [ ] **Step 9: Run the whole web suite**

Run: `RPC_URL=http://127.0.0.1:8547 pnpm --filter @aegisclear/web test`
Expected: config 7, runstore 4, server 6 — all pass (≈ 1–2 min). Then `pnpm --filter @aegisclear/web typecheck` clean.

- [ ] **Step 10: Commit**

```bash
git add web
git commit -m "web: demo run store + scenario runner (session reset, faucet, time travel) with SSE step stream"
```

---

### Task 5: Leak-check and raw 402 offer endpoints

**Files:**
- Modify: `web/server/app.ts`, `web/test/server.test.ts`

**Interfaces:**
- Consumes: `leakCheck` (Task 1), `runner.privateOf` (Task 4).
- Produces: `GET /api/demo/leak-check/:runId → LeakResponse[]`, `GET /api/offer?client=A|B → { status, body }`.

- [ ] **Step 1: Failing tests** — append to `web/test/server.test.ts`:

```ts
  it("leak-check untuk run Pasar B: bocor 0; offer 402 memuat extra.aegis tanpa nonce di config", async () => {
    const runs = await get<RunSnapshot[]>("/api/demo/runs");
    const disp = runs.find((r) => r.scenario === "B-dispute" && r.status === "done")!;
    const rep = await get<LeakResponse[]>(`/api/demo/leak-check/${disp.id}`);
    expect(rep.length).toBe(1); expect(rep[0].channel).toBe(disp.channels[0]);
    expect(rep[0].leaks).toBe(0); expect(rep[0].ambiguous).toBe(0); expect(rep[0].txs.length).toBe(5); // open + fund + submitCheckpoint + claimPenalty + settle
    const aRun = runs.find((r) => r.scenario === "A-reject")!;
    expect((await fetch(`${BASE}/api/demo/leak-check/${aRun.id}`)).status).toBe(404);
    const offer = await get<{ status: number; body: any }>("/api/offer?client=B");
    expect(offer.status).toBe(402);
    expect(offer.body.accepts[0].extra.aegis.config.client).toBe(privateKeyToAccount(srv.cfg.keys.b).address);
    expect(offer.body.accepts[0].payTo).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
```
Import `LeakResponse` from the shared types.

- [ ] **Step 2: Routes** — in `web/server/app.ts` (before the static handler), with `import { leakCheck } from "@aegisclear/demo";` and `import type { LeakResponse } from "../shared/types.js";`:

```ts
  app.get("/api/demo/leak-check/:runId", async (c) => {
    const recs = runner.privateOf(c.req.param("runId"));
    if (!recs?.length) return c.json({ error: "run tidak dikenal atau tidak punya channel Pasar B" }, 404);
    const out: LeakResponse[] = [];
    for (const p of recs) out.push({ channel: p.channel, ...(await leakCheck(chain.publicClient, cfg.deployment.factory, p.channel, p.txs, p.values, cfg.deployBlock)) });
    return c.json(out);
  });
  // 402 mentah yang dilihat klien x402 — membuat sesi provider untuk klien demo bila belum ada (tanpa efek on-chain).
  app.get("/api/offer", async (c) => {
    const addr = chain.addressOf(cfg.keys[c.req.query("client") === "B" ? "b" : "a"]);
    const res = await app.request("/provider/job", { headers: { "Aegis-Client": addr } });
    return c.json({ status: res.status, body: await res.json() });
  });
```

- [ ] **Step 3: Run** — `RPC_URL=http://127.0.0.1:8547 pnpm --filter @aegisclear/web test -- test/server.test.ts` → 7 passing.

- [ ] **Step 4: Commit** — `git add web && git commit -m "web: leak-check per run and raw 402 offer endpoints"`

---

### Task 6: The page — header, channels table + drawer, demo panel with live log, privacy cards

**Files:**
- Create: `web/src/api.ts`, `web/src/format.ts`, `web/src/components/Header.tsx`, `web/src/components/ChannelsTable.tsx`, `web/src/components/ChannelDrawer.tsx`, `web/src/components/DemoPanel.tsx`, `web/src/components/PrivacyCards.tsx`, `web/src/components/OfferView.tsx`, `web/test/format.test.ts`
- Modify: `web/src/App.tsx`, `web/src/styles.css`

**Interfaces:**
- Consumes: every `/api/*` route from Tasks 2–5 and the shared types.
- Produces: the page. No exports used elsewhere.

- [ ] **Step 1: Failing format tests — `web/test/format.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { fmtUsdg, shortAddr, countdown, explorer } from "../src/format.js";

describe("format", () => {
  it("fmtUsdg: 6 desimal → 2 desimal", () => { expect(fmtUsdg("70000")).toBe("0.07"); expect(fmtUsdg(2_000_000n)).toBe("2.00"); expect(fmtUsdg("0")).toBe("0.00"); });
  it("shortAddr", () => { expect(shortAddr("0x0922ee7D6D518681Fd94E98e56D3f161A0574ED3")).toBe("0x0922…4ED3"); });
  it("countdown", () => { expect(countdown(100, 100)).toBe("lewat"); expect(countdown(159, 100)).toBe("59 s"); expect(countdown(100 + 125, 100)).toBe("2 m 5 s"); expect(countdown(100 + 3660, 100)).toBe("1 j 1 m"); });
  it("explorer: undefined tanpa base", () => { expect(explorer(undefined, "tx", "0x1")).toBeUndefined(); expect(explorer("https://e", "address", "0x1")).toBe("https://e/address/0x1"); });
});
```

`web/tsconfig.server.json` includes `test`, and the test imports `../src/format.js` — that file has no DOM dependency, so the Node typecheck stays clean; add `"src/format.ts"` to that tsconfig's `include` list.

- [ ] **Step 2: `web/src/format.ts`**

```ts
export const fmtUsdg = (x: string | bigint): string => (Number(BigInt(x)) / 1e6).toFixed(2);
export const shortAddr = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;
export function countdown(deadline: number, now = Math.floor(Date.now() / 1000)): string {
  const s = deadline - now;
  if (s <= 0) return "lewat";
  if (s >= 3600) return `${Math.floor(s / 3600)} j ${Math.floor((s % 3600) / 60)} m`;
  if (s >= 60) return `${Math.floor(s / 60)} m ${s % 60} s`;
  return `${s} s`;
}
export const explorer = (base: string | undefined, kind: "address" | "tx", v: string): string | undefined => (base ? `${base}/${kind}/${v}` : undefined);
export const gasFmt = (g: string | number): string => Number(g).toLocaleString("id-ID");
```

Run: `pnpm --filter @aegisclear/web test -- test/format.test.ts` → 4 passing.

- [ ] **Step 3: `web/src/api.ts`**

```ts
import type { ChannelDetail, ChannelSummary, ConfigResponse, LeakResponse, RunSnapshot, ScenarioId, SseEvent } from "../shared/types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  const body = (await r.json().catch(() => ({}))) as { error?: string; channel?: string };
  if (!r.ok) throw new Error(body.error ? `${body.error}${body.channel ? ` (${body.channel})` : ""}` : `${path} → HTTP ${r.status}`);
  return body as T;
}
export const getConfig = () => api<ConfigResponse>("/api/config");
export const getChannels = () => api<{ scannedAt: number; channels: ChannelSummary[] }>("/api/channels");
export const getChannel = (a: string) => api<ChannelDetail>(`/api/channels/${a}`);
export const startRun = (scenario: ScenarioId) =>
  api<{ runId: string }>("/api/demo/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }) });
export const getRun = (id: string) => api<RunSnapshot>(`/api/demo/runs/${id}`);
export const getRuns = () => api<RunSnapshot[]>("/api/demo/runs");
export const leakCheck = (id: string) => api<LeakResponse[]>(`/api/demo/leak-check/${id}`);
export const getOffer = (client: "A" | "B") => api<{ status: number; body: unknown }>(`/api/offer?client=${client}`);

/** SSE run: replay step lama lalu live; ditutup otomatis setelah done/error. */
export function subscribeRun(id: string, onEvent: (ev: SseEvent) => void): () => void {
  const es = new EventSource(`/api/demo/runs/${id}/events`);
  const parse = (e: Event) => JSON.parse((e as MessageEvent).data as string);
  es.addEventListener("step", (e) => onEvent({ type: "step", data: parse(e) }));
  es.addEventListener("done", (e) => { onEvent({ type: "done", data: parse(e) }); es.close(); });
  es.addEventListener("error", (e) => { if ((e as MessageEvent).data) { onEvent({ type: "error", data: parse(e) }); es.close(); } });
  return () => es.close();
}
```

- [ ] **Step 4: Components**

`web/src/components/Header.tsx`:
```tsx
import type { ConfigResponse } from "../../shared/types";
import { explorer, shortAddr } from "../format";

export function Addr({ a, base, full }: { a: string; base?: string; full?: boolean }) {
  const href = explorer(base, "address", a); const text = full ? a : shortAddr(a);
  return href ? <a className="mono" href={href} target="_blank" rel="noreferrer" title={a}>{text}</a> : <code title={a}>{text}</code>;
}
export function Tx({ h, base }: { h: string; base?: string }) {
  const href = explorer(base, "tx", h);
  return href ? <a className="mono" href={href} target="_blank" rel="noreferrer" title={h}>{shortAddr(h)}</a> : <code title={h}>{shortAddr(h)}</code>;
}
export function Header({ cfg, error }: { cfg: ConfigResponse | null; error: string | null }) {
  return (
    <header className="header">
      <div>
        <h1>AegisClear <span className="muted">console</span></h1>
        <p className="muted">micro-escrow USDG per pasangan agen · penyelesaian proporsional dengan bukti Groth16 · syarat &amp; metrik tetap privat</p>
      </div>
      {error && <div className="banner error">server tidak jalan — <code>pnpm --filter @aegisclear/web start</code> ({error})</div>}
      {cfg && (
        <div className="badges">
          <span className={`pill net-${cfg.network}`}>{cfg.network} · chain {cfg.chainId}</span>
          {(["factory", "factoryProd", "factoryAnchored", "usdg", "verifier", "escrow"] as const).map((k) =>
            cfg.addresses[k] ? <span key={k} className="pill">{k} <Addr a={cfg.addresses[k]} base={cfg.explorerBase} /></span> : null,
          )}
          <span className="pill">provider <Addr a={cfg.provider} base={cfg.explorerBase} /></span>
          {cfg.clients.map((c) => <span key={c.label} className="pill">klien {c.label} <Addr a={c.address} base={cfg.explorerBase} /></span>)}
        </div>
      )}
    </header>
  );
}
```

`web/src/components/ChannelsTable.tsx`:
```tsx
import { useEffect, useState } from "react";
import type { ChannelSummary, ConfigResponse } from "../../shared/types";
import { getChannels } from "../api";
import { countdown, fmtUsdg } from "../format";
import { Addr } from "./Header";

export function ChannelsTable({ cfg, onSelect }: { cfg: ConfigResponse | null; onSelect: (a: string) => void }) {
  const [rows, setRows] = useState<ChannelSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    let alive = true;
    const tick = () => getChannels().then((r) => { if (alive) { setRows(r.channels); setErr(null); } }).catch((e) => { if (alive) setErr(String((e as Error).message)); });
    void tick();
    const id = setInterval(() => { void tick(); setNow(Math.floor(Date.now() / 1000)); }, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return (
    <>
      <h2>Channels <span className="muted">({rows.length})</span></h2>
      {err && <p className="banner error">{err}</p>}
      {rows.length === 0 && !err && <p className="muted">Belum ada channel di factory ini — jalankan skenario di panel Demo.</p>}
      {rows.length > 0 && (
        <div className="scroll">
          <table className="table">
            <thead><tr><th>channel</th><th>klien</th><th>state</th><th>seq</th><th>A (USDG)</th><th>budget</th><th>deadline</th><th>bukti</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.channel} className="row-click" onClick={() => onSelect(r.channel)}>
                  <td><Addr a={r.channel} base={cfg?.explorerBase} />{r.runId && <span className="tag">run</span>}{r.factoryName !== "factory" && <span className="tag">{r.factoryName}</span>}</td>
                  <td><Addr a={r.client} base={cfg?.explorerBase} /></td>
                  <td><span className={`pill st-${r.state}`}>{r.state}</span></td>
                  <td>{r.seq}</td>
                  <td>{fmtUsdg(r.cumulativeAmount)}</td>
                  <td>{fmtUsdg(r.budget)}</td>
                  <td>{r.state === "CLOSING" ? countdown(r.deadline, now) : "—"}</td>
                  <td>{r.hasProof ? `payToClient ${fmtUsdg(r.payToClient)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

`web/src/components/ChannelDrawer.tsx`:
```tsx
import { useEffect, useState } from "react";
import type { ChannelDetail, ConfigResponse } from "../../shared/types";
import { getChannel } from "../api";
import { fmtUsdg, gasFmt } from "../format";
import { Addr, Tx } from "./Header";

export function ChannelDrawer({ addr, cfg, onClose }: { addr: string; cfg: ConfigResponse | null; onClose: () => void }) {
  const [d, setD] = useState<ChannelDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setD(null); setErr(null); getChannel(addr).then(setD).catch((e) => setErr(String((e as Error).message))); }, [addr]);
  const base = cfg?.explorerBase;
  return (
    <aside className="drawer" aria-label="detail channel">
      <div className="drawer-head"><h3>Channel <Addr a={addr} base={base} full /></h3><button onClick={onClose}>tutup</button></div>
      {err && <p className="banner error">{err}</p>}
      {!d && !err && <p className="muted">memuat…</p>}
      {d && (
        <>
          <dl className="kv">
            <dt>state</dt><dd><span className={`pill st-${d.state}`}>{d.state}</span> · seq {d.seq} · A {fmtUsdg(d.cumulativeAmount)} USDG · budget {fmtUsdg(d.budget)} USDG</dd>
            <dt>T (termsCommitment)</dt><dd><code>{d.termsCommitment}</code></dd>
            <dt>R (receiptsRoot)</dt><dd><code>{d.receiptsRoot}</code></dd>
            <dt>klien → payoutClient</dt><dd><Addr a={d.cfg.client} base={base} /> → <Addr a={d.cfg.payoutClient} base={base} /></dd>
            <dt>provider → payoutProvider</dt><dd><Addr a={d.cfg.provider} base={base} /> → <Addr a={d.cfg.payoutProvider} base={base} /></dd>
            <dt>jendela</dt><dd>challenge {d.cfg.challengeWindow} s · response {d.cfg.responseWindow} s</dd>
            <dt>bukti</dt><dd>{d.hasProof ? `payToClient ${fmtUsdg(d.payToClient)} USDG` : "—"}</dd>
            <dt>dibuka</dt><dd><Tx h={d.openedTx} base={base} /> · blok {d.openedBlock} · {d.factoryName}</dd>
          </dl>
          <h4>Event on-chain</h4>
          {d.events.length === 0 && <p className="muted">belum ada</p>}
          <ol className="log">
            {d.events.map((e, i) => (
              <li key={i}>
                <span className="ph">{e.name}</span> <Tx h={e.txHash} base={base} /> <span className="muted">{gasFmt(e.gasUsed)} gas</span>
                <div className="args">{Object.entries(e.args).map(([k, v]) => <span key={k}><b>{k}</b>={v} </span>)}</div>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  );
}
```

`web/src/components/OfferView.tsx`:
```tsx
import { useState } from "react";
import { getOffer } from "../api";

export function OfferView() {
  const [client, setClient] = useState<"A" | "B">("A");
  const [body, setBody] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = (c: "A" | "B") => { setClient(c); setErr(null); getOffer(c).then((o) => setBody(JSON.stringify(o.body, null, 2))).catch((e) => setErr(String((e as Error).message))); };
  return (
    <details className="offer">
      <summary>402 yang dilihat klien x402 (<code>GET /provider/job</code>)</summary>
      <div className="buttons"><button onClick={() => load("A")} disabled={client === "A" && !!body}>klien A</button><button onClick={() => load("B")} disabled={client === "B" && !!body}>klien B</button></div>
      {err && <p className="banner error">{err}</p>}
      {body && <pre className="json">{body}</pre>}
      <p className="muted">`payTo` = alamat channel yang diprediksi (CREATE2); `extra.aegis` memuat config, tanda tangan provider, syarat (hanya untuk klien), tiket keluar seq-0.</p>
    </details>
  );
}
```

`web/src/components/PrivacyCards.tsx`:
```tsx
import { useEffect, useState, type ReactNode } from "react";
import type { ChannelDetail, ConfigResponse, LeakResponse, RunSnapshot } from "../../shared/types";
import { getChannel } from "../api";
import { fmtUsdg, shortAddr } from "../format";
import { Tx } from "./Header";

export function PrivacyCards({ cfg, run, leak }: { cfg: ConfigResponse | null; run: RunSnapshot; leak: LeakResponse[] | null }) {
  const [chs, setChs] = useState<ChannelDetail[]>([]);
  useEffect(() => { Promise.all(run.channels.map(getChannel)).then(setChs).catch(() => setChs([])); }, [run.id, run.status]);
  return (
    <div className="cards">
      <div className="card private">
        <h3>Privat (off-chain) — hanya provider &amp; klien</h3>
        {cfg && (
          <dl className="kv">
            <dt>harga/unit</dt><dd>{fmtUsdg(cfg.terms.unitPrice)} USDG</dd>
            <dt>ambang</dt><dd>latensi ≤ {cfg.terms.maxM1} ms · kualitas ≥ {cfg.terms.minM2}</dd>
            <dt>penalti</dt><dd>{Number(cfg.terms.penaltyBps) / 100}% per unit melanggar · cap {Number(cfg.terms.capBps) / 100}% dari total</dd>
            <dt>unit melanggar (demo)</dt><dd>seq {cfg.breaches.join(", ")} (latensi 1200 ms)</dd>
          </dl>
        )}
        <p className="muted">Nilai-nilai ini tidak pernah masuk calldata maupun log; di chain hanya ada komitmen Poseidon-nya.</p>
      </div>
      <div className="card chain">
        <h3>Yang dilihat chain</h3>
        {chs.map((c) => (
          <dl className="kv" key={c.channel}>
            <dt>channel</dt><dd><code>{shortAddr(c.channel)}</code> · {c.state}</dd>
            <dt>T</dt><dd><code>{shortAddr(c.termsCommitment)}</code></dd>
            <dt>R</dt><dd><code>{shortAddr(c.receiptsRoot)}</code></dd>
            <dt>A</dt><dd>{fmtUsdg(c.cumulativeAmount)} USDG</dd>
            <dt>payToClient</dt><dd>{c.hasProof ? `${fmtUsdg(c.payToClient)} USDG (bukti)` : "— (tanpa bukti)"}</dd>
          </dl>
        ))}
        {leak && leak.map((l) => (
          <p key={l.channel} className={l.leaks === 0 ? "ok" : "bad"}>
            leak-check {shortAddr(l.channel)}: <b>bocor {l.leaks}</b>, ambigu {l.ambiguous}, {l.txs.length} tx dipindai{" "}
            {l.txs.map((h) => <Tx key={h} h={h} base={cfg?.explorerBase} />).reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, " ", el] : [el]), [])}
          </p>
        ))}
      </div>
    </div>
  );
}
```
`web/src/components/DemoPanel.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import type { ConfigResponse, LeakResponse, Row, RunSnapshot, ScenarioId, Step } from "../../shared/types";
import { SCENARIOS } from "../../shared/types";
import { getRun, getRuns, leakCheck, startRun, subscribeRun } from "../api";
import { gasFmt } from "../format";
import { Tx } from "./Header";
import { PrivacyCards } from "./PrivacyCards";
import { OfferView } from "./OfferView";

const LABEL: Record<ScenarioId, string> = {
  "B-cooperative": "B · kooperatif (klien A)", "B-dispute": "B · sengketa + bukti (klien B)",
  "A-complete": "A · escrow biner: complete", "A-reject": "A · escrow biner: reject", all: "Jalankan semua (4 baris §14)",
};

export function DemoPanel({ cfg }: { cfg: ConfigResponse | null }) {
  const [run, setRun] = useState<RunSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [leak, setLeak] = useState<LeakResponse[] | null>(null);
  const unsub = useRef<(() => void) | undefined>(undefined);
  const attach = (id: string) => {
    unsub.current?.();
    unsub.current = subscribeRun(id, (ev) => {
      if (ev.type === "step") setRun((r) => (r && r.id === id ? { ...r, steps: [...r.steps.filter((s) => s.i !== ev.data.i), ev.data].sort((a, b) => a.i - b.i) } : r));
      else setRun(ev.data);
    });
  };
  useEffect(() => {
    getRuns().then((rs) => { if (rs[0]) return getRun(rs[0].id).then((r) => { setRun(r); if (r.status === "running") attach(r.id); }); }).catch(() => {});
    return () => unsub.current?.();
  }, []);
  const start = async (s: ScenarioId) => {
    setErr(null); setLeak(null);
    try { const { runId } = await startRun(s); setRun(await getRun(runId)); attach(runId); }
    catch (e) { setErr(String((e as Error).message)); }
  };
  const running = run?.status === "running";
  return (
    <>
      <h2>Demo: Pasar A (escrow biner) vs Pasar B (AegisClear)</h2>
      <div className="buttons">{SCENARIOS.map((s) => <button key={s} disabled={running || !cfg} onClick={() => void start(s)}>{LABEL[s]}</button>)}</div>
      {err && <p className="banner error">{err}</p>}
      {run && (
        <>
          <div className="runhead"><span className={`pill st-${run.status}`}>{run.status}</span> <code>{run.scenario}</code> <span className="muted">#{run.id}</span></div>
          <StepLog steps={run.steps} base={cfg?.explorerBase} />
          {run.error && <p className="banner error">{run.error}</p>}
          {run.result && <ResultTable rows={run.result} base={cfg?.explorerBase} />}
          {run.status === "done" && run.channels.length > 0 && (
            <>
              <div className="buttons"><button onClick={() => leakCheck(run.id).then(setLeak).catch((e) => setErr(String((e as Error).message)))}>Periksa kebocoran (calldata + log semua tx channel)</button></div>
              <PrivacyCards cfg={cfg} run={run} leak={leak} />
            </>
          )}
        </>
      )}
      {cfg && <OfferView />}
    </>
  );
}

function StepLog({ steps, base }: { steps: Step[]; base?: string }) {
  const last = [...steps].reverse().find((s) => s.progress);
  return (
    <ol className="log">
      {steps.map((s) => (
        <li key={s.i} className={`ph-${s.phase}`}>
          <span className="t">{(s.t / 1000).toFixed(1)}s</span> <span className="ph">{s.phase}</span> {s.label}
          {s.detail && <span className="muted"> — {s.detail}</span>}
          {s.txHash && <> <Tx h={s.txHash} base={base} />{s.gasUsed && <span className="muted"> {gasFmt(s.gasUsed)} gas</span>}</>}
          {s.progress && s === last && <progress value={s.progress.done} max={s.progress.total} />}
        </li>
      ))}
    </ol>
  );
}

function ResultTable({ rows, base }: { rows: Row[]; base?: string }) {
  return (
    <table className="table result">
      <thead><tr><th>pasar</th><th>klien / provider (USDG)</th><th>siapa yang memutuskan</th><th>terbaca di explorer</th><th>gas siklus penuh</th><th>proving (ms)</th><th>tx</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.pasar}>
            <td>{r.pasar}</td><td className="mono">{r.klien_provider}</td><td>{r.penentu}</td><td>{r.terlihat}</td><td className="mono">{gasFmt(r.gas)}</td><td className="mono">{r.proving_ms}</td>
            <td>{r.txs.map((t) => <span key={t.hash} className="txlink"><Tx h={t.hash} base={base} /> </span>)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: `web/src/App.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { ConfigResponse } from "../shared/types";
import { getConfig } from "./api";
import { Header } from "./components/Header";
import { ChannelsTable } from "./components/ChannelsTable";
import { ChannelDrawer } from "./components/ChannelDrawer";
import { DemoPanel } from "./components/DemoPanel";

export function App() {
  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { getConfig().then(setCfg).catch((e) => setErr(String((e as Error).message))); }, []);
  return (
    <div className="wrap">
      <Header cfg={cfg} error={err} />
      <div className="grid">
        <section className="panel"><ChannelsTable cfg={cfg} onSelect={setSelected} /></section>
        <section className="panel"><DemoPanel cfg={cfg} /></section>
      </div>
      {selected && <ChannelDrawer addr={selected} cfg={cfg} onClose={() => setSelected(null)} />}
    </div>
  );
}
```

- [ ] **Step 6: `web/src/styles.css`** (replace the starter)

```css
:root { color-scheme: dark; --bg: #0b0f14; --panel: #121821; --panel2: #0f141b; --line: #1f2a37; --fg: #e6edf3; --muted: #8b98a5; --accent: #4cc2ff; --ok: #3fb950; --warn: #d29922; --bad: #f85149; --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width: 1400px; margin: 0 auto; padding: 16px; }
h1 { margin: 0; font-size: 22px; } h2 { margin: 0 0 10px; font-size: 16px; } h3 { margin: 0 0 8px; font-size: 14px; } h4 { margin: 12px 0 6px; font-size: 13px; color: var(--muted); }
code, .mono, pre { font-family: var(--mono); font-size: 12.5px; }
a.mono { color: var(--accent); text-decoration: none; } a.mono:hover { text-decoration: underline; }
.muted { color: var(--muted); } .ok { color: var(--ok); } .bad { color: var(--bad); }
.header { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); font-family: var(--mono); font-size: 12px; }
.pill.net-testnet { border-color: var(--accent); } .pill.net-local { border-color: var(--warn); }
.pill.st-OPEN { border-color: var(--accent); } .pill.st-CLOSING { border-color: var(--warn); } .pill.st-SETTLED { border-color: var(--ok); } .pill.st-UNINIT { border-color: var(--muted); }
.pill.st-running { border-color: var(--warn); } .pill.st-done { border-color: var(--ok); } .pill.st-error { border-color: var(--bad); }
.tag { margin-left: 6px; padding: 0 5px; border-radius: 4px; background: var(--line); font-size: 11px; }
.banner { padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); margin: 8px 0; }
.banner.error { border-color: var(--bad); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px; min-width: 0; }
.scroll { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; white-space: nowrap; }
.table th { color: var(--muted); font-weight: 500; font-size: 12px; }
.row-click { cursor: pointer; } .row-click:hover { background: var(--panel2); }
.table.result td { white-space: normal; }
.buttons { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
button { background: var(--panel2); color: var(--fg); border: 1px solid var(--line); border-radius: 8px; padding: 7px 12px; cursor: pointer; font: inherit; }
button:hover:not(:disabled) { border-color: var(--accent); } button:disabled { opacity: .5; cursor: not-allowed; }
.runhead { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
.log { list-style: none; margin: 6px 0; padding: 8px; max-height: 360px; overflow: auto; background: var(--panel2); border-radius: 8px; border: 1px solid var(--line); font-size: 13px; }
.log li { padding: 2px 0; border-bottom: 1px dashed var(--line); }
.log .t { color: var(--muted); font-family: var(--mono); font-size: 11.5px; margin-right: 4px; }
.log .ph { display: inline-block; min-width: 56px; color: var(--accent); font-family: var(--mono); font-size: 11.5px; }
.log li.ph-prove .ph, .log li.ph-settle .ph { color: var(--ok); } .log li.ph-dispute .ph, .log li.ph-wait .ph { color: var(--warn); }
.log progress { display: block; width: 100%; height: 6px; margin-top: 4px; }
.args { color: var(--muted); font-family: var(--mono); font-size: 11.5px; word-break: break-all; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
@media (max-width: 700px) { .cards { grid-template-columns: 1fr; } }
.card { border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: var(--panel2); }
.card.private { border-color: var(--warn); } .card.chain { border-color: var(--accent); }
.kv { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 6px 0; }
.kv dt { color: var(--muted); } .kv dd { margin: 0; word-break: break-all; }
.drawer { position: fixed; top: 0; right: 0; height: 100vh; width: min(560px, 100vw); overflow: auto; background: var(--panel); border-left: 1px solid var(--line); padding: 14px; box-shadow: -12px 0 30px rgba(0,0,0,.5); }
.drawer-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.offer { margin-top: 12px; } .offer summary { cursor: pointer; color: var(--muted); }
pre.json { max-height: 320px; overflow: auto; background: var(--panel2); border: 1px solid var(--line); border-radius: 8px; padding: 10px; white-space: pre-wrap; word-break: break-all; }
.txlink { margin-right: 4px; }
```

- [ ] **Step 7: Build, typecheck, then look at it in a browser (or curl)**

Run:
```bash
pnpm --filter @aegisclear/web typecheck && pnpm --filter @aegisclear/web build
RPC_URL=http://127.0.0.1:8547 WEB_PORT=4042 pnpm --filter @aegisclear/web serve & sleep 3
curl -s http://127.0.0.1:4042/ | grep -o '<script[^>]*>' ; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:4042/$(ls web/dist/assets | grep '\.js$' | head -1 | sed 's#^#assets/#')"
curl -s -X POST -H 'content-type: application/json' -d '{"scenario":"B-dispute"}' http://127.0.0.1:4042/api/demo/run; echo
```
Expected: build OK (no TS errors), `<script type="module" … src="/assets/index-….js">`, `200`, `{"runId":"…"}`. If a browser is available open `http://127.0.0.1:4042` and confirm: header badges, channel table filling, live step log with progress, result table, leak-check `bocor 0`, drawer on row click. Then `kill %1`.

- [ ] **Step 8: Commit**

```bash
git add web
git commit -m "web: console page — channel dashboard with drawer, live demo runner (SSE), privacy cards, raw 402 view"
```

---

### Task 7: Docs, root scripts, full verification

**Files:**
- Modify: `README.md`, `docs/TOOLCHAIN.md`, `prd-arsitektur.md` (§14 one paragraph), `.gitignore` (verify `dist/` covers `web/dist`)

- [ ] **Step 1: README — new section right after the "Status implementasi" paragraph (before the table of contents), and a TOC entry**

```markdown
## Lihat di browser (web console)

```bash
# Lokal (Anvil 8545 + DeployLocal sudah jalan, zkey ada di circuits/build/):
pnpm web                                  # = pnpm --filter @aegisclear/web start → http://localhost:4040
# Testnet 46630 (butuh RPC_URL, PK_PROVIDER, PK_CLIENT_A, PK_CLIENT_B, PK_DEPLOYER di .env — dibaca otomatis):
AEGIS_NETWORK=testnet pnpm web
```

Halaman `http://localhost:4040` (port `WEB_PORT`) memuat: **dashboard channel** (semua `ChannelOpened` di factory deployment, state/seq/A/budget/deadline/bukti, klik untuk detail + event), **panel demo** Pasar A vs Pasar B — tombol menjalankan skenario §14 di server (provider, klien A/B, proving Groth16 semuanya di proses Node; tidak ada wallet di browser) dan men-stream langkahnya (SSE) dengan tautan explorer, lalu tabel perbandingan, kartu **"privat"** (syarat & metrik yang tidak pernah masuk chain) vs **"yang dilihat chain"** (T, R, A, payToClient) dan tombol **leak-check**; serta JSON 402 mentah yang dilihat klien x402. Provider yang sama di-mount di `http://localhost:4040/provider` (`GET /job` → 402) lengkap dengan challenge responder in-process. Pengembangan UI: `pnpm web:dev` (Vite di :4043, proxy ke :4040). API: `GET /api/config`, `/api/channels`, `/api/channels/:addr`, `POST /api/demo/run {scenario}`, `/api/demo/runs/:id`, `/api/demo/runs/:id/events` (SSE), `/api/demo/leak-check/:runId`, `/api/offer?client=A|B`.
```

Also in the existing "Menjalankan secara lokal" steps, after the demo CLI lines, add one line: `pnpm test:web   # butuh Anvil + DeployLocal seperti test SDK (RPC_URL untuk port lain)`.

- [ ] **Step 1b: Wire the demo package into the repo's checks (Task 1 review carry-over)** — root `package.json`: add `"test:demo": "pnpm --filter @aegisclear/demo test"` and include it in `"test"`; create `demo/tsconfig.json` = `{ "extends": "../tsconfig.base.json", "compilerOptions": { "rootDir": "..", "noEmit": true, "types": ["node"] }, "include": ["src", "test", "run.ts", "leak-check.ts", "../sdk/src/types.d.ts"] }` (the ambient `circomlibjs`/`snarkjs` shim lives in `sdk/src/types.d.ts`; `web/tsconfig.server.json` needed the same include — Task 2 finding) and `"typecheck": "tsc -p tsconfig.json --noEmit"` in `demo/package.json` (add `typescript`/`@types/node` devDependencies if missing); `pnpm --filter @aegisclear/demo typecheck` must be clean. In `demo/leak-check.ts`, wrap the `leakCheck` call: `catch (e) { console.error(`BOCOR-CEK GAGAL: ${(e as Error).message}`); process.exit(1); }` (one-line diagnostic instead of a stack trace).

- [ ] **Step 1c: Small server hardening (Task 2 review carry-over)** — `web/server/config.ts`: `readDeployment` also requires `chainId`; the local branch checks `Number(deployment.chainId) === 31337` (same error shape as the testnet branch); `loadDotEnv` strips an inline ` # comment` suffix from unquoted values. `web/server/app.ts` static handler: wrap `decodeURIComponent` in try/catch → `400 bad path`; drop the unreachable `startsWith(DIST)` 403 branch **or** keep it but make it real by resolving with `path.resolve(DIST, "." + p)` — pick one and keep a comment explaining which check is the actual guard. Also register `app.onError((e, c) => c.json({ error: String((e as Error).message) }, 502))` in `createWebServer` (RPC hiccups inside `/api/channels*` and a `leakCheck` throw become a JSON 502 instead of a bare 500 — Task 3/5 review carry-over). In `GET /api/offer`: validate `client` (`A`|`B`, else 400 `{error:"client must be A or B"}`) and read the provider reply defensively (`const text = await res.text(); let body: unknown = text; try { body = JSON.parse(text); } catch {}`) so a non-JSON upstream reply still yields `{ status, body }` (Task 5 review carry-over). Add 3 assertions to `web/test/config.test.ts` (chainId missing → error message names `chainId`; local + testnet deployment → error; inline comment stripped) and one to `web/test/server.test.ts` (`GET /%zz` → 400).

- [ ] **Step 2: `docs/TOOLCHAIN.md`** — add a "Web console" row group: Vite, React, @vitejs/plugin-react, vitest versions actually installed (`pnpm --filter @aegisclear/web list --depth 0`).

- [ ] **Step 3: `prd-arsitektur.md` §14** — append after the "Lingkungan:" paragraph:

```markdown
**Web console (20 Sep 2026).** `web/` menjalankan skenario tabel ini dari browser (`pnpm web` → `http://localhost:4040`, mode `local`/`testnet`): dashboard channel dari event `ChannelOpened`, log langkah live per skenario dengan tautan explorer, tabel perbandingan di atas, kartu privat-vs-chain, dan `leak-check` per run. Kunci demo tetap di server (tidak ada wallet browser); provider yang sama di-mount di `/provider`.
```

- [ ] **Step 4: Full verification on the private Anvil**

```bash
RPC_URL=http://127.0.0.1:8547 pnpm test:sdk        # 34 pass
pnpm test:circuits                                   # 14 pass
(cd contracts && forge test)                         # 63 pass
RPC_URL=http://127.0.0.1:8547 pnpm test:web          # 18 pass (config 7, runstore 4, format 4, server 7 — adjust the count to what the suite prints)
(cd demo && node --import tsx --test test/*.test.ts) # 3 pass
pnpm --filter @aegisclear/web typecheck && pnpm --filter @aegisclear/sdk typecheck
```
Record the real counts in the report.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/TOOLCHAIN.md prd-arsitektur.md
git commit -m "docs: web console — how to open it in the browser, API list, toolchain versions"
```
