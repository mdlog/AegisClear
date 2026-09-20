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
Direct call sites that need the `ch.epoch()` first argument (verified by grep on 20 Sep 2026): `contracts/test/Checkpoint.t.sol:31` (`ch.hashCheckpoint(1, 20_000, …)`), `contracts/test/Wallet1271.t.sol:25` (`ch.hashCheckpoint(10, 200_000, …)`), `contracts/test/Invariant.t.sol:27` (`ch.hashCheckpoint(s, a, r)`) and `:72` (`ch.hashClose(s, tp)`). Re-grep before finishing: `grep -rn -E "hashCheckpoint\(|hashClose\(" contracts/test contracts/script`.

- [ ] **Step 5: Run the whole Foundry suite**

Run: `cd contracts && forge test`
Expected: all previous tests + 11 new `RolloverTest` pass. `Penalty.t.sol` (FFI proof) still passes — proofs do not include epoch.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/AegisChannel.sol contracts/test
git commit -m "contracts: epoch in Checkpoint/Close signatures and cooperative rollover (FR-10)"
```

---

### Task 2: SDK — epoch in typed data, authenticated `/close`, `rollover` flow

**Files:**
- Modify: `sdk/src/core/typedData.ts`, `sdk/src/core/receipts.ts`, `sdk/src/chain/abi.ts`, `sdk/src/chain/channel.ts`, `sdk/src/provider/server.ts`, `sdk/src/client/agent.ts`, `sdk/src/watcher/watcher.ts`, `sdk/test/typedData.test.ts`, `sdk/test/integration.test.ts`, `sdk/test/watcher.test.ts` (every `Checkpoint` literal at lines 27, 55–56, 98–99, 142 gains `epoch: 0`; the stale-vs-latest responder tests keep their semantics)

**Interfaces:**
- Consumes: Task 1 contract (`epoch()`, `rollover`, new hash functions).
- Produces: `Checkpoint { epoch, seq, cumulativeAmount, receiptsRoot }`, `CloseMsg { epoch, seq, toProvider }`, `RolloverMsg` (= `CloseMsg`), `signRollover`/`verifyRolloverSig`, `TypedDataVerifier.verifyRolloverSig`, `ChannelView.epoch`, `rolloverTx`, provider routes `POST /close {seq,toProvider,sigClient}`, `POST /rollover {seq,toProvider,sigClient}`, `POST /rollover/confirm`, 409 `session-closing`; client `epoch`, `rollover()`, sign-first `closeCooperative()`; `ReceiptTree.reset()`.

**Security fix carried in this task (P0 hole, ledger F-close-continue):** today the provider countersigns `Close(seq k, X)` and keeps serving units; a client can then submit the old close and pay only X. Fix: (a) `/close` and `/rollover` require the **client's** signature in the request (proves identity and intent — also closes the "anyone can freeze a session via `Aegis-Client`" DoS), (b) once countersigned, `session.closing = true` and `/job` answers 409 `session-closing` until `/rollover/confirm` resets the epoch.

- [ ] **Step 1: Failing tests — `sdk/test/typedData.test.ts`**

Replace the two tests in `describe("EIP-712")` and add the cross-check:

```ts
import { encodeAbiParameters, hashTypedData, hashDomain, getTypesForEIP712Domain, keccak256, toBytes, concatHex, type Hex } from "viem";
import {
  signCheckpoint, verifyCheckpointSig, signChannelTerms, verifyChannelTermsSig, signClose, verifyCloseSig, signRollover, verifyRolloverSig,
  makeTypedDataVerifier, domain, CHECKPOINT_TYPES, CLOSE_TYPES, ROLLOVER_TYPES, rootHex, type ChannelConfig,
} from "../src/core/typedData.js";

describe("EIP-712", () => {
  it("checkpoint sign/verify roundtrip; epoch/seq/chainId berbeda gagal", async () => {
    const cp = { epoch: 0, seq: 100, cumulativeAmount: 2_000_000n, receiptsRoot: 777n };
    const sig = await signCheckpoint(acct, channel, 31337, cp);
    expect(await verifyCheckpointSig(acct.address, channel, 31337, cp, sig)).toBe(true);
    expect(await verifyCheckpointSig(acct.address, channel, 31337, { ...cp, seq: 101 }, sig)).toBe(false);
    expect(await verifyCheckpointSig(acct.address, channel, 31337, { ...cp, epoch: 1 }, sig)).toBe(false);
    expect(await verifyCheckpointSig(acct.address, channel, 4663, cp, sig)).toBe(false);
  });
  it("channel terms, close & rollover roundtrip; close ≠ rollover meski isi sama", async () => {
    const s1 = await signChannelTerms(acct, channel, 31337, cfg);
    expect(await verifyChannelTermsSig(acct.address, channel, 31337, cfg, s1)).toBe(true);
    const m = { epoch: 2, seq: 10, toProvider: 5n };
    const s2 = await signClose(acct, channel, 31337, m);
    expect(await verifyCloseSig(acct.address, channel, 31337, m, s2)).toBe(true);
    expect(await verifyCloseSig(acct.address, channel, 31337, { ...m, toProvider: 6n }, s2)).toBe(false);
    expect(await verifyCloseSig(acct.address, channel, 31337, { ...m, epoch: 3 }, s2)).toBe(false);
    const s3 = await signRollover(acct, channel, 31337, m);
    expect(await verifyRolloverSig(acct.address, channel, 31337, m, s3)).toBe(true);
    expect(await verifyCloseSig(acct.address, channel, 31337, m, s3)).toBe(false);      // tipe berbeda → digest berbeda
    expect(await verifyRolloverSig(acct.address, channel, 31337, m, s2)).toBe(false);
  });
  // Struct hash TS == keccak256(abi.encode(TYPEHASH, ...)) persis seperti AegisChannel.hashCheckpoint/hashClose/hashRollover:
  // menjamin string typehash di kontrak dan `types` di SDK tidak pernah menyimpang (tanpa chain).
  it("struct hash cocok dengan typehash kontrak (Checkpoint/Close/Rollover)", () => {
    const dom = domain(channel, 31337);
    const domSep = hashDomain({ domain: dom, types: { EIP712Domain: getTypesForEIP712Domain({ domain: dom }) } });
    const th = (s: string) => keccak256(toBytes(s));
    const expectDigest = (types: any, primaryType: string, message: any, encoded: Hex) =>
      expect(hashTypedData({ domain: dom, types, primaryType, message })).toBe(keccak256(concatHex(["0x1901", domSep, keccak256(encoded)])));
    expectDigest(CHECKPOINT_TYPES, "Checkpoint", { epoch: 1, seq: 7n, cumulativeAmount: 140_000n, receiptsRoot: rootHex(777n) },
      encodeAbiParameters([{ type: "bytes32" }, { type: "uint32" }, { type: "uint64" }, { type: "uint128" }, { type: "bytes32" }],
        [th("Checkpoint(uint32 epoch,uint64 seq,uint128 cumulativeAmount,bytes32 receiptsRoot)"), 1, 7n, 140_000n, rootHex(777n)]));
    expectDigest(CLOSE_TYPES, "Close", { epoch: 1, seq: 7n, toProvider: 5n },
      encodeAbiParameters([{ type: "bytes32" }, { type: "uint32" }, { type: "uint64" }, { type: "uint128" }], [th("Close(uint32 epoch,uint64 seq,uint128 toProvider)"), 1, 7n, 5n]));
    expectDigest(ROLLOVER_TYPES, "Rollover", { epoch: 1, seq: 7n, toProvider: 5n },
      encodeAbiParameters([{ type: "bytes32" }, { type: "uint32" }, { type: "uint64" }, { type: "uint128" }], [th("Rollover(uint32 epoch,uint64 seq,uint128 toProvider)"), 1, 7n, 5n]));
  });
});
```

Imports for the file: `import { encodeAbiParameters, hashTypedData, hashDomain, getTypesForEIP712Domain, keccak256, toBytes, concatHex, type Hex } from "viem";`. Update the `makeTypedDataVerifier` describe block messages to include `epoch: 0` and add one `verifyRolloverSig` assertion through the on-chain verifier.

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @aegisclear/sdk test -- test/typedData.test.ts` → FAIL (`signRollover`/`ROLLOVER_TYPES` missing; epoch field rejected).

- [ ] **Step 3: `sdk/src/core/typedData.ts`** — replace the types/interfaces and add rollover (keep every existing export name):

```ts
export const CHECKPOINT_TYPES = {
  Checkpoint: [{ name: "epoch", type: "uint32" }, { name: "seq", type: "uint64" }, { name: "cumulativeAmount", type: "uint128" }, { name: "receiptsRoot", type: "bytes32" }],
} as const;
export const CLOSE_TYPES = { Close: [{ name: "epoch", type: "uint32" }, { name: "seq", type: "uint64" }, { name: "toProvider", type: "uint128" }] } as const;
export const ROLLOVER_TYPES = { Rollover: [{ name: "epoch", type: "uint32" }, { name: "seq", type: "uint64" }, { name: "toProvider", type: "uint128" }] } as const;

/** Setiap pesan memuat `epoch` (FR-10): tanda tangan epoch lama mati setelah `rollover`. */
export interface Checkpoint { epoch: number; seq: number; cumulativeAmount: bigint; receiptsRoot: bigint }
export interface CloseMsg { epoch: number; seq: number; toProvider: bigint }
export type RolloverMsg = CloseMsg;

const cpMsg = (cp: Checkpoint) => ({ epoch: cp.epoch, seq: BigInt(cp.seq), cumulativeAmount: cp.cumulativeAmount, receiptsRoot: rootHex(cp.receiptsRoot) });
const closeMsg = (m: CloseMsg) => ({ epoch: m.epoch, seq: BigInt(m.seq), toProvider: m.toProvider });

export function signRollover(a: PrivateKeyAccount, channel: Address, chainId: number, m: RolloverMsg): Promise<Hex> {
  return a.signTypedData({ domain: domain(channel, chainId), types: ROLLOVER_TYPES, primaryType: "Rollover", message: closeMsg(m) });
}
export function verifyRolloverSig(signer: Address, channel: Address, chainId: number, m: RolloverMsg, signature: Hex): Promise<boolean> {
  return verifyTypedData({ address: signer, domain: domain(channel, chainId), types: ROLLOVER_TYPES, primaryType: "Rollover", message: closeMsg(m), signature });
}
```
`TypedDataVerifier` gains `verifyRolloverSig(signer, channel, chainId, m, signature): Promise<boolean>` and `makeTypedDataVerifier` implements it with `publicClient.verifyTypedData` like the others.

`sdk/src/core/receipts.ts` — add to `ReceiptTree`:
```ts
  /** Epoch baru (rollover): kosongkan daun & receipt; objek tetap sama agar referensi pemilik tidak putus. */
  reset(): void { this.leaves.length = 0; this.receipts.length = 0; }
```

- [ ] **Step 4: ABI + chain helpers**

`sdk/src/chain/abi.ts` — add to `channelAbi`:
```ts
  "function epoch() view returns (uint32)",
  "function rollover(uint64 seq, uint128 toProvider, bytes sigClient, bytes sigProvider)",
  "event RolledOver(uint32 indexed newEpoch, uint64 closedSeq, uint256 toProvider, uint256 remaining)",
```
`sdk/src/chain/channel.ts` — `ChannelView` gains `epoch: number`; `readChannel` reads `epoch` in the same `Promise.all` and returns `epoch: Number(ep)`; add:
```ts
export const rolloverTx = (ctx: ChainCtx, ch: Address, seq: number, toProvider: bigint, sigC: Hex, sigP: Hex) =>
  write(ctx, ch, "rollover", [BigInt(seq), toProvider, sigC, sigP]);
```

- [ ] **Step 5: Provider — `sdk/src/provider/server.ts`**

1. Imports: add `signRollover`, `readChannel` (from `../chain/channel.js`).
2. `Session` gains `epoch: number; /** Close/Rollover sudah ditandatangani provider: tidak ada unit baru sampai rollover terkonfirmasi (F-close-continue) */ closing: boolean;`. In `session()` set `epoch: 0, closing: false`, and `cp0 = { epoch: 0, seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) }`.
3. `POST /job`: after the ack block (2) and before (3) insert:
```ts
    if (s.closing) return c.json({ error: "session-closing" }, 409);
```
   and build the checkpoint with `epoch: s.epoch`: `const cp: Checkpoint = { epoch: s.epoch, seq: n + 1, cumulativeAmount: s.cumulativeAmount, receiptsRoot: await s.tree.root() };`
