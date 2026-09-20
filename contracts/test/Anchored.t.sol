// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {stdJson} from "forge-std/StdJson.sol";
import {AegisTestBase, AegisChannel, AegisChannelFactory, Sigs} from "./Base.t.sol";
import {SLASettlementVerifier} from "../src/SLASettlementVerifier.sol";
import {PoseidonPathYul} from "../src/PoseidonPathYul.sol";

contract AnchoredTest is AegisTestBase {
    using stdJson for string;
    AegisChannel ch;
    string fx;
    uint256[] leaves; uint256[] cums; uint256[] roots;

    function setUp() public override {
        super.setUp();
        fx = vm.readFile("test/fixtures/anchored_ex1.json");
        leaves = fx.readUintArray(".leaves"); cums = fx.readUintArray(".cumulative"); roots = fx.readUintArray(".roots");
        ch = openByClientOn(factoryAnchored, defaultConfig());
        fund(ch, 5_000_000);
    }

    function _ack(uint64 s) internal {
        // leafSig(...) itself calls ch.domainSeparator()/ch.hashLeaf() (real STATICCALLs); computed inline as an
        // ack() argument it would consume vm.prank's single-shot next-call before ack() ever dispatches — so it
        // is resolved into a local first, exactly like every other leafSig call site in this file.
        bytes memory sig = leafSig(ch, s, bytes32(leaves[s]), uint128(cums[s]));
        vm.prank(client);
        ch.ack(s, bytes32(leaves[s]), uint128(cums[s]), sig);
    }

    function test_factory_modes() public view {
        assertTrue(ch.ANCHORED()); assertEq(address(ch.POSEIDON()), address(yul));
        assertEq(address(factoryAnchored.POSEIDON()), address(yul));
        assertEq(address(factory.POSEIDON()), address(0));
    }

    function test_ack_three_leaves_matches_fixture_roots() public {
        for (uint64 i; i < 3; i++) {
            vm.expectEmit(false, false, false, true, address(ch));
            emit AegisChannel.Acked(i, bytes32(leaves[i]), uint128(cums[i]), bytes32(roots[i]));
            _ack(i);
            assertEq(ch.receiptsRoot(), bytes32(roots[i]));
            assertEq(ch.seq(), i + 1);
            assertEq(ch.cumulativeAmount(), uint128(cums[i]));
        }
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.OPEN));
    }

    function test_ack_wrong_seq_reverts() public {
        bytes memory sig = leafSig(ch, 1, bytes32(leaves[1]), uint128(cums[1]));
        vm.prank(client);
        vm.expectRevert(AegisChannel.StaleCheckpoint.selector);
        ch.ack(1, bytes32(leaves[1]), uint128(cums[1]), sig);
    }

    function test_ack_only_client() public {
        bytes memory sig = leafSig(ch, 0, bytes32(leaves[0]), uint128(cums[0]));
        vm.prank(provider);
        vm.expectRevert(AegisChannel.NotClient.selector);
        ch.ack(0, bytes32(leaves[0]), uint128(cums[0]), sig);
    }

    function test_ack_bad_provider_signature_reverts() public {
        bytes32 d = Sigs.digest(ch.domainSeparator(), ch.hashLeaf(ch.epoch(), 0, bytes32(leaves[0]), uint128(cums[0])));
        bytes memory sigByClient = Sigs.sign(clientPk, d);
        vm.prank(client);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.ack(0, bytes32(leaves[0]), uint128(cums[0]), sigByClient);
    }

    function test_ack_amount_decrease_reverts() public {
        _ack(0);
        bytes memory sig = leafSig(ch, 1, bytes32(leaves[1]), 10_000);
        vm.prank(client);
        vm.expectRevert(AegisChannel.AmountDecreased.selector);
        ch.ack(1, bytes32(leaves[1]), 10_000, sig);
    }

    function test_ack_after_startClose_reverts() public {
        vm.prank(client); ch.startClose();
        bytes memory sig = leafSig(ch, 0, bytes32(leaves[0]), uint128(cums[0]));
        vm.prank(client);
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.ack(0, bytes32(leaves[0]), uint128(cums[0]), sig);
    }

    function test_submitCheckpoint_in_anchored_reverts_WrongMode() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 1, 20_000, bytes32(uint256(1)));
        vm.expectRevert(AegisChannel.WrongMode.selector);
        ch.submitCheckpoint(1, 20_000, bytes32(uint256(1)), sc, sp);
    }

    function test_ack_and_startClose_in_cosigned_channel_revert_WrongMode() public {
        AegisChannel co = openByClient(defaultConfig());
        bytes memory sig = leafSig(co, 0, bytes32(leaves[0]), uint128(cums[0]));
        vm.prank(client);
        vm.expectRevert(AegisChannel.WrongMode.selector);
        co.ack(0, bytes32(leaves[0]), uint128(cums[0]), sig);
        vm.prank(client);
        vm.expectRevert(AegisChannel.WrongMode.selector);
        co.startClose();
    }

    function test_startClose_only_party_and_only_open() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(AegisChannel.NotParty.selector);
        ch.startClose();
        _ack(0);
        vm.expectEmit(true, false, false, true, address(ch));
        emit AegisChannel.CloseStarted(provider, 1, uint128(cums[0]), bytes32(roots[0]), uint64(block.timestamp) + 120);
        vm.prank(provider); ch.startClose();
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.CLOSING));
        assertEq(ch.deadline(), block.timestamp + 120);
        vm.prank(client);
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.startClose();
    }

    function test_startClose_then_settle_without_proof_pays_cumulative() public {
        _ack(0); _ack(1);
        vm.prank(client); ch.startClose();
        vm.warp(block.timestamp + 121);
        uint256 p0 = usdg.balanceOf(provider); uint256 c0 = usdg.balanceOf(client);
        ch.settle();
        assertEq(usdg.balanceOf(provider) - p0, 40_000);
        assertEq(usdg.balanceOf(client) - c0, 4_960_000);
    }

    function test_rollover_resets_tree() public {
        _ack(0); _ack(1);
        (bytes memory rc, bytes memory rp) = rolloverSigs(ch, 2, uint128(cums[1]));
        ch.rollover(2, uint128(cums[1]), rc, rp);
        assertEq(ch.epoch(), 1); assertEq(ch.seq(), 0); assertEq(ch.receiptsRoot(), bytes32(0));
        // M8 (final-fix brief) — komentar diperjelas: loop `vm.load` DI BAWAH INI adalah assersi yang
        // DISKRIMINATIF, bukan `receiptsRoot() == bytes32(0)` di atas. `receiptsRoot` kebetulan nol tidak
        // membuktikan `filledSubtrees` (state incremental-tree per-epoch) benar-benar ter-reset — bisa saja
        // nol untuk alasan lain. `vm.load` membaca storage slot `filledSubtrees` LANGSUNG. `forge inspect
        // AegisChannel storage-layout` melaporkan slot 0..6 (bukan 1..7 seperti dugaan awal brief —
        // ReentrancyGuard OZ v5.5 di sini memakai slot namespaced/pseudo-random di luar layout sekuensial
        // biasa, jadi TIDAK menggeser slot AegisChannel; filledSubtrees mulai langsung di slot 0).
        for (uint256 slot; slot < 7; slot++) {
            assertEq(vm.load(address(ch), bytes32(slot)), bytes32(0));
        }
        _ack(0);                                       // leafSig membaca epoch() = 1
        assertEq(ch.receiptsRoot(), bytes32(roots[0]));  // pohon benar-benar kosong sebelum ack ini
        // M8: bukti end-to-end TAMBAHAN — ack seq 1 juga di epoch baru dan cocokkan dengan `roots[1]`,
        // fixture yang SAMA dipakai tree yang benar-benar baru dari nol (lihat
        // test_ack_three_leaves_matches_fixture_roots). Bila `filledSubtrees` TIDAK benar-benar ter-reset
        // (mis. sisa insertPath dari 2 ack epoch 0 lolos lewat entah bagaimana), root KEDUA ini akan
        // menyimpang dari `roots[1]` walau root pertama (`roots[0]`) kebetulan masih cocok — dua titik data
        // berurutan jauh lebih sulit lolos secara kebetulan dibanding satu.
        _ack(1);
        assertEq(ch.receiptsRoot(), bytes32(roots[1]));
    }

    /// Task 8 Step 3d(i): ack() menolak seq_ == MAX_SEQ (128) dengan SeqTooLarge — 128 acks berturut-turut
    /// (leaf fixture dipakai berputar; cumulativeAmount_ dijaga tak pernah turun) mengisi seq sampai 128 persis,
    /// lalu ack ke-129 (seq_ == 128) harus revert.
    function test_ack_seq_128_reverts_SeqTooLarge() public {
        uint128 amt;
        for (uint64 i; i < 128; i++) {
            uint256 idx = i % leaves.length;
            uint128 candidate = uint128(cums[idx]);
            if (candidate > amt) amt = candidate;
            bytes memory sig = leafSig(ch, i, bytes32(leaves[idx]), amt);
            vm.prank(client);
            ch.ack(i, bytes32(leaves[idx]), amt, sig);
        }
        assertEq(ch.seq(), 128);
        bytes memory sig128 = leafSig(ch, 128, bytes32(leaves[0]), amt);
        vm.prank(client);
        vm.expectRevert(AegisChannel.SeqTooLarge.selector);
        ch.ack(128, bytes32(leaves[0]), amt, sig128);
    }

    /// Task 8 Step 3d(i): Leaf ditandatangani atas epoch 0 tidak sah lagi setelah rollover menaikkan epoch — sinyal
    /// FR-10 yang sama dengan Checkpoint/Close, kini untuk ack() anchored.
    function test_old_epoch_leaf_signature_rejected_after_rollover() public {
        bytes memory staleSig = leafSig(ch, 0, bytes32(leaves[0]), uint128(cums[0]));  // ditandatangani epoch 0
        (bytes memory rc, bytes memory rp) = rolloverSigs(ch, 0, 0);
        ch.rollover(0, 0, rc, rp);                                                      // epoch -> 1; seq tetap 0
        assertEq(ch.epoch(), 1); assertEq(ch.seq(), 0);
        vm.prank(client);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.ack(0, bytes32(leaves[0]), uint128(cums[0]), staleSig);
    }

    /// Task 8 Step 3d(i): cumulativeAmount_ SAMA dengan cumulativeAmount saat ini (tidak turun, tidak naik) sah —
    /// hanya penurunan yang ditolak (AmountDecreased memakai `<`, bukan `<=`).
    function test_ack_equal_amount_allowed() public {
        _ack(0);
        uint128 sameAmt = ch.cumulativeAmount();
        bytes memory sig = leafSig(ch, 1, bytes32(leaves[1]), sameAmt);
        vm.prank(client);
        ch.ack(1, bytes32(leaves[1]), sameAmt, sig);
        assertEq(ch.cumulativeAmount(), sameAmt);
        assertEq(ch.seq(), 2);
    }

    function test_close_cooperative_in_anchored() public {
        _ack(0); _ack(1);
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 2, uint128(cums[1]));
        uint256 p0 = usdg.balanceOf(provider);
        ch.closeCooperative(2, uint128(cums[1]), sc, sp);
        assertEq(usdg.balanceOf(provider) - p0, 40_000);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.SETTLED));
    }

    function test_ack_gas_report() public {
        uint256 g0 = gasleft();
        _ack(0);
        emit log_named_uint("ack (Yul path, first leaf) gas", g0 - gasleft());
    }
}

