# SDD ledger — plan: docs/superpowers/plans/2026-09-19-aegisclear-mvp.md
Spec: prd-arsitektur.md (v1.0, 19 Sep 2026) — reachable, binding authority.
Workspace: .superpowers/sdd/2026-09-19-aegisclear-mvp/

## Setup rulings
- Ruling: repo did not exist; controller ran `git init -b main` (no commit) so the SDD workspace could resolve. Task 1 makes the initial docs commit on `main`, then all work continues on branch `feat/aegisclear-mvp` (created by Task 1 implementer) — why: skill forbids implementing on main without consent; the user consented to execution, a branch keeps finishing-a-development-branch clean — cost if wrong: one trivial branch merge.
- Ruling: no worktree (repo is brand new, nothing else lives in it); the branch is the isolation — cost if wrong: none observable.

## Pre-flight conflict scan (pairs sharing files/interfaces)
| Pair | Produces vs consumes | Finding |
|---|---|---|
| T2↔T3 | vectors JSON {terms,receipts,seq,cumulativeAmount,...} vs loadVector() field names; nonce as int or string → BigInt() | consistent (T3 note adds nonce stringification to Python before --json) |
| T3↔T4 | leafHash Poseidon(seq,qty,m1,m2,due), commitTerms Poseidon(6 fields), merkleRoot 128 slots EMPTY_LEAF=0 vs circuit C1/C4/C5 | consistent; public input order identical |
| T4↔T5 | build.sh outputs build/sla_settlement.r1cs + build/sla_settlement_js/sla_settlement.wasm vs setup.sh/prove.ts paths | consistent |
| T5↔T6 | prove.ts --json {proof: string[8] decimal, inputs: string[6] decimal} vs Verifier.t.sol parseJsonUintArray; contract renamed SLASettlementVerifier, verifyProof(uint[2],uint[2][2],uint[2],uint[6]) vs ISLASettlementVerifier | consistent |
| T5↔T10 | prove.ts hex abi.encode(uint256[8],uint256[6]) / --terms-only abi.encode(uint256) on stdout, logs on stderr vs vm.ffi decode | consistent (npx tsx must resolve from contracts/: T1 adds root devDep tsx) |
| T7↔T8/9/10/11 | errors/events/storage declared in T7 (StaleCheckpoint, SeqTooLarge, NotParty, ExceedsCumulative, InvalidProof, TooEarly, ExceedsBudget, WrongToken, hasProof/proofSeq/payToClient) vs later use; _payout defined T8 used T9 | consistent |
| T7 Base.t.sol↔T8–T12 | checkpointSigs/closeSigs/fund/openByClient/termsDigest helpers vs usage | consistent; T10 uses its own realFactory but base fund()/usdg |
| T11 | ISignatureTransfer import already present since T7 (unused until T11) | no conflict |
| T12 | Handler extends Test (bound, vm) and is targetContract; fail_on_revert=false in foundry.toml (T6) | consistent |
| T13↔T4/T5 | sdk exports "./src/core/index.ts" until T13 switches to "./src/index.ts" (re-exports core); prove.ts imports move to sdk prove/toCalldata in T13 | consistent, sequenced |
| T13↔T14/15/16 | openChannel→{channel,hash,gasUsed}; readChannel→ChannelView(deadline:number,state:string); submitCheckpointTx/claimPenaltyTx(inputs[5])/settleTx/sweepTx/closeCooperativeTx/erc20Transfer/erc20Balance names | consistent (checked in plan self-review) |
| T14 | client transfers deposit to predicted address before open; clone deployed later at funded address | valid (CREATE2 onto address with balance, no code) |
| T16↔T14 | DeployLocal gains `escrow`; demo reads deployments/local.json {usdg,factory,escrow} | consistent (redeploy required after T16 Step 1) |
| T17↔T14 | integration test parametrized by env; default = local | consistent |
| T18 | remapping poseidon-solidity/=lib/poseidon-solidity/contracts/; PoseidonT6.hash(uint[5]) | consistent with upstream repo layout |