4. Replace `POST /close` with a shared helper used by `/close` and `/rollover`:
```ts
  /**
   * Gating bersama /close & /rollover (T-close-hi + F-close-continue): hanya seq co-signed TERTINGGI, jumlah harus
   * persis kumulatif checkpoint itu, dan permintaan WAJIB membawa tanda tangan klien atas pesan yang sama
   * (bukti identitas + niat; header Aegis-Client sendiri tidak diautentikasi). Setelah provider ikut
   * menandatangani, sesi ditandai `closing`: tidak ada unit baru sampai rollover terkonfirmasi on-chain.
   */
  async function countersign(c: any, kind: "close" | "rollover") {
    const client = clientOf(c); const s = client && sessions.get(client.toLowerCase());
    if (!s?.channel) return c.json({ error: "no channel" }, 409);
    const { seq, toProvider, sigClient } = (await c.req.json()) as { seq: number; toProvider: string; sigClient: Hex };
    const n = s.tree.size;
    let hi: number | undefined;
    if (n === 0) hi = 0;
    else if (s.checkpoints.get(n)?.sigClient) hi = n;
    else if (s.checkpoints.get(n - 1)?.sigClient) hi = n - 1;
    if (hi === undefined || seq !== hi) return c.json({ error: "checkpoint-not-acked", seq }, 409);
    const owed = hi === 0 ? 0n : s.checkpoints.get(hi)!.cp.cumulativeAmount;
    if (BigInt(toProvider) !== owed) return c.json({ error: "amount-mismatch", toProvider: owed.toString() }, 409);
    const msg = { epoch: s.epoch, seq: hi, toProvider: owed };
    const ok = kind === "close"
      ? await verify.verifyCloseSig(client!, s.channel, chainId, msg, sigClient)
      : await verify.verifyRolloverSig(client!, s.channel, chainId, msg, sigClient);
    if (!ok) return c.json({ error: "bad-client-signature" }, 400);
    const sigProvider = kind === "close" ? await signClose(o.account, s.channel, chainId, msg) : await signRollover(o.account, s.channel, chainId, msg);
    s.closing = true;
    return c.json({ epoch: s.epoch, seq: hi, toProvider: owed.toString(), sigProvider });
  }
  app.post("/close", (c) => countersign(c, "close"));
  app.post("/rollover", (c) => countersign(c, "rollover"));

  /** Setelah tx rollover klien masuk: verifikasi on-chain (epoch+1, seq 0, OPEN) lalu mulai epoch baru di sesi. */
  app.post("/rollover/confirm", async (c) => {
    const client = clientOf(c); const s = client && sessions.get(client.toLowerCase());
    if (!s?.channel) return c.json({ error: "no channel" }, 409);
    const v = await readChannel(o.ctx, s.channel);
    if (v.epoch !== s.epoch + 1 || v.seq !== 0 || v.state !== "OPEN") return c.json({ error: "rollover-not-onchain", epoch: v.epoch, seq: v.seq, state: v.state }, 409);
    s.epoch = v.epoch; s.closing = false; s.tree.reset(); s.cumulativeAmount = 0n; s.checkpoints.clear();
    const cp0: Checkpoint = { epoch: s.epoch, seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
    s.exitSigProvider = await signCheckpoint(o.account, s.channel, chainId, cp0);
    return c.json({ epoch: s.epoch, exitSig: s.exitSigProvider });
  });
```
   (`Session.checkpoints` must be a mutable `Map` — it already is; `s.tree.reset()` keeps the same object.)

- [ ] **Step 6: Client — `sdk/src/client/agent.ts`**

1. Field `epoch = 0;` (public, next to `deposit`). Imports: `signRollover`, `rolloverTx`, `readChannel` already imported? (`readChannel` yes; add `signRollover` from typedData and `rolloverTx` from channel).
2. `start()`: `cp0 = { epoch: 0, seq: 0, ... }`.
3. `requestUnit()`: `const cp: Checkpoint = { epoch: Number(b.checkpoint.epoch), seq: ..., ... };` and add `if (cp.epoch !== this.epoch) throw new Error("checkpoint epoch mismatch");` before the seq/root/amount check.
4. Replace `closeCooperative()` — sign first, then ask the provider to countersign:
```ts
  async closeCooperative(): Promise<void> {
    const seq = this.tree.size;
    const toProvider = settle(this.tree.receipts, this.terms).cumulativeAmount;
    const msg = { epoch: this.epoch, seq, toProvider };
    const sigClient = await signClose(this.o.account, this.channel, this.chainId, msg);
    const res = await fetch(`${this.o.providerUrl}/close`, { method: "POST", headers: this.hdr(), body: JSON.stringify({ seq, toProvider: toProvider.toString(), sigClient }) });
    if (res.status !== 200) throw new Error(`POST /close ${res.status}: ${await res.text()}`);
    const b = (await res.json()) as any;
    if (Number(b.epoch) !== this.epoch || Number(b.seq) !== seq || bi(b.toProvider) !== toProvider) throw new Error("close reply mismatch");
    if (!(await this.verify.verifyCloseSig(this.cfg.provider, this.channel, this.chainId, msg, b.sigProvider))) throw new Error("bad provider close signature");
    this.txs.push({ label: "closeCooperative", ...(await closeCooperativeTx(this.o.ctx, this.channel, seq, toProvider, sigClient, b.sigProvider)) });
  }

  /**
   * Rollover kooperatif (FR-10): bayar epoch berjalan, sisa deposit jadi budget epoch baru, seq/R/A reset,
   * epoch++. Klien menandatangani dulu (identitas + niat), provider ikut menandatangani, klien mengirim tx,
   * lalu memberi tahu provider (`/rollover/confirm`) yang memverifikasi on-chain dan memberi tiket keluar baru.
   */
  async rollover(): Promise<void> {
    const seq = this.tree.size;
    const toProvider = settle(this.tree.receipts, this.terms).cumulativeAmount;
    const msg = { epoch: this.epoch, seq, toProvider };
    const sigClient = await signRollover(this.o.account, this.channel, this.chainId, msg);
    const res = await fetch(`${this.o.providerUrl}/rollover`, { method: "POST", headers: this.hdr(), body: JSON.stringify({ seq, toProvider: toProvider.toString(), sigClient }) });
    if (res.status !== 200) throw new Error(`POST /rollover ${res.status}: ${await res.text()}`);
    const b = (await res.json()) as any;
    if (Number(b.epoch) !== this.epoch || Number(b.seq) !== seq || bi(b.toProvider) !== toProvider) throw new Error("rollover reply mismatch");
    if (!(await this.verify.verifyRolloverSig(this.cfg.provider, this.channel, this.chainId, msg, b.sigProvider))) throw new Error("bad provider rollover signature");
    this.txs.push({ label: "rollover", ...(await rolloverTx(this.o.ctx, this.channel, seq, toProvider, sigClient, b.sigProvider)) });
    const confirm = await fetch(`${this.o.providerUrl}/rollover/confirm`, { method: "POST", headers: this.hdr() });
    if (confirm.status !== 200) throw new Error(`POST /rollover/confirm ${confirm.status}: ${await confirm.text()}`);
    const cb = (await confirm.json()) as any;
    const onchain = await readChannel(this.o.ctx, this.channel);
    if (onchain.epoch !== this.epoch + 1 || Number(cb.epoch) !== onchain.epoch) throw new Error("epoch mismatch after rollover");
    this.epoch = onchain.epoch;
    const cp0: Checkpoint = { epoch: this.epoch, seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
    if (!(await this.verify.verifyCheckpointSig(this.cfg.provider, this.channel, this.chainId, cp0, cb.exitSig))) throw new Error("bad provider exit ticket (new epoch)");
    this.exitSigProvider = cb.exitSig as Hex;
    this.tree.reset(); this.checkpoints.clear(); this.pendingAck = undefined;
  }
```
5. `exitUnilateral()`: `cp0 = { epoch: this.epoch, seq: 0, ... }`.

- [ ] **Step 7: Watcher epoch guard — `sdk/src/watcher/watcher.ts`**

`if (mine && mine.cp.epoch === v.epoch && mine.cp.seq > v.seq) {` (a co-signed checkpoint from an older epoch can never win; do not retry it every tick). Update the doc comment accordingly.

- [ ] **Step 8: Integration tests — `sdk/test/integration.test.ts`**

1. The `/close` gating test: the raw `fetch` calls must now carry `toProvider` and a client signature. Replace the three raw posts with:
```ts
    const post = async (seq: number, toProvider: bigint, signer = privateKeyToAccount(PK.clientC)) => {
      const sigClient = await signClose(signer, c.channel, CHAIN_ID, { epoch: c.epoch, seq, toProvider });
      return fetch("http://127.0.0.1:4020/close", { method: "POST", headers: hdr, body: JSON.stringify({ seq, toProvider: toProvider.toString(), sigClient }) });
    };
    expect((await post(0, 0n)).status).toBe(409);
    expect((await post(5, 100_000n)).status).toBe(409);
    expect((await post(10, 199_999n)).status).toBe(409);                                   // jumlah salah
    expect((await post(10, 200_000n, privateKeyToAccount(PK.clientD))).status).toBe(400);  // tanda tangan bukan klien ini
    const r10 = await post(10, 200_000n);
    expect(r10.status).toBe(200);
    expect(((await r10.json()) as any).toProvider).toBe("200000");
    // F-close-continue: setelah provider ikut menandatangani Close, tidak ada unit baru lagi
    await expect(c.requestUnit()).rejects.toThrow(/session-closing/);
    // jalur yang benar tetap bisa menutup channel secara normal (tanda tangan baru atas pesan yang sama)
    await c.closeCooperative();
```
   (`signClose` import from `../src/index.js`.)
2. New scenario 11 (add after the F5 test), on the main provider at 4020 with a fresh funded client:
```ts
  it("skenario 11 (FR-10): epoch penuh → 409 epoch-full → rollover() → unit lanjut di epoch 1 → close; provider = A0 + A1", async () => {
    const pk = generatePrivateKey(); const acct = privateKeyToAccount(pk);
    const eth = await ctxOf(PK.deployer).walletClient.sendTransaction({ to: acct.address, value: 1_000_000_000_000_000_000n });
    await publicClient.waitForTransactionReceipt({ hash: eth });
    await mintUsdg(acct.address, 10_000_000n);
    const c = new AegisClient({ ctx: ctxOf(pk), account: acct, providerUrl: "http://127.0.0.1:4020", usdg: d.usdg, artifacts: art });
    const p0 = await bal(providerAddr); const c0 = await bal(acct.address);
    await c.start();                                             // deposit 1.000.000 (provider utama)
    for (let i = 0; i < 50; i++) await c.requestUnit();          // 50 × 20.000 = 1.000.000 = seluruh deposit
    await c.finalAck();
    await expect(c.requestUnit()).rejects.toThrow(/402/);        // budget habis (FR-24) — bukan epoch-full; deposit ulang dulu
    await erc20Transfer(ctxOf(pk), d.usdg, c.channel, 2_000_000n);
    for (let i = 50; i < 128; i++) await c.requestUnit();        // sampai MAX_SEQ
    await c.finalAck();
    await expect(c.requestUnit()).rejects.toThrow(/epoch-full/);
    expect(c.epoch).toBe(0);
    await c.rollover();                                          // bayar 2.560.000, sisa 440.000 jadi budget epoch 1
    expect(c.epoch).toBe(1); expect(c.tree.size).toBe(0);
    expect((await c.view()).epoch).toBe(1);
    expect((await bal(providerAddr)) - p0).toBe(2_560_000n);
    for (let i = 0; i < 5; i++) await c.requestUnit();           // epoch 1: seq 0..4
    await c.finalAck();
    await c.closeCooperative();                                  // 100.000 ke provider, 340.000 kembali
    expect((await c.view()).state).toBe("SETTLED");
    expect((await bal(providerAddr)) - p0).toBe(2_660_000n);
    expect(c0 - (await bal(acct.address))).toBe(2_660_000n);
    expect(c.txs.map((t) => t.label)).toEqual(["fund", "rollover", "closeCooperative"]);
  });
```
   Imports: `erc20Transfer`, `signClose` from `../src/index.js`. The main provider's metrics inject a breach at seq 3 — cooperative close pays cumulative regardless (penalties only apply in disputes), so the amounts above hold. 128 units ≈ 128 × (2 eth_call + 2 signatures) — well within the 120 s timeout on Anvil.
3. The responder test (Task 15) still holds (`coSigned` epoch guard: both epoch 0).

- [ ] **Step 9: Run everything**

```bash
pnpm --filter @aegisclear/sdk typecheck
RPC_URL=http://127.0.0.1:8547 pnpm test:sdk          # requires DeployLocal re-broadcast with the Task 1 contracts: (cd contracts && forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8547 --broadcast --private-key 0xac09…ff80)
(cd contracts && forge test)
RPC_URL=http://127.0.0.1:8547 pnpm test:web          # web console uses AegisClient/createProviderApp as black boxes — must stay green
```
Expected: SDK 36+ pass (2 new), Foundry unchanged, web green.

