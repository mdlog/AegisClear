// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISLASettlementVerifier} from "../../src/interfaces/ISLASettlementVerifier.sol";

contract MockVerifier is ISLASettlementVerifier {
    bool public result;
    constructor(bool r) { result = r; }
    function set(bool r) external { result = r; }
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[6] calldata)
        external view returns (bool) { return result; }
}
