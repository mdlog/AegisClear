# SDD ledger — plan: docs/superpowers/plans/2026-09-20-aegisclear-web-console.md
Spec: docs/superpowers/specs/2026-09-20-aegisclear-p1-design.md §A. Branch: feat/aegisclear-p1-web (from main 891eea4).
Test infra: private Anvil :8547 (foreign Anvil may sit on :8545), DeployLocal → contracts/deployments/local.json, web tests on :4042.

## Pre-flight conflict scan (20 Sep 2026)
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 → T3/T4/T5 | `ScenarioEnv{ctx,publicClient,d,art,providerUrl,providerAddress,providerPk,challengeWindow,timeTravel}`, `runMarketB(env,pk,dispute,emit,units?)`, `runMarketA(env,pk,accept,emit)`, `toRows`, `privateValues`, `leakCheck(pc,factory,channel,txs,priv,fromBlock)` vs uses in demo.ts/app.ts | consistent (providerPk added to interface in plan) |
| T1 → T3 | sdk `channelAbi` + `cfg()` + events vs `channels.ts` `readContract cfg`, `getContractEvents` all-events | consistent |
| T2 → T3 | `createWebServer` skeleton + `WebServer` interface vs T3 replaces interface with `services` | T3 text says replace; no conflict |
| T3 → T4 | `runIdOf: Map<Address,string>` declared in T3, filled by T4 emit wrapper | consistent |
| T4 → T5 | `runner.privateOf(runId) → PrivateRecord[]` vs leak route | consistent |
| T4 → T6 | `ChannelSummary.receiptsRoot` added in T4 Step 1 vs PrivacyCards/Drawer usage | consistent |
| T2 test ↔ config | `keys toEqual ANVIL_KEYS`, testnet windows 60/30, chainId guard message `chainId 31337` | consistent with code |
| T6 format.ts vs demo fmtUsdg | duplicated 1-line helper (browser bundle must not import server lib) | Ruling: accept duplication — importing @aegisclear/demo would drag viem/sdk/snarkjs into the bundle — cost if wrong: none |
| Rubric | no asserting-nothing tests; each task has TDD steps | clean |
| Global | ports 4040/4041/4042, Anvil 8547, no key material in API responses (test asserts) | clean |