- [ ] **Step 10: Commit**

```bash
git add sdk
git commit -m "sdk: epoch-scoped Checkpoint/Close/Rollover, client-signed close/rollover requests, rollover flow (FR-10)"
```

---

### Task 3: Payout hook + `AegisTreasuryRouter` (FR-26)

**Files:**
- Create: `contracts/src/interfaces/IAegisPayoutHook.sol`, `contracts/src/AegisTreasuryRouter.sol`, `contracts/test/TreasuryRouter.t.sol`, `contracts/test/mocks/RevertingPayout.sol`, `contracts/test/mocks/GasBurnerPayout.sol`, `contracts/test/mocks/FreezableToken.sol`
- Modify: `contracts/src/AegisChannel.sol` (`_send`, `fundWithPermit2` nonReentrant), `contracts/script/DeployLocal.s.sol`, `contracts/script/DeployTestnet.s.sol`, `sdk/src/chain/abi.ts` (`routerAbi`), `sdk/src/provider/server.ts` (`payoutProvider` option), `sdk/test/integration.test.ts` (scenario 13)

**Interfaces:**
- Produces: `IAegisPayoutHook.onPayout(address party, address token, uint256 amount)`; `AegisTreasuryRouter { setTreasury(address), treasuryOf(address), destinationOf(address), credit(address,address), totalCredit(address), onPayout, claim(address token, address to) }` + events `TreasurySet`, `PayoutRouted(party, token, dest, amount, forwarded)`, `Claimed`; `AegisChannel._send(to, party, amount)` used by `_payout`, `sweep`, `rollover`; deployment JSON key `router`; `ProviderOptions.payoutProvider?`; SDK `routerAbi`.

- [ ] **Step 1: Failing tests — `contracts/test/TreasuryRouter.t.sol` + mocks**

`contracts/test/mocks/RevertingPayout.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @dev Payee kontrak yang selalu revert di onPayout (dan fallback) — tidak boleh menyandera settle.
contract RevertingPayout {
    function onPayout(address, address, uint256) external pure { revert("nope"); }
    fallback() external payable { revert("nope"); }
}
```
`contracts/test/mocks/GasBurnerPayout.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @dev Payee kontrak yang menghabiskan seluruh gas yang diberikan — hook dibatasi stipend, settle tetap sukses.
contract GasBurnerPayout {
    uint256 public sink;
    function onPayout(address, address, uint256) external { while (true) { sink++; } }
}
```
`contracts/test/mocks/FreezableToken.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @dev USDG-like token dengan freeze per alamat (transfer KE alamat beku revert) — simulasi Paxos freeze (T8).
contract FreezableToken is ERC20 {
    mapping(address => bool) public frozen;
    constructor() ERC20("Freezable", "FRZ") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function freeze(address a, bool f) external { frozen[a] = f; }
    function _update(address from, address to, uint256 value) internal override {
        require(!frozen[to] && !frozen[from], "frozen");
        super._update(from, to, value);
    }
}
```
`contracts/test/TreasuryRouter.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AegisTestBase, AegisChannel, Sigs} from "./Base.t.sol";
import {AegisTreasuryRouter} from "../src/AegisTreasuryRouter.sol";
import {RevertingPayout} from "./mocks/RevertingPayout.sol";
import {GasBurnerPayout} from "./mocks/GasBurnerPayout.sol";
import {FreezableToken} from "./mocks/FreezableToken.sol";

contract TreasuryRouterTest is AegisTestBase {
    AegisTreasuryRouter router;
    address treasury = address(0x7EA5);

    function setUp() public override {
        super.setUp();
        router = new AegisTreasuryRouter();
    }

    function _openWithProviderPayout(address payoutProvider) internal returns (AegisChannel ch) {
        AegisChannel.Config memory c = defaultConfig();
        c.payoutProvider = payoutProvider;
        ch = openByClient(c);
        fund(ch, 5_000_000);
    }
    function _close(AegisChannel ch, uint64 s, uint128 toProvider) internal {
        (bytes memory sc, bytes memory sp) = closeSigs(ch, s, toProvider);
        ch.closeCooperative(s, toProvider, sc, sp);
    }

    function test_router_forwards_to_treasury_in_same_tx() public {
        vm.prank(provider); router.setTreasury(treasury);
        AegisChannel ch = _openWithProviderPayout(address(router));
        vm.expectEmit(true, true, true, true, address(router));
        emit AegisTreasuryRouter.PayoutRouted(provider, address(usdg), treasury, 2_000_000, true);
        _close(ch, 100, 2_000_000);
        assertEq(usdg.balanceOf(treasury), 2_000_000);
        assertEq(usdg.balanceOf(address(router)), 0);
        assertEq(router.credit(provider, address(usdg)), 0);
        assertEq(usdg.balanceOf(provider), 0);
    }

    function test_router_without_treasury_forwards_to_agent() public {
        AegisChannel ch = _openWithProviderPayout(address(router));
        _close(ch, 100, 2_000_000);
        assertEq(usdg.balanceOf(provider), 2_000_000);
        assertEq(usdg.balanceOf(address(router)), 0);
    }

    function test_setTreasury_is_per_sender_and_clearable() public {
        vm.prank(provider); router.setTreasury(treasury);
        assertEq(router.treasuryOf(provider), treasury); assertEq(router.destinationOf(provider), treasury);
        assertEq(router.destinationOf(client), client);
        vm.prank(provider); router.setTreasury(address(0));
        assertEq(router.destinationOf(provider), provider);
    }

    function test_reverting_payee_does_not_block_settle_or_close() public {
        RevertingPayout bad = new RevertingPayout();
        AegisChannel.Config memory c = defaultConfig();
        c.payoutClient = address(bad);                 // klien memilih payee jahat untuk dirinya sendiri
        AegisChannel ch = openByClient(c);
        fund(ch, 5_000_000);
        _close(ch, 100, 2_000_000);                    // tidak revert
        assertEq(usdg.balanceOf(provider), 2_000_000);
        assertEq(usdg.balanceOf(address(bad)), 3_000_000);   // dana tetap terkirim; hook-nya saja yang gagal
        assertEq(uint8(ch.state()), uint8(AegisChannel.State.SETTLED));
    }

    function test_gas_burning_payee_is_capped_and_settle_succeeds() public {
        GasBurnerPayout burner = new GasBurnerPayout();
        AegisChannel ch = _openWithProviderPayout(address(burner));
        (bytes memory sc, bytes memory sp) = checkpointSigs(ch, 10, 200_000, bytes32(uint256(1)));
        ch.submitCheckpoint(10, 200_000, bytes32(uint256(1)), sc, sp);
        vm.warp(block.timestamp + 121);
        uint256 g0 = gasleft();
        ch.settle();
        assertLt(g0 - gasleft(), 400_000);             // stipend 150k + transfer, bukan seluruh gas blok
        assertEq(usdg.balanceOf(address(burner)), 200_000);
        assertEq(usdg.balanceOf(client), 100e6 - 5_000_000 + 4_800_000);
    }

    function test_frozen_treasury_keeps_credit_then_claim() public {
        FreezableToken frz = new FreezableToken();
        frz.mint(client, 10_000_000);
        vm.prank(provider); router.setTreasury(treasury);
        frz.freeze(treasury, true);
        AegisChannel.Config memory c = defaultConfig();
        c.token = address(frz); c.payoutProvider = address(router);
        AegisChannel ch = openByClient(c);
        vm.prank(client); frz.transfer(address(ch), 5_000_000);
        _close(ch, 100, 2_000_000);
        assertEq(frz.balanceOf(address(router)), 2_000_000);
        assertEq(router.credit(provider, address(frz)), 2_000_000);
        assertEq(router.totalCredit(address(frz)), 2_000_000);
        frz.freeze(treasury, false);
        vm.prank(provider); router.claim(address(frz), treasury);
        assertEq(frz.balanceOf(treasury), 2_000_000);
        assertEq(router.credit(provider, address(frz)), 0);
        assertEq(router.totalCredit(address(frz)), 0);
    }

    function test_onPayout_without_backing_reverts() public {
        vm.expectRevert(AegisTreasuryRouter.Unbacked.selector);
        router.onPayout(provider, address(usdg), 1);
        usdg.mint(address(router), 100);
        router.onPayout(provider, address(usdg), 100);     // 100 masuk sungguhan → diteruskan ke provider
        assertEq(usdg.balanceOf(provider), 100);
        vm.expectRevert(AegisTreasuryRouter.Unbacked.selector);
        router.onPayout(provider, address(usdg), 1);        // saldo router 0 lagi
    }

    function test_claim_nothing_reverts() public {
        vm.prank(provider);
        vm.expectRevert(AegisTreasuryRouter.NothingToClaim.selector);
        router.claim(address(usdg), treasury);
    }

    function test_sweep_and_rollover_go_through_hook() public {
        vm.prank(provider); router.setTreasury(treasury);
        AegisChannel.Config memory c = defaultConfig();
        c.payoutProvider = address(router); c.payoutClient = address(router);
        AegisChannel ch = openByClient(c);
        fund(ch, 5_000_000);
        (bytes memory rc, bytes memory rp) = rolloverSigs(ch, 128, 1_000_000);
        ch.rollover(128, 1_000_000, rc, rp);
        assertEq(usdg.balanceOf(treasury), 1_000_000);              // rollover → hook → treasury provider
        _close(ch, 1, 0);                                           // semua sisa ke payoutClient = router → klien (tanpa treasury)
        assertEq(usdg.balanceOf(client), 100e6 - 5_000_000 + 4_000_000);
        fund(ch, 250_000);                                          // dana telat setelah SETTLED (dari klien sendiri)
        ch.sweep();                                                 // → router → klien: netto 0 bagi klien
        assertEq(usdg.balanceOf(client), 100e6 - 5_000_000 + 4_000_000);
        assertEq(usdg.balanceOf(address(ch)), 0);
        assertEq(usdg.balanceOf(address(router)), 0);
    }
}
```

- [ ] **Step 2: Run to verify it fails** — `cd contracts && forge test --match-contract TreasuryRouterTest` → compilation error (router missing).

- [ ] **Step 3: Interface + router**

`contracts/src/interfaces/IAegisPayoutHook.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Hook opsional yang dipanggil AegisChannel SETELAH token dikirim ke payee kontrak (FR-26).
///         Best-effort: channel memanggilnya dengan stipend gas terbatas di dalam try/catch — kegagalan diabaikan.
interface IAegisPayoutHook {
    function onPayout(address party, address token, uint256 amount) external;
}
```
`contracts/src/AegisTreasuryRouter.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAegisPayoutHook} from "./interfaces/IAegisPayoutHook.sol";

/// @title AegisTreasuryRouter — memetakan agen → treasury per armada (FR-26, spec §8.4). Tanpa owner, tanpa custody
///        yang disengaja: onPayout meneruskan dalam tx yang sama; bila transfer ke tujuan gagal (mis. alamat dibekukan
///        USDG) jumlahnya tercatat sebagai kredit yang bisa ditarik agen lewat claim(). Invarian: Σcredit[token] ≤ saldo.
contract AegisTreasuryRouter is IAegisPayoutHook {
    using SafeERC20 for IERC20;

    mapping(address agent => address treasury) public treasuryOf;
    mapping(address agent => mapping(address token => uint256)) public credit;
    mapping(address token => uint256) public totalCredit;

    event TreasurySet(address indexed agent, address indexed treasury);
    event PayoutRouted(address indexed party, address indexed token, address indexed dest, uint256 amount, bool forwarded);
    event Claimed(address indexed party, address indexed token, address indexed to, uint256 amount);

    error Unbacked();
    error NothingToClaim();

    /// @notice Agen (EOA, Safe, akun 4337 — msg.sender) mengatur treasury-nya sendiri; address(0) menghapus.
    function setTreasury(address treasury) external {
        treasuryOf[msg.sender] = treasury;
        emit TreasurySet(msg.sender, treasury);
    }

    function destinationOf(address agent) public view returns (address) {
        address t = treasuryOf[agent];
        return t == address(0) ? agent : t;
    }

    /// @notice Dipanggil channel setelah mentransfer `amount` token ke router. Siapa pun boleh memanggil,
    ///         tetapi kredit hanya diberikan bila saldo router benar-benar menutupinya (Σcredit ≤ saldo).
    function onPayout(address party, address token, uint256 amount) external {
        if (IERC20(token).balanceOf(address(this)) < totalCredit[token] + amount) revert Unbacked();
        address dest = destinationOf(party);
        credit[party][token] += amount;
        totalCredit[token] += amount;
        bool ok = _tryTransfer(token, dest, amount);
        if (ok) {
            credit[party][token] -= amount;
            totalCredit[token] -= amount;
        }
        emit PayoutRouted(party, token, dest, amount, ok);
    }

    /// @notice Tarik kredit yang gagal diteruskan (mis. treasury sempat dibekukan) ke alamat pilihan agen.
    function claim(address token, address to) external {
        uint256 a = credit[msg.sender][token];
        if (a == 0) revert NothingToClaim();
        credit[msg.sender][token] = 0;
        totalCredit[token] -= a;
        IERC20(token).safeTransfer(to, a);
        emit Claimed(msg.sender, token, to, a);
    }

    function _tryTransfer(address token, address to, uint256 amount) internal returns (bool) {
        (bool success, bytes memory ret) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        return success && (ret.length == 0 || abi.decode(ret, (bool)));
    }
}
```

