// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, AegisChannelFactory, Sigs} from "./Base.t.sol";
import {SLASettlementVerifier} from "../src/SLASettlementVerifier.sol";

/// @dev Memakai bukti asli: `npx tsx ../circuits/scripts/prove.ts` lewat vm.ffi (cwd = contracts/). Butuh setup.sh sudah dijalankan.
contract PenaltyTest is AegisTestBase {
    SLASettlementVerifier realVerifier;
    AegisChannelFactory realFactory;
    AegisChannel ch;
    uint256[8] proof;
    uint256[6] inputs;

    function _cmd(bool termsOnly, address channel) internal pure returns (string[] memory cmd) {
        cmd = new string[](termsOnly ? 6 : 7);
        cmd[0] = "npx"; cmd[1] = "tsx"; cmd[2] = "../circuits/scripts/prove.ts";
        cmd[3] = "--vector"; cmd[4] = "EX1_7_latency_breaches";
        if (termsOnly) { cmd[5] = "--terms-only"; }
        else { cmd[5] = "--channel"; cmd[6] = vm.toString(channel); }
    }

    function setUp() public override {
        super.setUp();
        realVerifier = new SLASettlementVerifier();
        realFactory = new AegisChannelFactory(address(realVerifier), PERMIT2, 60);
        uint256 T = abi.decode(vm.ffi(_cmd(true, address(0))), (uint256));
        AegisChannel.Config memory c = defaultConfig();
        c.termsCommitment = bytes32(T);
        address predicted = realFactory.predict(c);
        bytes32 d = Sigs.digest(Sigs.domain(predicted), AegisChannel(realFactory.IMPLEMENTATION()).hashChannelTerms(c));
        vm.prank(client);
        ch = AegisChannel(realFactory.open(c, "", Sigs.sign(providerPk, d)));
        fund(ch, 5_000_000);
        (proof, inputs) = abi.decode(vm.ffi(_cmd(false, address(ch))), (uint256[8], uint256[6]));
        assertEq(inputs[0], ch.channelIdField());
        assertEq(inputs[1], T);
        assertEq(inputs[3], 100); assertEq(inputs[4], 2_000_000); assertEq(inputs[5], 70_000);
    }

    function _checkpointEx1(bytes32 root) internal {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 100, 2_000_000, root);
        ch.submitCheckpoint(100, 2_000_000, root, sc, sp);
    }

    function test_claim_ex1_then_settle_pays_proportionally() public {
        _checkpointEx1(bytes32(inputs[2]));
        vm.prank(client);
        ch.claimPenalty(proof, 70_000);
        assertTrue(ch.hasProof()); assertEq(ch.payToClient(), 70_000); assertEq(ch.proofSeq(), 100);
        vm.warp(block.timestamp + 120);
        uint256 c0 = usdg.balanceOf(client); uint256 p0 = usdg.balanceOf(provider);
        ch.settle();
        assertEq(usdg.balanceOf(provider) - p0, 1_930_000);
        assertEq(usdg.balanceOf(client) - c0, 3_070_000); // 70.000 penalti + 3.000.000 sisa budget
    }

    function test_provider_may_also_submit_same_proof() public {
        _checkpointEx1(bytes32(inputs[2]));
        vm.prank(provider);
        ch.claimPenalty(proof, 70_000);
        assertEq(ch.payToClient(), 70_000);
    }

    function test_wrong_amount_is_invalid_proof() public {
        _checkpointEx1(bytes32(inputs[2]));
        vm.prank(client);
        vm.expectRevert(AegisChannel.InvalidProof.selector);
        ch.claimPenalty(proof, 70_001);
    }

    function test_proof_against_other_root_rejected() public {
        _checkpointEx1(bytes32(uint256(1)));
        vm.prank(client);
        vm.expectRevert(AegisChannel.InvalidProof.selector);
        ch.claimPenalty(proof, 70_000);
    }

    function test_non_party_reverts() public {
        _checkpointEx1(bytes32(inputs[2]));
        vm.prank(address(0xBEEF));
        vm.expectRevert(AegisChannel.NotParty.selector);
        ch.claimPenalty(proof, 70_000);
    }

    function test_claim_in_open_reverts() public {
        vm.prank(client);
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.claimPenalty(proof, 70_000);
    }

    function test_newer_checkpoint_voids_proof() public {
        _checkpointEx1(bytes32(inputs[2]));
        vm.prank(client);
        ch.claimPenalty(proof, 70_000);
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 101, 2_020_000, bytes32(uint256(2)));
        ch.submitCheckpoint(101, 2_020_000, bytes32(uint256(2)), sc, sp);
        assertFalse(ch.hasProof());
        vm.warp(block.timestamp + 200);
        uint256 p0 = usdg.balanceOf(provider);
        ch.settle();
        assertEq(usdg.balanceOf(provider) - p0, 2_020_000);
    }

    function test_fr18_exceeds_cumulative_reverts_even_if_verifier_says_true() public {
        // factory dari Base memakai MockVerifier(true)
        AegisChannel m = openByClient(defaultConfig());
        fund(m, 1_000_000);
        (bytes memory sc, bytes memory sp) = checkpointSigs(m, 5, 100_000, bytes32(uint256(9)));
        m.submitCheckpoint(5, 100_000, bytes32(uint256(9)), sc, sp);
        uint256[8] memory dummy;
        vm.prank(client);
        vm.expectRevert(AegisChannel.ExceedsCumulative.selector);
        m.claimPenalty(dummy, 100_001);
        vm.prank(client);
        m.claimPenalty(dummy, 100_000);
        assertEq(m.payToClient(), 100_000);
    }
}
