# Toolchain (diverifikasi 2026-09-19)
- forge/cast/anvil: forge Version: 1.5.1-stable
- node: v22.23.1, pnpm: 9.15.0
- circom: circom compiler 2.2.3
- python3: Python 3.12.3
- cargo: cargo 1.92.0 (344c4567c 2025-10-21), cargo-stylus: stylus 0.10.9
- rustup targets: wasm32-unknown-unknown wasm32v1-none x86_64-unknown-linux-gnu 

## sla_settlement.circom (Task 4, 2026-09-19)
- `SlaSettlement(128, 7)` (MAX_SEQ=128, DEPTH=7 — unchanged, D4 not applied), compiled with `circom --O2` (full constraint simplification; see `circuits/scripts/build.sh`).
- `snarkjs r1cs info`: # of Wires: 112200, **# of Constraints: 113224** (< 131072 gate), # of Private Inputs: 518, # of Public Inputs: 6, # of Labels: 317893, # of Outputs: 0.
- Note: circom's CLI default (`--O1`, no flag) yields 217908 constraints (114508 non-linear + 103400 un-simplified linear) on this same circuit — above the gate. `--O2` is a lossless, semantics-preserving substitution of the linear rows (0 remain), not a circuit redesign. See `task-4-report.md` for why D4 (N=64/DEPTH=6) was evaluated and rejected instead (breaks the 100/100/128-receipt vectors).
- `pnpm --filter @aegisclear/circuits build` wall time: ~9.8s.