/// @dev Jalur sengketa anchored dengan bukti Groth16 ASLI (FFI prove.ts, seperti Penalty.t.sol): 100 ack EX1 satu per satu →
///      startClose → claimPenalty(70.000) → settle → pembagian identik dengan mode co-signed.
contract AnchoredPenaltyTest is AegisTestBase {
    using stdJson for string;
    AegisChannel ch;
    uint256[8] proof; uint256[6] inputs;
    uint256[] leaves; uint256[] cums;

    function _cmd(bool termsOnly, address channel) internal pure returns (string[] memory cmd) {
        cmd = new string[](termsOnly ? 6 : 7);
        cmd[0] = "npx"; cmd[1] = "tsx"; cmd[2] = "../circuits/scripts/prove.ts";
        cmd[3] = "--vector"; cmd[4] = "EX1_7_latency_breaches";
        if (termsOnly) { cmd[5] = "--terms-only"; } else { cmd[5] = "--channel"; cmd[6] = vm.toString(channel); }
    }

    function setUp() public override {
        super.setUp();
        string memory fx = vm.readFile("test/fixtures/anchored_ex1.json");
        leaves = fx.readUintArray(".leaves"); cums = fx.readUintArray(".cumulative");
        SLASettlementVerifier realVerifier = new SLASettlementVerifier();
        AegisChannelFactory realFactory = new AegisChannelFactory(address(realVerifier), PERMIT2, 60, address(yul));
        AegisChannel.Config memory c = defaultConfig();
        c.termsCommitment = bytes32(abi.decode(vm.ffi(_cmd(true, address(0))), (uint256)));
        assertEq(uint256(c.termsCommitment), fx.readUint(".termsCommitment"));
        ch = openByClientOn(realFactory, c);
        fund(ch, 5_000_000);
        (proof, inputs) = abi.decode(vm.ffi(_cmd(false, address(ch))), (uint256[8], uint256[6]));
    }

    function test_100_acks_then_dispute_with_real_proof() public {
        for (uint64 i; i < 100; i++) {
            // see _ack() in AnchoredTest: leafSig must be resolved before vm.prank, or its internal
            // ch.domainSeparator()/ch.hashLeaf() staticcalls consume the single-shot prank first.
            bytes memory sig = leafSig(ch, i, bytes32(leaves[i]), uint128(cums[i]));
            vm.prank(client);
            ch.ack(i, bytes32(leaves[i]), uint128(cums[i]), sig);
        }
        assertEq(uint256(ch.receiptsRoot()), inputs[2]);    // R on-chain == R yang dibuktikan
        assertEq(ch.seq(), 100); assertEq(ch.cumulativeAmount(), 2_000_000);
        vm.prank(client); ch.startClose();
        vm.prank(provider); ch.claimPenalty(proof, 70_000);
        assertTrue(ch.hasProof());
        vm.warp(block.timestamp + 121);
        uint256 c0 = usdg.balanceOf(client); uint256 p0 = usdg.balanceOf(provider);
        ch.settle();
        assertEq(usdg.balanceOf(provider) - p0, 1_930_000);
        assertEq(usdg.balanceOf(client) - c0, 3_070_000);
    }
}
