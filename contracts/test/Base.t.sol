// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AegisChannel} from "../src/AegisChannel.sol";
import {AegisChannelFactory} from "../src/AegisChannelFactory.sol";
import {MockUSDG} from "../src/MockUSDG.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";
import {Sigs} from "./utils/Sigs.sol";

abstract contract AegisTestBase is Test {
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    MockUSDG internal usdg;
    MockVerifier internal verifier;
    AegisChannelFactory internal factory;
    uint256 internal clientPk = 0xA11CE;
    uint256 internal providerPk = 0xB0B;
    address internal client;
    address internal provider;

    function setUp() public virtual {
        usdg = new MockUSDG();
        verifier = new MockVerifier(true);
        factory = new AegisChannelFactory(address(verifier), PERMIT2, 60);
        client = vm.addr(clientPk);
        provider = vm.addr(providerPk);
        vm.label(client, "client");
        vm.label(provider, "provider");
        usdg.mint(client, 100e6);
    }

    function defaultConfig() internal view returns (AegisChannel.Config memory c) {
        c = AegisChannel.Config({
            client: client, provider: provider, token: address(usdg),
            termsCommitment: bytes32(uint256(12345)),
            challengeWindow: 120, responseWindow: 60,
            payoutClient: client, payoutProvider: provider,
            salt: bytes32(uint256(1))
        });
    }

    function termsDigest(AegisChannel.Config memory c) internal view returns (bytes32) {
        address predicted = factory.predict(c);
        bytes32 structHash = AegisChannel(factory.IMPLEMENTATION()).hashChannelTerms(c);
        return Sigs.digest(Sigs.domain(predicted), structHash);
    }

    function openByClient(AegisChannel.Config memory c) internal returns (AegisChannel ch) {
        bytes memory sigP = Sigs.sign(providerPk, termsDigest(c));
        vm.prank(client);
        ch = AegisChannel(factory.open(c, "", sigP));
    }

    function fund(AegisChannel ch, uint256 amount) internal {
        vm.prank(client);
        usdg.transfer(address(ch), amount);
    }

    function checkpointSigs(AegisChannel ch, uint64 s, uint128 a, bytes32 r)
        internal view returns (bytes memory sc, bytes memory sp)
    {
        bytes32 d = Sigs.digest(ch.domainSeparator(), ch.hashCheckpoint(ch.epoch(), s, a, r));
        sc = Sigs.sign(clientPk, d);
        sp = Sigs.sign(providerPk, d);
    }

    function closeSigs(AegisChannel ch, uint64 s, uint128 toProvider)
        internal view returns (bytes memory sc, bytes memory sp)
    {
        bytes32 d = Sigs.digest(ch.domainSeparator(), ch.hashClose(ch.epoch(), s, toProvider));
        sc = Sigs.sign(clientPk, d);
        sp = Sigs.sign(providerPk, d);
    }

    function rolloverSigs(AegisChannel ch, uint64 s, uint128 toProvider)
        internal view returns (bytes memory sc, bytes memory sp)
    {
        bytes32 d = Sigs.digest(ch.domainSeparator(), ch.hashRollover(ch.epoch(), s, toProvider));
        sc = Sigs.sign(clientPk, d);
        sp = Sigs.sign(providerPk, d);
    }
}
