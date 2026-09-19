# Toolchain (diverifikasi 2026-09-19)
- forge/cast/anvil: forge Version: 1.5.1-stable
- node: v22.23.1, pnpm: 9.15.0
- circom: circom compiler 2.2.3
- python3: Python 3.12.3
- cargo: cargo 1.92.0 (344c4567c 2025-10-21), cargo-stylus: stylus 0.10.9
- rustup targets: wasm32-unknown-unknown wasm32v1-none x86_64-unknown-linux-gnu 

## sla_settlement.circom (Task 4, 2026-09-19)
- `SlaSettlement(128, 7)` (MAX_SEQ=128, DEPTH=7 — unchanged, D4 not applied), compiled with `circom --O2` (full constraint simplification; see `circuits/scripts/build.sh`).
- Note: circom's CLI default (`--O1`, no flag) yields ~218k constraints (above the gate) on this same circuit. `--O2` is a lossless, semantics-preserving substitution of the linear rows, not a circuit redesign. See `task-4-report.md` for why D4 (N=64/DEPTH=6) was evaluated and rejected instead (breaks the 100/100/128-receipt vectors).
- `pnpm --filter @aegisclear/circuits build` wall time: ~9.7–9.8s.

### Fix round 1 (2026-09-19) — superseded the numbers above
Review found `DivBps`'s remainder `r` was range-checked only via `LessThan(14)` (unsound for out-of-range `in[0]`, per circomlib's own precondition), and `seq`/`penaltyBps`/`capBps` were only bounded by `LessEqThan`, which is likewise unsound without a prior bit-decomposition. Fixed by adding `Num2Bits(14)` on `r` (in `DivBps`, before its `LessThan(14)`), `Num2Bits(8)` on `seq`, and `Num2Bits(14)` on `penaltyBps`/`capBps` (both before their existing `LessEqThan(14)` checks). See `task-4-report.md` § "Fix round 1" for the full finding text and regression-test evidence.
- **`snarkjs r1cs info` (post-fix-round-1)**: # of Wires: 113910, # of Constraints: 115066 (< 131072 gate), # of Private Inputs: 518, # of Public Inputs: 6, # of Labels: 319867, # of Outputs: 0. (+1842 constraints vs. the pre-fix 113224, from the 4 new `Num2Bits` range checks × 128 `DivBps` instances + globals.)

### Fix round 2 (2026-09-19) — DivBps split into a shared constraint template; regression test rewritten
Fix round 1's regression test (tampering `main.div[0].q`/`.r` directly in a full `sla_settlement` witness after `calculateWitness`) was found NON-DISCRIMINATING: it also failed with `rb` removed, because the tampered `q`/`r` left the *other* pre-existing bit-decomposition sub-signals (`qb.out[]`, `rlt`'s internal `n2b.out[]`) stale/inconsistent with the new values, so `checkConstraints` rejected for an unrelated reason regardless of whether `rb` was present. Fixed by extracting `DivBps`'s constraint set into `template DivBpsConstraints()` (`circuits/lib/divbps.circom`, taking `x,q,r` as circuit **inputs**, not witness-derived signals) — `sla_settlement.circom` now `include`s it and its own `DivBps` wraps it; a standalone probe circuit (`circuits/test/circuits/divbps_probe.circom`, `component main = DivBpsConstraints();`) lets the test drive `(x,q,r)` directly through `calculateWitness`, so every dependent bit signal is freshly and consistently computed for the attacker-chosen values — no stale bits, no cross-contamination with unrelated constraints. See `task-4-report.md` § "Fix round 2" for the full discrimination proof (test run with `rb` temporarily removed → FAILS; restored → PASSES).
- **`snarkjs r1cs info` (current, post-fix-round-2, same circuit semantics as fix round 1, just restructured)**: # of Wires: 113910, **# of Constraints: 115066** (< 131072 gate, unchanged from fix round 1 — the refactor is constraint-count-neutral), # of Private Inputs: 518, # of Public Inputs: 6, # of Labels: 320254, # of Outputs: 0.