- [ ] **Step 4: `_send` in `contracts/src/AegisChannel.sol`**

Import `IAegisPayoutHook`. Add constant + helper (in the internal section):
```solidity
    uint256 private constant HOOK_GAS = 150_000;

    /// @dev Transfer + hook best-effort (FR-26): payee kontrak boleh menerapkan IAegisPayoutHook (mis. AegisTreasuryRouter).
    ///      Hook dipanggil dengan stipend tetap di dalam try/catch — payee yang revert/menghabiskan gas TIDAK bisa
    ///      menyandera settle/close/sweep pihak lain (T-hook). Semua pemanggil nonReentrant dan state sudah final.
    function _send(address to, address party, uint256 amount) internal {
        if (amount == 0) return;
        IERC20(cfg.token).safeTransfer(to, amount);
        if (to.code.length > 0) {
            try IAegisPayoutHook(to).onPayout{gas: HOOK_GAS}(party, cfg.token, amount) {} catch {}
        }
    }
```
Use it: in `_payout` replace the two `safeTransfer` lines with `_send(cfg.payoutProvider, cfg.provider, toProvider); _send(cfg.payoutClient, cfg.client, toClient);` (drop the `IERC20 t` local); in `sweep` replace `if (b > 0) IERC20(cfg.token).safeTransfer(cfg.payoutClient, b);` with `_send(cfg.payoutClient, cfg.client, b);`; in `rollover` replace the `safeTransfer` line with `_send(cfg.payoutProvider, cfg.provider, toProvider);`. Add `nonReentrant` to `fundWithPermit2` (P0 backlog).

- [ ] **Step 5: Deploy scripts + SDK**

`DeployLocal.s.sol` / `DeployTestnet.s.sol`: `AegisTreasuryRouter router = new AegisTreasuryRouter();` inside the broadcast; `vm.serializeAddress(j, "router", address(router));`.

`sdk/src/chain/abi.ts`:
```ts
export const routerAbi = parseAbi([
  "function setTreasury(address treasury)",
  "function treasuryOf(address agent) view returns (address)",
  "function destinationOf(address agent) view returns (address)",
  "function credit(address agent, address token) view returns (uint256)",
  "function claim(address token, address to)",
  "event PayoutRouted(address indexed party, address indexed token, address indexed dest, uint256 amount, bool forwarded)",
]);
```
`sdk/src/provider/server.ts`: `ProviderOptions.payoutProvider?: Address` (doc: "alamat penerima payout provider — treasury/router/Safe; default account.address (FR-26/D8)") and in `session()` `payoutProvider: o.payoutProvider ?? o.account.address`.

- [ ] **Step 6: Integration scenario 13 — `sdk/test/integration.test.ts`**

```ts
  it("skenario 13 (FR-26): payoutProvider = AegisTreasuryRouter → treasury menerima pembayaran dalam tx close yang sama", async () => {
    const dd = d as typeof d & { router: Address };
    expect(dd.router).toMatch(/^0x/);
    const treasury = privateKeyToAccount(generatePrivateKey()).address;
    const setT = await ctxOf(PK.provider).walletClient.writeContract({ address: dd.router, abi: routerAbi, functionName: "setTreasury", args: [treasury] });
    await publicClient.waitForTransactionReceipt({ hash: setT });
    const terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
    const { app: app3 } = createProviderApp({
      ctx: ctxOf(PK.provider), account: providerAccount, usdg: d.usdg, terms, payoutProvider: dd.router,
      unitQty: 1n, deposit: 1_000_000n, challengeWindow: 60, responseWindow: 30, metrics: () => ({ m1: 300n, m2: 95n }),
    });
    const server3 = serve({ fetch: app3.fetch, port: 4028 });
    try {
      const pk = generatePrivateKey(); const acct = privateKeyToAccount(pk);
      const eth = await ctxOf(PK.deployer).walletClient.sendTransaction({ to: acct.address, value: 1_000_000_000_000_000_000n });
      await publicClient.waitForTransactionReceipt({ hash: eth });
      await mintUsdg(acct.address, 2_000_000n);
      const c = new AegisClient({ ctx: ctxOf(pk), account: acct, providerUrl: "http://127.0.0.1:4028", usdg: d.usdg, artifacts: art });
      await c.start();
      expect(c.cfg.payoutProvider.toLowerCase()).toBe(dd.router.toLowerCase());
      for (let i = 0; i < 5; i++) await c.requestUnit();
      await c.finalAck();
      const p0 = await bal(providerAddr);
      await c.closeCooperative();
      expect(await bal(treasury)).toBe(100_000n);              // 5 × 20.000 langsung ke treasury
      expect(await bal(providerAddr)).toBe(p0);                // EOA provider tidak tersentuh
      expect(await bal(dd.router)).toBe(0n);
    } finally { server3.close(); }
  });
```
Import `routerAbi` from `../src/index.js`. `d`'s type in the test gets `router?: Address`.

- [ ] **Step 7: Run**

```bash
(cd contracts && forge test)                                                    # + 9 TreasuryRouterTest
(cd contracts && forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8547 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
RPC_URL=http://127.0.0.1:8547 pnpm test:sdk && RPC_URL=http://127.0.0.1:8547 pnpm test:web
```

- [ ] **Step 8: Commit**

```bash
git add contracts sdk
git commit -m "contracts+sdk: payout hook with gas-capped try/catch, AegisTreasuryRouter (credit ledger + claim), payoutProvider option (FR-26)"
```

---

### Task 4: `IPoseidonPath`, `PoseidonPathYul`, and the anchored fixture

**Files:**
- Create: `contracts/src/interfaces/IPoseidonPath.sol`, `contracts/src/PoseidonPathYul.sol`, `contracts/test/PoseidonPathYul.t.sol`, `circuits/scripts/anchored_fixture.ts`, `contracts/test/fixtures/anchored_ex1.json` (generated)
- Modify: `circuits/package.json` (script `fixture:anchored`)

**Interfaces:**
- Produces: `IPoseidonPath { hash2(uint256,uint256) view returns (uint256); insertPath(uint256 leaf, uint256 index, uint256[7] calldata filled) view returns (uint256 root, uint256[7] memory nodes) }`; `PoseidonPathYul` (pure, over `PoseidonT3`); fixture JSON `{ zeros: string[8], termsCommitment: string, emptyRoot: string, leaves: string[100], cumulative: string[100], roots: string[100] }` for EX1 — consumed by Task 5 (Foundry `Anchored.t.sol`) and Task 6 (Rust tests).

- [ ] **Step 1: Fixture generator — `circuits/scripts/anchored_fixture.ts`**

```ts
#!/usr/bin/env tsx
// Fixture mode anchored (FR-25): daun Poseidon, jumlah kumulatif dan root pohon inkremental untuk EX1, plus zeros[0..7].
// Dipakai contracts/test/Anchored.t.sol, contracts/test/PoseidonPathYul.t.sol dan stylus/aegis-poseidon (cargo test).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadVector, leafHash, merkleRoot, commitTerms, settle, poseidon } from "@aegisclear/sdk";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "contracts", "test", "fixtures", "anchored_ex1.json");
const v = loadVector("EX1_7_latency_breaches");
const h = await poseidon();
const zeros: bigint[] = [0n];
for (let i = 0; i < 7; i++) zeros.push(h([zeros[i], zeros[i]]));
const leaves = await Promise.all(v.receipts.map(leafHash));
const roots: bigint[] = []; const cumulative: bigint[] = [];
for (let i = 1; i <= leaves.length; i++) {
  roots.push(await merkleRoot(leaves.slice(0, i)));
  cumulative.push(settle(v.receipts.slice(0, i), v.terms).cumulativeAmount);
}
const fixture = {
  zeros: zeros.map(String), termsCommitment: (await commitTerms(v.terms)).toString(), emptyRoot: (await merkleRoot([])).toString(),
  leaves: leaves.map(String), cumulative: cumulative.map(String), roots: roots.map(String),
};
writeFileSync(out, JSON.stringify(fixture, null, 1) + "\n");
console.log(`ditulis ${out}: ${leaves.length} daun, zeros[7] = ${zeros[7]}`);
```
`circuits/package.json` scripts: `"fixture:anchored": "tsx scripts/anchored_fixture.ts"`. Run it: `pnpm --filter @aegisclear/circuits fixture:anchored` → expected `zeros[7] = 3396914609616007258851405644437304192397291162432396347162513310381425243293`, and `roots[0]`/`roots[99]` equal the values in Global Constraints. Commit the generated JSON (it is small, ≈ 25 KB).

- [ ] **Step 2: Failing Foundry test — `contracts/test/PoseidonPathYul.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {PoseidonPathYul} from "../src/PoseidonPathYul.sol";
import {IPoseidonPath} from "../src/interfaces/IPoseidonPath.sol";

contract PoseidonPathYulTest is Test {
    using stdJson for string;
    IPoseidonPath p;
    string fx;

    function setUp() public {
        p = new PoseidonPathYul();
        fx = vm.readFile("test/fixtures/anchored_ex1.json");
    }
    function _arr(string memory key) internal view returns (uint256[] memory) { return fx.readUintArray(key); }

    function test_hash2_matches_circomlib() public view {
        assertEq(p.hash2(1, 2), 7853200120776062878684798364095072458815029376092732009249414926327459813530);
    }
    function test_zeros_chain() public view {
        uint256[] memory z = _arr(".zeros");
        for (uint256 i; i < 7; i++) assertEq(p.hash2(z[i], z[i]), z[i + 1]);
        assertEq(z[7], fx.readUint(".emptyRoot"));
    }
    function test_insertPath_128_leaves_incrementally_matches_sdk_roots() public view {
        uint256[] memory leaves = _arr(".leaves"); uint256[] memory roots = _arr(".roots");
        uint256[7] memory filled;
        for (uint256 i; i < leaves.length; i++) {
            (uint256 root, uint256[7] memory nodes) = p.insertPath(leaves[i], i, filled);
            for (uint256 l; l < 7; l++) if ((i >> l) & 1 == 0) filled[l] = nodes[l];
            assertEq(root, roots[i], "root mismatch");
        }
    }
    function test_insertPath_rejects_non_field_and_bad_index() public {
        uint256[7] memory filled;
        vm.expectRevert(PoseidonPathYul.NotField.selector);
        p.insertPath(21888242871839275222246405745257275088548364400416034343698204186575808495617, 0, filled);
        vm.expectRevert(PoseidonPathYul.BadIndex.selector);
        p.insertPath(1, 128, filled);
        vm.expectRevert(PoseidonPathYul.NotField.selector);
        p.hash2(21888242871839275222246405745257275088548364400416034343698204186575808495617, 0);
    }
    function test_insertPath_gas_report() public view {
        uint256[7] memory filled;
        uint256 g0 = gasleft();
        p.insertPath(1, 5, filled);
        console.log("PoseidonPathYul.insertPath (7 hash) gas:", g0 - gasleft());
    }
}
```
Import `console` from `forge-std/console.sol`.

- [ ] **Step 3: Run to verify it fails** — `cd contracts && forge test --match-contract PoseidonPathYulTest` → compilation error.

- [ ] **Step 4: Interface + Yul implementation**

