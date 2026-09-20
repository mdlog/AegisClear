// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {ISLASettlementVerifier} from "./interfaces/ISLASettlementVerifier.sol";
import {IAegisPayoutHook} from "./interfaces/IAegisPayoutHook.sol";
import {IPoseidonPath} from "./interfaces/IPoseidonPath.sol";

/// @title AegisChannel — micro-escrow channel USDG per pasangan agen (spec §8.1).
/// @dev Satu clone EIP-1167 per channel; alamat = atribusi. Tidak ada owner/pause/upgrade.
contract AegisChannel is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State { UNINIT, OPEN, CLOSING, SETTLED }

    struct Config {
        address client;
        address provider;
        address token;            // USDG
        bytes32 termsCommitment;  // T = Poseidon(terms)
        uint32  challengeWindow;
        uint32  responseWindow;
        address payoutClient;
        address payoutProvider;
        bytes32 salt;
    }

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant CHANNEL_TERMS_TYPEHASH = keccak256(
        "ChannelTerms(address client,address provider,address token,bytes32 termsCommitment,uint32 challengeWindow,uint32 responseWindow,address payoutClient,address payoutProvider,bytes32 salt)"
    );
    bytes32 public constant CHECKPOINT_TYPEHASH =
        keccak256("Checkpoint(uint32 epoch,uint64 seq,uint128 cumulativeAmount,bytes32 receiptsRoot)");
    bytes32 public constant CLOSE_TYPEHASH = keccak256("Close(uint32 epoch,uint64 seq,uint128 toProvider)");
    bytes32 public constant ROLLOVER_TYPEHASH = keccak256("Rollover(uint32 epoch,uint64 seq,uint128 toProvider)");
    bytes32 public constant LEAF_TYPEHASH = keccak256("Leaf(uint32 epoch,uint64 seq,bytes32 leaf,uint128 cumulativeAmount)");
    uint64 public constant MAX_SEQ = 128;

    address public immutable FACTORY;
    ISLASettlementVerifier public immutable VERIFIER;
    ISignatureTransfer public immutable PERMIT2;
    IPoseidonPath public immutable POSEIDON;
    bool public immutable ANCHORED;              // mode per implementasi/factory (spec B.3): Config & alamat channel tidak berubah
    uint256[7] private filledSubtrees;            // pohon inkremental kedalaman 7 (hanya anchored)

    Config public cfg;
    bytes32 public domainSeparator;
    State public state;
    uint64 public seq;
    uint128 public cumulativeAmount;   // A
    bytes32 public receiptsRoot;       // R
    uint64 public deadline;            // hanya bermakna di CLOSING
    uint128 public payToClient;        // hasil bukti tertunda
    uint64 public proofSeq;            // seq yang dibuktikan
    bool public hasProof;
    uint32 public epoch;               // FR-10: setiap struct yang ditandatangani memuat epoch — checkpoint/close epoch lama tidak bisa di-replay setelah rollover

    event Opened(address indexed client, address indexed provider, bytes32 termsCommitment, uint32 challengeWindow);
    event Funded(address indexed from, uint256 amount);
    event CheckpointSubmitted(uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, uint64 deadline);
    event PenaltyClaimed(address indexed by, uint64 seq, uint128 payToClient);
    event Settled(uint64 seq, uint128 cumulativeAmount, uint256 penalty, uint256 toProvider, uint256 toClient, bool cooperative);
    event Swept(uint256 amount);
    event RolledOver(uint32 indexed newEpoch, uint64 closedSeq, uint256 toProvider, uint256 remaining);
    // Bentuk ERC-8183 (FR-27)
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event Acked(uint64 seq, bytes32 leaf, uint128 cumulativeAmount, bytes32 root);
    event CloseStarted(address indexed by, uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, uint64 deadline);

    error NotFactory();
    error AlreadyInitialized();
    error BadConfig();
    error BadSignature();
    error WrongState();
    error StaleCheckpoint();
    error SeqTooLarge();
    error NotParty();
    error ExceedsCumulative();
    error InvalidProof();
    error TooEarly();
    error ExceedsBudget();
    error WrongToken();
    error WrongMode();
    error NotClient();
    error AmountDecreased();
    error InsufficientGas();

    constructor(address verifier, address permit2, address poseidonPath) {
        FACTORY = msg.sender;
        VERIFIER = ISLASettlementVerifier(verifier);
        PERMIT2 = ISignatureTransfer(permit2);
        POSEIDON = IPoseidonPath(poseidonPath);
        ANCHORED = poseidonPath != address(0);
        state = State.SETTLED; // implementasi tidak pernah dipakai langsung
    }

    /// @notice Dipanggil factory tepat setelah clone. Untuk tiap pihak: opener == pihak ATAU tanda tangan ChannelTerms sah (FR-2).
    function initialize(Config calldata c, address opener, bytes calldata sigClient, bytes calldata sigProvider) external {
        if (msg.sender != FACTORY) revert NotFactory();
        if (state != State.UNINIT) revert AlreadyInitialized();
        if (c.client == address(0) || c.provider == address(0) || c.client == c.provider || c.token == address(0)) revert BadConfig();
        if (c.payoutClient == address(0) || c.payoutProvider == address(0)) revert BadConfig();
        if (c.responseWindow > c.challengeWindow) revert BadConfig();
        cfg = c;
        domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("AegisClear"), keccak256("1"), block.chainid, address(this))
        );
        bytes32 d = _digest(hashChannelTerms(c));
        if (opener != c.client && !SignatureChecker.isValidSignatureNow(c.client, d, sigClient)) revert BadSignature();
        if (opener != c.provider && !SignatureChecker.isValidSignatureNow(c.provider, d, sigProvider)) revert BadSignature();
        state = State.OPEN;
        emit Opened(c.client, c.provider, c.termsCommitment, c.challengeWindow);
    }

    // ---------- views ----------
    function budget() public view returns (uint256) { return IERC20(cfg.token).balanceOf(address(this)); }
    function channelIdField() public view returns (uint256) { return uint256(uint160(address(this))); }

    function hashChannelTerms(Config memory c) public pure returns (bytes32) {
        return keccak256(abi.encode(
            CHANNEL_TERMS_TYPEHASH, c.client, c.provider, c.token, c.termsCommitment,
            c.challengeWindow, c.responseWindow, c.payoutClient, c.payoutProvider, c.salt
        ));
    }
    function hashCheckpoint(uint32 epoch_, uint64 seq_, uint128 amount, bytes32 root) public pure returns (bytes32) {
        return keccak256(abi.encode(CHECKPOINT_TYPEHASH, epoch_, seq_, amount, root));
    }
    function hashClose(uint32 epoch_, uint64 seq_, uint128 toProvider) public pure returns (bytes32) {
        return keccak256(abi.encode(CLOSE_TYPEHASH, epoch_, seq_, toProvider));
    }
    function hashRollover(uint32 epoch_, uint64 seq_, uint128 toProvider) public pure returns (bytes32) {
        return keccak256(abi.encode(ROLLOVER_TYPEHASH, epoch_, seq_, toProvider));
    }
    function hashLeaf(uint32 epoch_, uint64 seq_, bytes32 leaf, uint128 amount) public pure returns (bytes32) {
        return keccak256(abi.encode(LEAF_TYPEHASH, epoch_, seq_, leaf, amount));
    }

    // ---------- funding ----------
    /// @notice Pendanaan tanpa allowance langsung ke channel: Permit2 permitTransferFrom, owner = msg.sender (FR-3).
    /// @dev Transfer ERC-20 biasa (termasuk settlement x402 ke alamat ini) juga sah — budget() = saldo.
    function fundWithPermit2(ISignatureTransfer.PermitTransferFrom calldata permit, bytes calldata signature) external nonReentrant {
        if (state != State.OPEN && state != State.CLOSING) revert WrongState();
        if (permit.permitted.token != cfg.token) revert WrongToken();
        PERMIT2.permitTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({to: address(this), requestedAmount: permit.permitted.amount}),
            msg.sender,
            signature
        );
        emit Funded(msg.sender, permit.permitted.amount);
        emit JobFunded(channelIdField(), msg.sender, permit.permitted.amount);
    }

    // ---------- checkpoint & settle ----------
    /// @notice Checkpoint co-signed. OPEN → mulai jendela; CLOSING → hanya seq lebih tinggi, perpanjang ≤ responseWindow (FR-12/13).
    function submitCheckpoint(uint64 seq_, uint128 amount, bytes32 root, bytes calldata sigClient, bytes calldata sigProvider)
        external
    {
        if (ANCHORED) revert WrongMode();
        if (state != State.OPEN && state != State.CLOSING) revert WrongState();
        if (seq_ > MAX_SEQ) revert SeqTooLarge();
        if (state == State.CLOSING && seq_ <= seq) revert StaleCheckpoint();
        _requireBothSigned(hashCheckpoint(epoch, seq_, amount, root), sigClient, sigProvider);
        seq = seq_;
        cumulativeAmount = amount;
        receiptsRoot = root;
        hasProof = false; // FR-15: bukti lama gugur
        uint64 nowTs = uint64(block.timestamp);
        if (state == State.OPEN) {
            state = State.CLOSING;
            deadline = nowTs + cfg.challengeWindow;
        } else {
            uint64 ext = nowTs + cfg.responseWindow;
            if (ext > deadline) deadline = ext;
        }
        emit CheckpointSubmitted(seq_, amount, root, deadline);
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

    /// @notice Klaim penalti dengan bukti Groth16 atas state saat ini (FR-14). Hanya pihak; payToClient ≤ A dipaksakan kontrak (FR-18).
    function claimPenalty(uint256[8] calldata p, uint128 payToClient_) external {
        if (msg.sender != cfg.client && msg.sender != cfg.provider) revert NotParty();
        if (state != State.CLOSING) revert WrongState();
        if (payToClient_ > cumulativeAmount) revert ExceedsCumulative();
        uint256[6] memory inputs = [
            channelIdField(), uint256(cfg.termsCommitment), uint256(receiptsRoot),
            uint256(seq), uint256(cumulativeAmount), uint256(payToClient_)
        ];
        if (!VERIFIER.verifyProof([p[0], p[1]], [[p[2], p[3]], [p[4], p[5]]], [p[6], p[7]], inputs)) revert InvalidProof();
        payToClient = payToClient_;
        proofSeq = seq;
        hasProof = true;
        emit PenaltyClaimed(msg.sender, seq, payToClient_);
    }

    /// @notice Permissionless setelah deadline (FR-16). Penalti hanya dari bukti atas state saat ini.
    function settle() external nonReentrant {
        if (state != State.CLOSING) revert WrongState();
        if (block.timestamp < deadline) revert TooEarly();
        uint256 pen = (hasProof && proofSeq == seq) ? payToClient : 0;
        _payout(uint256(cumulativeAmount) - pen, pen, false);
    }

    /// @notice Cooperative close: kedua pihak menandatangani Close(seq, toProvider); sisa ke klien; seketika (FR-11).
    function closeCooperative(uint64 seq_, uint128 toProvider, bytes calldata sigClient, bytes calldata sigProvider)
        external nonReentrant
    {
        if (state != State.OPEN && state != State.CLOSING) revert WrongState();
        if (seq_ > MAX_SEQ) revert SeqTooLarge();
        if (seq_ < seq) revert StaleCheckpoint();
        _requireBothSigned(hashClose(epoch, seq_, toProvider), sigClient, sigProvider);
        if (toProvider > budget()) revert ExceedsBudget();
        seq = seq_;
        hasProof = false;
        _payout(toProvider, 0, true);
    }

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
        _send(cfg.payoutProvider, cfg.provider, toProvider);
        emit RolledOver(newEpoch, seq_, toProvider, budget());
        emit PaymentReleased(channelIdField(), cfg.provider, toProvider);
    }

    /// @dev State per-epoch tambahan: mode anchored me-nol-kan pohon inkremental agar epoch baru mulai dari emptyRoot.
    function _resetEpochState() internal { if (ANCHORED) delete filledSubtrees; }

    /// @notice Setelah SETTLED: dana yang masuk belakangan → payoutClient (FR-6). Siapa pun boleh memanggil.
    function sweep() external nonReentrant {
        if (state != State.SETTLED) revert WrongState();
        uint256 b = budget();
        _send(cfg.payoutClient, cfg.client, b);
        emit Swept(b);
    }

    /// @dev toProvider = min(owed, budget); sisa selalu ke klien (FR-17). Efek sebelum interaksi.
    function _payout(uint256 owedToProvider, uint256 penalty, bool cooperative) internal {
        uint256 b = budget();
        uint256 toProvider = owedToProvider < b ? owedToProvider : b;
        uint256 toClient = b - toProvider;
        state = State.SETTLED;
        _send(cfg.payoutProvider, cfg.provider, toProvider);
        _send(cfg.payoutClient, cfg.client, toClient);
        uint256 jobId = channelIdField();
        emit Settled(seq, cumulativeAmount, penalty, toProvider, toClient, cooperative);
        emit PaymentReleased(jobId, cfg.provider, toProvider);
        emit Refunded(jobId, cfg.client, toClient);
    }

    // ---------- internal ----------
    // I2 (final-fix brief): MockUSDG hook terukur 35-90k gas; proxy USDG bergaya Paxos (upgradeable,
    // beberapa SLOAD tambahan lewat delegatecall) diestimasi ~115-120k — margin lama (150k) terlalu tipis
    // untuk implementasi token production yang lebih berat. Stipend hanya benar-benar dikonsumsi bila
    // dipakai (try/catch, T-hook): payee tanpa hook atau hook murah tidak membayar gas ekstra apa pun,
    // jadi menaikkan batas ini tidak menaikkan biaya jalur umum sama sekali.
    uint256 private constant HOOK_GAS = 300_000;

    /// @dev Transfer + hook best-effort (FR-26): payee kontrak boleh menerapkan IAegisPayoutHook (mis. AegisTreasuryRouter).
    ///      Hook dipanggil dengan stipend tetap di dalam try/catch — payee yang revert/menghabiskan gas TIDAK bisa
    ///      menyandera settle/close/sweep pihak lain (T-hook). Semua pemanggil nonReentrant dan state sudah final.
    ///
    ///      Audit 2026-09 (M-1, docs/audit/slither-2026-09.md): `{gas: HOOK_GAS}` hanya batas ATAS — EIP-150 memberi
    ///      callee min(HOOK_GAS, 63/64 gas tersisa). Pemanggil permissionless (settle/sweep) bisa memilih gas limit
    ///      sehingga hook kehabisan gas tetapi tx luar tetap selesai; untuk payee router, token yang sudah ditransfer
    ///      lalu tidak teratribusi (slack) dan bisa diambil siapa pun lewat onPayout(). Sebelum perbaikan, jendela itu
    ///      ada untuk hook berbiaya ~227k-300k (di bawah itu, sisa 1/64 tidak cukup untuk LOG + sentry SSTORE 2300).
    ///      Pemeriksaan pasca-panggilan bergaya OZ ERC2771Forwarder._checkForwardedGas: bila callee kehabisan gas, ia
    ///      menerima tepat 63/64 gas tersisa X, jadi gasleft() = X/64; X/64 < HOOK_GAS/63 ⟹ X < 64/63·HOOK_GAS ⟹
    ///      hook TIDAK ditawari stipend penuh → revert (pemanggil harus memberi gas cukup; estimateGas monoton).
    ///      Hook yang gagal karena ulahnya sendiri (revert / membakar stipend penuh) tetap diabaikan (T-hook utuh).
    function _send(address to, address party, uint256 amount) internal {
        if (amount == 0) return;
        IERC20(cfg.token).safeTransfer(to, amount);
        if (to.code.length > 0) {
            try IAegisPayoutHook(to).onPayout{gas: HOOK_GAS}(party, cfg.token, amount) {} catch {}
            if (gasleft() < HOOK_GAS / 63) revert InsufficientGas();
        }
    }

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
    function _requireBothSigned(bytes32 structHash, bytes calldata sigClient, bytes calldata sigProvider) internal view {
        bytes32 d = _digest(structHash);
        if (!SignatureChecker.isValidSignatureNow(cfg.client, d, sigClient)) revert BadSignature();
        if (!SignatureChecker.isValidSignatureNow(cfg.provider, d, sigProvider)) revert BadSignature();
    }
}