Per-task self-consistency: T1 .gitignore keeps verification_key.json; T2 flag --no-random matches .gitignore RAND_*; T4 LessThan(8)/LessEqThan(8) bounds hold for seq≤128 (unsatisfiable beyond); T7 cfg() destructure has 9 slots; T8 deadline math uint64; T10 FR-18 test uses MockVerifier(true) from base factory; T16 test asserts on balances; no test asserts nothing; no verbatim duplicated logic blocks mandated. Scan result: no conflicts requiring rulings beyond setup.

## Task log
- Task 1: dispatched (implementer sonnet; BASE = unborn/no commits)
- Task 1: implementer DONE (f5c9a0b docs on main; 5a1bdde chore on feat/aegisclear-mvp). Note: pnpm is a corepack shim and /home/mdlog/package.json pins yarn — pnpm/npx must run from a dir whose nearest package.json is the repo's (now exists at root, so contracts/ resolves fine). Review package base = f5c9a0b (root commit holds only controller-authored docs).
- Task 1: review clean. ⚠️ resolved by controller: snarkjs is installed by sdk (Task 3) and circuits (Task 4) packages — brief Interfaces line was loose, no gap; branch placement verified by controller (`git branch --show-current` = feat/aegisclear-mvp, main tip = f5c9a0b).
- Task 1: minor (deferred): docs/TOOLCHAIN.md:7 trailing space after rustup targets line.
- Task 1: complete (commits f5c9a0b..5a1bdde, review clean)
- Task 2: dispatched (implementer haiku; BASE = 5a1bdde)
- Task 2: implementer DONE (9f0965c)
- Task 2: review clean. ⚠️ (commit body trailer) resolved by controller: `git log -1 --format=%B 9f0965c` = subject only, no trailer.
- Task 2: minor (deferred): vectors/*.json single-line without trailing newline (as mandated by brief code).
- Task 2: complete (commits 5a1bdde..9f0965c, review clean)
- Task 3: dispatched (implementer haiku; BASE = 9f0965c)
- Task 3: implementer DONE_WITH_CONCERNS (a2c7ab6). Ruling: accept `return cached as Promise<PoseidonFn>;` type assertion in sdk/src/core/poseidon.ts — why: circomlibjs is untyped so strict TS cannot narrow the cached union; non-behavioral — cost if wrong: none at runtime.
- Task 3: review clean. ⚠️ resolved by controller: commit body has no trailer (git log -1 --format=%B a2c7ab6).
- Task 3: minor (deferred): poseidon.ts caches a rejected promise forever if buildPoseidon fails; assertReceiptInRange seq check redundant with settle(); JSON vectors stringify only nonce (other fields safe for current ranges).
- Task 3: complete (commits 9f0965c..a2c7ab6, review clean)
- Task 4: dispatched (implementer sonnet; BASE = a2c7ab6)
- Task 4: implementer DONE_WITH_CONCERNS (6159598). Measured: circom default O1 = 217,908 constraints (> 2^17); with `--O2` = 113,224 (< 131,072). Ruling: accept `--O2` in circuits/scripts/build.sh instead of D4 — why: D4 (N=64) would break EX1/EX2/EDGE_seq128 vectors the plan itself mandates, and circom --O2 (full linear-constraint simplification) is sound and standard — cost if wrong: if O2 ever miscompiles, all proofs fail loudly at verify (no silent risk). Spec §9.3 estimate (~90.5k) superseded by measurement; controller to update spec text.
- Task 4: review → Needs fixes. Findings (both plan-mandated code): (1) DivBps `r` under-constrained — LessThan(14) admits r ∈ [p−6384, p−1], prover can inflate q by +1 per breached receipt → payToClient above settle() (probe-verified by reviewer); (2) `seq ≤ 128` via LessEqThan(8) not tight (admits seq ≈ p−k, proves empty channel). Ruling: plan text is defective, spec C8/C10 is binding → fix in circuit: `Num2Bits(14)` on r inside DivBps, `Num2Bits(8)` on seq, `Num2Bits(14)` on penaltyBps/capBps; add witness-tampering regression test for DivBps — why: shipped circuit would admit wrong payouts before the zkey is baked — cost if wrong: ~+2k constraints (still < 2^17). Controller will amend plan Task 4 code after the fix lands.
- Task 4: minor (deferred): negative-test regex `/Assert Failed|Error/` too broad; unused `settle` import and unused `viem` dep in circuits; `dB Num2Bits(64)` on due redundant (~8.2k constraints); build.sh comment imprecise about witness layout.
- Task 4: fix round 1/5 dispatched result: implementer DONE (9e88ff6; constraints 115,066)
- Task 4: fix round 1/5 (2 addressed [F2, bookkeeping], 1 open — F1 regression test non-discriminating: tampering two witness slots breaks unrelated bit-decomposition constraints, so it rejects with or without `rb`; commits 6159598..9e88ff6)
- Task 4: Ruling for round 2: split DivBps into `DivBpsConstraints()` (x,q,r as inputs; all constraints) + `DivBps()` wrapper in `circuits/lib/divbps.circom`; probe circuit compiles `DivBpsConstraints` as main so the test feeds attacker-chosen (x=13616,q=2,r=p−6384) — accepted without `rb`, rejected with it (reviewer-verified boundary) — why: only way to get a discriminating test without hand-building a full consistent malicious witness — cost if wrong: small refactor, constraint count unchanged under --O2.
- Task 4: fix round 2/5 implementer DONE (bb50be9; probe test discriminates: FAILS without rb, PASSES with rb; 12 tests; 115,066 constraints)
- Task 4: fix round 2/5 (1 addressed — F1 discriminating probe test; 0 open; commits 9e88ff6..bb50be9)
- Task 4: complete (commits a2c7ab6..bb50be9, review clean after 2 fix rounds). Controller docs commit follows (spec §9/§9.3 + plan Task 4 amended).
- Task 5: dispatched (implementer sonnet; BASE = docs commit after bb50be9)
- Task 5: implementer DONE (f4af7f6). Setup 447 s total; provingMs 4132; 14/14 circuits tests. NOTE: host disk /home at 99% (2.6 GB free) — flag to user; Task 18 (cargo/Stylus build) must check `df` first and may need a target dir elsewhere.
- Task 5: review Approved with 1 Important plan-mandated finding: setup.sh phase-2 (zkey) block not idempotent — every run regenerates sla_final.zkey (new entropy) → desync with committed vkey/verifier/fixture on other machines. Ruling: fix (guard phase-2+export with `[ -f build/sla_final.zkey ] && FORCE_SETUP!=1 → skip with warning`) — why: cheap, prevents silent verifier drift for CI/other checkouts; Task 17 additionally publishes the zkey as a release asset — cost if wrong: none (guard only).
- Task 5: minor (deferred): unused `settle` import in prove.test.ts (brief-mandated); no runtime validation of --channel; fixture/vkey lack trailing newline; CLI error paths untested; ⚠️ "14 tests" count is TAP total incl. subtests (8 top-level registrations).
- Task 5: fix round 1/5 implementer DONE (c9dc54b; idempotence verified by checksum)
- Task 5: fix round 1/5 (1 addressed, 0 open; commits f4af7f6..c9dc54b)
- Task 5: complete (commits 7cdd3d7..c9dc54b, review clean after 1 fix round)
- Task 6: dispatched (implementer sonnet; BASE = c9dc54b)
- Task 6: implementer DONE (76f9ef8). verifyProof gas (6 inputs) = 229,241 → spec §8.7 to be updated by controller. forge-std installed via submodule fallback; forge 1.5.1 has no --no-commit.
- Task 6: review clean. ⚠️ resolved: empty dirs (deployments/, test/mocks, test/utils) get files in Tasks 7/12/14.
- Task 6: minor (deferred): Verifier.t.sol negative tests `public` → could be `view` (solc 2018 warnings, brief-mandated); forge-std/permit2 pinned to branch tip, not tags.
- Task 6: complete (commits c9dc54b..76f9ef8, review clean). Controller docs commit: spec §8.2/§8.7 verifier gas 229,241.
- Task 7: dispatched (implementer sonnet; BASE = docs commit after 76f9ef8)
- Task 7: implementer DONE (dfd92d7; 11/11 tests). Ruling: accept hoisting the sig into a local in test_bad_config_reverts (vm.expectRevert must bind to the next external call) — cost if wrong: none.
- Task 7: review clean. ⚠️ resolved: RED/GREEN evidence consistent with diff; commit body checked by controller earlier pattern (subject only).
- Task 7: minor (deferred): CREATE2 collision on double-open burns forwarded gas (add `predict(c).code.length != 0 → AlreadyOpen` pre-check); untyped expectRevert in test_open_twice; MockVerifier not declared `is ISLASettlementVerifier`; extra test gaps (implementation initialize, salt-only replay negative, BadConfig branches, 1271 signer — 1271 covered in Task 12); EIP-7702-delegated EOAs go to the 1271 path (integration note); ChannelTerms has no expiry (spec-level note).
- Task 7: Ruling: keep storage-based OZ `ReentrancyGuard` (deprecated in v5.7 in favour of Transient) — why: safe on clones (namespaced slot, ENTERED check) and avoids depending on TSTORE support on Robinhood Chain that is unverified — cost if wrong: one cold SSTORE per clone's first guarded call.
- Task 7: complete (commits 0d5ebaa..dfd92d7, review clean)
- Task 8: dispatched (implementer sonnet; BASE = dfd92d7)
- Task 8: implementer DONE (1ac28ad; 22/22)
- Task 8: review Approved; 1 Important plan-mandated: no vm.expectEmit assertions for CheckpointSubmitted/Settled/PaymentReleased/Refunded. Ruling: not a fix round now — carry into Task 12 (test-hardening task) as a mandated addition: event-emission tests for submitCheckpoint/settle/closeCooperative/claimPenalty incl. jobId, payout vs identity addresses, cooperative flag — why: no downstream task depends on it and Task 12 already touches tests — cost if wrong: a Task 9–11 event regression would be caught only at Task 12.
- Task 8: minor (deferred): no success test for seq == 128; no WrongState test for submitCheckpoint after SETTLED; cap test doesn't pin client delta; forge fmt diffs on brief one-liners.
- Task 8: complete (commits dfd92d7..1ac28ad, review clean)
- Task 9: dispatched (implementer sonnet; BASE = 1ac28ad)
- Task 9: implementer DONE (587bba8; 29/29)
- Task 9: review clean. ⚠️ resolved: commit body = subject only (controller checked).
- Task 9: minor (deferred): untested boundaries (toProvider == budget, seq_ == 128, budget == 0, Swept(0), provider-sourced late funds); forge fmt one-liner. → carry boundary tests into Task 12 as optional additions.
- Task 9: complete (commits 1ac28ad..587bba8, review clean)
- Task 10: dispatched (implementer sonnet; BASE = 587bba8)
- Task 10: implementer DONE (aa3ef29; 37/37; real-proof EX1 end-to-end 1,930,000 / 3,070,000)
- Task 10: review clean (opus). ⚠️ resolved: commit body subject-only (controller checked).
- Task 10: minor (deferred): "last valid claim wins" semantic undocumented (benign under soundness; FR-18 bounds it); claimPenalty accepted after deadline until settle (document); FR-15 cryptographic replay test (re-submit stale proof after newer checkpoint → InvalidProof) missing; no expectEmit for PenaltyClaimed; misnamed test. → carry replay test + expectEmit into Task 12.
- Task 10: complete (commits 587bba8..aa3ef29, review clean)
- Task 11: dispatched (implementer sonnet; BASE = aa3ef29)
- Task 11: implementer DONE (05db0c2; 41/41). Ruling: accept correcting the test constant `PERMIT_TRANSFER_FROM_TYPEHASH` to include the `TokenPermissions(address token,uint256 amount)` suffix (EIP-712 encodeType; matches Permit2 PermitHash.sol) — the plan's constant was wrong; controller to amend plan text — cost if wrong: none (real Permit2 bytecode accepted the signature).
- Task 11: review clean. ⚠️ resolved: commit body subject-only.
- Task 11: minor (deferred): fundWithPermit2 lacks nonReentrant (not exploitable; defense-in-depth); no expectEmit for Funded/JobFunded; no WrongState test for UNINIT/SETTLED funding. → expectEmit carried into Task 12.
- Task 11: complete (commits aa3ef29..05db0c2, review clean). Controller docs commit: plan Task 11 typehash corrected.
- Task 12: dispatched (implementer sonnet; BASE = docs commit after 05db0c2) with carried additions: event tests (Task 8 ruling), stale-proof cryptographic replay test (Task 10), boundary tests optional.
- Task 12: implementer DONE (18bea73; 57/57; AegisChannel.sol line coverage 100%)
- Task 12: review clean. ⚠️ resolved: commit body subject-only.
- Task 12: minor (deferred): settle event test has A == toProvider by construction (discriminated by the cooperative test); unchecked transfer in Wallet1271.t.sol (lint); duplicated sweep setup.
- Task 12: complete (commits 87ae654..18bea73, review clean)
- Task 13: dispatched (implementer sonnet; BASE = 18bea73)
- Task 13: implementer DONE (09c84b2; sdk 18/18, circuits 14/14, typecheck clean; one pre-approved as-any cast in write())
- Task 13: review clean. ⚠️ resolved: commit body subject-only; chain helpers exercised end-to-end in Task 14.
- Task 13: minor (deferred): write() helper untyped (`as any`, plan-mandated); waitTx error lacks revert reason; ProofCalldata.proof not a fixed tuple.
- Task 13: complete (commits 18bea73..09c84b2, review clean)
- Task 14: dispatched (implementer sonnet; BASE = 09c84b2)
- Task 14: implementer DONE (eef9e5c; sdk 20/20 incl. 2 Anvil integration). Gas (Anvil): fund 51,577; submitCheckpoint 102,825; claimPenalty 293,880; settle 93,900 → spec §8.7 (controller).
- Task 14: review → Needs fixes (opus). 3 Important plan-mandated fund-loss holes in the brief's protocol code: (1) `/close` signs Close for seq 0 / any stale acked seq → client can close with toProvider 0 after 10 acked units; (2) client never binds `offer.payTo` to `predictChannel(cfg)` → provider can redirect the deposit to any address it signs a domain for; (3) `cfg.payoutClient` (and `provider`) unchecked before the client signs ChannelTerms → refund redirectable. Ruling: fix all three (spec §6.2/§11.3/T19 binding) + Ruling: add a provider-signed "exit ticket" `Checkpoint(0, 0, emptyRoot)` in the 402 `extra.aegis.exitSig` so the client always has a unilateral seq-0 exit if the provider goes dark before unit 0 (reviewer cross-task observation; no contract change) — why: client deposit otherwise unrecoverable — cost if wrong: one extra signature per session.
- Task 14: minor (deferred): sessions never evicted; no per-session serialization; client appends before verifying (dispute() should use highest co-signed key); no client policy bounds (maxDeposit/maxWindow); provider opens before checking funding (gas griefing); unguarded JSON.parse / address validation; unauthenticated session creation & /state; fixed port 4020; negative HTTP paths unexercised; cooperative close should be refused by client when payToClient > 0 (policy). Provider watcher for stale on-chain checkpoints = Task 15 scope (Watcher only settles/sweeps — NOTE: responding to a stale checkpoint with the newer co-signed one is NOT in Task 15; ledger as gap for final review/Plan 2).
- Task 14: fix round 1/5 implementer DONE (bab6eca; 24/24 SDK tests incl. 4 new negative/exit tests)
- Task 14: Ruling (carried into Task 15): the exit ticket does not create a new attack class — a client could already submit ANY stale co-signed checkpoint; both rely on the counterparty responding within the window (spec T1 liveness). Task 15's Watcher must therefore also act as a challenge responder: given a per-channel store of the highest co-signed checkpoint, on tick if `state == CLOSING && onchain.seq < stored.seq` → `submitCheckpointTx(stored)`; the provider server exposes its co-signed store for this. Cost if wrong: a few hundred lines in Task 15.
- Task 14: fix round 1/5 (F1–F4 + tests a–d addressed; re-review raised NEW Critical: static exit ticket lets a client roll back to seq 0 after consuming units if the provider does not respond within the window; commits eef9e5c..bab6eca)
- Task 14: Ruling on the new finding: contestable as "new class" — before the ticket a client could already submit any stale co-signed checkpoint k ≥ 1 in OPEN and win the same race; the ticket only extends k to 0 (extra exposure = one unit's price). Spec T1 already accepts the liveness assumption; the real mitigation is the provider challenge responder mandated for Task 15 (ruled above). Round 2 scope: (a) client `exitUnilateral()` refuses when any co-signed checkpoint exists (must use dispute()/close) — removes the foot-gun; (b) server exposes `latestCoSigned(client)` so the Task 15 responder can consume it; (c) doc comment in server.ts that fund-safety for providers REQUIRES running the responder; (d) test: after units, `exitUnilateral()` throws. Cost if wrong: provider exposure until Task 15 lands (all on Anvil/testnet for now).
- Task 14: fix round 2/5 implementer DONE (71f46de; 24/24)
- Task 14: fix round 2/5 (F5 addressed, 0 open; commits bab6eca..71f46de)
- Task 14: complete (commits 09c84b2..71f46de, review clean after 2 fix rounds). Controller docs commit: spec §8.7 gas, §10.2 exit ticket, §11.4 challenge responder.
- Task 15: dispatched (implementer sonnet; BASE = docs commit) with mandated addition: challenge responder in Watcher consuming provider `latestCoSigned`.
- Task 15: implementer DONE (c333885; 26/26). Ruling: accept vitest fileParallelism=false (shared Anvil/accounts across test files) — cost: slower suite.
- Task 15: review → Needs fixes: (1) latestCoSignedByChannel untested; (2) CLI never activates the responder (no runnable provider protection); (3) scan() not exception-isolated. Ruling: fix all three — add `startProviderWatcher()` (in-process Watcher wired to latestCoSignedByChannel) exported from server.ts, integration test where the client submits a stale seq-5 checkpoint and the provider's in-process watcher responds with seq 10; wrap scan() in try/catch; document the CLI as the permissionless settle/sweep bot.
- Task 15: minor (deferred): cli.ts env non-null assertions; no SIGINT handling; scan() rescans from genesis each tick, channels set never shrinks.
- Task 15: fix round 1/5 implementer DONE (e836a76; 28/28). Note: anvil #5 key I gave equals clientC's key already used — implementer used a second provider app instance for a fresh session (accepted).
- Task 15: fix round 1/5 (3 addressed, 0 open; commits c333885..e836a76)
- Task 15: minor (deferred): settle check reuses pre-response `v` within one tick (unreachable per reviewer analysis, self-corrects); e2e balance assertion couples to test ordering/fromBlock 0; CHAIN_ID default removed from cli (docs must state it).
- Task 15: complete (commits efe05a4..e836a76, review clean after 1 fix round)
- Task 16: dispatched (implementer sonnet; BASE = e836a76)
- Task 16: implementer DONE (ba8c094; forge 60/60, sdk 28/28; demo table A 0/2.00 & 2.00/0, B 0.00/2.00 & 0.07/1.93, proving 4245 ms, gas A 347,918/330,781, B 162,079/542,194; leak-check bocor 0). Spec §14 table to be filled by controller.
- Task 16: review Approved with 1 Important plan-mandated: leak-check never scans the provider-sent `open` tx (only the client's tx log). Ruling: fix (cheap) — leak-check fetches the `ChannelOpened` log for channelB from the factory and scans that tx too; run.ts writes `factory` into result.json.
- Task 16: minor (deferred): SimpleJobEscrow.fund() transfers before state update (CEI, mock-only control contract); escrow tests cover one access-control edge; report/port nit; CLIENT_C/D letter-index pairing.
- Task 16: fix round 1/5 implementer DONE (cb03f70; leak-check 5 tx, bocor 0)
- Task 16: fix round 1/5 (1 addressed, 0 open; commits ba8c094..cb03f70)
- Task 16: complete (commits e836a76..cb03f70, review clean after 1 fix round). Controller docs commit: spec §14 table filled.
- Task 17: Ruling: no funded Robinhood testnet key is available to the controller and broadcasting to a public testnet with the user's key is a side effect that needs the user → implement everything (DeployTestnet script, .env.example, integration-test env parametrization, README, release notes) and validate with a NON-broadcast `forge script` simulation against the testnet RPC; the actual `--broadcast` + Blockscout verify + testnet integration run are handed to the user with exact commands. Cost if wrong: none (user runs two commands).
- Task 17: dispatched (implementer sonnet; BASE = docs commit after cb03f70)
- Task 17: implementer DONE (81fafb9; dry-run against testnet RPC ok: ~8.68M gas; README; suites green). User actions remain: fund keys, deploy+verify, mint, testnet integration, release upload.
- Task 17: review → Needs fixes: README/brief testnet integration command uses a repo-root-relative DEPLOY_FILE while `pnpm --filter` runs vitest with cwd = sdk/ → suite silently skipped. Ruling: fix by resolving a relative DEPLOY_FILE against the repo root in the test (path.resolve from import.meta.url) AND documenting an absolute-path form in README; add a smoke check with a dummy JSON at the documented path proving the suite is not skipped (then remove the dummy).
- Task 17: minor (deferred): README status paragraph links to internal SDD report; English section titles; unshown diff context for 31337 sweep.
- Task 17: fix round 1/5 implementer DONE (aba66dd; documented command runs 7/7 via smoke; reporters:['default'] added — accepted)
- Task 17: fix round 1/5 (1 addressed, 0 open; commits 81fafb9..aba66dd)
- Task 17: complete (commits 91d01e5..aba66dd, review clean after 1 fix round; broadcast deferred to user per ruling)
- Task 18: Ruling: Yul benchmark + circomlib-compat check fully; Stylus crate built and validated with `cargo stylus check --endpoint <testnet>` (no key needed) with CARGO_TARGET_DIR=/tmp/aegis-stylus-target (/home has 1.7 GB free, / has 386 GB); on-chain deploy + `cast estimate` require the user's funded key → documented commands; docs/benchmarks/poseidon.md filled with Yul numbers, Stylus rows marked pending; D2 decision left open for the user. Cost if wrong: user runs three commands.
- Task 18: dispatched (implementer sonnet; BASE = aba66dd)
- Task 18: implementer DONE (e60756a; Yul T3 32,503 / T6 172,418 / 7×T3 212,715 gas; circomlib compat PASS; cargo stylus check OK, WASM 14.4 KB compressed; on-chain Stylus estimate pending user key; D2 open)
- Task 18: fix round 1/5 implementer DONE (04915fa; doc-only ratio rule)
- Task 18: fix round 1/5 (1 addressed, 0 open; commits e60756a..04915fa)
- Task 18: complete (commits aba66dd..04915fa, review clean after 1 fix round; on-chain Stylus estimate + D2 decision pending user)
- Task 18: minor (deferred): rust-toolchain pinned 1.92.0 (disk); template main.rs kept.
## Final review
- Final review package: f5c9a0b..HEAD excluding pnpm-lock.yaml, Cargo.lock, bytecode fixtures, generated verifier, plan doc (custom package, same format)
- Final review (opus): Ready With fixes. 0 Critical; 7 Important (all SDK/README, contract- and circuit-neutral). Ruling: ONE fix wave for #1 watcher after-deadline response, #2 client verify-before-append + highest-key dispute, #3 client policy bounds + unitQty in 402, #5 per-session nonce, #6 ERC-1271-aware off-chain verification via publicClient.verifyTypedData, #7 README accuracy pass (+ Minor README items, fromBlock example). Ruling: #4 request authentication (Aegis-Client header spoofable → one-unit grief per hijack, no fund loss) is PARKED as a documented known limitation of the reference SDK with the fix design (signed per-request header) — why: MVP demo runs same-machine; cost if wrong: one unit of provider revenue per hijack until implemented. Deferred-minor triage accepted as reported (only the two Task-14 items are MUST FIX → in this wave).
- Final fix wave: implementer DONE (d60ffde sdk fixes; a0474d9 README). SDK 34/34, typecheck, demo unchanged, leak 0, forge 63/63. NOTE: a concurrent Claude session ("Praetor") shares this machine and restarts anvil on :8545; our agent killed one 8545 anvil instance early (possibly theirs) then used a private port 8547 — surface to user.
- Final fix wave: scoped re-review (opus) clean — all findings addressed, no new Critical/Important. Minor (deferred): signCheckpoint after append ordering; BigInt(null) unitQty message; README provider example nonce comment; closeCooperative seq from tree.size; qty bound `policy ?? advertised` not min; 1271 RPC-outage throws; ProviderOptions.terms.nonce ignored.
- Branch feat/aegisclear-mvp final head: a0474d9. Workspace to be deleted after rulings are collected.
