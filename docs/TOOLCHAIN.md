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
- **`snarkjs r1cs info` (current, post-fix, supersedes the pre-fix numbers above)**: # of Wires: 113910, **# of Constraints: 115066** (< 131072 gate), # of Private Inputs: 518, # of Public Inputs: 6, # of Labels: 319867, # of Outputs: 0. (+1842 constraints vs. the pre-fix 113224, from the 4 new `Num2Bits` range checks × 128 `DivBps` instances + globals.)
