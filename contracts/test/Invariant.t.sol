// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";
import {MockUSDG} from "../src/MockUSDG.sol";

contract Handler is Test {
    AegisChannel public ch;
    MockUSDG usdg;
    uint256 clientPk; uint256 providerPk; address client; address provider;

    uint256 public totalFunded;
    uint256 public settledBudget;
    uint256 public paidProvider;
    uint256 public paidClient;
    uint256 public penaltyAtSettle;
    uint128 public amountAtSettle;
    bool public settled;
    bool public cooperative;
    /// Task 8 Step 3b: seluruh dana yang PERNAH keluar channel (rollover ke provider + payout settle/close akhir)
    /// — lintas epoch, bukan hanya event terminal — supaya balance conservation tetap teruji setelah rollover.
    uint256 public totalPaidOut;

    constructor(AegisChannel _ch, MockUSDG _usdg, uint256 _cpk, uint256 _ppk, address _c, address _p) {
        ch = _ch; usdg = _usdg; clientPk = _cpk; providerPk = _ppk; client = _c; provider = _p;
    }

    function _cpSigs(uint64 s, uint128 a, bytes32 r) internal view returns (bytes memory, bytes memory) {
        bytes32 d = Sigs.digest(ch.domainSeparator(), ch.hashCheckpoint(ch.epoch(), s, a, r));
        return (Sigs.sign(clientPk, d), Sigs.sign(providerPk, d));
    }

    function fund(uint96 amt) external {
        if (settled) return;
        amt = uint96(bound(amt, 0, 10e6));
        usdg.mint(address(ch), amt);
        totalFunded += amt;
    }

    function checkpoint(uint8 s, uint96 a) external {
        if (settled) return;
        uint64 seq_ = uint64(bound(s, 0, 128));
        uint128 a_ = uint128(bound(a, 0, 20e6));
        if (ch.state() == AegisChannel.State.CLOSING && seq_ <= ch.seq()) return;
        (bytes memory sc, bytes memory sp) = _cpSigs(seq_, a_, bytes32(uint256(seq_) + 1));
        ch.submitCheckpoint(seq_, a_, bytes32(uint256(seq_) + 1), sc, sp);
    }

    function claim(uint96 pc) external {
        if (settled || ch.state() != AegisChannel.State.CLOSING) return;
        uint128 pc_ = uint128(bound(pc, 0, ch.cumulativeAmount()));
        uint256[8] memory dummy;
        vm.prank(client);
        ch.claimPenalty(dummy, pc_);   // MockVerifier(true)
    }

    function warpAndSettle() external {
        if (settled || ch.state() != AegisChannel.State.CLOSING) return;
        vm.warp(ch.deadline());
        penaltyAtSettle = (ch.hasProof() && ch.proofSeq() == ch.seq()) ? ch.payToClient() : 0;
        amountAtSettle = ch.cumulativeAmount();
        settledBudget = usdg.balanceOf(address(ch));
        uint256 p0 = usdg.balanceOf(provider); uint256 c0 = usdg.balanceOf(client);
        ch.settle();
        paidProvider = usdg.balanceOf(provider) - p0;
        paidClient = usdg.balanceOf(client) - c0;
        totalPaidOut += paidProvider + paidClient;
        settled = true;
    }

    function closeCoop(uint96 toProv) external {
        if (settled) return;
        uint128 tp = uint128(bound(toProv, 0, usdg.balanceOf(address(ch))));
        uint64 s = ch.seq();
        bytes32 d = Sigs.digest(ch.domainSeparator(), ch.hashClose(ch.epoch(), s, tp));
        settledBudget = usdg.balanceOf(address(ch));
        uint256 p0 = usdg.balanceOf(provider); uint256 c0 = usdg.balanceOf(client);
        ch.closeCooperative(s, tp, Sigs.sign(clientPk, d), Sigs.sign(providerPk, d));
        paidProvider = usdg.balanceOf(provider) - p0;
        paidClient = usdg.balanceOf(client) - c0;
        totalPaidOut += paidProvider + paidClient;
        settled = true; cooperative = true;
    }

    /// Task 8 Step 3b (Task 1 review carry-over): rollover kooperatif — lets the invariant fuzzer cross epochs.
    /// Bounded so it never reverts: seq_ in [ch.seq(), MAX_SEQ], toProvider in [0, budget].
    function rollover(uint64 seq_, uint128 toProvider) external {
        if (settled) return;
        uint64 s = uint64(bound(seq_, ch.seq(), 128));
        uint128 tp = uint128(bound(toProvider, 0, ch.budget()));
        bytes32 d = Sigs.digest(ch.domainSeparator(), ch.hashRollover(ch.epoch(), s, tp));
        ch.rollover(s, tp, Sigs.sign(clientPk, d), Sigs.sign(providerPk, d));
        totalPaidOut += tp;
    }
}

