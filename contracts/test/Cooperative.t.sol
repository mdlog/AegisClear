// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";

contract CooperativeTest is AegisTestBase {
    AegisChannel ch;
    bytes32 constant ROOT = bytes32(uint256(777));

    function setUp() public override {
        super.setUp();
        ch = openByClient(defaultConfig());
        fund(ch, 5_000_000);
    }

    function _close(uint64 s, uint128 toProvider) internal {
        (bytes memory sc, bytes memory sp) = closeSigs(ch, s, toProvider);
        ch.closeCooperative(s, toProvider, sc, sp);
    }

    function test_close_from_open_pays_split_immediately() public {
        uint256 c0 = usdg.balanceOf(client); uint256 p0 = usdg.balanceOf(provider);
        _close(100, 2_000_000);
        assertEq(usdg.balanceOf(provider) - p0, 2_000_000);
        assertEq(usdg.balanceOf(client) - c0, 3_000_000);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.SETTLED));
        assertEq(ch.seq(), 100);
    }

    function test_close_from_closing_with_higher_or_equal_seq() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 50, 1_000_000, ROOT);
        ch.submitCheckpoint(50, 1_000_000, ROOT, sc, sp);
        _close(50, 1_000_000);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.SETTLED));
    }

    function test_close_with_lower_seq_reverts() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 50, 1_000_000, ROOT);
        ch.submitCheckpoint(50, 1_000_000, ROOT, sc, sp);
        (bytes memory c2, bytes memory p2) = closeSigs(ch, 49, 900_000);
        vm.expectRevert(AegisChannel.StaleCheckpoint.selector);
        ch.closeCooperative(49, 900_000, c2, p2);
    }

    function test_close_exceeding_budget_reverts() public {
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 1, 5_000_001);
        vm.expectRevert(AegisChannel.ExceedsBudget.selector);
        ch.closeCooperative(1, 5_000_001, sc, sp);
    }

    function test_close_requires_both_sigs() public {
        (bytes memory sc,) = closeSigs(ch, 1, 1);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.closeCooperative(1, 1, sc, sc);
    }

    function test_close_replay_after_settled_reverts() public {
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 1, 1_000_000);
        ch.closeCooperative(1, 1_000_000, sc, sp);
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.closeCooperative(1, 1_000_000, sc, sp);
    }

    function test_sweep_only_after_settled_and_sends_late_funds_to_client() public {
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.sweep();
        _close(1, 1_000_000);
        fund(ch, 250_000); // dana masuk belakangan
        uint256 c0 = usdg.balanceOf(client);
        vm.prank(address(0xCAFE));
        ch.sweep();
        assertEq(usdg.balanceOf(client) - c0, 250_000);
        assertEq(usdg.balanceOf(address(ch)), 0);
    }
}
