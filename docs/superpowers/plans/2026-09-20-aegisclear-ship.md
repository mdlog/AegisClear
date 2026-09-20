# AegisClear Ship Implementation Plan (P1 sub-project C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the P1 features visible in the browser console (anchored + rollover scenarios), pass a self-audit (Slither), bring the spec to v1.1, and produce the submission package — the last mile before the video and the HackQuest form.

**Architecture:** The web console gets a second provider instance (anchored factory) mounted at `/provider-anchored`, two new scenarios in the shared demo library (`runMarketB` on the anchored env, `runRollover`), an `epoch`/mode column and an anchored-aware leak-check. Slither runs over `contracts/src` with findings triaged into `docs/audit/`. The spec is edited in place to v1.1 (changelog §23). The submission package lives in `docs/SUBMISSION.md`.

**Tech Stack:** as before (TypeScript/Hono/Vite/React, Foundry, Slither 0.11+ installed at `~/.local/bin/slither`).

**Spec:** `docs/superpowers/specs/2026-09-20-aegisclear-p1-design.md` §C; parent `prd-arsitektur.md`.

## Global Constraints

- Ports: web 4040 / dev 4043 / tests 4042; private chain `~/.local/bin/aegis-node --port 8547` (an Anvil binary copy under another name — foreign sessions `pkill anvil`); never 8545. Re-broadcast `DeployLocal` after any contract change (`contracts/deployments/local.json` has `factoryAnchored`, `poseidon`, `router`, `deployBlock`).
- Demo numbers stay reproducible: co-signed B rows unchanged (`0.00 / 2.00`, `0.07 / 1.93`); anchored scenario = **20 units**, breaches at seq 3 and 17 → penalty 2 × 10 000 = 20 000, A = 400 000 → row `0.02 / 0.38`; rollover scenario = 128 units + rollover + 5 units, deposit 5 USDG → provider 2.66 USDG, row `0.00 / 2.66`, on-chain `epoch 1`.
- Anchored mode reveals per-ack cumulative amounts on-chain by design (spec §6.7): the anchored leak-check excludes `unitPrice` from the private set and the UI says so; metrics/thresholds/penalty/cap/nonce must still never appear.
- No new runtime dependencies. Commit messages plain, no AI attribution trailers. Never touch `.env`.
- All suites green at the end: forge, sdk (Anvil), circuits, demo, web (+ new tests), stylus `cargo test`.

## File Structure

```
demo/src/scenarios.ts        + runRollover, RolloverResult, toRows bAnch/bRoll rows, privateValues(terms, {anchored})
demo/test/rows.test.ts       + rows for anchored/rollover, privateValues anchored
web/shared/types.ts          ScenarioId + 2, ChannelSummary.epoch + mode
web/server/chain.ts          ctx(pk, factory?)
web/server/app.ts            providerAnchored at /provider-anchored + watcher; config addresses already whitelisted
web/server/demo.ts           runner: anchored env, CLIENT_OF/ALL, resetSession(provider), privates with anchored flag
web/server/channels.ts       epoch + mode in summaries
web/src/components/*.tsx     buttons, labels, epoch column, mode tag, anchored privacy note
web/test/server.test.ts      + B-anchored-dispute, B-rollover
docs/audit/slither-2026-09.md
prd-arsitektur.md            v1.1
docs/SUBMISSION.md
README.md, docs/TOOLCHAIN.md touch-ups
```

---

### Task 1: Demo library — anchored/rollover scenarios and rows

**Files:**
- Modify: `demo/src/scenarios.ts`, `demo/test/rows.test.ts`

**Interfaces:**
- Produces: `runRollover(env, pk, emit): Promise<RolloverResult>` where `RolloverResult = MarketBResult & { epoch: number; units: number }`; `toRows({ aOk?, aRej?, bCoop?, bDisp?, bAnch?, bRoll? })` with two new rows; `privateValues(terms, opts?: { anchored?: boolean })` (anchored → without `unitPrice`); `ANCHORED_UNITS = 20`.
- Consumes: `AegisClient.rollover()` (SDK), `readChannel`.

