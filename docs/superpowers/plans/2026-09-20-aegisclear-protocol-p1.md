# AegisClear Protocol P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three P1 protocol features from the spec on top of the P0 channel: epoch-scoped signatures + cooperative `rollover` (FR-10), `AegisTreasuryRouter` with a best-effort payout hook (FR-26), and anchored mode with on-chain Poseidon (Stylus program on Robinhood Chain, Yul twin for Foundry/Anvil) (FR-25) — plus the SDK/provider/client flows and Anvil integration scenarios for each.

**Architecture:** One `AegisChannel` implementation serves both modes: a factory deployed with `poseidonPath == 0` is co-signed (P0 behaviour), one deployed with a Poseidon path contract is anchored (`ack` + `startClose` instead of `submitCheckpoint`). Every signed message gains a `uint32 epoch` so `rollover` cannot be replayed. Payouts go through `_send`, which calls an optional `onPayout` hook on contract payees inside `try/catch`. The Stylus program `AegisPoseidon` (circomlib Poseidon v1, t=3) and `PoseidonPathYul` implement the same `IPoseidonPath` interface and are cross-checked against one fixture generated from the SDK.

**Tech Stack:** Foundry 1.5.1 / solc 0.8.28 (cancun), OpenZeppelin v5.7.0, poseidon-solidity v0.0.5 (submodule), TypeScript SDK (viem 2.56, Hono 4, vitest), circomlibjs 0.1.7, Rust 1.92 + stylus-sdk 0.10.9 + ark-ff/ark-bn254 0.5, cargo-stylus.

**Spec:** `docs/superpowers/specs/2026-09-20-aegisclear-p1-design.md` §B (B.1–B.5). Parent spec: `prd-arsitektur.md` §6.2, §8.1, §8.3, §8.4, §13.

## Global Constraints

- Circuit, zkey, `SLASettlementVerifier.sol` and the proof public inputs `[channelIdField, T, R, seq, A, payToClient]` are frozen. `ChannelTerms` typehash, `Config`, factory `salt`/`predict` are frozen (channel addresses and T19 unchanged).
- New EIP-712 structs (exact strings): `Checkpoint(uint32 epoch,uint64 seq,uint128 cumulativeAmount,bytes32 receiptsRoot)`, `Close(uint32 epoch,uint64 seq,uint128 toProvider)`, `Rollover(uint32 epoch,uint64 seq,uint128 toProvider)`, `Leaf(uint32 epoch,uint64 seq,bytes32 leaf,uint128 cumulativeAmount)`. Domain unchanged (`AegisClear`, `1`, chainId, channel).
- Poseidon everywhere = circomlib Poseidon **v1** (D3). Vectors: `poseidon(1,2) = 7853200120776062878684798364095072458815029376092732009249414926327459813530`; zero subtrees `zeros[0..7]` = `0`, `14744269619966411208579211824598458697587494354926760081771325075741142829156`, `7423237065226347324353380772367382631490014989348495481811164164159255474657`, `11286972368698509976183087595462810875513684078608517520839298933882497716792`, `3607627140608796879659380071776844901612302623152076817094415224584923813162`, `19712377064642672829441595136074946683621277828620209496774504837737984048981`, `20775607673010627194014556968476266066927294572720319469184847051418138353016`, `3396914609616007258851405644437304192397291162432396347162513310381425243293` (= `merkleRoot([])`, the empty root).
- EX1 vector (`vectors/EX1_7_latency_breaches.json`): T = `10447700350088281559137459452510020886916474580304116699188002044057610786406`; 100 receipts, due 20 000 each, A = 2 000 000, payToClient = 70 000; roots after 1/2/3/100 inserts = `8867972900015110853220544640232097790621643464826894219536805239310374416705`, `16559330790100715518300826130979113268665135143881484837525464896222103150451`, `12839636037049993912134068360534405049057970034406270699098987504988146663141`, `11741125459848829621133978959988136619675858357344169374224847804543560466517`.
- `MAX_SEQ = 128`, `DEPTH = 7`, index of a leaf = its `seq`, empty leaf = 0, node = Poseidon(left, right).
- Tests: Foundry `cd contracts && forge test` (63 today + new), SDK `RPC_URL=http://127.0.0.1:8547 pnpm test:sdk` against a private Anvil on **8547** with `DeployLocal` (never 8545), circuits `pnpm test:circuits`, web `RPC_URL=… pnpm test:web`. Ports for new provider instances in tests: **4027** (anchored), **4028** (rollover/router) — never 4020/4023/4024/4026/4041 (used by the SDK suite), 4031, 4040, 4042, 4043.
- Between Task 1 (contract typed data) and Task 2 (SDK typed data) the SDK integration suite is expected to be red — Task 2 makes it green again; every other task leaves all suites green.
- Never print or commit private keys. `.env` holds real testnet keys — only Task 9 (controller) touches testnet.
- Commit messages: plain, no AI attribution trailers.
- Stylus builds: `CARGO_TARGET_DIR=/tmp/aegis-stylus-target` (home partition is nearly full).