`contracts/src/interfaces/IPoseidonPath.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Poseidon (circomlib v1, t=3) untuk pohon inkremental anchored mode (FR-25). Dua implementasi dengan
///         keluaran identik: AegisPoseidon (Stylus, Robinhood Chain) dan PoseidonPathYul (poseidon-solidity; Foundry/Anvil/Plan B).
interface IPoseidonPath {
    function hash2(uint256 a, uint256 b) external view returns (uint256);
    /// @dev cur = leaf; untuk level i = 0..6: bit i dari `index` 0 → (cur, zeros[i]) dan nodes[i] = cur;
    ///      bit 1 → (filled[i], cur) dan nodes[i] = filled[i]; cur = H(kiri, kanan). Kembalikan root (= cur) dan nodes.
    ///      Pemanggil menyimpan nodes[i] sebagai filledSubtrees[i] hanya untuk level dengan bit 0. Revert bila input ≥ p atau index ≥ 128.
    function insertPath(uint256 leaf, uint256 index, uint256[7] calldata filled) external view returns (uint256 root, uint256[7] memory nodes);
}
```
`contracts/src/PoseidonPathYul.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {IPoseidonPath} from "./interfaces/IPoseidonPath.sol";

/// @title PoseidonPathYul — IPoseidonPath di atas poseidon-solidity (Yul, circomlib v1). Dipakai Foundry, Anvil, dan
///        sebagai Rencana B bila program Stylus tidak tersedia. Zeros = subtree kosong: zeros[0]=0, zeros[i+1]=H(zeros[i],zeros[i]).
contract PoseidonPathYul is IPoseidonPath {
    uint256 internal constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 internal constant Z1 = 14744269619966411208579211824598458697587494354926760081771325075741142829156;
    uint256 internal constant Z2 = 7423237065226347324353380772367382631490014989348495481811164164159255474657;
    uint256 internal constant Z3 = 11286972368698509976183087595462810875513684078608517520839298933882497716792;
    uint256 internal constant Z4 = 3607627140608796879659380071776844901612302623152076817094415224584923813162;
    uint256 internal constant Z5 = 19712377064642672829441595136074946683621277828620209496774504837737984048981;
    uint256 internal constant Z6 = 20775607673010627194014556968476266066927294572720319469184847051418138353016;

    error NotField();
    error BadIndex();

    function hash2(uint256 a, uint256 b) external pure returns (uint256) {
        if (a >= P || b >= P) revert NotField();
        return PoseidonT3.hash([a, b]);
    }

    function insertPath(uint256 leaf, uint256 index, uint256[7] calldata filled)
        external pure returns (uint256 root, uint256[7] memory nodes)
    {
        if (leaf >= P) revert NotField();
        if (index >= 128) revert BadIndex();
        uint256 cur = leaf;
        for (uint256 i; i < 7; i++) {
            if (filled[i] >= P) revert NotField();
            uint256 l; uint256 r;
            if ((index >> i) & 1 == 0) { l = cur; r = _zero(i); nodes[i] = cur; }
            else { l = filled[i]; r = cur; nodes[i] = filled[i]; }
            cur = PoseidonT3.hash([l, r]);
        }
        root = cur;
    }

    function _zero(uint256 level) internal pure returns (uint256) {
        if (level == 0) return 0;
        if (level == 1) return Z1;
        if (level == 2) return Z2;
        if (level == 3) return Z3;
        if (level == 4) return Z4;
        if (level == 5) return Z5;
        return Z6;
    }
}
```

- [ ] **Step 5: Run** — `cd contracts && forge test --match-contract PoseidonPathYulTest -vv` → 5 pass; note the reported `insertPath` gas in your report (expected ≈ 225–240k).

- [ ] **Step 6: Commit**

```bash
git add contracts/src/interfaces/IPoseidonPath.sol contracts/src/PoseidonPathYul.sol contracts/test/PoseidonPathYul.t.sol contracts/test/fixtures/anchored_ex1.json circuits/scripts/anchored_fixture.ts circuits/package.json
git commit -m "contracts: IPoseidonPath + PoseidonPathYul (incremental depth-7 insert, circomlib v1) with SDK-generated anchored fixture"
```

---

### Task 5: Anchored mode in `AegisChannel` (`ack`, `startClose`, incremental tree) + factory mode

**Files:**
- Modify: `contracts/src/AegisChannel.sol`, `contracts/src/AegisChannelFactory.sol`, `contracts/test/Base.t.sol`, every test/script that constructs `AegisChannelFactory` (4th ctor arg), `contracts/script/DeployLocal.s.sol`, `contracts/script/DeployTestnet.s.sol`
- Create: `contracts/test/Anchored.t.sol`

**Interfaces:**
- Produces: `AegisChannel(verifier, permit2, poseidonPath)` ctor; immutables `POSEIDON`, `ANCHORED`; `LEAF_TYPEHASH`; `hashLeaf(uint32 epoch, uint64 seq, bytes32 leaf, uint128 cumulativeAmount)`; `ack(uint64 seq_, bytes32 leaf, uint128 cumulativeAmount_, bytes sigProvider)`; `startClose()`; events `Acked(uint64 seq, bytes32 leaf, uint128 cumulativeAmount, bytes32 root)`, `CloseStarted(address indexed by, uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, uint64 deadline)`; errors `WrongMode`, `NotClient`, `AmountDecreased`; factory ctor `(verifier, permit2, minChallengeWindow, poseidonPath)` + `POSEIDON` immutable; deployment JSON keys `poseidon`, `factoryAnchored`, `deployBlock`. Test helpers `openByClientOn(factory, cfg)`, `leafSig(ch, seq, leaf, amount)`, `factoryAnchored`, `yul`.
- Consumed by: Task 7 (SDK anchored flow), Task 9 (testnet).

- [ ] **Step 1: Failing tests — `contracts/test/Anchored.t.sol`**

```solidity
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
        vm.prank(client);
        ch.ack(s, bytes32(leaves[s]), uint128(cums[s]), leafSig(ch, s, bytes32(leaves[s]), uint128(cums[s])));
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
        vm.prank(client);
        vm.expectRevert(AegisChannel.StaleCheckpoint.selector);
        ch.ack(1, bytes32(leaves[1]), uint128(cums[1]), leafSig(ch, 1, bytes32(leaves[1]), uint128(cums[1])));
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
        _ack(0);                                       // leafSig membaca epoch() = 1
        assertEq(ch.receiptsRoot(), bytes32(roots[0]));  // pohon benar-benar kosong sebelum ack ini
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
            vm.prank(client);
            ch.ack(i, bytes32(leaves[i]), uint128(cums[i]), leafSig(ch, i, bytes32(leaves[i]), uint128(cums[i])));
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
```

- [ ] **Step 2: Run to verify it fails** — `cd contracts && forge test --match-contract Anchored` → compilation error.

- [ ] **Step 3: Contract changes**

`contracts/src/AegisChannelFactory.sol`:
```solidity
    address public immutable POSEIDON;   // 0 = mode co-signed; kontrak IPoseidonPath = mode anchored (FR-25)

    constructor(address verifier, address permit2, uint32 minChallengeWindow, address poseidonPath) {
        IMPLEMENTATION = address(new AegisChannel(verifier, permit2, poseidonPath));
        VERIFIER = verifier; PERMIT2 = permit2; MIN_CHALLENGE_WINDOW = minChallengeWindow; POSEIDON = poseidonPath;
    }
```
`contracts/src/AegisChannel.sol` — import `IPoseidonPath`; add:
```solidity
    bytes32 public constant LEAF_TYPEHASH = keccak256("Leaf(uint32 epoch,uint64 seq,bytes32 leaf,uint128 cumulativeAmount)");
    IPoseidonPath public immutable POSEIDON;
    bool public immutable ANCHORED;              // mode per implementasi/factory (spec B.3): Config & alamat channel tidak berubah
    uint256[7] private filledSubtrees;            // pohon inkremental kedalaman 7 (hanya anchored)

    event Acked(uint64 seq, bytes32 leaf, uint128 cumulativeAmount, bytes32 root);
    event CloseStarted(address indexed by, uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, uint64 deadline);
    error WrongMode();
    error NotClient();
    error AmountDecreased();

    constructor(address verifier, address permit2, address poseidonPath) {
        FACTORY = msg.sender;
        VERIFIER = ISLASettlementVerifier(verifier);
        PERMIT2 = ISignatureTransfer(permit2);
        POSEIDON = IPoseidonPath(poseidonPath);
        ANCHORED = poseidonPath != address(0);
        state = State.SETTLED;
    }

    function hashLeaf(uint32 epoch_, uint64 seq_, bytes32 leaf, uint128 amount) public pure returns (bytes32) {
        return keccak256(abi.encode(LEAF_TYPEHASH, epoch_, seq_, leaf, amount));
    }

    /// @notice Anchored (FR-25): klien meng-ack unit `seq_` on-chain dengan daun = Poseidon(seq,qty,m1,m2,due) yang
    ///         ditandatangani provider (`Leaf`). Hanya hash daun + kumulatif yang naik; metrik & harga per unit tetap privat.
    ///         Satu panggilan IPoseidonPath melakukan 7 hash penyisipan (Stylus di Robinhood Chain, Yul di Anvil/Foundry).
    function ack(uint64 seq_, bytes32 leaf, uint128 cumulativeAmount_, bytes calldata sigProvider) external {
        if (!ANCHORED) revert WrongMode();
        if (msg.sender != cfg.client) revert NotClient();
        if (state != State.OPEN) revert WrongState();
        if (seq_ != seq) revert StaleCheckpoint();
        if (seq_ >= MAX_SEQ) revert SeqTooLarge();
        if (cumulativeAmount_ < cumulativeAmount) revert AmountDecreased();
        bytes32 d = _digest(hashLeaf(epoch, seq_, leaf, cumulativeAmount_));
        if (!SignatureChecker.isValidSignatureNow(cfg.provider, d, sigProvider)) revert BadSignature();
        (uint256 root, uint256[7] memory nodes) = POSEIDON.insertPath(uint256(leaf), seq_, filledSubtrees);
        for (uint256 i; i < 7; i++) if ((seq_ >> i) & 1 == 0) filledSubtrees[i] = nodes[i];
        receiptsRoot = bytes32(root);
        seq = seq_ + 1;
        cumulativeAmount = cumulativeAmount_;
        hasProof = false;
        emit Acked(seq_, leaf, cumulativeAmount_, bytes32(root));
    }

    /// @notice Anchored: salah satu pihak membuka jendela tantangan atas state on-chain (pengganti submitCheckpoint).
    function startClose() external {
        if (!ANCHORED) revert WrongMode();
        if (msg.sender != cfg.client && msg.sender != cfg.provider) revert NotParty();
        if (state != State.OPEN) revert WrongState();
        state = State.CLOSING;
        deadline = uint64(block.timestamp) + cfg.challengeWindow;
        emit CloseStarted(msg.sender, seq, cumulativeAmount, receiptsRoot, deadline);
    }

    function _resetEpochState() internal override { if (ANCHORED) delete filledSubtrees; }
```
(`_resetEpochState` was declared `internal virtual` with an empty body in Task 1 — turn it into the version above, dropping `virtual`/`override`: a single implementation is fine.) In `submitCheckpoint` add `if (ANCHORED) revert WrongMode();` as the first check.

`contracts/test/Base.t.sol`: `import {PoseidonPathYul} from "../src/PoseidonPathYul.sol";` fields `PoseidonPathYul internal yul; AegisChannelFactory internal factoryAnchored;`; in `setUp`: `factory = new AegisChannelFactory(address(verifier), PERMIT2, 60, address(0)); yul = new PoseidonPathYul(); factoryAnchored = new AegisChannelFactory(address(verifier), PERMIT2, 60, address(yul));` and helpers:
```solidity
    function openByClientOn(AegisChannelFactory f, AegisChannel.Config memory c) internal returns (AegisChannel ch) {
        address predicted = f.predict(c);
        bytes32 d = Sigs.digest(Sigs.domain(predicted), AegisChannel(f.IMPLEMENTATION()).hashChannelTerms(c));
        vm.prank(client);
        ch = AegisChannel(f.open(c, "", Sigs.sign(providerPk, d)));
    }
    function leafSig(AegisChannel ch, uint64 s, bytes32 leaf, uint128 amount) internal view returns (bytes memory) {
        return Sigs.sign(providerPk, Sigs.digest(ch.domainSeparator(), ch.hashLeaf(ch.epoch(), s, leaf, amount)));
    }
```
Call sites of `new AegisChannelFactory(` that need the 4th argument (verified by grep on 20 Sep 2026): `contracts/test/Penalty.t.sol:26` (`address(0)`), `contracts/script/DeployLocal.s.sol:23` (`address(0)` for the co-signed demo factory), `contracts/script/DeployTestnet.s.sol:21-22` (`address(0)` for `factoryDemo`/`factoryProd`), plus `Base.t.sol`. Re-grep before finishing. `Invariant.t.sol` handlers: no change beyond the constructor.

Deploy scripts:
- `DeployLocal.s.sol`: `PoseidonPathYul yul = new PoseidonPathYul(); AegisChannelFactory factoryAnchored = new AegisChannelFactory(address(verifier), PERMIT2, 60, address(yul));` + JSON `poseidon`, `factoryAnchored`, and `vm.serializeUint(j, "deployBlock", block.number)`.
- `DeployTestnet.s.sol`: `address poseidon = vm.envOr("POSEIDON_STYLUS", address(0)); if (poseidon == address(0)) poseidon = address(new PoseidonPathYul());` (Yul = Plan B, logged with `console.log`), `factoryAnchored` with window 60, JSON `poseidon`, `factoryAnchored`, `deployBlock` = `ArbSys(0x64).arbBlockNumber()` inside `try/catch` falling back to `block.number` (define `interface IArbSys { function arbBlockNumber() external view returns (uint256); }` in the script).

