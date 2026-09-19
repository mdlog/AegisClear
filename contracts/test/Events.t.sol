// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";

/// @dev Controller-mandated addition (Task 12 review carry-over): pin exact event args
/// (topics + data) for the state-changing paths that Checkpoint/Cooperative/Penalty tests
/// only assert the side-effects of. `fundWithPermit2` is Permit2-dependent and already
/// exercised in Permit2.t.sol — skipped here per the brief; `sweep`'s `Swept` event stands in.
contract EventsTest is AegisTestBase {
    /// 1) submitCheckpoint -> CheckpointSubmitted(seq, cumulativeAmount, receiptsRoot, deadline)
    /// with the exact expected deadline (OPEN -> CLOSING: deadline = now + challengeWindow).
    function test_submitCheckpoint_emits_CheckpointSubmitted_with_exact_deadline() public {
        AegisChannel.Config memory c = defaultConfig();
        AegisChannel ch = openByClient(c);
        fund(ch, 5_000_000);

        uint64 s = 10; uint128 a = 200_000; bytes32 root = bytes32(uint256(5));
        // hoisted: checkpointSigs() makes external view calls (domainSeparator/hashCheckpoint) on
        // `ch` — must happen before vm.expectEmit so it doesn't consume the "next call" tracking.
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, s, a, root);
        uint64 expectedDeadline = uint64(block.timestamp) + c.challengeWindow;

        vm.expectEmit(true, true, true, true, address(ch));
        emit AegisChannel.CheckpointSubmitted(s, a, root, expectedDeadline);
        ch.submitCheckpoint(s, a, root, sc, sp);
    }

    /// 2) settle (default path, no proof) -> Settled(seq, cumulativeAmount, 0, toProvider, toClient, false),
    /// PaymentReleased(jobId, cfg.provider, toProvider), Refunded(jobId, cfg.client, toClient).
    /// payoutClient/payoutProvider DIFFER from client/provider: events name the identity addresses
    /// while the tokens land on the payout addresses.
    function test_settle_default_path_emits_Settled_PaymentReleased_Refunded() public {
        AegisChannel.Config memory c = defaultConfig();
        c.payoutClient = address(0xC0FFEE);
        c.payoutProvider = address(0xD00D);
        AegisChannel ch = openByClient(c);
        fund(ch, 5_000_000);

        uint64 s = 100; uint128 a = 2_000_000; bytes32 root = bytes32(uint256(7));
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, s, a, root);
        ch.submitCheckpoint(s, a, root, sc, sp);
        vm.warp(block.timestamp + c.challengeWindow);

        uint256 toProvider = a; // no proof/penalty, a < budget
        uint256 toClient = 5_000_000 - a;
        uint256 jobId = uint256(uint160(address(ch)));

        vm.expectEmit(true, true, true, true, address(ch));
        emit AegisChannel.Settled(s, a, 0, toProvider, toClient, false);
        vm.expectEmit(true, true, true, true, address(ch));
        emit AegisChannel.PaymentReleased(jobId, c.provider, toProvider);
        vm.expectEmit(true, true, true, true, address(ch));
        emit AegisChannel.Refunded(jobId, c.client, toClient);
        ch.settle();

        // tokens actually moved to the payout addresses, not the identity addresses the events name
        assertEq(usdg.balanceOf(c.payoutProvider), toProvider);
        assertEq(usdg.balanceOf(c.payoutClient), toClient);
        assertEq(usdg.balanceOf(c.provider), 0);
        assertEq(usdg.balanceOf(c.client), 100e6 - 5_000_000);
    }

    /// 3) closeCooperative -> Settled(..., cooperative = true), same identity-vs-payout split.
    function test_closeCooperative_emits_Settled_with_cooperative_true() public {
        AegisChannel.Config memory c = defaultConfig();
        c.payoutClient = address(0xC0FFEE);
        c.payoutProvider = address(0xD00D);
        AegisChannel ch = openByClient(c);
        fund(ch, 5_000_000);

        uint64 s = 1; uint128 toProvider = 2_000_000;
        (bytes memory sc, bytes memory sp) = closeSigs(ch, s, toProvider);
        uint256 toClient = 5_000_000 - toProvider;
        uint256 jobId = uint256(uint160(address(ch)));

        vm.expectEmit(true, true, true, true, address(ch));
        emit AegisChannel.Settled(s, 0, 0, toProvider, toClient, true);
        vm.expectEmit(true, true, true, true, address(ch));
        emit AegisChannel.PaymentReleased(jobId, c.provider, toProvider);
        vm.expectEmit(true, true, true, true, address(ch));
        emit AegisChannel.Refunded(jobId, c.client, toClient);
        ch.closeCooperative(s, toProvider, sc, sp);

        assertEq(usdg.balanceOf(c.payoutProvider), toProvider);
        assertEq(usdg.balanceOf(c.payoutClient), toClient);
        assertEq(usdg.balanceOf(c.provider), 0);
    }

    /// 4) claimPenalty (MockVerifier(true) from AegisTestBase) -> PenaltyClaimed(msg.sender, seq, payToClient).
    function test_claimPenalty_emits_PenaltyClaimed() public {
        AegisChannel ch = openByClient(defaultConfig());
        fund(ch, 5_000_000);

        uint64 s = 10; uint128 a = 2_000_000; bytes32 root = bytes32(uint256(9));
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, s, a, root);
        ch.submitCheckpoint(s, a, root, sc, sp);

        uint256[8] memory dummy;
        uint128 payToClient_ = 500_000;

        vm.expectEmit(true, true, true, true, address(ch));
        emit AegisChannel.PenaltyClaimed(client, s, payToClient_);
        vm.prank(client);
        ch.claimPenalty(dummy, payToClient_);
    }

    /// 5) fundWithPermit2 is Permit2-dependent (already covered end-to-end in Permit2.t.sol) —
    /// skipped here per the brief. Sweep's Swept(amount) event stands in.
    function test_sweep_emits_Swept_with_leftover_amount() public {
        AegisChannel ch = openByClient(defaultConfig());
        fund(ch, 5_000_000);
        uint64 s = 1; uint128 toProvider = 1_000_000;
        (bytes memory sc, bytes memory sp) = closeSigs(ch, s, toProvider);
        ch.closeCooperative(s, toProvider, sc, sp);

        fund(ch, 250_000); // dana masuk belakangan (post-SETTLED)

        vm.expectEmit(true, true, true, true, address(ch));
        emit AegisChannel.Swept(250_000);
        ch.sweep();
    }

    /// Optional boundary (brief): Swept(0) on an empty sweep.
    function test_sweep_emits_Swept_zero_when_no_leftover_funds() public {
        AegisChannel ch = openByClient(defaultConfig());
        fund(ch, 5_000_000);
        uint64 s = 1; uint128 toProvider = 1_000_000;
        (bytes memory sc, bytes memory sp) = closeSigs(ch, s, toProvider);
        ch.closeCooperative(s, toProvider, sc, sp);

        vm.expectEmit(true, true, true, true, address(ch));
        emit AegisChannel.Swept(0);
        ch.sweep();
    }
}
