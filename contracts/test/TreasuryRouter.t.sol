// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";
import {AegisTreasuryRouter} from "../src/AegisTreasuryRouter.sol";
import {RevertingPayout} from "./mocks/RevertingPayout.sol";
import {GasBurnerPayout} from "./mocks/GasBurnerPayout.sol";
import {FreezableToken} from "./mocks/FreezableToken.sol";

contract TreasuryRouterTest is AegisTestBase {
    AegisTreasuryRouter router;
    address treasury = address(0x7EA5);

    function setUp() public override {
        super.setUp();
        router = new AegisTreasuryRouter();
    }

    function _openWithProviderPayout(address payoutProvider) internal returns (AegisChannel ch) {
        AegisChannel.Config memory c = defaultConfig();
        c.payoutProvider = payoutProvider;
        ch = openByClient(c);
        fund(ch, 5_000_000);
    }
    function _close(AegisChannel ch, uint64 s, uint128 toProvider) internal {
        (bytes memory sc, bytes memory sp) = closeSigs(ch, s, toProvider);
        ch.closeCooperative(s, toProvider, sc, sp);
    }

    function test_router_forwards_to_treasury_in_same_tx() public {
        vm.prank(provider); router.setTreasury(treasury);
        AegisChannel ch = _openWithProviderPayout(address(router));
        vm.expectEmit(true, true, true, true, address(router));
        emit AegisTreasuryRouter.PayoutRouted(provider, address(usdg), treasury, 2_000_000, true);
        _close(ch, 100, 2_000_000);
        assertEq(usdg.balanceOf(treasury), 2_000_000);
        assertEq(usdg.balanceOf(address(router)), 0);
        assertEq(router.credit(provider, address(usdg)), 0);
        assertEq(usdg.balanceOf(provider), 0);
    }

    function test_router_without_treasury_forwards_to_agent() public {
        AegisChannel ch = _openWithProviderPayout(address(router));
        _close(ch, 100, 2_000_000);
        assertEq(usdg.balanceOf(provider), 2_000_000);
        assertEq(usdg.balanceOf(address(router)), 0);
    }

    function test_setTreasury_is_per_sender_and_clearable() public {
        vm.prank(provider); router.setTreasury(treasury);
        assertEq(router.treasuryOf(provider), treasury); assertEq(router.destinationOf(provider), treasury);
        assertEq(router.destinationOf(client), client);
        vm.prank(provider); router.setTreasury(address(0));
        assertEq(router.destinationOf(provider), provider);
    }

    function test_reverting_payee_does_not_block_settle_or_close() public {
        RevertingPayout bad = new RevertingPayout();
        AegisChannel.Config memory c = defaultConfig();
        c.payoutClient = address(bad);                 // klien memilih payee jahat untuk dirinya sendiri
        AegisChannel ch = openByClient(c);
        fund(ch, 5_000_000);
        _close(ch, 100, 2_000_000);                    // tidak revert
        assertEq(usdg.balanceOf(provider), 2_000_000);
        assertEq(usdg.balanceOf(address(bad)), 3_000_000);   // dana tetap terkirim; hook-nya saja yang gagal
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.SETTLED));
    }

    function test_gas_burning_payee_is_capped_and_settle_succeeds() public {
        GasBurnerPayout burner = new GasBurnerPayout();
        AegisChannel ch = _openWithProviderPayout(address(burner));
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 10, 200_000, bytes32(uint256(1)));
        ch.submitCheckpoint(10, 200_000, bytes32(uint256(1)), sc, sp);
        vm.warp(block.timestamp + 121);
        uint256 g0 = gasleft();
        ch.settle();
        assertLt(g0 - gasleft(), 400_000);             // stipend 150k + transfer, bukan seluruh gas blok
        assertEq(usdg.balanceOf(address(burner)), 200_000);
        assertEq(usdg.balanceOf(client), 100e6 - 5_000_000 + 4_800_000);
    }

    function test_frozen_treasury_keeps_credit_then_claim() public {
        FreezableToken frz = new FreezableToken();
        frz.mint(client, 10_000_000);
        vm.prank(provider); router.setTreasury(treasury);
        frz.freeze(treasury, true);
        AegisChannel.Config memory c = defaultConfig();
        c.token = address(frz); c.payoutProvider = address(router);
        AegisChannel ch = openByClient(c);
        vm.prank(client); frz.transfer(address(ch), 5_000_000);
        _close(ch, 100, 2_000_000);
        assertEq(frz.balanceOf(address(router)), 2_000_000);
        assertEq(router.credit(provider, address(frz)), 2_000_000);
        assertEq(router.totalCredit(address(frz)), 2_000_000);
        frz.freeze(treasury, false);
        vm.prank(provider); router.claim(address(frz), treasury);
        assertEq(frz.balanceOf(treasury), 2_000_000);
        assertEq(router.credit(provider, address(frz)), 0);
        assertEq(router.totalCredit(address(frz)), 0);
    }

    function test_onPayout_without_backing_reverts() public {
        vm.expectRevert(AegisTreasuryRouter.Unbacked.selector);
        router.onPayout(provider, address(usdg), 1);
        usdg.mint(address(router), 100);
        router.onPayout(provider, address(usdg), 100);     // 100 masuk sungguhan → diteruskan ke provider
        assertEq(usdg.balanceOf(provider), 100);
        vm.expectRevert(AegisTreasuryRouter.Unbacked.selector);
        router.onPayout(provider, address(usdg), 1);        // saldo router 0 lagi
    }

    function test_claim_nothing_reverts() public {
        vm.prank(provider);
        vm.expectRevert(AegisTreasuryRouter.NothingToClaim.selector);
        router.claim(address(usdg), treasury);
    }

    function test_sweep_and_rollover_go_through_hook() public {
        vm.prank(provider); router.setTreasury(treasury);
        AegisChannel.Config memory c = defaultConfig();
        c.payoutProvider = address(router); c.payoutClient = address(router);
        AegisChannel ch = openByClient(c);
        fund(ch, 5_000_000);
        (bytes memory rc, bytes memory rp) = rolloverSigs(ch, 128, 1_000_000);
        ch.rollover(128, 1_000_000, rc, rp);
        assertEq(usdg.balanceOf(treasury), 1_000_000);              // rollover → hook → treasury provider
        _close(ch, 1, 0);                                           // semua sisa ke payoutClient = router → klien (tanpa treasury)
        assertEq(usdg.balanceOf(client), 100e6 - 5_000_000 + 4_000_000);
        fund(ch, 250_000);                                          // dana telat setelah SETTLED (dari klien sendiri)
        ch.sweep();                                                 // → router → klien: netto 0 bagi klien
        assertEq(usdg.balanceOf(client), 100e6 - 5_000_000 + 4_000_000);
        assertEq(usdg.balanceOf(address(ch)), 0);
        assertEq(usdg.balanceOf(address(router)), 0);
    }
}