- [ ] **Step 4: Run** — `cd contracts && forge test` → everything green including `AnchoredTest` (14) and `AnchoredPenaltyTest` (1, FFI ≈ 5 s). Record the `ack` gas from `test_ack_gas_report` in the report.

- [ ] **Step 5: Redeploy local + confirm SDK/web still green** (the SDK is not anchored-aware yet, but co-signed channels must be unaffected):
```bash
(cd contracts && forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8547 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
RPC_URL=http://127.0.0.1:8547 pnpm test:sdk && RPC_URL=http://127.0.0.1:8547 pnpm test:web
```

- [ ] **Step 6: Commit**

```bash
git add contracts
git commit -m "contracts: anchored mode — ack() with on-chain Poseidon incremental tree, startClose(), per-factory mode (FR-25)"
```

---

### Task 6: `AegisPoseidon` Stylus program (circomlib Poseidon v1, t=3)

**Files:**
- Create: `stylus/aegis-poseidon/Cargo.toml`, `stylus/aegis-poseidon/rust-toolchain.toml`, `stylus/aegis-poseidon/scripts/gen_constants.mjs`, `stylus/aegis-poseidon/src/constants.rs` (generated, committed), `stylus/aegis-poseidon/src/poseidon.rs`, `stylus/aegis-poseidon/src/lib.rs`, `stylus/aegis-poseidon/tests/vectors.rs`, `stylus/aegis-poseidon/README.md`

**Interfaces:**
- Produces: Stylus program exposing `hash2(uint256,uint256) → uint256` and `insertPath(uint256 leaf, uint256 index, uint256[7] filled) → (uint256 root, uint256[7] nodes)` — byte-identical results to `PoseidonPathYul` (Task 4) and the SDK; reverts on inputs ≥ p or index ≥ 128. Deployed to testnet by Task 9 (`cargo stylus deploy`), address → `POSEIDON_STYLUS` for `DeployTestnet`.
- Consumes: fixture `contracts/test/fixtures/anchored_ex1.json` (Task 4), circomlibjs constants (`sdk/node_modules/circomlibjs/src/poseidon_constants.json`, `C[1]`/`M[1]` = t=3).

- [ ] **Step 1: Crate files**

`stylus/aegis-poseidon/Cargo.toml`:
```toml
[package]
name = "aegis-poseidon"
version = "0.1.0"
edition = "2021"
description = "AegisClear anchored mode: circomlib Poseidon v1 (t=3) incremental Merkle insert for Robinhood Chain (Stylus)"

[dependencies]
stylus-sdk = "0.10.9"
alloy-primitives = { version = "1", default-features = false }
ark-ff = { version = "0.5", default-features = false }
ark-bn254 = { version = "0.5", default-features = false, features = ["scalar_field"] }

[dev-dependencies]
serde_json = "1"

[lib]
crate-type = ["lib", "cdylib"]

[features]
export-abi = ["stylus-sdk/export-abi"]

[profile.release]
codegen-units = 1
strip = true
lto = true
panic = "abort"
opt-level = "z"
```
`stylus/aegis-poseidon/rust-toolchain.toml` — copy of `stylus/poseidon-bench/rust-toolchain.toml` (channel 1.92.0, target wasm32-unknown-unknown).

- [ ] **Step 2: Constants generator — `stylus/aegis-poseidon/scripts/gen_constants.mjs`**

```js
// Membangkitkan src/constants.rs dari konstanta circomlib Poseidon v1 (t = 3) + zeros pohon (fixture SDK).
// Jalankan dari root repo: node stylus/aegis-poseidon/scripts/gen_constants.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const require = createRequire(path.join(repo, "sdk", "package.json"));
const k = JSON.parse(readFileSync(require.resolve("circomlibjs/src/poseidon_constants.json"), "utf8"));
const fx = JSON.parse(readFileSync(path.join(repo, "contracts", "test", "fixtures", "anchored_ex1.json"), "utf8"));
const C = k.C[1], M = k.M[1];                     // indeks 1 = t = 3 (8 full + 57 partial round → 195 konstanta)
if (C.length !== 195 || M.length !== 3 || M[0].length !== 3) throw new Error(`bentuk konstanta tak terduga: C ${C.length}, M ${M.length}x${M[0]?.length}`);
const dec = (h) => BigInt(h).toString();
const fp = (h) => `MontFp!("${dec(h)}")`;
const out = `// DIBANGKITKAN oleh scripts/gen_constants.mjs — jangan sunting. Sumber: circomlibjs poseidon_constants.json (t = 3)
// dan zeros[0..6] dari contracts/test/fixtures/anchored_ex1.json (SDK). Poseidon v1 circomlib (D3).
use ark_bn254::Fr;
use ark_ff::MontFp;

pub const N_ROUNDS_F: usize = 8;
pub const N_ROUNDS_P: usize = 57;
pub const T: usize = 3;
pub const DEPTH: usize = 7;

pub const C: [Fr; ${C.length}] = [
${C.map((c) => `    ${fp(c)},`).join("\n")}
];

pub const M: [[Fr; 3]; 3] = [
${M.map((row) => `    [${row.map(fp).join(", ")}],`).join("\n")}
];

/// zeros[i] = akar subtree kosong tinggi i (zeros[0] = 0, zeros[i+1] = H(zeros[i], zeros[i])).
pub const ZEROS: [Fr; 7] = [
${fx.zeros.slice(0, 7).map((z) => `    ${fp(z)},`).join("\n")}
];
`;
writeFileSync(path.join(here, "..", "src", "constants.rs"), out);
console.log(`ditulis src/constants.rs: C ${C.length}, M 3x3, ZEROS 7`);
```
Run: `node stylus/aegis-poseidon/scripts/gen_constants.mjs`.

- [ ] **Step 3: Failing tests — `stylus/aegis-poseidon/tests/vectors.rs`**

```rust
use aegis_poseidon::poseidon::{hash2, insert_path, to_fr, to_u256};
use alloy_primitives::U256;
use std::str::FromStr;

fn u(s: &str) -> U256 { U256::from_str(s).unwrap() }
fn fixture() -> serde_json::Value {
    let p = concat!(env!("CARGO_MANIFEST_DIR"), "/../../contracts/test/fixtures/anchored_ex1.json");
    serde_json::from_str(&std::fs::read_to_string(p).expect("fixture (jalankan pnpm --filter @aegisclear/circuits fixture:anchored)")).unwrap()
}
fn arr(v: &serde_json::Value, key: &str) -> Vec<U256> { v[key].as_array().unwrap().iter().map(|x| u(x.as_str().unwrap())).collect() }

#[test]
fn hash2_matches_circomlib_1_2() {
    let h = hash2(to_fr(U256::from(1)).unwrap(), to_fr(U256::from(2)).unwrap());
    assert_eq!(to_u256(h), u("7853200120776062878684798364095072458815029376092732009249414926327459813530"));
}

#[test]
fn zeros_chain_matches_fixture() {
    let z = arr(&fixture(), "zeros");
    for i in 0..7 { assert_eq!(to_u256(hash2(to_fr(z[i]).unwrap(), to_fr(z[i]).unwrap())), z[i + 1], "zeros[{}]", i + 1); }
}

#[test]
fn insert_path_128_leaves_matches_sdk_roots() {
    let fx = fixture();
    let leaves = arr(&fx, "leaves"); let roots = arr(&fx, "roots");
    let mut filled = [to_fr(U256::ZERO).unwrap(); 7];
    for (i, leaf) in leaves.iter().enumerate() {
        let (root, nodes) = insert_path(to_fr(*leaf).unwrap(), i, &filled);
        for l in 0..7 { if (i >> l) & 1 == 0 { filled[l] = nodes[l]; } }
        assert_eq!(to_u256(root), roots[i], "root after leaf {}", i);
    }
}

#[test]
fn to_fr_rejects_non_field() {
    assert!(to_fr(u("21888242871839275222246405745257275088548364400416034343698204186575808495617")).is_none());
    assert!(to_fr(u("21888242871839275222246405745257275088548364400416034343698204186575808495616")).is_some());
}
```

Run: `cd stylus/aegis-poseidon && CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo test` → FAIL (modules missing).

- [ ] **Step 4: `src/poseidon.rs` and `src/lib.rs`**

`stylus/aegis-poseidon/src/poseidon.rs`:
```rust
//! Poseidon v1 circomlib (BN254 Fr, t = 3, 8 full + 57 partial round, S-box x^5) — port 1:1 dari
//! circomlibjs poseidon_reference.js — plus penyisipan pohon inkremental kedalaman 7 (satu panggilan = 7 hash).
use alloy_primitives::U256;
use ark_bn254::Fr;
use ark_ff::{BigInt, BigInteger, Field, PrimeField, Zero};

use crate::constants::{C, DEPTH, M, N_ROUNDS_F, N_ROUNDS_P, T, ZEROS};

/// U256 → Fr; None bila ≥ p (input harus elemen field, sama seperti sirkuit/SDK).
pub fn to_fr(x: U256) -> Option<Fr> { Fr::from_bigint(BigInt::<4>(x.into_limbs())) }
pub fn to_u256(f: Fr) -> U256 { U256::from_limbs(f.into_bigint().0) }

#[inline]
fn pow5(x: Fr) -> Fr { let x2 = x.square(); x2.square() * x }

/// Permutasi Poseidon atas state [0, a, b]; keluaran = state[0].
pub fn hash2(a: Fr, b: Fr) -> Fr {
    let mut state = [Fr::zero(), a, b];
    for r in 0..(N_ROUNDS_F + N_ROUNDS_P) {
        for i in 0..T { state[i] += C[r * T + i]; }
        if r < N_ROUNDS_F / 2 || r >= N_ROUNDS_F / 2 + N_ROUNDS_P {
            for s in state.iter_mut() { *s = pow5(*s); }
        } else {
            state[0] = pow5(state[0]);
        }
        let mut next = [Fr::zero(); T];
        for i in 0..T { let mut acc = Fr::zero(); for j in 0..T { acc += M[i][j] * state[j]; } next[i] = acc; }
        state = next;
    }
    state[0]
}

/// Penyisipan pohon inkremental (Semaphore/Tornado): lihat IPoseidonPath.insertPath.
pub fn insert_path(leaf: Fr, index: usize, filled: &[Fr; DEPTH]) -> (Fr, [Fr; DEPTH]) {
    let mut cur = leaf;
    let mut nodes = [Fr::zero(); DEPTH];
    for i in 0..DEPTH {
        let (l, r) = if (index >> i) & 1 == 0 { nodes[i] = cur; (cur, ZEROS[i]) } else { nodes[i] = filled[i]; (filled[i], cur) };
        cur = hash2(l, r);
    }
    (cur, nodes)
}
```
`stylus/aegis-poseidon/src/lib.rs`:
```rust
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

pub mod constants;
pub mod poseidon;

use alloc::vec::Vec;
use alloy_primitives::U256;
use stylus_sdk::prelude::*;

use crate::poseidon::{hash2 as h2, insert_path as ip, to_fr, to_u256};

const ERR_NOT_FIELD: &[u8] = b"NotField";
const ERR_BAD_INDEX: &[u8] = b"BadIndex";

/// AegisPoseidon — IPoseidonPath untuk mode anchored AegisClear (FR-25). Stateless & view.
#[entrypoint]
#[storage]
struct AegisPoseidon;

#[public]
impl AegisPoseidon {
    /// hash2(uint256,uint256) → uint256 — Poseidon v1 circomlib, t = 3 (padanan PoseidonT3 / SDK `poseidon([a,b])`).
    fn hash2(&self, a: U256, b: U256) -> Result<U256, Vec<u8>> {
        let (fa, fb) = match (to_fr(a), to_fr(b)) { (Some(x), Some(y)) => (x, y), _ => return Err(ERR_NOT_FIELD.to_vec()) };
        Ok(to_u256(h2(fa, fb)))
    }
    /// insertPath(uint256,uint256,uint256[7]) → (uint256 root, uint256[7] nodes) — 7 hash dalam satu panggilan.
    fn insert_path(&self, leaf: U256, index: U256, filled: [U256; 7]) -> Result<(U256, [U256; 7]), Vec<u8>> {
        if index >= U256::from(128u64) { return Err(ERR_BAD_INDEX.to_vec()); }
        let fl = to_fr(leaf).ok_or_else(|| ERR_NOT_FIELD.to_vec())?;
        let mut ff = [ark_ff::Zero::zero(); 7];
        for i in 0..7 { ff[i] = to_fr(filled[i]).ok_or_else(|| ERR_NOT_FIELD.to_vec())?; }
        let (root, nodes) = ip(fl, index.to::<usize>(), &ff);
        let mut out = [U256::ZERO; 7];
        for i in 0..7 { out[i] = to_u256(nodes[i]); }
        Ok((to_u256(root), out))
    }
}
```
If `[ark_ff::Zero::zero(); 7]` does not type-infer, write `[ark_bn254::Fr::from(0u64); 7]`. If the `#[public]` macro rejects the tuple/fixed-array return type in stylus-sdk 0.10.9, return `(U256, Vec<U256>)` and adapt `IPoseidonPath` to `uint256[] memory nodes` **in both** the Yul twin and `AegisChannel` (report this as DONE_WITH_CONCERNS with the exact ABI you shipped — Task 5 code must then be adjusted by the controller).