## File Structure

```
contracts/src/AegisChannel.sol            epoch, rollover, _send + hook, ANCHORED/POSEIDON, ack, startClose, filledSubtrees
contracts/src/AegisChannelFactory.sol     + poseidonPath ctor arg, POSEIDON immutable, AlreadyOpen pre-check
contracts/src/AegisTreasuryRouter.sol     FR-26 (hook + credit ledger)
contracts/src/PoseidonPathYul.sol         IPoseidonPath over poseidon-solidity PoseidonT3
contracts/src/interfaces/IAegisPayoutHook.sol, IPoseidonPath.sol
contracts/test/Base.t.sol                 epoch-aware sig helpers, rolloverSigs, leafSig, openOn(factory)
contracts/test/{Rollover,TreasuryRouter,PoseidonPathYul,Anchored}.t.sol
contracts/test/mocks/{RevertingPayout,GasBurnerPayout,FreezableToken}.sol
contracts/test/fixtures/anchored_ex1.json (generated by circuits/scripts/anchored_fixture.ts)
contracts/script/{DeployLocal,DeployTestnet}.s.sol   + PoseidonPathYul/Stylus, factoryAnchored, router, deployBlock
sdk/src/core/typedData.ts                 epoch fields, Rollover, Leaf, verifier methods
sdk/src/core/receipts.ts                  ReceiptTree.reset()
sdk/src/chain/abi.ts, channel.ts          epoch(), rollover, ack, startClose, router ABI, tx helpers, ChannelView.epoch
sdk/src/provider/server.ts                epoch, authenticated /close, /rollover, /rollover/confirm, closing flag, anchored flow
sdk/src/client/agent.ts                   epoch, rollover(), anchored requestUnit/dispute/exit, sign-first close
sdk/src/watcher/{watcher,cli}.ts          epoch guard; env validation + SIGINT
sdk/test/{typedData,integration,watcher}.test.ts   updated + scenarios 11, 12, 13
circuits/scripts/anchored_fixture.ts      fixture generator
stylus/aegis-poseidon/                    Cargo.toml, rust-toolchain.toml, src/{lib,poseidon,constants}.rs, scripts/gen_constants.mjs, tests
```

---

### Task 1: Epoch-scoped signatures and `rollover` (contract)

**Files:**
- Modify: `contracts/src/AegisChannel.sol`, `contracts/test/Base.t.sol`
- Create: `contracts/test/Rollover.t.sol`

**Interfaces:**
- Produces: `uint32 public epoch`, `hashCheckpoint(uint32,uint64,uint128,bytes32)`, `hashClose(uint32,uint64,uint128)`, `hashRollover(uint32,uint64,uint128)`, `rollover(uint64 seq_, uint128 toProvider, bytes sigClient, bytes sigProvider)`, event `RolledOver(uint32 indexed newEpoch, uint64 closedSeq, uint256 toProvider, uint256 remaining)`, `ROLLOVER_TYPEHASH`. Test helpers `checkpointSigs`/`closeSigs` now read `ch.epoch()`; new `rolloverSigs(ch, seq, toProvider)`.
- Consumed by: Task 2 (SDK), Task 3 (`_send` refactor of the rollover payout), Task 5 (tree reset).

