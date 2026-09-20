// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockUSDG} from "../src/MockUSDG.sol";
import {SLASettlementVerifier} from "../src/SLASettlementVerifier.sol";
import {AegisChannelFactory} from "../src/AegisChannelFactory.sol";
import {SimpleJobEscrow} from "../src/SimpleJobEscrow.sol";
import {AegisTreasuryRouter} from "../src/AegisTreasuryRouter.sol";
import {PoseidonPathYul} from "../src/PoseidonPathYul.sol";
import {IPoseidonPath} from "../src/interfaces/IPoseidonPath.sol";

/// @dev Precompile ArbSys (0x64) — nomor blok L2 asli di Arbitrum/Robinhood Chain (Orbit). Di luar Arbitrum
///      (mis. fork lokal) panggilan gagal dan run() jatuh ke block.number.
interface IArbSys { function arbBlockNumber() external view returns (uint256); }

/// Robinhood Chain testnet 46630. ETH uji: faucet.quicknode.com/robinhood/testnet atau faucets.chain.link/robinhood-testnet.
/// forge script script/DeployTestnet.s.sol --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast --private-key $PK \
///   --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
contract DeployTestnet is Script {
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant ARB_SYS = 0x0000000000000000000000000000000000000064;

    function run() external {
        require(block.chainid == 46630, "wrong chain");
        // POSEIDON_STYLUS = alamat program Stylus AegisPoseidon (FR-25) bila sudah di-deploy di Robinhood Chain;
        // kosong → Rencana B: PoseidonPathYul (Solidity/Yul, keluaran identik, lebih mahal gas).
        address poseidon = vm.envOr("POSEIDON_STYLUS", address(0));
        vm.startBroadcast();
        MockUSDG usdg = new MockUSDG();
        SLASettlementVerifier verifier = new SLASettlementVerifier();
        AegisChannelFactory factoryDemo = new AegisChannelFactory(address(verifier), PERMIT2, 60, address(0));
        AegisChannelFactory factoryProd = new AegisChannelFactory(address(verifier), PERMIT2, 6 hours, address(0));
        if (poseidon == address(0)) {
            poseidon = address(new PoseidonPathYul());
            console.log("POSEIDON_STYLUS not set - deployed PoseidonPathYul (Plan B) at", poseidon);
        }
        // Known-answer check (Task 8 Step 3d-ii): hash2(1,2) circomlib v1 t=3 — jalan untuk KEDUANYA, override
        // Stylus (POSEIDON_STYLUS di-set) maupun fallback Yul di atas; salah wiring/deploy Poseidon gagal jelas
        // di sini, bukan diam-diam menghasilkan root yang salah di factoryAnchored.
        require(
            IPoseidonPath(poseidon).hash2(1, 2)
                == 7853200120776062878684798364095072458815029376092732009249414926327459813530,
            "POSEIDON_STYLUS: wrong Poseidon"
        );
        AegisChannelFactory factoryAnchored = new AegisChannelFactory(address(verifier), PERMIT2, 60, poseidon);
        SimpleJobEscrow escrow = new SimpleJobEscrow(address(usdg));
        AegisTreasuryRouter router = new AegisTreasuryRouter();
        usdg.mint(msg.sender, 1_000e6);
        vm.stopBroadcast();
        // Task 8 Step 3d(ii): staticcall + guard panjang balasan menggantikan try/catch — ArbSys ada di alamat
        // presisi tetap di setiap chain (juga di luar Arbitrum, mis. anvil fork lokal) tetapi TIDAK selalu
        // mengembalikan data yang bisa didekode; try/catch sebelumnya cukup untuk revert langsung, tidak untuk
        // balasan pendek/aneh dari precompile yang tidak ada.
        (bool ok, bytes memory ret) = ARB_SYS.staticcall(abi.encodeCall(IArbSys.arbBlockNumber, ()));
        uint256 deployBlock = (ok && ret.length == 32) ? abi.decode(ret, (uint256)) : block.number;
        string memory j = "deploy";
        vm.serializeAddress(j, "usdg", address(usdg));
        vm.serializeAddress(j, "verifier", address(verifier));
        vm.serializeAddress(j, "factory", address(factoryDemo));
        vm.serializeAddress(j, "factoryProd", address(factoryProd));
        vm.serializeAddress(j, "poseidon", poseidon);
        vm.serializeAddress(j, "factoryAnchored", address(factoryAnchored));
        vm.serializeAddress(j, "escrow", address(escrow));
        vm.serializeAddress(j, "router", address(router));
        vm.serializeUint(j, "chainId", block.chainid);
        string memory out = vm.serializeUint(j, "deployBlock", deployBlock);
        vm.writeJson(out, "deployments/testnet-46630.json");
    }
}
