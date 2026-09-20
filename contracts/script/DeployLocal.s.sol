// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MockUSDG} from "../src/MockUSDG.sol";
import {SLASettlementVerifier} from "../src/SLASettlementVerifier.sol";
import {AegisChannelFactory} from "../src/AegisChannelFactory.sol";
import {SimpleJobEscrow} from "../src/SimpleJobEscrow.sol";
import {AegisTreasuryRouter} from "../src/AegisTreasuryRouter.sol";

/// forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
///   --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
contract DeployLocal is Script {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant CLIENT_A = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // anvil #1
    address constant CLIENT_B = 0x90F79bf6EB2c4f870365E785982E1f101E93b906; // anvil #3
    address constant CLIENT_D = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65; // anvil #4 — dipakai sdk/test/integration.test.ts
    address constant CLIENT_C = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc; // anvil #5 — dipakai sdk/test/integration.test.ts

    function run() external {
        vm.startBroadcast();
        MockUSDG usdg = new MockUSDG();
        SLASettlementVerifier verifier = new SLASettlementVerifier();
        AegisChannelFactory factory = new AegisChannelFactory(address(verifier), PERMIT2, 60); // factory demo (D5)
        SimpleJobEscrow escrow = new SimpleJobEscrow(address(usdg));
        AegisTreasuryRouter router = new AegisTreasuryRouter();
        usdg.mint(CLIENT_A, 100e6);
        usdg.mint(CLIENT_B, 100e6);
        usdg.mint(CLIENT_C, 100e6);
        usdg.mint(CLIENT_D, 100e6);
        vm.stopBroadcast();
        string memory j = "deploy";
        vm.serializeAddress(j, "usdg", address(usdg));
        vm.serializeAddress(j, "verifier", address(verifier));
        vm.serializeAddress(j, "factory", address(factory));
        vm.serializeAddress(j, "escrow", address(escrow));
        vm.serializeAddress(j, "router", address(router));
        string memory out = vm.serializeUint(j, "chainId", block.chainid);
        vm.writeJson(out, "deployments/local.json");
    }
}