- [ ] **Step 1: Failing tests** — extend `demo/test/rows.test.ts`:

```ts
test("toRows: baris anchored dan rollover", () => {
  const tx = { label: "x", hash: "0x01" as const, gasUsed: 10n };
  const base = { channel: "0x0000000000000000000000000000000000000001" as const, txs: [tx], gasTotal: 1n, clientDelta: 0n, terms: { ...TERMS_BASE, nonce: 1n } };
  const anch = { ...base, provingMs: 4000, providerDelta: 380_000n, local: { cumulativeAmount: 400_000n, breaches: 2, penRaw: 20_000n, cap: 120_000n, payToClient: 20_000n, payToProvider: 380_000n } };
  const roll = { ...base, provingMs: 0, providerDelta: 2_660_000n, local: { cumulativeAmount: 100_000n, breaches: 0, penRaw: 0n, cap: 30_000n, payToClient: 0n, payToProvider: 100_000n }, epoch: 1, units: 133 };
  const rows = toRows({ bAnch: anch, bRoll: roll });
  assert.deepEqual(rows.map((r) => r.pasar), ["B: AegisClear anchored (ack on-chain, sengketa)", "B: AegisClear rollover (128 + 5 unit, 1 deposit)"]);
  assert.equal(rows[0].klien_provider, "0.02 / 0.38"); assert.equal(rows[0].penentu, "bukti Groth16 atas R on-chain");
  assert.equal(rows[1].klien_provider, "0.00 / 2.66"); assert.equal(rows[1].terlihat, "T, R, epoch, jumlah");
});
test("privateValues anchored: tanpa unitPrice (A per ack ada di chain)", () => {
  const v = privateValues({ ...TERMS_BASE, nonce: 7n }, { anchored: true });
  assert.deepEqual(v, [800n, 90n, 5000n, 3000n, 7n, 1200n, 300n, 95n]);
});
```

- [ ] **Step 2: Implement** in `demo/src/scenarios.ts`:

```ts
export const ANCHORED_UNITS = 20;
export interface RolloverResult extends MarketBResult { epoch: number; units: number }
export const privateValues = (t: Terms, opts: { anchored?: boolean } = {}): bigint[] => [
  ...(opts.anchored ? [] : [t.unitPrice]), t.maxM1, t.minM2, t.penaltyBps, t.capBps, t.nonce, METRICS.breachM1, METRICS.okM1, METRICS.m2,
];

/** Rollover (FR-10): 128 unit (epoch 0 penuh) → rollover() → 5 unit di epoch 1 → close; satu deposit untuk 133 unit. */
export async function runRollover(env: ScenarioEnv, pk: Hex, emit: Emit): Promise<RolloverResult> {
  const ctx = env.ctx(pk); const me = privateKeyToAccount(pk).address;
  const c = new AegisClient({ ctx, account: privateKeyToAccount(pk), providerUrl: env.providerUrl, usdg: env.d.usdg, artifacts: env.art });
  const c0 = await erc20Balance(ctx, env.d.usdg, me); const p0 = await erc20Balance(ctx, env.d.usdg, env.providerAddress);
  let seen = 0;
  const flush = (phase: Phase) => { for (const t of c.txs.slice(seen)) emit({ phase, label: t.label, txHash: t.hash, gasUsed: t.gasUsed.toString(), channel: c.channel }); seen = c.txs.length; };
  await c.start(); flush("fund");
  emit({ phase: "fund", label: `402 diterima: payTo ${c.channel}, deposit ${fmtUsdg(c.deposit)} USDG`, channel: c.channel });
  for (let i = 0; i < 128; i++) { await c.requestUnit(); if ((i + 1) % 16 === 0) emit({ phase: "serve", label: `${i + 1}/128 unit epoch 0`, progress: { done: i + 1, total: 133 }, channel: c.channel }); }
  await c.finalAck();
  emit({ phase: "close", label: "epoch 0 penuh (MAX_SEQ 128) → rollover: bayar 2,56 USDG, sisa jadi budget epoch 1", channel: c.channel });
  await c.rollover(); flush("close");
  emit({ phase: "serve", label: `epoch ${c.epoch} dimulai: seq kembali ke 0, deposit tidak diulang`, channel: c.channel });
  for (let i = 0; i < 5; i++) { await c.requestUnit(); }
  emit({ phase: "serve", label: "133/133 unit dilayani (5 di epoch 1)", progress: { done: 133, total: 133 }, channel: c.channel });
  await c.finalAck();
  await c.closeCooperative(); flush("close");
  return {
    channel: c.channel, txs: c.txs, gasTotal: c.txs.reduce((s, t) => s + t.gasUsed, 0n), provingMs: 0,
    clientDelta: c0 - (await erc20Balance(ctx, env.d.usdg, me)), providerDelta: (await erc20Balance(ctx, env.d.usdg, env.providerAddress)) - p0,
    local: settle(c.tree.receipts, c.terms), terms: c.terms, epoch: c.epoch, units: 133,
  };
}
```
`toRows` gains, after the `bDisp` row:
```ts
  if (r.bAnch) rows.push({ pasar: "B: AegisClear anchored (ack on-chain, sengketa)", klien_provider: `${fmtUsdg(r.bAnch.local.payToClient)} / ${fmtUsdg(r.bAnch.providerDelta)}`, penentu: "bukti Groth16 atas R on-chain", terlihat: "hash daun, A per ack, payToClient", gas: r.bAnch.gasTotal.toString(), proving_ms: String(r.bAnch.provingMs), txs: links(r.bAnch.txs) });
  if (r.bRoll) rows.push({ pasar: "B: AegisClear rollover (128 + 5 unit, 1 deposit)", klien_provider: `${fmtUsdg(0n)} / ${fmtUsdg(r.bRoll.providerDelta)}`, penentu: "dua tanda tangan ×2 (rollover + close)", terlihat: "T, R, epoch, jumlah", gas: r.bRoll.gasTotal.toString(), proving_ms: "-", txs: links(r.bRoll.txs) });
```
`runMarketB` is reused unchanged for the anchored dispute (the client detects the mode from the factory in `env.ctx`); its `serve` label should say "di-ack on-chain" when `c.anchored` — read `c.anchored` after `start()` and pick the label.

- [ ] **Step 3: Run** — `pnpm test:demo` (5) and the demo CLI on the private chain still prints 4 rows.
- [ ] **Step 4: Commit** — `git commit -m "demo: rollover scenario, anchored/rollover rows, anchored-aware private set"`

---

### Task 2: Web console — anchored provider, two scenarios, epoch/mode

**Files:**
- Modify: `web/shared/types.ts`, `web/server/chain.ts`, `web/server/app.ts`, `web/server/demo.ts`, `web/server/channels.ts`, `web/src/components/{DemoPanel,ChannelsTable,ChannelDrawer,PrivacyCards}.tsx`, `web/src/styles.css`, `web/test/server.test.ts`

**Interfaces:**
- `ScenarioId` += `"B-anchored-dispute" | "B-rollover"` (`SCENARIOS` order: B-cooperative, B-dispute, B-anchored-dispute, B-rollover, A-complete, A-reject, all — `all` still runs only the four §14 legs).
- `ChainServices.ctx(pk, factory?: Address)`; `WebServer.services.providerAnchored`; routes `/provider-anchored/*`; runner `resetSession(provider, client)`; `PrivateRecord.anchored`.
- `ChannelSummary` += `epoch: number; mode: "co-signed" | "anchored"` (mode = `factoryName === "factoryAnchored" ? "anchored" : "co-signed"`).

- [ ] **Step 1: Failing tests** — append to `web/test/server.test.ts`:

