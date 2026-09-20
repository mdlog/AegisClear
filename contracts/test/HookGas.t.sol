// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel} from "./Base.t.sol";
import {AegisTreasuryRouter} from "../src/AegisTreasuryRouter.sol";
import {HeavyToken} from "./mocks/HeavyToken.sol";
import {GasProbePayout} from "./mocks/GasProbePayout.sol";
import {NeedyPayout} from "./mocks/NeedyPayout.sol";

/// Audit 2026-09 M-1 (docs/audit/slither-2026-09.md): stipend hook `{gas: HOOK_GAS}` hanya batas atas (EIP-150:
/// callee menerima min(HOOK_GAS, 63/64 sisa)). Sebelum perbaikan, pemanggil permissionless `sweep()` bisa memilih gas
/// limit sehingga hook router (biaya ~227k-300k) kehabisan gas sementara sweep selesai → token mendarat di router
/// tanpa atribusi → siapa pun mengambilnya lewat onPayout(). Test di sini memakai HeavyToken(900) (hook ≈ 258k,
/// biaya komputasi murni supaya tidak bergantung warm/cold storage Foundry); sebelum perbaikan test pertama gagal
/// pada gas limit ≈ 458k.
contract HookGasTest is AegisTestBase {
    AegisTreasuryRouter router;
    address attacker = address(0xA77);
    uint256 constant HOOK_GAS = 300_000; // = AegisChannel.HOOK_GAS (private)

    function setUp() public override { super.setUp(); router = new AegisTreasuryRouter(); }

    function _heavyChannel(uint256 iters, bool clientRouter, bool providerRouter) internal returns (AegisChannel ch, HeavyToken tok) {
        tok = new HeavyToken(iters);
        tok.mint(client, 100e6);
        AegisChannel.Config memory c = defaultConfig();
        c.token = address(tok);
        if (clientRouter) c.payoutClient = address(router);
        if (providerRouter) c.payoutProvider = address(router);
        ch = openByClient(c);
        vm.prank(client); tok.transfer(address(ch), 5_000_000);
    }

    /// Untuk SETIAP gas limit: sweep gagal, ATAU sweep sukses DAN hook router sudah meneruskan (saldo router 0).
    /// Keadaan "sweep sukses tapi 250k nyangkut di router" tidak boleh pernah terjadi.
    function test_sweep_caller_cannot_starve_router_hook() public {
        (AegisChannel ch, HeavyToken tok) = _heavyChannel(900, true, false);
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 1, 1_000_000);
        ch.closeCooperative(1, 1_000_000, sc, sp);
        vm.prank(client); tok.transfer(address(ch), 250_000);          // dana telat → sweep
        uint256 successes;
        for (uint256 g = 380_000; g < 640_000; g += 400) {
            uint256 snap = vm.snapshotState();
            vm.prank(attacker);
            (bool ok,) = address(ch).call{gas: g}(abi.encodeCall(ch.sweep, ()));
            if (ok) {
                successes++;
                assertEq(tok.balanceOf(address(ch)), 0, "swept");
                assertEq(tok.balanceOf(address(router)), 0, "hook starved: funds stranded in router");
                assertEq(tok.balanceOf(client), 100e6 - 5_250_000 + 4_000_000 + 250_000, "client got late funds");
            }
            vm.revertToState(snap);
        }
        assertGt(successes, 0, "range must contain successful sweeps");
    }

    /// Jalur _payout (settle, toClient == 0 sehingga hanya kaki provider + 3 event setelah hook).
    function test_settle_caller_cannot_starve_router_hook() public {
        (AegisChannel ch, HeavyToken tok) = _heavyChannel(900, false, true);
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 10, 5_000_000, bytes32(uint256(1)));
        ch.submitCheckpoint(10, 5_000_000, bytes32(uint256(1)), sc, sp);
        vm.warp(block.timestamp + 121);
        uint256 successes;
        for (uint256 g = 380_000; g < 640_000; g += 800) {
            uint256 snap = vm.snapshotState();
            vm.prank(attacker);
            (bool ok,) = address(ch).call{gas: g}(abi.encodeCall(ch.settle, ()));
            if (ok) {
                successes++;
                assertEq(tok.balanceOf(address(router)), 0, "hook starved: funds stranded in router");
                assertEq(tok.balanceOf(provider), 5_000_000, "provider paid via router");
            }
            vm.revertToState(snap);
        }
        assertGt(successes, 0, "range must contain successful settles");
    }

    /// Pemanggil pelit: hook membakar 63/64 sisa, gasleft() < HOOK_GAS/63 → InsufficientGas (bukan sukses diam-diam).
    function test_starved_hook_reverts_InsufficientGas() public {
        GasProbePayout probe = new GasProbePayout();
        probe.setBurn(true);
        AegisChannel.Config memory c = defaultConfig();
        c.payoutClient = address(probe);
        AegisChannel ch = openByClient(c);
        fund(ch, 5_000_000);
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 1, 5_000_000);
        ch.closeCooperative(1, 5_000_000, sc, sp);                      // toClient = 0: hook belum pernah dipanggil
        fund(ch, 250_000);
        vm.prank(attacker);
        (bool ok, bytes memory ret) = address(ch).call{gas: 200_000}(abi.encodeCall(ch.sweep, ()));
        assertFalse(ok);
        assertEq(ret.length, 4);
        assertEq(bytes4(ret), AegisChannel.InsufficientGas.selector);
        assertEq(usdg.balanceOf(address(ch)), 250_000, "reverted: nothing moved");
        vm.prank(attacker);
        ch.sweep();                                                     // gas cukup → sukses walau hook membakar stipend
        assertEq(usdg.balanceOf(address(probe)), 250_000);
    }

    /// Hook sah yang butuh ~290k dari stipend 300k: untuk SETIAP gas limit, sweep sukses ⟹ hook terlayani.
    /// Sebelum perbaikan ada jendela ~70k gas limit di mana sweep sukses tetapi hook kehabisan gas.
    function test_hook_needing_full_stipend_is_never_starved() public {
        NeedyPayout needy = new NeedyPayout(1150);
        AegisChannel.Config memory c = defaultConfig();
        c.payoutClient = address(needy);
        AegisChannel ch = openByClient(c);
        fund(ch, 5_000_000);
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 1, 5_000_000);
        ch.closeCooperative(1, 5_000_000, sc, sp);
        fund(ch, 250_000);
        {   // kalibrasi: biaya hook harus di dalam stipend tetapi mendekatinya (test tidak boleh hampa)
            uint256 snap = vm.snapshotState();
            uint256 g0 = gasleft();
            needy.onPayout(client, address(usdg), 250_000);
            uint256 cost = g0 - gasleft();
            emit log_named_uint("needy hook cost", cost);
            assertGt(cost, 250_000); assertLt(cost, HOOK_GAS - 2_000);
            vm.revertToState(snap);
        }
        uint256 successes;
        for (uint256 g = 280_000; g < 440_000; g += 200) {
            uint256 snap = vm.snapshotState();
            vm.prank(attacker);
            (bool ok,) = address(ch).call{gas: g}(abi.encodeCall(ch.sweep, ()));
            if (ok) {
                successes++;
                assertEq(needy.served(), 1, "sweep succeeded but hook was starved");
            }
            vm.revertToState(snap);
        }
        assertGt(successes, 0, "range must contain successful sweeps");
    }

    /// Payee EOA: tidak ada hook, tidak ada syarat gas tambahan.
    function test_eoa_payee_has_no_stipend_requirement() public {
        AegisChannel ch = openByClient(defaultConfig());
        fund(ch, 5_000_000);
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 1, 5_000_000);
        ch.closeCooperative(1, 5_000_000, sc, sp);
        fund(ch, 250_000);
        vm.prank(attacker);
        (bool ok,) = address(ch).call{gas: 120_000}(abi.encodeCall(ch.sweep, ()));
        assertTrue(ok);
        assertEq(usdg.balanceOf(client), 100e6 - 5_250_000 + 250_000);
    }
}