- [ ] **Step 5: Test natively, then check the WASM against the chain**

```bash
cd stylus/aegis-poseidon
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo test                       # 4 pass
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo stylus check --endpoint https://rpc.testnet.chain.robinhood.com
CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo stylus export-abi | grep -E "hash2|insertPath"
```
Expected: tests green; `cargo stylus check` prints the compressed WASM size (must be ≤ 24 KB) and "contract … [is valid | would activate]"; ABI shows `function hash2(uint256 a, uint256 b) external view returns (uint256)` and `function insertPath(uint256 leaf, uint256 index, uint256[7] memory filled) external view returns (uint256, uint256[7] memory)`. Record the size in `README.md` of the crate. If the size exceeds 24 KB: try `opt-level = "z"` (already), `ark-ff` features off, and as a last resort report DONE_WITH_CONCERNS (spec fallback: `openzeppelin-crypto` `FpBN256`).

- [ ] **Step 6: `stylus/aegis-poseidon/README.md`** — what it is (IPoseidonPath twin of `PoseidonPathYul`), how constants are generated, test/check/deploy commands (`cargo stylus deploy --endpoint $RPC_URL --private-key $PK_DEPLOYER`), the measured WASM size, and the note "no CacheManager on Robinhood Chain (20 Sep 2026) — every call pays program init".

- [ ] **Step 7: Commit**

```bash
git add stylus/aegis-poseidon
git commit -m "stylus: AegisPoseidon — circomlib Poseidon v1 t=3 + depth-7 incremental insert (IPoseidonPath twin), fixture-verified"
```

---

### Task 7: SDK anchored flow (provider + client) and integration scenario 12

**Files:**
- Modify: `sdk/src/core/typedData.ts`, `sdk/src/chain/abi.ts`, `sdk/src/chain/channel.ts`, `sdk/src/provider/server.ts`, `sdk/src/client/agent.ts`, `sdk/test/typedData.test.ts`, `sdk/test/integration.test.ts`

**Interfaces:**
- Consumes: Task 5 contract (`ack`, `startClose`, `hashLeaf`, `ANCHORED`, factory `POSEIDON`), Task 2 SDK (epoch, `countersign`, closing flag), `local.json.factoryAnchored` (Task 5 DeployLocal).
- Produces: `LEAF_TYPES`, `LeafMsg { epoch, seq, leaf: Hex, cumulativeAmount }`, `signLeaf`/`verifyLeafSig` (+ `TypedDataVerifier.verifyLeafSig`), `ackTx`, `startCloseTx`, `ProviderOptions.anchored?`, 402 `extra.aegis.anchored`, `POST /job` anchored reply `{ result, receipt, leaf, sigProvider, channel }`, `AegisClient.anchored`, anchored `requestUnit()/dispute()/exitUnilateral()/closeCooperative()`.

- [ ] **Step 1: Failing tests**

`sdk/test/typedData.test.ts` — add to `describe("EIP-712")`:
```ts
  it("leaf sign/verify (anchored) dan struct hash cocok dengan typehash kontrak", async () => {
    const m = { epoch: 0, seq: 3, leaf: rootHex(16723296179585495516306154995438540387388995699464725696412698533727287537557n), cumulativeAmount: 80_000n };
    const sig = await signLeaf(acct, channel, 31337, m);
    expect(await verifyLeafSig(acct.address, channel, 31337, m, sig)).toBe(true);
    expect(await verifyLeafSig(acct.address, channel, 31337, { ...m, cumulativeAmount: 80_001n }, sig)).toBe(false);
    const dom = domain(channel, 31337);
    const domSep = hashDomain({ domain: dom, types: { EIP712Domain: getTypesForEIP712Domain({ domain: dom }) } });
    const encoded = encodeAbiParameters([{ type: "bytes32" }, { type: "uint32" }, { type: "uint64" }, { type: "bytes32" }, { type: "uint128" }],
      [keccak256(toBytes("Leaf(uint32 epoch,uint64 seq,bytes32 leaf,uint128 cumulativeAmount)")), 0, 3n, m.leaf, 80_000n]);
    expect(hashTypedData({ domain: dom, types: LEAF_TYPES, primaryType: "Leaf", message: { epoch: 0, seq: 3n, leaf: m.leaf, cumulativeAmount: 80_000n } }))
      .toBe(keccak256(concatHex(["0x1901", domSep, keccak256(encoded)])));
  });
```
`sdk/test/integration.test.ts` — new nested block (after scenario 13):
```ts
  describe("skenario 12 (FR-25 anchored): ack on-chain, startClose, bukti atas R on-chain", () => {
    let server4: ReturnType<typeof serve>;
    const PORT = 4027;
    const fresh = async (usdgAmount: bigint) => {
      const pk = generatePrivateKey(); const acct = privateKeyToAccount(pk);
      const eth = await ctxOf(PK.deployer).walletClient.sendTransaction({ to: acct.address, value: 1_000_000_000_000_000_000n });
      await publicClient.waitForTransactionReceipt({ hash: eth });
      await mintUsdg(acct.address, usdgAmount);
      return { pk, acct };
    };
    const mkAnchoredClient = (pk: Hex) => new AegisClient({
      ctx: { ...ctxOf(pk), factory: (d as any).factoryAnchored }, account: privateKeyToAccount(pk), providerUrl: `http://127.0.0.1:${PORT}`, usdg: d.usdg, artifacts: art,
    });
    const words = (hex: string) => { const h = hex.replace(/^0x/, ""); const o: bigint[] = []; for (let i = 0; i + 64 <= h.length; i += 64) o.push(BigInt("0x" + h.slice(i, i + 64))); return o; };

    beforeAll(() => {
      expect((d as any).factoryAnchored).toMatch(/^0x/);
      const terms = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n, nonce: randomNonce() };
      const { app } = createProviderApp({
        ctx: { ...ctxOf(PK.provider), factory: (d as any).factoryAnchored }, account: providerAccount, usdg: d.usdg, terms, anchored: true,
        unitQty: 1n, deposit: 1_000_000n, challengeWindow: 120, responseWindow: 60,
        metrics: (seq) => ({ m1: seq === 3 ? 1200n : 300n, m2: 95n }),
      });
      server4 = serve({ fetch: app.fetch, port: PORT });
    });
    afterAll(() => { server4?.close(); });

    it("sengketa: 10 ack on-chain (1 pelanggaran) → startClose → bukti → settle 190.000 / 810.000; calldata ack tanpa metrik", async () => {
      const { pk, acct } = await fresh(2_000_000n);
      const c = mkAnchoredClient(pk);
      const c0 = await bal(acct.address); const p0 = await bal(providerAddr);
      await c.start();
      expect(c.anchored).toBe(true);
      for (let i = 0; i < 10; i++) await c.requestUnit();
      expect(c.txs.filter((t) => t.label === "ack").length).toBe(10);
      const v = await c.view();
      expect(v.seq).toBe(10); expect(v.receiptsRoot).toBe(await c.tree.root()); expect(v.cumulativeAmount).toBe(200_000n);
      const { payToClient } = await c.dispute();
      expect(payToClient).toBe(10_000n);
      expect(c.txs.map((t) => t.label)).toEqual(expect.arrayContaining(["startClose", "claimPenalty"]));
      expect((await c.view()).hasProof).toBe(true);
      if (CHAIN_ID === 31337) { await publicClient.request({ method: "evm_increaseTime", params: [121] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any); }
      else await new Promise((r) => setTimeout(r, 125_000));
      await c.settle();
      expect((await bal(providerAddr)) - p0).toBe(190_000n);
      expect(c0 - (await bal(acct.address))).toBe(190_000n);
      // Privasi anchored (spec §6.7): metrik & ambang tidak pernah masuk calldata/log ack — hanya hash daun + kumulatif.
      for (const t of c.txs.filter((x) => x.label === "ack")) {
        const tx = await publicClient.getTransaction({ hash: t.hash }); const rc = await publicClient.getTransactionReceipt({ hash: t.hash });
        const ws = [...words("0x" + tx.input.slice(10)), ...rc.logs.flatMap((l) => words(l.data))];
        for (const secret of [1200n, 300n, 95n, 800n, 90n, 5000n, 3000n]) expect(ws).not.toContain(secret);
      }
      console.table(c.txs.map((t) => ({ label: t.label, gasUsed: t.gasUsed.toString() })));
    });

    it("kooperatif anchored: 5 ack → close (klien menandatangani dulu) → provider +100.000", async () => {
      const { pk, acct } = await fresh(2_000_000n);
      const c = mkAnchoredClient(pk);
      const p0 = await bal(providerAddr); const c0 = await bal(acct.address);
      await c.start();
      for (let i = 0; i < 5; i++) await c.requestUnit();
      await c.finalAck();                                  // no-op di anchored
      await c.closeCooperative();
      expect((await c.view()).state).toBe("SETTLED");
      expect((await bal(providerAddr)) - p0).toBe(100_000n);
      expect(c0 - (await bal(acct.address))).toBe(100_000n);
    });

    it("keluar unilateral anchored: provider tidak menjawab → startClose → settle → deposit kembali penuh", async () => {
      const { pk, acct } = await fresh(2_000_000n);
      const c = mkAnchoredClient(pk);
      const c0 = await bal(acct.address);
      await c.start();
      await c.exitUnilateral();
      expect((await c.view()).state).toBe("CLOSING");
      if (CHAIN_ID === 31337) { await publicClient.request({ method: "evm_increaseTime", params: [121] } as any); await publicClient.request({ method: "evm_mine", params: [] } as any); }
      else await new Promise((r) => setTimeout(r, 125_000));
      await c.settle();
      expect(await bal(acct.address)).toBe(c0);
    });
  });
```
Imports: `signLeaf`, `verifyLeafSig`, `LEAF_TYPES` in the typedData test.

- [ ] **Step 2: typed data + ABI + tx helpers**

`typedData.ts`:
```ts
export const LEAF_TYPES = { Leaf: [{ name: "epoch", type: "uint32" }, { name: "seq", type: "uint64" }, { name: "leaf", type: "bytes32" }, { name: "cumulativeAmount", type: "uint128" }] } as const;
/** Anchored (FR-25): provider menandatangani daun Poseidon + kumulatif; klien mengirimnya ke `ack()`. */
export interface LeafMsg { epoch: number; seq: number; leaf: Hex; cumulativeAmount: bigint }
const leafMsg = (m: LeafMsg) => ({ epoch: m.epoch, seq: BigInt(m.seq), leaf: m.leaf, cumulativeAmount: m.cumulativeAmount });
export function signLeaf(a: PrivateKeyAccount, channel: Address, chainId: number, m: LeafMsg): Promise<Hex> { … LEAF_TYPES, "Leaf", leafMsg(m) … }
export function verifyLeafSig(signer: Address, channel: Address, chainId: number, m: LeafMsg, signature: Hex): Promise<boolean> { … }
```
+ `TypedDataVerifier.verifyLeafSig` implemented in `makeTypedDataVerifier`.

`abi.ts` — `channelAbi` add: `"function ANCHORED() view returns (bool)"`, `"function ack(uint64 seq, bytes32 leaf, uint128 cumulativeAmount, bytes sigProvider)"`, `"function startClose()"`, `"event Acked(uint64 seq, bytes32 leaf, uint128 cumulativeAmount, bytes32 root)"`, `"event CloseStarted(address indexed by, uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, uint64 deadline)"`; `factoryAbi` add `"function POSEIDON() view returns (address)"`.

`channel.ts`:
```ts
export const ackTx = (ctx: ChainCtx, ch: Address, m: LeafMsg, sigP: Hex) => write(ctx, ch, "ack", [BigInt(m.seq), m.leaf, m.cumulativeAmount, sigP]);
export const startCloseTx = (ctx: ChainCtx, ch: Address) => write(ctx, ch, "startClose", []);
```

- [ ] **Step 3: Provider — `sdk/src/provider/server.ts`**

`ProviderOptions.anchored?: boolean` (doc: "mode anchored (FR-25): factory di `ctx.factory` harus factory anchored; ack klien = tx on-chain, tidak ada checkpoint co-signed"). `challenge()` → `extra.aegis.anchored: !!o.anchored` (keep `exitSig`; the client ignores it in anchored mode).

`POST /job`: restructure step (2):
```ts
    const n = s.tree.size;
    if (n > 0) {
      if (o.anchored) {
        // (2') anchored: unit n-1 harus sudah di-ack ON-CHAIN oleh klien (tidak ada header Aegis-Ack); epoch harus sama.
        const v = await readChannel(o.ctx, s.channel);
        if (v.epoch !== s.epoch || v.seq < n) return c.json({ error: "ack-required", seq: n - 1 }, 409);
      } else {
        … existing pending/ack-required block unchanged …
      }
    }
