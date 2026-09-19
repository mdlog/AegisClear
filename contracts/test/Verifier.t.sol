// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SLASettlementVerifier} from "../src/SLASettlementVerifier.sol";

contract VerifierTest is Test {
    SLASettlementVerifier v;

    function setUp() public { v = new SLASettlementVerifier(); }

    function _fixture() internal view returns (uint256[8] memory p, uint256[6] memory inp) {
        string memory j = vm.readFile("test/fixtures/ex1_verifier.json");
        uint256[] memory pr = vm.parseJsonUintArray(j, ".proof");
        uint256[] memory ins = vm.parseJsonUintArray(j, ".inputs");
        for (uint256 i; i < 8; i++) p[i] = pr[i];
        for (uint256 i; i < 6; i++) inp[i] = ins[i];
    }

    function _verify(uint256[8] memory p, uint256[6] memory inp) internal view returns (bool ok, uint256 gasUsed) {
        uint256 g0 = gasleft();
        ok = v.verifyProof([p[0], p[1]], [[p[2], p[3]], [p[4], p[5]]], [p[6], p[7]], inp);
        gasUsed = g0 - gasleft();
    }

    function test_ex1_valid_and_gas() public {
        (uint256[8] memory p, uint256[6] memory inp) = _fixture();
        assertEq(inp[5], 70_000, "payToClient EX1");
        (bool ok, uint256 gasUsed) = _verify(p, inp);
        assertTrue(ok, "proof must verify");
        emit log_named_uint("verifyProof gas (6 public inputs)", gasUsed);
        assertLt(gasUsed, 300_000);
    }

    function test_tampered_public_input_fails() public {
        (uint256[8] memory p, uint256[6] memory inp) = _fixture();
        inp[5] += 1;
        (bool ok,) = _verify(p, inp);
        assertFalse(ok);
    }

    function test_tampered_proof_fails() public {
        (uint256[8] memory p, uint256[6] memory inp) = _fixture();
        p[0] ^= 1;
        (bool ok,) = _verify(p, inp);
        assertFalse(ok);
    }
}
