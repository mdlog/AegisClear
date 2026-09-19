// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MockUSDG} from "../src/MockUSDG.sol";
import {SLASettlementVerifier} from "../src/SLASettlementVerifier.sol";
import {AegisChannelFactory} from "../src/AegisChannelFactory.sol";
import {SimpleJobEscrow} from "../src/SimpleJobEscrow.sol";

/// Robinhood Chain testnet 46630. ETH uji: faucet.quicknode.com/robinhood/testnet atau faucets.chain.link/robinhood-testnet.
/// forge script script/DeployTestnet.s.sol --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast --private-key $PK \
///   --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
contract DeployTestnet is Script {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function run() external {
        require(block.chainid == 46630, "wrong chain");
        vm.startBroadcast();
        MockUSDG usdg = new MockUSDG();
        SLASettlementVerifier verifier = new SLASettlementVerifier();
        AegisChannelFactory factoryDemo = new AegisChannelFactory(address(verifier), PERMIT2, 60);
        AegisChannelFactory factoryProd = new AegisChannelFactory(address(verifier), PERMIT2, 6 hours);
        SimpleJobEscrow escrow = new SimpleJobEscrow(address(usdg));
        usdg.mint(msg.sender, 1_000e6);
        vm.stopBroadcast();
        string memory j = "deploy";
        vm.serializeAddress(j, "usdg", address(usdg));
        vm.serializeAddress(j, "verifier", address(verifier));
        vm.serializeAddress(j, "factory", address(factoryDemo));
        vm.serializeAddress(j, "factoryProd", address(factoryProd));
        vm.serializeAddress(j, "escrow", address(escrow));
        string memory out = vm.serializeUint(j, "chainId", block.chainid);
        vm.writeJson(out, "deployments/testnet-46630.json");
    }
}
