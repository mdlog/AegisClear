# Slither self-audit — AegisClear contracts (2026-09-20)

Static-analysis triage of `contracts/src` with [Slither](https://github.com/crytic/slither), plus the manual review that
was needed to give every finding a verdict. This is a **self-audit by the team**, not an independent audit: it finds what
a static analyzer finds and documents the reasoning behind each verdict so a reader can check it. Judges: every row below
has a verdict — there is no "TBD".

## 1. Run metadata

| | |
|---|---|
| Slither | 0.11.5 (101 detectors, all enabled, incl. informational/optimization) |
| Compiler | solc 0.8.28, evm `cancun`, optimizer 200 runs (Foundry profile `contracts/foundry.toml`) |
| Foundry | forge 1.5.1-stable |
| Dependencies | OpenZeppelin v5.7.0, Permit2 (interfaces only), poseidon-solidity (`PoseidonT3`) |
| Scope | `contracts/src/**` (7 contracts + 3 interfaces, 574 SLOC); `lib/`, `test/`, `script/` filtered; findings inside dependencies excluded |
| Before-run commit | `4144d3d` on `feat/aegisclear-p1-ship` (contracts identical up to `127f92f`) |
| After-run tree | `5fe05c0` (fixes below applied) |
| Raw output | [`slither-raw-2026-09.md`](./slither-raw-2026-09.md) (before + after, verbatim except naming-convention compacted) |

Command lines (run from `contracts/`; Slither compiles through Foundry, no `--solc-remaps` needed):

```sh
slither . --filter-paths "lib/|test/|script/" --exclude-dependencies --checklist
slither . --filter-paths "lib/|test/|script/" --exclude-dependencies --print human-summary
# sanity run without the lib/ filter: adds only OpenZeppelin-internal results (Math.mulDiv, SignatureChecker); none in src/
slither . --filter-paths "test/|script/" --checklist
```

### Trust boundary (what the verdicts assume)

- **In scope:** `AegisChannel` (EIP-1167 clone implementation), `AegisChannelFactory`, `AegisTreasuryRouter`, `PoseidonPathYul`.
- **Frozen, findings noted only:** `SLASettlementVerifier.sol` — a byte-for-byte snarkjs export tied to the trusted-setup
  zkey (`circuits/scripts/setup.sh`); editing it would break reproducibility of the verifier against the released zkey.
- **Out of the trust boundary:** `SimpleJobEscrow` (demo "Market A" control contract), `MockUSDG` (testnet token with
  permissionless `mint`, never used with real funds).
- **Accepted designs** (PRD `prd-arsitektur.md` §12, design spec §B): `block.timestamp` deadlines (Arbitrum sequencer
  timestamps, windows ≥ 60 s testnet / hours in production), permissionless `settle`/`sweep`, best-effort payout hook,
  permissionless `onPayout` guarded by the `Unbacked` balance check, per-factory mode immutables (`ANCHORED`).

## 2. Summary

| Severity | Before (4144d3d) | After (5fe05c0) | True positive → fixed | Accepted risk / by design | False positive |
|---|---|---|---|---|---|
| High | 3 | 3 | 0 | 0 | 3 (snarkjs `return` idiom) |
| Medium | 2 | 2 | 0 | 0 | 2 |
| Low | 6 | 4 | **2** (missing-zero-check ×2) | 3 (timestamp ×2, poseidonPath zero = mode) | 1 (reentrancy-events) |
| Informational | 66 | 66 | 0 | 66 (frozen verifier, immutables naming, intentional low-level call) | 0 |
| **Total** | **77** | **75** | **2** | **69** | **6** |
| Manual (not a Slither detector) | — | — | **1** (M-1, Low: hook stipend not guaranteed) | 0 | — |

Net: **zero true-positive High/Medium**. Two Low hardenings fixed; one manual Low (M-1) found while verifying the
reentrancy verdicts on `_send`, fixed with a regression test that demonstrably fails on the previous code.
`forge test`: 111 → **118 passed** (7 new regression tests), 0 failed.

## 3. Findings — verdict table

IDs are Slither's checklist IDs from the *before* run (same numbering in the raw file). Locations are `file:line` at
`4144d3d`; after-fix line numbers differ slightly (see raw file header).

### 3.1 High / Medium

| ID | Detector · severity/conf. | Location | Verdict | Note |
|---|---|---|---|---|
| ID-0, ID-1, ID-2 | `incorrect-return` · High/Medium | `SLASettlementVerifier.sol:74-202` (`checkField`, `g1_mulAccC`, `checkPairing` contain `return(0, 0x20)`) | **False positive** (frozen file) | Standard snarkjs Groth16 template. The Yul `return(0,0x20)` inside the helper functions is the *intended* early exit: it ends `verifyProof` with `false` (memory word 0 = 0) when a public input is ≥ r or a precompile call fails. Slither flags any `return` inside a Yul function as "halts execution"; here halting is the point. Behaviour is covered by `test/Verifier.t.sol` (`test_tampered_public_input_fails`, `test_tampered_proof_fails`, `test_ex1_valid_and_gas`) and by the FFI proof tests in `Penalty.t.sol`/`Anchored.t.sol`. Not modified: the file must stay identical to the snarkjs export for the released zkey. |
| ID-3 | `incorrect-equality` · Medium/High | `AegisChannel.sol:312` (`if (amount == 0) return;` in `_send`) | **False positive** | The detector targets strict equality on manipulable balances. `amount` is a computed payout leg (`min(owed, budget)` / remainder / `toProvider`); `== 0` only skips a zero-value transfer and a pointless hook call. No decision depends on an attacker-controllable exact value. |
| ID-4 | `reentrancy-no-eth` · Medium/Medium | `AegisTreasuryRouter.sol:48-59` (`onPayout`: `credit`/`totalCredit` written after `token.call`) | **False positive** (guarded; regression test added) | `onPayout` and `claim` — the only two writers/readers of `credit`/`totalCredit` — are both `nonReentrant` (shared OZ guard), so the cross-function path Slither describes (`token.transfer` → re-enter `claim` while `credit` is temporarily inflated) reverts with `ReentrancyGuardReentrantCall`. Slither still reports guarded functions when the written variable is `public` (an external observer could read the inflated intermediate value during the call) — with USDG (no transfer hooks) there is no observer. The "credit first, undo on success" ordering is deliberate: `Σcredit ≤ balance` holds at every point, including during the call. Regression test: `TreasuryRouter.t.sol::test_onPayout_cross_function_reentrancy_into_claim_is_blocked` (malicious token re-enters `claim` from `transfer`; claim reverts, payee paid exactly once, credit back to 0). |

### 3.2 Low

| ID | Detector · severity/conf. | Location | Verdict | Note |
|---|---|---|---|---|
| ID-5 | `missing-zero-check` · Low/Medium | `AegisChannelFactory.sol:19` (`verifier`) | **True positive → fixed in commit `5fe05c0`** | The verifier address is baked into the immutable implementation shared by every clone of the factory; `verifier == 0` would make every `claimPenalty` revert forever (high-level call to a codeless address) — a silent, permanent misdeploy. Added `if (verifier == address(0) \|\| permit2 == address(0)) revert ZeroAddress();` in the factory constructor. Test: `Factory.t.sol::test_constructor_zero_verifier_or_permit2_reverts`. All deploy scripts and tests already pass non-zero values. |
| ID-7 | `missing-zero-check` · Low/Medium | `AegisChannelFactory.sol:19` (`permit2`) | **True positive → fixed in commit `5fe05c0`** | Same fix as ID-5; `permit2 == 0` would make `fundWithPermit2` permanently unusable (plain transfers would still work, so this is a usability hardening rather than a fund-safety issue). |
| ID-6 | `missing-zero-check` · Low/Medium | `AegisChannelFactory.sol:19` (`poseidonPath`) | **Accepted — by design** | `poseidonPath == address(0)` *is* the co-signed mode selector (`ANCHORED = poseidonPath != address(0)`, spec §B.3: mode per factory, not per channel). Adding a zero-check would remove the co-signed mode. Still reported after the fix (1 remaining Low). Covered by `Anchored.t.sol::test_factory_modes` and `Factory.t.sol::test_constructor_zero_verifier_or_permit2_reverts` (asserts `POSEIDON()==0` ⇒ `ANCHORED()==false`). |
| ID-8 | `reentrancy-events` · Low/Medium | `AegisChannelFactory.sol:31-39` (`open`: `ChannelOpened` emitted after `initialize` call) | **False positive** | The "external call" is `initialize` on a clone of our own implementation created in the same transaction. The only untrusted code it can reach is an ERC-1271 wallet via OZ `SignatureChecker.isValidSignatureNow`, which uses **`staticcall`** (OZ v5.7 `SignatureChecker.sol:89`) — the wallet cannot change state or re-enter `open`. Event order (`Opened` from the channel, then `ChannelOpened` from the factory) is deterministic. |
| ID-9 | `timestamp` · Low/Medium | `AegisChannel.sol:180` (`ext > deadline` in `submitCheckpoint`) | **Accepted risk — documented design** | Challenge-window extension (`≤ responseWindow`, FR-12/13) uses `block.timestamp`. On Arbitrum the sequencer assigns timestamps (monotonic, bounded drift vs L1); the protocol tolerates seconds of skew because windows are ≥ 60 s (demo) and hours in production (`factoryProd`: 6 h). Sequencer censorship is T7 in the threat model (windows ≥ force-inclusion delay in production). |
| ID-10 | `timestamp` · Low/Medium | `AegisChannel.sol:235` (`block.timestamp < deadline` in `settle`) | **Accepted risk — documented design** | Same as ID-9: a deadline comparison is the mechanism, not a bug. Deterministic outcome; `settle` is permissionless so no party gains from timing it (T13). |

### 3.3 Informational

| ID | Detector | Location | Verdict | Note |
|---|---|---|---|---|
| ID-11…ID-14 | `assembly` | `SLASettlementVerifier.sol:75-201` | **Accepted** (frozen) | snarkjs verifier is entirely Yul (precompiles 6/7/8). Not modified. |
| ID-15 | `solc-version` (`>=0.7.0 <0.9.0` "too complex") | `SLASettlementVerifier.sol:21` | **Accepted** (frozen) | snarkjs template pragma; the project pins solc 0.8.28 in `foundry.toml`, so the floating range never selects another compiler. Our own files use `^0.8.24`. |
| ID-16 | `low-level-calls` | `AegisTreasuryRouter.sol:74-80` (`_tryTransfer`) | **Accepted — intentional** | The whole point of `_tryTransfer` is a *non-reverting* ERC-20 transfer: a frozen destination (Paxos USDG freeze, threat T8) must turn into a `credit` entry instead of failing `onPayout` and stranding tokens. Return data handled explicitly (empty = ok, 32 bytes = decoded bool, anything else = failure; `test_transfer_returns_garbage_credit_stays_no_revert`). A codeless `token` cannot reach it: `onPayout` first does a high-level `balanceOf`, which reverts for addresses without code. |
| ID-17 | `missing-inheritance` (`SLASettlementVerifier` should inherit `ISLASettlementVerifier`) | `SLASettlementVerifier.sol:23` | **Accepted** (frozen) — recommendation | Correct suggestion, but the verifier is kept byte-identical to the snarkjs export. The ABI match is enforced by the compiler where it matters: `AegisChannel` calls it through `ISLASettlementVerifier`, and `test/Verifier.t.sol` + the FFI proof tests exercise the real contract through that interface. Recommendation for a future re-export: wrap or regenerate with the interface. |
| ID-18, 19, 25, 26, 36, 45, 50, 53, 55, 64 | `naming-convention` (immutables in UPPER_CASE: `FACTORY`, `VERIFIER`, `PERMIT2`, `POSEIDON`, `ANCHORED`, `IMPLEMENTATION`, `MIN_CHALLENGE_WINDOW`) | `AegisChannel.sol:44-48`, `AegisChannelFactory.sol:9-13` | **Accepted — cannot change** | Project style (immutables in SCREAMING_SNAKE, as in OZ/Uniswap) and, decisively, these are public getters the SDK/web console read by name (`sdk/src/chain/abi.ts`: `IMPLEMENTATION()`, `MIN_CHALLENGE_WINDOW()`, `POSEIDON()`, `ANCHORED()`). Renaming = ABI break. |
| ID-62 | `naming-convention` (`SimpleJobEscrow.TOKEN`) | `SimpleJobEscrow.sol:13` | **Accepted** | Same convention; demo control contract outside the trust boundary. |
| ID-20…24, 27…35, 37…44, 46…49, 51, 52, 54, 56…61, 63, 65…76 | `naming-convention` (snarkjs constants/parameters, 48 results) | `SLASettlementVerifier.sol` | **Accepted** (frozen) | Generated code. |

### 3.4 What Slither did *not* analyze, and the manual check that replaced it

The brief expected reentrancy findings on `AegisChannel._send` (token transfer + hook). Slither reported none, and it is
important to say why rather than to count that as a clean bill of health:

- `reentrancy-events` **skips every function whose entry points all carry `nonReentrant`** (`Function.is_reentrant`
  in Slither 0.11.5; `reentrancy_events.py:78`). `settle`, `closeCooperative`, `rollover`, `sweep`, `fundWithPermit2`
  are all guarded, so `_payout`/`_send` were never examined by that detector.
- `reentrancy-no-eth` / `reentrancy-eth` only report a guarded function when the variable written after the call is
  `public` or used by an unguarded function; `_payout` and `rollover` write **nothing** after `_send` (only events), so
  there was nothing to report either way.

Manual verification of the `_send` path (the reasoning the brief asked to document):

1. **CEI holds.** `_payout` sets `state = SETTLED` before the first `_send`; `rollover` resets `seq/A/R/deadline/proof`,
   increments `epoch` and sets `state = OPEN` before `_send`; `sweep` requires `SETTLED` and changes no state. The only
   post-call reads are `budget()` for the `RolledOver` event (informational).
2. **Re-entering the channel from the hook:** guarded entry points revert (`ReentrancyGuardReentrantCall`). The unguarded
   ones — `submitCheckpoint` (needs both parties' fresh-epoch signatures), `ack` (`msg.sender == client`), `startClose`
   (party only), `claimPenalty` (party only; reverts in `SETTLED`, and after `rollover` could only prove the reset state) — either require the counter-party's signature
   or are things the calling party may legitimately do at any time; none can move funds. `ack`/`claimPenalty`/`initialize`
   call `view` functions (`insertPath`, `verifyProof`, ERC-1271 `isValidSignature`) which compile to `STATICCALL`, so
   they cannot re-enter anything (that is also why Slither did not flag `ack` writing `filledSubtrees` after `insertPath`).
3. **Hook failure cannot hold funds hostage (T-hook):** the hook runs inside `try/catch` with a fixed stipend; a reverting
   or gas-burning payee is tested (`test_reverting_payee_does_not_block_settle_or_close`,
   `test_gas_burning_payee_is_capped_and_settle_succeeds`).
4. **But the stipend was only an upper bound** — see M-1 below. This was found precisely while writing down point 3.

### 3.5 Manual finding M-1 — hook stipend not guaranteed (Low) → fixed in commit `5fe05c0`

| | |
|---|---|
| Location | `AegisChannel.sol` `_send` (`try IAegisPayoutHook(to).onPayout{gas: HOOK_GAS}(…) {} catch {}`) |
| Severity | **Low** (not exploitable against the shipped router with USDG; exploitable against any payee hook costing ≈230-300k gas) |
| Class | Insufficient-gas griefing of a sub-call (the pattern OZ `ERC2771Forwarder._checkForwardedGas` and Gnosis Safe `execTransaction` guard against) |

Catatan presisi: pemeriksaan `gasleft() ≥ HOOK_GAS/63` membuktikan hook ditawari ≥ 63·⌊300000/63⌋ = 299.943 gas (selisih ≤ 57 gas adalah pembulatan bawaan pola OZ). Pengamatan tambahan yang memperkuat alasan perbaikan: sebelum perbaikan, `eth_estimateGas` untuk `sweep`/`settle` sendiri akan mengembalikan gas limit terendah yang lolos (≈ pre-hook + 230k) sehingga hook berbiaya 227k–300k akan kekurangan gas juga tanpa penyerang — ini bahaya keandalan, bukan hanya griefing.

**Issue.** `{gas: HOOK_GAS}` caps the hook at 300k but does not *guarantee* it: by EIP-150 the callee receives
`min(300k, 63/64 · gasleft)`. `settle()` and `sweep()` are permissionless, so a third party chooses the gas limit. If the
hook runs out of gas while the outer call still completes, the tokens have already been transferred to the payee
contract but the hook that attributes them never ran. For `AegisTreasuryRouter` this is the worst case: the amount sits
in the router as unattributed "slack", and `onPayout` is permissionless, so **anyone** can then call
`onPayout(attacker, token, amount)` and take it (the `Unbacked` check passes because the tokens really are there).
This is the interaction of two individually accepted designs (best-effort hook × permissionless `onPayout`).

**Measured, not guessed.** After the hook, `sweep` still needs a `LOG1` (~1.0k) and the ReentrancyGuard exit `SSTORE`,
which trips the EIP-2200 sentry below 2300 gas — so the caller keeps ~3.6k of the 1/64 remainder and the window only
opens for hooks costing more than ≈ 63 × 3.6k ≈ 227k. Foundry PoC with a compute-heavy token (cost independent of
warm/cold storage; the PoC is folded into `test/HookGas.t.sol`): router hook of 164k → no window; 234k → `sweep{gas: 434_200}` completes with 250,000 tokens stranded
in the router, then `router.onPayout(attacker, …)` pays the attacker; 258k → window at 458,400; 282k → 483,200. `settle`
and `rollover` have more post-hook work (3 events / `budget()` + 2 events, remainder ≈ 8-9k ⇒ threshold > 300k), so
they were **not** starvable within the stipend. The shipped router costs ~55k with `MockUSDG` (warm) and is estimated
at ~115-120k for a Paxos-style USDG proxy (`HOOK_GAS` comment, I2), i.e. below the threshold — hence Low. But the
guarantee rested on the accidental size of the post-hook code, not on a check.

**Fix** (`AegisChannel._send`, one line + docs): after the `try/catch`,
`if (gasleft() < HOOK_GAS / 63) revert InsufficientGas();`. If the callee ran out of gas it received exactly
`63/64 · X`, so `gasleft() = X/64`; `X/64 < HOOK_GAS/63 ⇒ X < 64/63 · HOOK_GAS`, i.e. the hook was *not* offered the
full stipend and the caller must retry with more gas. A hook that fails on its own (reverts early, or burns the full
300k) leaves ≥ `HOOK_GAS/63` and is still ignored — T-hook is unchanged. EOA payees are untouched (no hook, no check).
Cost: one `GAS` + compare (~30 gas) on contract payees only; the minimum *gas limit* for calls with contract payees
rises to ≈305k at the hook (gas *used* does not change; the SDK/web use viem gas estimation, nothing is hardcoded, and
success is monotonic in the limit so `eth_estimateGas` converges).

**Regression tests** (`test/HookGas.t.sol`, mocks `HeavyToken`, `NeedyPayout`, `GasProbePayout`; 3 of the 5 fail on
the previous code, verified by re-running them against `git show 4144d3d:contracts/src/AegisChannel.sol`):
- `test_sweep_caller_cannot_starve_router_hook` — router payee, 258k hook; for every gas limit in 380k…640k: sweep
  reverts, or it succeeds **and** the router has forwarded (balance 0). Failed before the fix ("funds stranded in
  router: 250000 != 0").
- `test_hook_needing_full_stipend_is_never_starved` — a legitimate hook that needs 288k of the 300k; success ⇒ served.
  Failed before the fix.
- `test_starved_hook_reverts_InsufficientGas` — 200k gas limit ⇒ revert with `InsufficientGas()` and nothing moves;
  full gas ⇒ success even though the payee burns its whole stipend. Failed before the fix (at 200k the outer call itself ran out of gas at the post-hook SSTORE sentry → empty revert data, so the `ret.length` assertion fails — not a silent success).
- `test_settle_caller_cannot_starve_router_hook` — `_payout` path guard (passed before too, as predicted).
- `test_eoa_payee_has_no_stipend_requirement` — EOA payee sweeps fine at 120k.

### 3.6 Notes outside Slither's detectors (no action)

- **`PoseidonPathYul` links an external library.** `PoseidonT3.hash` is `public`, so `PoseidonPathYul` bytecode contains
  a `DELEGATECALL` to the `PoseidonT3` library address linked at deploy time (`forge script` deploys and links it
  automatically; the library is stateless and `pure`). Not a vulnerability; a verification/reproducibility note: the
  library address must be supplied when verifying `PoseidonPathYul` on an explorer. On the testnet the anchored factory
  uses the Stylus `AegisPoseidon` program instead; `PoseidonPathYul` is the Foundry/Anvil/Plan-B implementation.
- **`ReentrancyGuard` in clones.** The guard's constructor never runs for EIP-1167 clones, so `_status` starts at 0
  rather than `NOT_ENTERED` (1). OZ v5 only compares against `ENTERED` (2), so the guard works; the first guarded call
  per channel pays a 0→2 `SSTORE` (~22k) instead of 1→2 — a one-time gas note, not a bug.
- **Router slack is claimable by anyone** (documented in `AegisTreasuryRouter.onPayout` NatSpec, I2). With M-1 fixed,
  the remaining ways to create slack are a direct ERC-20 transfer to the router (user error, warned against) or a
  non-standard token; USDG through channels is the only intended path.
- **`MockUSDG.mint` is permissionless** — testnet/Anvil token only (`DeployTestnet` uses it on chain 46630 for the demo).
- **`tx.origin`**: not used anywhere (the brief listed it as a possible warning; none was raised).

## 4. After-fix run

Same command lines, tree `5fe05c0` with the fixes applied:

```text
Number of optimization issues: 0
Number of informational issues: 66
Number of low issues: 4        (was 6: missing-zero-check verifier/permit2 resolved; poseidonPath remains by design)
Number of medium issues: 2     (both false positive, see ID-3, ID-4)
Number of high issues: 3       (all three the snarkjs return idiom, see ID-0..2)
. analyzed (37 contracts with 101 detectors), 75 result(s) found   (was 77)
```

`forge test`: **118 passed, 0 failed** (111 existing + 7 new: 5 `HookGas.t.sol`, 1 `Factory.t.sol`, 1 `TreasuryRouter.t.sol`).

## 5. Changes made in the audit commit `5fe05c0`

| File | Change |
|---|---|
| `contracts/src/AegisChannel.sol` | `error InsufficientGas()`; post-hook stipend check in `_send` + NatSpec explaining the EIP-150 reasoning (M-1). Function signatures, events, typehashes, `Config`, proof inputs: unchanged. |
| `contracts/src/AegisChannelFactory.sol` | `error ZeroAddress()`; constructor rejects `verifier == 0` or `permit2 == 0` (ID-5/ID-7). `poseidonPath == 0` still means co-signed mode. |
| `contracts/test/HookGas.t.sol` (+ `mocks/HeavyToken.sol`, `mocks/NeedyPayout.sol`, `mocks/GasProbePayout.sol`) | M-1 regression tests. |
| `contracts/test/Factory.t.sol` | `test_constructor_zero_verifier_or_permit2_reverts`. |
| `contracts/test/TreasuryRouter.t.sol` (+ `mocks/ReenteringToken.sol`) | `test_onPayout_cross_function_reentrancy_into_claim_is_blocked` (ID-4 verdict evidence). |
| `docs/audit/slither-raw-2026-09.md` | Raw before/after output. |

Not changed on purpose: `SLASettlementVerifier.sol` (frozen), any ABI surface used by the SDK, the `HOOK_GAS` value.

## 6. Limitations

- Slither is a static analyzer: it does not reason about signatures, the Groth16 circuit, the Poseidon tree, or economic
  invariants. Those are covered by the Foundry suite (`Invariant.t.sol`, FFI proof tests) and are outside this document.
- Aderyn/Mythril/formal tools were not run (not installed on the build machine).
- This is a team self-audit performed before a hackathon deadline; it is not a substitute for an independent review
  before real funds are used (PRD §12 T4: the trusted setup is declared open in the MVP; a ≥3-contributor ceremony is
  required before real funds).
