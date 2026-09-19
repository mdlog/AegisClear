// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";

contract CheckpointTest is AegisTestBase {
    AegisChannel ch;
    bytes32 constant ROOT = bytes32(uint256(777));

    function setUp() public override {
        super.setUp();
        ch = openByClient(defaultConfig());
        fund(ch, 5_000_000); // 5.00 USDG
    }

    function _cp(uint64 s, uint128 a) internal {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, s, a, ROOT);
        ch.submitCheckpoint(s, a, ROOT, sc, sp);
    }

    function test_checkpoint_opens_window() public {
        uint256 t0 = block.timestamp;
        _cp(100, 2_000_000);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.CLOSING));
        assertEq(ch.seq(), 100); assertEq(ch.cumulativeAmount(), 2_000_000); assertEq(ch.receiptsRoot(), ROOT);
        assertEq(ch.deadline(), t0 + 120);
    }

    function test_checkpoint_requires_both_valid_sigs() public {
        (bytes memory sc,) = checkpointSigs(ch, 1, 20_000, ROOT);
        bytes memory bad = Sigs.sign(0xDEAD, Sigs.digest(ch.domainSeparator(), ch.hashCheckpoint(1, 20_000, ROOT)));
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.submitCheckpoint(1, 20_000, ROOT, sc, bad);
    }

    function test_seq_too_large_reverts() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 129, 1, ROOT);
        vm.expectRevert(AegisChannel.SeqTooLarge.selector);
        ch.submitCheckpoint(129, 1, ROOT, sc, sp);
    }

    /// Optional boundary (Task 12 brief): seq_ == MAX_SEQ (128) is accepted, not rejected.
    function test_seq_128_accepted_at_boundary() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 128, 1_000_000, ROOT);
        ch.submitCheckpoint(128, 1_000_000, ROOT, sc, sp);
        assertEq(ch.seq(), 128);
    }

    function test_stale_seq_reverts_in_closing() public {
        _cp(50, 1_000_000);
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 50, 1_000_000, ROOT);
        vm.expectRevert(AegisChannel.StaleCheckpoint.selector);
        ch.submitCheckpoint(50, 1_000_000, ROOT, sc, sp);
    }

    function test_newer_checkpoint_replaces_and_extends() public {
        uint256 t0 = block.timestamp;
        _cp(50, 1_000_000);
        vm.warp(t0 + 100);
        _cp(100, 2_000_000);
        assertEq(ch.seq(), 100);
        assertEq(ch.deadline(), t0 + 160); // max(t0+120, t0+100+60)
    }

    function test_newer_checkpoint_never_shrinks_deadline() public {
        uint256 t0 = block.timestamp;
        _cp(50, 1_000_000);
        vm.warp(t0 + 10);
        _cp(60, 1_200_000);
        assertEq(ch.deadline(), t0 + 120);
    }

    function test_settle_too_early_reverts() public {
        _cp(100, 2_000_000);
        vm.expectRevert(AegisChannel.TooEarly.selector);
        ch.settle();
    }

    function test_settle_wrong_state_reverts() public {
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.settle();
    }

    function test_settle_default_pays_A_then_remainder() public {
        _cp(100, 2_000_000);
        vm.warp(block.timestamp + 120);
        uint256 c0 = usdg.balanceOf(client); uint256 p0 = usdg.balanceOf(provider);
        vm.prank(address(0xCAFE)); // siapa pun
        ch.settle();
        assertEq(usdg.balanceOf(provider) - p0, 2_000_000);
        assertEq(usdg.balanceOf(client) - c0, 3_000_000);
        assertEq(usdg.balanceOf(address(ch)), 0);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.SETTLED));
    }

    function test_settle_caps_at_budget_when_A_exceeds() public {
        _cp(100, 9_000_000);
        vm.warp(block.timestamp + 120);
        uint256 p0 = usdg.balanceOf(provider);
        ch.settle();
        assertEq(usdg.balanceOf(provider) - p0, 5_000_000);
        assertEq(usdg.balanceOf(address(ch)), 0);
    }

    function test_settle_twice_reverts() public {
        _cp(1, 20_000);
        vm.warp(block.timestamp + 120);
        ch.settle();
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.settle();
    }
}
