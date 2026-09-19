// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, AegisChannelFactory, Sigs} from "./Base.t.sol";

contract FactoryTest is AegisTestBase {
    function test_predict_matches_open_and_state_open() public {
        AegisChannel.Config memory c = defaultConfig();
        address predicted = factory.predict(c);
        AegisChannel ch = openByClient(c);
        assertEq(address(ch), predicted);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.OPEN));
        (address cl, address pr, address tok, bytes32 T,,,,,) = ch.cfg();
        assertEq(cl, client); assertEq(pr, provider); assertEq(tok, address(usdg)); assertEq(T, c.termsCommitment);
        assertEq(ch.channelIdField(), uint256(uint160(address(ch))));
        assertEq(ch.domainSeparator(), Sigs.domain(address(ch)));
    }

    function test_open_by_third_party_requires_both_sigs() public {
        AegisChannel.Config memory c = defaultConfig();
        bytes32 d = termsDigest(c);
        bytes memory sc = Sigs.sign(clientPk, d);
        bytes memory sp = Sigs.sign(providerPk, d);
        vm.prank(address(0xBEEF));
        AegisChannel ch = AegisChannel(factory.open(c, sc, sp));
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.OPEN));
    }

    function test_open_by_third_party_missing_client_sig_reverts() public {
        AegisChannel.Config memory c = defaultConfig();
        bytes memory sp = Sigs.sign(providerPk, termsDigest(c));
        vm.prank(address(0xBEEF));
        vm.expectRevert(AegisChannel.BadSignature.selector);
        factory.open(c, "", sp);
    }

    function test_open_by_client_with_wrong_provider_sig_reverts() public {
        AegisChannel.Config memory c = defaultConfig();
        bytes memory bad = Sigs.sign(0xDEAD, termsDigest(c));
        vm.prank(client);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        factory.open(c, "", bad);
    }

    function test_open_window_too_short_reverts() public {
        AegisChannel.Config memory c = defaultConfig();
        c.challengeWindow = 59;
        vm.prank(client);
        vm.expectRevert(AegisChannelFactory.WindowTooShort.selector);
        factory.open(c, "", "");
    }

    function test_open_twice_same_config_reverts() public {
        AegisChannel.Config memory c = defaultConfig();
        openByClient(c);
        bytes memory sigP = Sigs.sign(providerPk, termsDigest(c));
        vm.prank(client);
        vm.expectRevert();
        factory.open(c, "", sigP);
    }

    function test_direct_initialize_reverts_not_factory() public {
        AegisChannel.Config memory c = defaultConfig();
        AegisChannel ch = openByClient(c);
        vm.expectRevert(AegisChannel.NotFactory.selector);
        ch.initialize(c, client, "", "");
    }

    function test_bad_config_reverts() public {
        AegisChannel.Config memory c = defaultConfig();
        c.responseWindow = 121; // > challengeWindow
        bytes memory sigP = Sigs.sign(providerPk, termsDigest(c));
        vm.prank(client);
        vm.expectRevert(AegisChannel.BadConfig.selector);
        factory.open(c, "", sigP);
    }
}