- [ ] **Step 1: Write the failing test — `contracts/test/Rollover.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";

contract RolloverTest is AegisTestBase {
    AegisChannel ch;
    bytes32 constant ROOT = bytes32(uint256(777));
    uint256[8] proofZero;

    function setUp() public override {
        super.setUp();
        ch = openByClient(defaultConfig());
        fund(ch, 5_000_000);
    }

    function _rollover(uint64 s, uint128 toProvider) internal {
        (bytes memory sc, bytes memory sp) = rolloverSigs(ch, s, toProvider);
        ch.rollover(s, toProvider, sc, sp);
    }

    function test_rollover_pays_provider_keeps_remainder_and_resets() public {
        uint256 p0 = usdg.balanceOf(provider);
        uint256 c0 = usdg.balanceOf(client);
        vm.expectEmit(true, false, false, true, address(ch));
        emit AegisChannel.RolledOver(1, 128, 2_560_000, 2_440_000);
        _rollover(128, 2_560_000);
        assertEq(usdg.balanceOf(provider) - p0, 2_560_000);
        assertEq(usdg.balanceOf(client), c0);                 // sisa TIDAK dikembalikan: jadi budget epoch baru
        assertEq(ch.budget(), 2_440_000);
        assertEq(ch.epoch(), 1);
        assertEq(ch.seq(), 0); assertEq(ch.cumulativeAmount(), 0); assertEq(ch.receiptsRoot(), bytes32(0));
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.OPEN));
        assertEq(ch.deadline(), 0); assertFalse(ch.hasProof()); assertEq(ch.payToClient(), 0);
    }

    function test_old_epoch_checkpoint_and_close_rejected_after_rollover() public {
        (bytes memory sc0, bytes memory sp0) = checkpointSigs(ch, 128, 2_560_000, ROOT); // epoch 0
        (bytes memory cc0, bytes memory cp0) = closeSigs(ch, 128, 2_560_000);
        _rollover(128, 2_560_000);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.submitCheckpoint(128, 2_560_000, ROOT, sc0, sp0);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.closeCooperative(128, 2_560_000, cc0, cp0);
        (bytes memory sc1, bytes memory sp1) = checkpointSigs(ch, 1, 20_000, ROOT);     // epoch 1
        ch.submitCheckpoint(1, 20_000, ROOT, sc1, sp1);
        assertEq(ch.seq(), 1);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.CLOSING));
    }

    function test_rollover_signature_not_replayable() public {
        (bytes memory sc, bytes memory sp) = rolloverSigs(ch, 10, 200_000);
        ch.rollover(10, 200_000, sc, sp);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.rollover(10, 200_000, sc, sp);
    }

    function test_rollover_from_closing_clears_pending_proof() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 50, 1_000_000, ROOT);
        ch.submitCheckpoint(50, 1_000_000, ROOT, sc, sp);
        vm.prank(client);
        ch.claimPenalty(proofZero, 10_000);        // MockVerifier(true)
        assertTrue(ch.hasProof());
        _rollover(50, 1_000_000);
        assertFalse(ch.hasProof()); assertEq(ch.payToClient(), 0); assertEq(ch.proofSeq(), 0);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.OPEN));
    }

    function test_rollover_stale_seq_reverts() public {
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 50, 1_000_000, ROOT);
        ch.submitCheckpoint(50, 1_000_000, ROOT, sc, sp);
        (bytes memory rc, bytes memory rp) = rolloverSigs(ch, 49, 900_000);
        vm.expectRevert(AegisChannel.StaleCheckpoint.selector);
        ch.rollover(49, 900_000, rc, rp);
    }

    function test_rollover_exceeding_budget_reverts() public {
        (bytes memory sc, bytes memory sp) = rolloverSigs(ch, 1, 5_000_001);
        vm.expectRevert(AegisChannel.ExceedsBudget.selector);
        ch.rollover(1, 5_000_001, sc, sp);
    }

    function test_rollover_seq_too_large_reverts() public {
        (bytes memory sc, bytes memory sp) = rolloverSigs(ch, 129, 1);
        vm.expectRevert(AegisChannel.SeqTooLarge.selector);
        ch.rollover(129, 1, sc, sp);
    }

    function test_rollover_requires_both_sigs() public {
        (bytes memory sc,) = rolloverSigs(ch, 1, 1);
        vm.expectRevert(AegisChannel.BadSignature.selector);
        ch.rollover(1, 1, sc, sc);
    }

    function test_two_rollovers_then_close() public {
        _rollover(128, 1_000_000);
        _rollover(128, 1_000_000);
        assertEq(ch.epoch(), 2); assertEq(ch.budget(), 3_000_000);
        uint256 c0 = usdg.balanceOf(client); uint256 p0 = usdg.balanceOf(provider);
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 5, 100_000);
        ch.closeCooperative(5, 100_000, sc, sp);
        assertEq(usdg.balanceOf(provider) - p0, 100_000);
        assertEq(usdg.balanceOf(client) - c0, 2_900_000);
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.SETTLED));
    }

    function test_rollover_after_settled_reverts() public {
        (bytes memory sc, bytes memory sp) = closeSigs(ch, 1, 1);
        ch.closeCooperative(1, 1, sc, sp);
        (bytes memory rc, bytes memory rp) = rolloverSigs(ch, 1, 1);
        vm.expectRevert(AegisChannel.WrongState.selector);
        ch.rollover(1, 1, rc, rp);
    }

    function test_rollover_zero_to_provider_keeps_full_budget() public {
        uint256 p0 = usdg.balanceOf(provider);
        _rollover(0, 0);
        assertEq(usdg.balanceOf(provider), p0); assertEq(ch.budget(), 5_000_000); assertEq(ch.epoch(), 1);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd contracts && forge test --match-contract RolloverTest`
Expected: compilation error (`rolloverSigs`, `epoch`, `rollover`, `RolledOver` undefined).

- [ ] **Step 3: Contract changes in `contracts/src/AegisChannel.sol`**