contract InvariantTest is AegisTestBase {
    Handler h;

    function setUp() public override {
        super.setUp();
        AegisChannel ch = openByClient(defaultConfig());
        h = new Handler(ch, usdg, clientPk, providerPk, client, provider);
        targetContract(address(h));
    }

    /// INV-9 diperluas lintas epoch (Task 8 Step 3b): saldo channel + seluruh yang PERNAH keluar (rollover ke
    /// provider maupun payout settle/close akhir) == seluruh yang pernah didanai. Sebelum Step 3b ini dulunya
    /// "tidak ada outflow sebelum SETTLED"; itu tidak lagi benar sejak rollover bisa membayar provider tanpa
    /// men-settle — bentuk konservasi yang berlaku sebelum MAUPUN sesudah SETTLED adalah persamaan saldo ini.
    function invariant_balance_conservation() public view {
        assertEq(usdg.balanceOf(address(h.ch())) + h.totalPaidOut(), h.totalFunded());
    }

    /// INV-1: konservasi saat settle (snapshot lokal event terminal; tidak terpengaruh rollover sebelumnya
    /// karena _payout selalu mengirim SELURUH budget epoch saat ini ke provider+klien).
    function invariant_conservation_at_settle() public view {
        if (h.settled()) assertEq(h.paidProvider() + h.paidClient(), h.settledBudget());
    }

    /// INV-5: batas provider pada jalur jendela
    function invariant_provider_bounds() public view {
        if (h.settled() && !h.cooperative()) {
            uint256 owed = uint256(h.amountAtSettle()) - h.penaltyAtSettle();
            uint256 expected = owed < h.settledBudget() ? owed : h.settledBudget();
            assertEq(h.paidProvider(), expected);
        }
    }

    /// Task 8 Step 3b: state selalu salah satu dari OPEN/CLOSING/SETTLED setelah open() — rollover membawa
    /// CLOSING kembali ke OPEN, tetapi UNINIT tidak pernah boleh terlihat lagi.
    function invariant_state_in_valid_range() public view {
        AegisChannel.State s = h.ch().state();
        assertTrue(s == AegisChannel.State.OPEN || s == AegisChannel.State.CLOSING || s == AegisChannel.State.SETTLED);
    }

    /// Task 8 Step 3b: setelah SETTLED, tidak ada lagi yang berubah — state tetap SETTLED dan saldo channel beku
    /// (Handler sendiri sudah menolak semua aksi lain begitu `settled`; invariant ini menguji itu benar-benar berlaku).
    bool sawSettled;
    uint256 balanceAtFirstSettle;
    function invariant_settled_is_terminal() public {
        if (!h.settled()) return;
        assertEq(uint8(h.ch().state()), uint8(AegisChannel.State.SETTLED));
        if (!sawSettled) {
            sawSettled = true;
            balanceAtFirstSettle = usdg.balanceOf(address(h.ch()));
        } else {
            assertEq(usdg.balanceOf(address(h.ch())), balanceAtFirstSettle);
        }
    }

    /// INV-2, per epoch (Task 8 Step 3b): seq tidak pernah turun SELAMA epoch tidak berubah — rollover me-reset
    /// epoch DAN seq bersamaan (FR-10), jadi monotonicity global tidak lagi berlaku lintas rollover secara desain.
    uint32 lastEpoch;
    uint64 lastSeq;
    function invariant_seq_monotonic_within_epoch() public {
        if (h.ch().epoch() == lastEpoch) assertGe(h.ch().seq(), lastSeq);
        lastEpoch = h.ch().epoch();
        lastSeq = h.ch().seq();
    }
}

contract SettleFuzzTest is AegisTestBase {
    function testFuzz_settle_split(uint96 budget_, uint96 amount, uint96 pen) public {
        budget_ = uint96(bound(budget_, 0, 50e6)); amount = uint96(bound(amount, 0, 50e6)); pen = uint96(bound(pen, 0, amount));
        AegisChannel ch = openByClient(defaultConfig());
        usdg.mint(address(ch), budget_);
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 1, amount, bytes32(uint256(1)));
        ch.submitCheckpoint(1, amount, bytes32(uint256(1)), sc, sp);
        uint256[8] memory dummy;
        vm.prank(client); ch.claimPenalty(dummy, pen);
        vm.warp(block.timestamp + 120);
        uint256 p0 = usdg.balanceOf(provider); uint256 c0 = usdg.balanceOf(client);
        ch.settle();
        uint256 owed = uint256(amount) - pen;
        uint256 exp = owed < budget_ ? owed : budget_;
        assertEq(usdg.balanceOf(provider) - p0, exp);
        assertEq(usdg.balanceOf(client) - c0, uint256(budget_) - exp);
    }
}
