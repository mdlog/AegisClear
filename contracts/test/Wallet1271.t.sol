// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";
import {Mock1271Wallet} from "./mocks/Mock1271Wallet.sol";

contract Wallet1271Test is AegisTestBase {
    Mock1271Wallet wallet;

    function setUp() public override {
        super.setUp();
        wallet = new Mock1271Wallet(vm.addr(clientPk)); // klien = smart account, owner = clientPk
        usdg.mint(address(wallet), 10e6);
    }

    function test_channel_with_1271_client_end_to_end() public {
        AegisChannel.Config memory c = defaultConfig();
        c.client = address(wallet); c.payoutClient = address(wallet);
        address predicted = factory.predict(c);
        bytes32 d = Sigs.digest(Sigs.domain(predicted), AegisChannel(factory.IMPLEMENTATION()).hashChannelTerms(c));
        // provider membuka dengan tanda tangan owner wallet (dicek via isValidSignature)
        vm.prank(provider);
        AegisChannel ch = AegisChannel(factory.open(c, Sigs.sign(clientPk, d), ""));
        vm.prank(address(wallet)); usdg.transfer(address(ch), 3_000_000);
        bytes32 cd = Sigs.digest(ch.domainSeparator(), ch.hashCheckpoint(ch.epoch(), 10, 200_000, bytes32(uint256(5))));
        ch.submitCheckpoint(10, 200_000, bytes32(uint256(5)), Sigs.sign(clientPk, cd), Sigs.sign(providerPk, cd));
        vm.warp(block.timestamp + 120);
        ch.settle();
        assertEq(usdg.balanceOf(address(wallet)), 10e6 - 200_000);
        assertEq(usdg.balanceOf(provider), 200_000);
    }

    function test_1271_rejects_non_owner_signature() public {
        AegisChannel.Config memory c = defaultConfig();
        c.client = address(wallet); c.payoutClient = address(wallet);
        address predicted = factory.predict(c);
        bytes32 d = Sigs.digest(Sigs.domain(predicted), AegisChannel(factory.IMPLEMENTATION()).hashChannelTerms(c));
        vm.prank(provider);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        factory.open(c, Sigs.sign(0xDEAD, d), "");
    }
}