Replace the two typehash constants and add the third:
```solidity
    bytes32 public constant CHECKPOINT_TYPEHASH =
        keccak256("Checkpoint(uint32 epoch,uint64 seq,uint128 cumulativeAmount,bytes32 receiptsRoot)");
    bytes32 public constant CLOSE_TYPEHASH = keccak256("Close(uint32 epoch,uint64 seq,uint128 toProvider)");
    bytes32 public constant ROLLOVER_TYPEHASH = keccak256("Rollover(uint32 epoch,uint64 seq,uint128 toProvider)");
```
Storage — add directly after `bool public hasProof;` (packs into the same slot as `payToClient`/`proofSeq`/`hasProof`):
```solidity
    uint32 public epoch;               // FR-10: setiap struct yang ditandatangani memuat epoch — checkpoint/close epoch lama tidak bisa di-replay setelah rollover
```
Event — after `Swept`:
```solidity
    event RolledOver(uint32 indexed newEpoch, uint64 closedSeq, uint256 toProvider, uint256 remaining);
```
Hash helpers (replace the two existing ones, add the third):
```solidity
    function hashCheckpoint(uint32 epoch_, uint64 seq_, uint128 amount, bytes32 root) public pure returns (bytes32) {
        return keccak256(abi.encode(CHECKPOINT_TYPEHASH, epoch_, seq_, amount, root));
    }
    function hashClose(uint32 epoch_, uint64 seq_, uint128 toProvider) public pure returns (bytes32) {
        return keccak256(abi.encode(CLOSE_TYPEHASH, epoch_, seq_, toProvider));
    }
    function hashRollover(uint32 epoch_, uint64 seq_, uint128 toProvider) public pure returns (bytes32) {
        return keccak256(abi.encode(ROLLOVER_TYPEHASH, epoch_, seq_, toProvider));
    }
```
In `submitCheckpoint`: `_requireBothSigned(hashCheckpoint(epoch, seq_, amount, root), sigClient, sigProvider);`
In `closeCooperative`: `_requireBothSigned(hashClose(epoch, seq_, toProvider), sigClient, sigProvider);`

New function after `closeCooperative`:
```solidity
    /// @notice Rollover kooperatif (FR-10): bayar epoch berjalan ke provider, sisa saldo menjadi budget epoch
    ///         berikutnya dengan syarat (T) yang sama; seq/R/A/bukti di-reset; epoch++ sehingga tanda tangan
    ///         epoch lama (checkpoint, close, rollover) tidak sah lagi. OPEN atau CLOSING; seq_ ≥ seq seperti close.
    function rollover(uint64 seq_, uint128 toProvider, bytes calldata sigClient, bytes calldata sigProvider)
        external nonReentrant
    {
        if (state != State.OPEN && state != State.CLOSING) revert WrongState();
        if (seq_ > MAX_SEQ) revert SeqTooLarge();
        if (seq_ < seq) revert StaleCheckpoint();
        _requireBothSigned(hashRollover(epoch, seq_, toProvider), sigClient, sigProvider);
        if (toProvider > budget()) revert ExceedsBudget();
        uint32 newEpoch = ++epoch;
        seq = 0; cumulativeAmount = 0; receiptsRoot = bytes32(0); deadline = 0;
        hasProof = false; payToClient = 0; proofSeq = 0;
        state = State.OPEN;
        _resetEpochState();
        if (toProvider > 0) IERC20(cfg.token).safeTransfer(cfg.payoutProvider, toProvider);
        emit RolledOver(newEpoch, seq_, toProvider, budget());
        emit PaymentReleased(channelIdField(), cfg.provider, toProvider);
    }

    /// @dev Hook untuk state per-epoch tambahan (mode anchored menimpa ini untuk me-nol-kan pohon inkremental).
    function _resetEpochState() internal virtual {}
```
Make the contract declarations compatible with `virtual` (the contract is not abstract; `internal virtual` with an empty body is fine).

- [ ] **Step 4: Test helpers in `contracts/test/Base.t.sol`**

Replace `checkpointSigs` and `closeSigs`, add `rolloverSigs`:
```solidity
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
```
Grep the other tests for direct `hashCheckpoint(`/`hashClose(` calls (e.g. `Wallet1271.t.sol`, `Events.t.sol`, `Invariant.t.sol`) and add the `ch.epoch()` first argument there.

- [ ] **Step 5: Run the whole Foundry suite**

Run: `cd contracts && forge test`
Expected: all previous tests + 11 new `RolloverTest` pass. `Penalty.t.sol` (FFI proof) still passes — proofs do not include epoch.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/AegisChannel.sol contracts/test
git commit -m "contracts: epoch in Checkpoint/Close signatures and cooperative rollover (FR-10)"
```

---