## Task log
- Task 1: dispatched (implementer sonnet), BASE 84cdae0, brief task-1-brief.md, report task-1-report.md. Anvil :8547 + DeployLocal prepared by controller (persistent, setsid).
- Task 1: complete — commit 3e928b7 (impl sonnet, review sonnet: ✅ spec, Approved, 0 Critical/Important). Minors: leak-check CLI error UX, demo tests not in root aggregate, no demo tsconfig → Ruling: folded into Task 7 (Step 1b) — cheap, keeps plan scope; cost if wrong: none.
- Task 2: dispatched (implementer sonnet), BASE 29a28cd, brief task-2-brief.md, report task-2-report.md.
- Task 2: implementer DONE_WITH_CONCERNS — commit f18bea8; concern: tsconfig.server.json needed `"../sdk/src/types.d.ts"` in include (ambient shim). Ruling: accepted (structural, pre-existing); Task 7 Step 1b demo tsconfig gets the same include — cost if wrong: typecheck noise only. Review dispatched.
- Task 2: complete — commit f18bea8 (review sonnet: ✅ spec, Approved, 0 Critical/Important; commit body trailer-free, checked by controller). Minors (dead 403 branch, URIError→500, no local chainId cross-check, readDeployment chainId, .env inline comments, no app.ts tests) → Ruling: folded into Task 7 Step 1c (small hardening) — cost if wrong: none. Task 3's server.test.ts covers app routes.
- Task 3: dispatched (implementer sonnet), BASE = HEAD after plan patch, brief task-3-brief.md, report task-3-report.md.
- Task 3: implementer DONE — commit 63c1099 (10/10 web tests, typecheck/build clean). Review dispatched (sonnet).
- Task 3: complete — commit 63c1099 (review sonnet: ✅ spec, Approved, 0 Critical/Important). Minors: no RPC error shaping (→ Task 7 Step 1c `app.onError` 502), unknown-address forces rescan, sequential reads, responder path untested here (covered by SDK suite). ⚠️ noted: in-process watcher scans only `ctx.factory` (demo factory) — by design; the anchored provider in Plan 2c gets its own ctx/watcher.
- Task 4: dispatched (implementer sonnet), brief task-4-brief.md, report task-4-report.md.
- Task 4: implementer DONE_WITH_CONCERNS — commit 3dc7054 (17/17). Deviation: ChannelIndex ttlMs=1000 at the app.ts call site to dodge a cache race in the brief's B-cooperative test (100-unit run completes in ~2.6 s on Anvil). Ruling: timing fix insufficient → fix round 1 will add structural invalidation (`ChannelIndex.invalidate()` called by the runner when a step carries a new channel and on finish/fail) and restore the default TTL — cost if wrong: one extra rescan per run. Review dispatched.
- Task 4: review (sonnet) → Needs fixes: Important #1 double-start race (async pre-flight before create), #2 uncaught pre-flight RPC error — both plan-mandated (brief code). Ruling: `starting` guard + try/catch → 409/502; `ChannelIndex.invalidate()` structural fix (TTL restored); SSE live-path test. Fix round 1 → resumed implementer acbd8fa.
- Backlog (parked): runIdOf/privates maps unbounded (demo-scale); Task 7 Step 1c already collects other hardening.
- Task 4: fix round 1 → commit ed47ed5 (18/18 ×3, TTL restored). Scoped re-review dispatched (sonnet).
- Task 4: complete — commits 3dc7054 + ed47ed5 (re-review: all 4 findings Fixed, no new issues). Minor theoretical: create() throw inside try → 502 (unreachable after the guard).
- Task 5: dispatched (implementer sonnet), brief task-5-brief.md, report task-5-report.md.
- Task 5: implementer DONE — commit b913863 (19/19). Review dispatched (sonnet, small diff).
- Task 5: complete — commit b913863 (review sonnet: ✅ spec, Approved). Important (plan-mandated) error-shaping findings (leakCheck throw → bare 500; offer res.json() on non-JSON) → Ruling: folded into Task 7 Step 1c together with app.onError + client validation — cost if wrong: opaque 500 on rare paths until Task 7.
- Task 6: dispatched (implementer sonnet), brief task-6-brief.md, report task-6-report.md.
- Task 6: implementer DONE — commit c144fad (23/23, build clean). Controller visual check in Chrome (server :4044): header/badges, channel table + run tag, live SSE log w/ progress, result row 0.07/1.93 (gas 542,218, proving 4,379 ms), leak-check bocor 0 (5 tx), privacy cards, drawer w/ event timeline+gas — all OK. Visual defect: result table's `tx` column overflows the panel edge (needs `.scroll` wrapper / table-layout). Note: Anvil :8547 had died mid-plan; Task 6 implementer restarted it (same deterministic addresses). Review dispatched (sonnet).
- Task 6: review (sonnet) → Needs fixes: Important #1 swallowed fetch errors (DemoPanel resume, PrivacyCards), #2 ChannelDrawer stale-response race — plan-mandated. + controller visual: result table overflow. Ruling: fix round 1 (error banners + gen guard, alive flags, `.scroll` wrapper, minors: keys/keyboard rows/<main>/busy button). Resumed implementer a419086.
- Task 6: fix round 1 → commit f751c69. Controller browser re-check: overflow contained (panel scrolls), but tx links break mid-hash making rows tall → Ruling: CSS polish folded into Task 7 Step 1d (not another fix round). Scoped re-review dispatched (sonnet).
- Task 6: complete — commits c144fad + f751c69 (re-review: all 4 findings Fixed; minor PrivacyCards stale state on error → folded into Task 7 Step 1d).
- Task 7: dispatched (implementer sonnet), brief task-7-brief.md, report task-7-report.md.
- Task 7: implementer DONE — commits 347ccfa + b1c9ac2 (sdk 34, circuits 14, contracts 63, web 27, demo 3). Task review (sonnet) + final whole-branch review (opus) dispatched in parallel.
- Task 7: complete — commits 347ccfa + b1c9ac2 (review sonnet: ✅ spec, Approved, 0 Critical/Important; minors: single-quote-only .env value, non-Error throw → "undefined" message). Commit bodies trailer-free (controller checked). Awaiting final whole-branch review (opus).
- Final whole-branch review (opus): With fixes — C1 settle race client vs in-process watcher (B-dispute nondeterministic on testnet), C2 local mode picks `.env` testnet RPC_URL without chain-id check; I1 bind 0.0.0.0, I2 index scaling, I3 API 404 fallthrough, I4 wait from on-chain deadline; minors (addresses whitelist, README API list, deployBlock in testnet json (controller added), EADDRINUSE, closeAllConnections). Ruling: ONE fix dispatch (final-fix-brief.md) → implementer sonnet a84d8b4; residual minors parked (fmtUsdg/j() duplication, PrivacyCards hard-coded 1200 ms, partial rows on `all` failure, OfferView cosmetics, as-any RPC calls).
- Final fix → commit 19d2130 (web 31/31 ×2, demo CLI 4 rows, typecheck/build clean). Scoped re-review dispatched (sonnet). Implementer note: SETTLED summaries cached permanently (budget may go stale after late funds + sweep) — re-reviewer asked to judge `budget === 0` rule.
- Final re-review: C1/I4, C2, I1, I3, minors Fixed; I2 partially (permanent SETTLED cache could freeze a stale non-zero budget). Controller adjudicated: applied `budget === 0n` gate directly (commit above), web 31/31. Residuals parked (backlog): full ChannelOpened re-fetch each scan; race-loss branches unexercised; FACTORY_BLOCK message also covers bad deployBlock. Plan workspace retained until merge.