```
After the budget check, split the serve step:
```ts
    const { m1, m2 } = o.metrics(n);
    const r: Receipt = makeReceipt(n, o.unitQty, m1, m2, s.terms.unitPrice);
    await s.tree.append(r);
    s.cumulativeAmount += due;
    if (o.anchored) {
      const leaf: LeafMsg = { epoch: s.epoch, seq: n, leaf: rootHex(s.tree.leaves[n]), cumulativeAmount: s.cumulativeAmount };
      const sigProvider = await signLeaf(o.account, s.channel, chainId, leaf);
      return c.json({ result: `unit-${n}`, receipt: j(r), leaf: j(leaf), sigProvider, channel: s.channel });
    }
    … existing checkpoint reply …
```
`countersign`: compute `hi`/`owed` per mode:
```ts
    let hi: number | undefined; let owed = 0n;
    if (o.anchored) {
      // anchored: state on-chain adalah kebenaran — tutup di seq yang sudah di-ack (bisa tree.size − 1 bila unit terakhir belum di-ack).
      const v = await readChannel(o.ctx, s.channel);
      if (v.epoch !== s.epoch) return c.json({ error: "epoch-mismatch", epoch: v.epoch }, 409);
      hi = v.seq;
      owed = settle(s.tree.receipts.slice(0, hi), s.terms).cumulativeAmount;
    } else {
      … existing hi/owed logic …
    }
    if (hi === undefined || seq !== hi) return c.json({ error: "checkpoint-not-acked", seq }, 409);
```
(import `settle` from core.)

- [ ] **Step 4: Client — `sdk/src/client/agent.ts`**

Field `anchored = false;`. In `start()`: `this.anchored = !!a.anchored;` right after parsing `a`; wrap the exit-ticket verification: `if (!this.anchored) { … cp0 verification … }` and only set `this.exitSigProvider` there. `requestUnit()` — after the receipt/due/policy checks, branch:
```ts
    if (this.anchored) {
      const lf: LeafMsg = { epoch: Number(b.leaf.epoch), seq: Number(b.leaf.seq), leaf: b.leaf.leaf as Hex, cumulativeAmount: bi(b.leaf.cumulativeAmount) };
      if (lf.epoch !== this.epoch || lf.seq !== this.tree.size) throw new Error("leaf epoch/seq mismatch");
      if (rootHex(await leafHash(r)) !== lf.leaf) throw new Error("leaf hash mismatch");
      if (lf.cumulativeAmount !== settle([...this.tree.receipts, r], this.terms).cumulativeAmount) throw new Error("leaf cumulativeAmount mismatch");
      if (!(await this.verify.verifyLeafSig(this.cfg.provider, this.channel, this.chainId, lf, b.sigProvider))) throw new Error("bad provider leaf signature");
      // Ack = tx on-chain (FR-25). Baru setelah tx sukses pohon lokal disentuh — invarian: tree.size == seq on-chain.
      this.txs.push({ label: "ack", ...(await ackTx(this.o.ctx, this.channel, lf, b.sigProvider)) });
      await this.tree.append(r);
      return r;
    }
```
`finalAck()`: `if (this.anchored || !this.pendingAck) return;`. `dispute()`:
```ts
    if (this.anchored) {
      this.txs.push({ label: "startClose", ...(await startCloseTx(this.o.ctx, this.channel)) });
    } else {
      … existing highest co-signed checkpoint submit …
    }
    … existing proof block unchanged (uses this.tree.receipts) …
```
`exitUnilateral()`: `if (this.anchored) { this.txs.push({ label: "startClose", ...(await startCloseTx(this.o.ctx, this.channel)) }); return; }` as the first statement (state on-chain is authoritative; no ticket needed). `closeCooperative()` unchanged (sign-first flow from Task 2; `seq = this.tree.size` equals the on-chain seq because every accepted unit was acked by the client's own tx).

- [ ] **Step 5: Run**

```bash
pnpm --filter @aegisclear/sdk typecheck
RPC_URL=http://127.0.0.1:8547 pnpm test:sdk          # + 1 typedData, + 3 anchored (Yul path on Anvil)
RPC_URL=http://127.0.0.1:8547 pnpm test:web
```
Record the anchored `ack` gas (Yul) printed by the console.table.

- [ ] **Step 6: Commit**

```bash
git add sdk
git commit -m "sdk: anchored mode — Leaf signatures, on-chain ack per unit, startClose dispute/exit, provider anchored flow (FR-25)"
```

---

### Task 8: P0 backlog hygiene (batch)

**Files:**
- Modify: `contracts/src/AegisChannelFactory.sol`, `contracts/test/Factory.t.sol`, `contracts/test/Checkpoint.t.sol`, `contracts/test/mocks/MockVerifier.sol`, `sdk/src/watcher/cli.ts`

- [ ] **Step 1: Factory `AlreadyOpen` pre-check** — in `open()` before `cloneDeterministic`: `if (predict(c).code.length != 0) revert AlreadyOpen();` (declare `error AlreadyOpen();`; `predict` is `external view` today — make it `public view`). Test in `Factory.t.sol`: open twice → `vm.expectRevert(AegisChannelFactory.AlreadyOpen.selector)` (replace the untyped `expectRevert` in `test_open_twice`).
- [ ] **Step 2: `MockVerifier is ISLASettlementVerifier`** — add the interface import/inheritance (no behaviour change).
- [ ] **Step 3: Boundary test** — `Checkpoint.t.sol`: `test_checkpoint_seq_128_accepted` (seq == MAX_SEQ succeeds; 129 reverts `SeqTooLarge`).
- [ ] **Step 3b: Invariant handler gains a `rollover` action (Task 1 review carry-over)** — in `contracts/test/Invariant.t.sol`'s `Handler`, add `rollover(uint64 seq_, uint128 toProvider)` (bounded: `seq_ = bound(seq_, ch.seq(), 128)`, `toProvider = bound(toProvider, 0, budget)`) that signs `Rollover(epoch, seq_, toProvider)` with both keys and calls `ch.rollover(...)`; extend the existing invariants (channel balance + payouts conserved; `state` ∈ {OPEN, CLOSING, SETTLED}; after SETTLED nothing changes) so they still hold across epochs; run `forge test --match-contract Invariant`.

- [ ] **Step 3c: Router hardening (Task 3 review carry-over)** — `AegisTreasuryRouter` inherits OZ `ReentrancyGuard`; `onPayout` and `claim` get `nonReentrant`; `_tryTransfer` decodes the return value only when `ret.length == 32` (anything else → treated as failure, credit stays); `TreasuryRouter.t.sol` adds `vm.expectEmit` for `PayoutRouted(..., forwarded=false)` in the frozen-treasury test and a test for a token that returns 1 byte of garbage (credit stays, no revert).

- [ ] **Step 3d: Anchored follow-ups (Task 5 review carry-over)** — (i) `Anchored.t.sol`: make `test_rollover_resets_tree` discriminating by asserting the seven `filledSubtrees` storage slots are zero right after `rollover` (`vm.load(address(ch), bytes32(uint256(slot)))` for the slots reported by `forge inspect AegisChannel storage-layout`), then the index-0 ack; add `test_ack_seq_128_reverts_SeqTooLarge` (drive 128 acks with fixture leaves — or `vm.store` `seq` to 128 — then expect `SeqTooLarge`), `test_old_epoch_leaf_signature_rejected_after_rollover` (`leafSig` captured at epoch 0, submitted after rollover → `BadSignature`), and `test_ack_equal_amount_allowed` (second ack with the same `cumulativeAmount` succeeds). (ii) `DeployTestnet.s.sol`: replace the `try/catch` on `ArbSys` with `(bool ok, bytes memory ret) = ARB_SYS.staticcall(abi.encodeCall(IArbSys.arbBlockNumber, ())); uint256 deployBlock = (ok && ret.length == 32) ? abi.decode(ret, (uint256)) : block.number;` and add a known-answer check before deploying `factoryAnchored`: `require(IPoseidonPath(poseidon).hash2(1, 2) == 7853200120776062878684798364095072458815029376092732009249414926327459813530, "POSEIDON_STYLUS: wrong Poseidon");` (works for the Yul fallback too). (iii) `.env.example`: `# POSEIDON_STYLUS=0x…` commented out (Foundry `envOr` fails on a set-but-empty value).

- [ ] **Step 4: `sdk/src/watcher/cli.ts`** — validate env up front (`RPC_URL`, `FACTORY`, `PRIVATE_KEY`, `CHAIN_ID` required → print the missing names and exit 1), `FROM_BLOCK` optional; `process.on("SIGINT", () => { w.stop(); process.exit(0); })`; keep behaviour otherwise. Add a tiny unit test `sdk/test/cli.test.ts` that imports a pure `parseWatcherEnv(env)` helper exported from `cli.ts` (move the env parsing into that function; `cli.ts` must not start the watcher when imported — guard the main block with `if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1])))` or move the runtime into `if (import.meta.main ?? …)`; simplest: put `parseWatcherEnv` in `sdk/src/watcher/env.ts` and import it from `cli.ts`).
- [ ] **Step 5: Run** — `cd contracts && forge test`; `RPC_URL=http://127.0.0.1:8547 pnpm test:sdk`.
- [ ] **Step 6: Commit** — `git add contracts sdk && git commit -m "hygiene: factory AlreadyOpen pre-check, MockVerifier interface, seq==128 boundary test, watcher CLI env validation + SIGINT"`

---

### Task 9 (controller-only, real keys): Stylus deploy, testnet redeploy, integration on 46630, measurements

Not dispatched to a subagent (touches `.env` keys and public chain state). Steps for the controller:

1. `cd stylus/aegis-poseidon && CARGO_TARGET_DIR=/tmp/aegis-stylus-target cargo stylus deploy --endpoint $RPC_URL --private-key $PK_DEPLOYER --no-verify` → program address `POSEIDON_STYLUS`. Cross-check on chain: `cast call $POSEIDON_STYLUS "hash2(uint256,uint256)(uint256)" 1 2` = `7853…3530`; `cast call $POSEIDON_STYLUS "insertPath(uint256,uint256,uint256[7])(uint256,uint256[7])" <leaf0> 0 "[0,0,0,0,0,0,0]"` = roots[0] of the fixture; same call against a `PoseidonPathYul` deployed on testnet → identical.
2. `cd contracts && POSEIDON_STYLUS=$POSEIDON_STYLUS forge script script/DeployTestnet.s.sol --rpc-url $RPC_URL --broadcast --private-key $PK_DEPLOYER --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/` → new `deployments/testnet-46630.json` (`usdg`, `verifier`, `factory`, `factoryProd`, `factoryAnchored`, `poseidon`, `router`, `escrow`, `deployBlock`). Mint MockUSDG to clients A/B as before.
3. `DEPLOY_FILE=contracts/deployments/testnet-46630.json RPC_URL=$RPC_URL CHAIN_ID=46630 PK_PROVIDER=… PK_CLIENT_A=… PK_CLIENT_B=… pnpm --filter @aegisclear/sdk test -- test/integration.test.ts` — the cooperative + dispute + anchored scenarios on testnet (the fresh-key scenarios need `PK_DEPLOYER` funding: skip them off-31337 with `if (CHAIN_ID !== 31337) return` guards added to those tests — controller ruling).
4. Record gas: `ack` (Stylus) from the anchored dispute console.table; Foundry: `ack` (Yul), `insertPath` (Yul), `rollover`, `startClose`, `settle` with router hook; WASM size from `cargo stylus check`.
5. Update `README.md` address table (keep the v0 20-Sep addresses in a "deploy v0" row), `docs/benchmarks/poseidon.md` (add the real `insertPath` numbers), `prd-arsitektur.md` §8.7 rows, §19 V18b, `.env.example` (`POSEIDON_STYLUS`), `docs/TOOLCHAIN.md`.
