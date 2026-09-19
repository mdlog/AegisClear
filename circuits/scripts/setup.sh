#!/usr/bin/env bash
# Trusted setup Groth16 untuk sla_settlement. Satu kontributor (hackathon) — lihat spec T4/§9.4.
set -euo pipefail
cd "$(dirname "$0")/.."
POWER=17
mkdir -p ptau build
BEACON=0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
entropy() { head -c 64 /dev/urandom | xxd -p | tr -d '\n'; }

if [ ! -f ptau/pot${POWER}_final.ptau ]; then
  if [ -n "${PTAU_URL:-}" ]; then
    echo ">> mengunduh ptau dari $PTAU_URL"
    curl -fL -o ptau/pot${POWER}_final.ptau "$PTAU_URL"
    npx snarkjs powersoftau verify ptau/pot${POWER}_final.ptau
  else
    echo ">> mirror publik tidak tersedia; membangkitkan Powers of Tau 2^${POWER} lokal (±5-10 menit)"
    npx snarkjs powersoftau new bn128 ${POWER} ptau/pot${POWER}_0000.ptau -v
    npx snarkjs powersoftau contribute ptau/pot${POWER}_0000.ptau ptau/pot${POWER}_0001.ptau --name="aegisclear-ptau-1" -v -e="$(entropy)"
    npx snarkjs powersoftau beacon ptau/pot${POWER}_0001.ptau ptau/pot${POWER}_beacon.ptau $BEACON 10 -n="ptau beacon"
    npx snarkjs powersoftau prepare phase2 ptau/pot${POWER}_beacon.ptau ptau/pot${POWER}_final.ptau -v
    npx snarkjs powersoftau verify ptau/pot${POWER}_final.ptau
  fi
fi

[ -f build/sla_settlement.r1cs ] || bash scripts/build.sh
npx snarkjs groth16 setup build/sla_settlement.r1cs ptau/pot${POWER}_final.ptau build/sla_0000.zkey
npx snarkjs zkey contribute build/sla_0000.zkey build/sla_0001.zkey --name="aegisclear-phase2-1" -v -e="$(entropy)"
npx snarkjs zkey beacon build/sla_0001.zkey build/sla_final.zkey $BEACON 10 -n="phase2 beacon"
npx snarkjs zkey verify build/sla_settlement.r1cs ptau/pot${POWER}_final.ptau build/sla_final.zkey
npx snarkjs zkey export verificationkey build/sla_final.zkey build/verification_key.json

mkdir -p ../contracts/src/interfaces
npx snarkjs zkey export solidityverifier build/sla_final.zkey ../contracts/src/SLASettlementVerifier.sol
sed -i 's/contract Groth16Verifier/contract SLASettlementVerifier/' ../contracts/src/SLASettlementVerifier.sol
cat > ../contracts/src/interfaces/ISLASettlementVerifier.sol <<'SOL'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Verifier Groth16 hasil ekspor snarkjs (circuits/scripts/setup.sh).
/// inputs = [channelIdField, termsCommitment, receiptsRoot, seq, cumulativeAmount, payToClient]
interface ISLASettlementVerifier {
    function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[6] calldata inputs)
        external view returns (bool);
}
SOL
echo ">> setup selesai: build/sla_final.zkey, build/verification_key.json, contracts/src/SLASettlementVerifier.sol"
