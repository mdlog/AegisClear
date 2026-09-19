#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build
# --O2 (full constraint simplification): circom's --O1 default leaves ~103k pure-linear
# constraints un-substituted (217908 total, >= 131072 gate). --O2 is a lossless, standard
# circom optimization (Gaussian-eliminates linear rows) that changes neither circuit
# semantics nor the wasm witness values; see docs/TOOLCHAIN.md for the measured counts.
circom sla_settlement.circom --r1cs --wasm --sym -o build -l node_modules --O2
npx snarkjs r1cs info build/sla_settlement.r1cs
