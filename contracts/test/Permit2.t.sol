// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";
import {MockUSDG} from "../src/MockUSDG.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";

interface IPermit2Domain { function DOMAIN_SEPARATOR() external view returns (bytes32); }

interface IX402ExactPermit2Proxy {
    struct Witness { address to; uint256 validAfter; }
    function settle(ISignatureTransfer.PermitTransferFrom calldata permit, address owner, Witness calldata witness, bytes calldata signature) external;
}

contract Permit2Test is AegisTestBase {
    address constant X402_PROXY = 0x402085c248EeA27D92E8b30b2C58ed07f9E20001;
    bytes32 constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 constant PERMIT_TRANSFER_FROM_TYPEHASH = keccak256(
        "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
    );
    string constant WITNESS_TYPE_STRING =
        "Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,uint256 validAfter)";
    bytes32 constant WITNESS_TYPEHASH = keccak256("Witness(address to,uint256 validAfter)");
    bytes32 immutable PERMIT_WITNESS_TYPEHASH = keccak256(abi.encodePacked(
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,", WITNESS_TYPE_STRING));

    function setUp() public override {
        super.setUp();
        vm.etch(PERMIT2, vm.parseBytes(vm.readFile("test/fixtures/permit2.bytecode")));
        vm.etch(X402_PROXY, vm.parseBytes(vm.readFile("test/fixtures/x402proxy.bytecode")));
        vm.label(PERMIT2, "Permit2"); vm.label(X402_PROXY, "x402ExactPermit2Proxy");
        vm.warp(1_700_000_000);
        vm.prank(client);
        usdg.approve(PERMIT2, type(uint256).max);
    }

    function _permit(address token, uint256 amount, uint256 nonce) internal view returns (ISignatureTransfer.PermitTransferFrom memory p) {
        p = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: token, amount: amount}),
            nonce: nonce, deadline: block.timestamp + 1 hours
        });
    }
    function _tokenPermHash(ISignatureTransfer.PermitTransferFrom memory p) internal pure returns (bytes32) {
        return keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, p.permitted.token, p.permitted.amount));
    }
    function _domainDigest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", IPermit2Domain(PERMIT2).DOMAIN_SEPARATOR(), structHash));
    }
    function _signPlain(ISignatureTransfer.PermitTransferFrom memory p, address spender) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(PERMIT_TRANSFER_FROM_TYPEHASH, _tokenPermHash(p), spender, p.nonce, p.deadline));
        return Sigs.sign(clientPk, _domainDigest(structHash));
    }
    function _signWitness(ISignatureTransfer.PermitTransferFrom memory p, address spender, address to, uint256 validAfter)
        internal view returns (bytes memory)
    {
        bytes32 witnessHash = keccak256(abi.encode(WITNESS_TYPEHASH, to, validAfter));
        bytes32 structHash = keccak256(abi.encode(PERMIT_WITNESS_TYPEHASH, _tokenPermHash(p), spender, p.nonce, p.deadline, witnessHash));
        return Sigs.sign(clientPk, _domainDigest(structHash));
    }

    function test_fundWithPermit2_credits_budget() public {
        AegisChannel ch = openByClient(defaultConfig());
        ISignatureTransfer.PermitTransferFrom memory p = _permit(address(usdg), 1_500_000, 1);
        bytes memory sig = _signPlain(p, address(ch));
        vm.prank(client);
        ch.fundWithPermit2(p, sig);
        assertEq(ch.budget(), 1_500_000);
        assertEq(usdg.balanceOf(client), 100e6 - 1_500_000);
    }

    function test_fundWithPermit2_wrong_token_reverts() public {
        AegisChannel ch = openByClient(defaultConfig());
        MockUSDG other = new MockUSDG();
        other.mint(client, 10e6);
        vm.prank(client); other.approve(PERMIT2, type(uint256).max);
        ISignatureTransfer.PermitTransferFrom memory p = _permit(address(other), 1, 2);
        bytes memory sig = _signPlain(p, address(ch));
        vm.prank(client);
        vm.expectRevert(AegisChannel.WrongToken.selector);
        ch.fundWithPermit2(p, sig);
    }

    function test_x402_proxy_settles_into_predicted_address_before_open() public {
        AegisChannel.Config memory c = defaultConfig();
        address predicted = factory.predict(c);
        ISignatureTransfer.PermitTransferFrom memory p = _permit(address(usdg), 2_000_000, 7);
        uint256 validAfter = block.timestamp - 1;
        bytes memory sig = _signWitness(p, X402_PROXY, predicted, validAfter);
        vm.prank(address(0xFAC1));  // facilitator mana pun, tidak perlu tahu AegisClear
        IX402ExactPermit2Proxy(X402_PROXY).settle(p, client, IX402ExactPermit2Proxy.Witness({to: predicted, validAfter: validAfter}), sig);
        assertEq(usdg.balanceOf(predicted), 2_000_000);
        AegisChannel ch = openByClient(c);
        assertEq(address(ch), predicted);
        assertEq(ch.budget(), 2_000_000);
    }

    function test_x402_witness_destination_cannot_be_redirected() public {
        AegisChannel.Config memory c = defaultConfig();
        address predicted = factory.predict(c);
        ISignatureTransfer.PermitTransferFrom memory p = _permit(address(usdg), 2_000_000, 8);
        uint256 validAfter = block.timestamp - 1;
        bytes memory sig = _signWitness(p, X402_PROXY, predicted, validAfter);
        vm.prank(address(0xFAC1));
        vm.expectRevert(); // Permit2: InvalidSigner
        IX402ExactPermit2Proxy(X402_PROXY).settle(p, client, IX402ExactPermit2Proxy.Witness({to: address(0xBAD), validAfter: validAfter}), sig);
    }
}
