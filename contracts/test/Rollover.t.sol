// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";

contract RolloverTest is AegisTestBase {
    AegisChannel ch;
    bytes32 constant ROOT = bytes32(uint256(777));
    uint256[8] proofZero;

    function setUp() public override {
        super.setUp();
        ch = openByClient(defaultConfig());
        fund(ch, 5_000_000);
    }

    function _rollover(uint64 s, uint128 toProvider) internal {
        (bytes memory sc, bytes memory sp) = rolloverSigs(ch, s, toProvider);
        ch.rollover(s, toProvider, sc, sp);
    }

    function test_rollover_pays_provider_keeps_remainder_and_resets() public {
        uint256 p0 = usdg.balanceOf(provider);
        uint256 c0 = usdg.balanceOf(client);
        vm.expectEmit(true, false, false, true, address(ch));
        emit AegisChannel.RolledOver(1, 128, 2_560_000, 2_440_000);
        _rollover(128, 2_560_000);
        assertEq(usdg.balanceOf(provider) - p0, 2_560_000);
        assertEq(usdg.balanceOf(client), c0);                 // sisa TIDAK dikembalikan: jadi budget epoch baru
        assertEq(ch.budget(), 2_440_000);
        assertEq(ch.epoch(), 1);
        assertEq(ch.seq(), 0); assertEq(ch.cumulativeAmount(), 0); assertEq(ch.receiptsRoot(), bytes32(0));
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.OPEN));
        assertEq(ch.deadline(), 0); assertFalse(ch.hasProof()); assertEq(ch.payToClient(), 0);
    }

    function test_old_epoch_checkpoint_and_close_rejected_after_rollover() public {
        (bytes memory sc0, bytes memory sp0) = checkpointSigs(ch, 128, 2_560_000, ROOT); // epoch 0
        (bytes memory cc0, bytes memory cp0) = closeSigs(ch, 128, 2_560_000);
        _rollover(128, 2_560_000);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.submitCheckpoint(128, 2_560_000, ROOT, sc0, sp0);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.closeCooperative(128, 2_560_000, cc0, cp0);
        (bytes memory sc1, bytes memory sp1) = checkpointSigs(ch, 1, 20_000, ROOT);     // epoch 1
        ch.submitCheckpoint(1, 20_000, ROOT, sc1, sp1);
        assertEq(ch.seq(), 1);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.CLOSING));
    }

    function test_rollover_signature_not_replayable() public {
        (bytes memory sc, bytes memory sp) = rolloverSigs(ch, 10, 200_000);
        ch.rollover(10, 200_000, sc, sp);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.rollover(10, 200_000, sc, sp);
    }

    function test_rollover_from_closing_clears_pending_proof() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 50, 1_000_000, ROOT);
        ch.submitCheckpoint(50, 1_000_000, ROOT, sc, sp);
        vm.prank(client);
        ch.claimPenalty(proofZero, 10_000);        // MockVerifier(true)
        assertTrue(ch.hasProof());
        _rollover(50, 1_000_000);
        assertFalse(ch.hasProof()); assertEq(ch.payToClient(), 0); assertEq(ch.proofSeq(), 0);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.OPEN));
    }

    function test_rollover_stale_seq_reverts() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 50, 1_000_000, ROOT);
        ch.submitCheckpoint(50, 1_000_000, ROOT, sc, sp);
        (bytes memory rc, bytes memory rp) = rolloverSigs(ch, 49, 900_000);
        vm.expectRevert(AegisChannel.StaleCheckpoint.selector);
        ch.rollover(49, 900_000, rc, rp);
    }

    function test_rollover_exceeding_budget_reverts() public {
        (bytes memory sc, bytes memory sp) = rolloverSigs(ch, 1, 5_000_001);
        vm.expectRevert(AegisChannel.ExceedsBudget.selector);
        ch.rollover(1, 5_000_001, sc, sp);
    }

    function test_rollover_seq_too_large_reverts() public {
        (bytes memory sc, bytes memory sp) = rolloverSigs(ch, 129, 1);
        vm.expectRevert(AegisChannel.SeqTooLarge.selector);
        ch.rollover(129, 1, sc, sp);
    }

    function test_rollover_requires_both_sigs() public {
        (bytes memory sc,) = rolloverSigs(ch, 1, 1);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.rollover(1, 1, sc, sc);
    }

    function test_two_rollovers_then_close() public {
        _rollover(128, 1_000_000);
        _rollover(128, 1_000_000);
        assertEq(ch.epoch(), 2); assertEq(ch.budget(), 3_000_000);
        uint256 c0 = usdg.balanceOf(client); uint256 p0 = usdg.balanceOf(provider);
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 5, 100_000);
        ch.closeCooperative(5, 100_000, sc, sp);
        assertEq(usdg.balanceOf(provider) - p0, 100_000);
        assertEq(usdg.balanceOf(client) - c0, 2_900_000);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.SETTLED));
    }

    function test_rollover_after_settled_reverts() public {
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 1, 1);
        ch.closeCooperative(1, 1, sc, sp);
        (bytes memory rc, bytes memory rp) = rolloverSigs(ch, 1, 1);
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.rollover(1, 1, rc, rp);
    }

    function test_rollover_zero_to_provider_keeps_full_budget() public {
        uint256 p0 = usdg.balanceOf(provider);
        _rollover(0, 0);
        assertEq(usdg.balanceOf(provider), p0); assertEq(ch.budget(), 5_000_000); assertEq(ch.epoch(), 1);
    }
}