```ts
  it("B-anchored-dispute: 20 ack on-chain via factoryAnchored → 0.02 / 0.38, channel mode anchored, leak-check tanpa metrik", async () => {
    const r = await post("B-anchored-dispute"); expect(r.status).toBe(202);
    const run = await waitRun(((await r.json()) as { runId: string }).runId);
    expect(run.status, run.error).toBe("done");
    expect(run.result![0].pasar).toBe("B: AegisClear anchored (ack on-chain, sengketa)");
    expect(run.result![0].klien_provider).toBe("0.02 / 0.38");
    expect(run.steps.filter((s) => s.label === "ack").length).toBe(20);
    const ch = (await get<{ channels: ChannelSummary[] }>("/api/channels")).channels.find((x) => x.channel === run.channels[0])!;
    expect(ch.mode).toBe("anchored"); expect(ch.seq).toBe(20); expect(ch.state).toBe("SETTLED");
    const rep = await get<LeakResponse[]>(`/api/demo/leak-check/${run.id}`);
    expect(rep[0].leaks).toBe(0); expect(rep[0].txs.length).toBe(24); // open + fund + 20 ack + startClose + claimPenalty (settle by client or watcher)
  });
  it("B-rollover: 128 + 5 unit dengan satu deposit → 0.00 / 2.66, epoch on-chain 1", async () => {
    const r = await post("B-rollover"); expect(r.status).toBe(202);
    const run = await waitRun(((await r.json()) as { runId: string }).runId);
    expect(run.status, run.error).toBe("done");
    expect(run.result![0].klien_provider).toBe("0.00 / 2.66");
    expect(run.steps.filter((s) => s.txHash).map((s) => s.label)).toEqual(expect.arrayContaining(["fund", "rollover", "closeCooperative"]));
    const ch = (await get<{ channels: ChannelSummary[] }>("/api/channels")).channels.find((x) => x.channel === run.channels[0])!;
    expect(ch.epoch).toBe(1); expect(ch.state).toBe("SETTLED");
  });
```
(The anchored leak-check tx count: adjust to what the run really produced if the watcher settled — assert `≥ 23` and that every ack tx is included.)

- [ ] **Step 2: Server** — `chain.ts`: `ctx(pk, factory = cfg.deployment.factory)`. `app.ts`: `providerAnchored = createProviderApp({ ...same options, anchored: true, ctx: chain.ctx(cfg.keys.provider, cfg.deployment.factoryAnchored) })` only when `cfg.deployment.factoryAnchored` exists; `app.route("/provider-anchored", providerAnchored.app)`; second watcher started/stopped with the first; JSON 404 catch-all also for `/provider-anchored/*`; runner gets `providerAnchored` + `providerAnchoredUrl`. `demo.ts`: `CLIENT_OF` += `"B-anchored-dispute": "a"`, `"B-rollover": "b"`; `envAnchored` = `{ ...env, ctx: (pk) => d.chain.ctx(pk, factoryAnchored), providerUrl: d.providerAnchoredUrl }`; `execute`: anchored → `runMarketB(envAnchored, pk, true, emit, ANCHORED_UNITS)` → `res.bAnch`, privates with `anchored: true`; rollover → `runRollover(env, pk, emit)` → `res.bRoll`; pre-flight `resetSession` runs against the provider that will serve the leg. `channels.ts`: `epoch: v.epoch`, `mode`. Leak-check route: pass the factory matching the channel's mode (`factoryAnchored` for anchored records) to `leakCheck`.

- [ ] **Step 3: UI** — `DemoPanel` LABEL for the two scenarios ("B · anchored: 20 ack on-chain + sengketa (klien A)", "B · rollover: 128 + 5 unit, 1 deposit (klien B)"); `ChannelsTable` columns `epoch` and a `mode` tag (`anchored` pill); `ChannelDrawer` shows `epoch`; `PrivacyCards` chain card adds, for anchored channels, the line "anchored: hash daun + A per ack terlihat on-chain (harga per unit tersirat); metrik & ambang tetap privat"; `.pill.mode-anchored` style.

- [ ] **Step 4: Run** — `pnpm --filter @aegisclear/web typecheck && build`, `RPC_URL=http://127.0.0.1:8547 pnpm test:web` (31 + 2), then the controller's browser check.
- [ ] **Step 5: Commit** — `git commit -m "web: anchored provider (/provider-anchored) + anchored/rollover scenarios, epoch & mode in the channel table"`

---

### Task 3: Slither self-audit

**Files:**
- Create: `docs/audit/slither-2026-09.md`; Modify: contracts only for true positives (+ tests).

