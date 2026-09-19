// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Verifier Groth16 hasil ekspor snarkjs (circuits/scripts/setup.sh).
/// inputs = [channelIdField, termsCommitment, receiptsRoot, seq, cumulativeAmount, payToClient]
interface ISLASettlementVerifier {
    function verifyProof(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[6] calldata inputs)
        external view returns (bool);
}