- [ ] **Step 1:** `cd contracts && slither . --filter-paths "lib/|test/|script/" --exclude-dependencies --checklist > /tmp/slither.md 2>&1` (also `--print human-summary`). If Slither cannot compile with the Foundry profile, use `slither . --foundry-compile-all` or `--solc-remaps` from `remappings.txt`.
- [ ] **Step 2:** Triage every High/Medium/Low into the report: table `detector | location | verdict (true positive → fix commit | false positive → why) | note`. Expected true positives to consider: reentrancy flags on `_send` (mitigated by nonReentrant + CEI — document), `PoseidonPathYul` external library, `tx.origin`/timestamp warnings (deadline logic is by design). Fix anything that is a real bug with a regression test.
- [ ] **Step 3:** Re-run Slither after fixes; the report ends with the summary counts and the command lines. `forge test` green.
- [ ] **Step 4:** Commit — `git commit -m "audit: Slither triage (docs/audit/slither-2026-09.md) + fixes"`

---

### Task 4: Spec v1.1 (`prd-arsitektur.md`)

- [ ] Edit in place (keep the section skeleton): §0 status line (P1 shipped 20 Sep: web console, rollover, router, anchored + Stylus; testnet v1); §1 scope table ticks; §5 FR-10/25/26 → ✅ with the delivered semantics; §6.2 signed structs with `epoch` and `Leaf(uint32 epoch,uint64 seq,bytes32 leaf,uint128 cumulativeAmount)` + rationale (replay after rollover; A signed so proofs stay possible); §6.7 leakage table gains the anchored row (leaf hash + A per ack); §8.1 function list (`rollover`, `ack`, `startClose`, `hashLeaf`, mode immutables, `_send` hook) and the settle flow note (proofSeq); §8.3 rewrite: what was actually built (v1 optimized, `insertPath` interface, sizes, addresses, numbers, no `hash5/6/root128` and why); §8.4 router as built (hook + credit ledger + claim, Unbacked invariant, nonReentrant); §8.5 factory ctor `poseidonPath`, `AlreadyOpen`; §8.6 role matrix rows for `ack`/`startClose`/`rollover`/router; §8.7 already updated — add `open`/`closeCooperative` from `forge test --gas-report` if cheap; §11 SDK: authenticated close/rollover, `/rollover/confirm`, anchored options, mode derived from factory (T-mode); §12 threat model: T-hook (payee griefing), T-mode (402 lies about mode), T-close-continue, T-rollover-ticket (parked design note from the ledger), anchored inflated-A analysis; §13 scenarios 11–13 ✅ with test names; §14 web console paragraph (already) + the two new scenario rows; §16 plan table rows 12/13 ✅; §17 Q&A: "Stylus di mana?" answer with the 1,75× number and why only there; §19 V18b (already), V12 ✅ final; §20 D2 ✅ (already), D-new: `startClose` in co-signed mode (open); §23 changelog v1.1 dated 20 Sep 2026 listing every change. Numbers only from README/ledger — never invent.
- [ ] Commit — `git commit -m "spec: v1.1 — P1 as built (epoch/rollover, hook+router, anchored+Stylus), threat model and measured numbers"`

---

### Task 5: Submission package

- [ ] Dispatch the `submission-packager` agent (it reads README/spec/docs) to produce `docs/SUBMISSION.md`: demo runbook (web console on testnet: start → run dispute → leak-check → explorer; then anchored + rollover), ≤3-minute video script with timestamps, portal write-up (problem, what's new, what's honest: single-contributor setup, MockUSDG on testnet, mainnet pending funds), judge Q&A (from spec §17 + P1), DQ checklist (public repo ✅, release ✅, deployed ✅ chain 46630, video ⬜, form ⬜), links table. Controller reviews for fabricated claims; every number must trace to README/spec.
- [ ] Commit — `git commit -m "docs: submission package (runbook, video script, judge Q&A, checklist)"`

---

### Task 6: Final verification + merge (controller)

- [ ] Full suites; browser check of the two new scenarios; final whole-branch review; merge to `main`, push; ledger archived; memory updated.
