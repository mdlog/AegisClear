// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {ISLASettlementVerifier} from "./interfaces/ISLASettlementVerifier.sol";

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
        keccak256("Checkpoint(uint64 seq,uint128 cumulativeAmount,bytes32 receiptsRoot)");
    bytes32 public constant CLOSE_TYPEHASH = keccak256("Close(uint64 seq,uint128 toProvider)");
    uint64 public constant MAX_SEQ = 128;

    address public immutable FACTORY;
    ISLASettlementVerifier public immutable VERIFIER;
    ISignatureTransfer public immutable PERMIT2;

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

    event Opened(address indexed client, address indexed provider, bytes32 termsCommitment, uint32 challengeWindow);
    event Funded(address indexed from, uint256 amount);
    event CheckpointSubmitted(uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, uint64 deadline);
    event PenaltyClaimed(address indexed by, uint64 seq, uint128 payToClient);
    event Settled(uint64 seq, uint128 cumulativeAmount, uint256 penalty, uint256 toProvider, uint256 toClient, bool cooperative);
    event Swept(uint256 amount);
    // Bentuk ERC-8183 (FR-27)
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);

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

    constructor(address verifier, address permit2) {
        FACTORY = msg.sender;
        VERIFIER = ISLASettlementVerifier(verifier);
        PERMIT2 = ISignatureTransfer(permit2);
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
    function hashCheckpoint(uint64 seq_, uint128 amount, bytes32 root) public pure returns (bytes32) {
        return keccak256(abi.encode(CHECKPOINT_TYPEHASH, seq_, amount, root));
    }
    function hashClose(uint64 seq_, uint128 toProvider) public pure returns (bytes32) {
        return keccak256(abi.encode(CLOSE_TYPEHASH, seq_, toProvider));
    }

    // ---------- checkpoint & settle ----------
    /// @notice Checkpoint co-signed. OPEN → mulai jendela; CLOSING → hanya seq lebih tinggi, perpanjang ≤ responseWindow (FR-12/13).
    function submitCheckpoint(uint64 seq_, uint128 amount, bytes32 root, bytes calldata sigClient, bytes calldata sigProvider)
        external
    {
        if (state != State.OPEN && state != State.CLOSING) revert WrongState();
        if (seq_ > MAX_SEQ) revert SeqTooLarge();
        if (state == State.CLOSING && seq_ <= seq) revert StaleCheckpoint();
        _requireBothSigned(hashCheckpoint(seq_, amount, root), sigClient, sigProvider);
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

    /// @notice Permissionless setelah deadline (FR-16). Penalti hanya dari bukti atas state saat ini.
    function settle() external nonReentrant {
        if (state != State.CLOSING) revert WrongState();
        if (block.timestamp < deadline) revert TooEarly();
        uint256 pen = (hasProof && proofSeq == seq) ? payToClient : 0;
        _payout(uint256(cumulativeAmount) - pen, pen, false);
    }

    /// @dev toProvider = min(owed, budget); sisa selalu ke klien (FR-17). Efek sebelum interaksi.
    function _payout(uint256 owedToProvider, uint256 penalty, bool cooperative) internal {
        uint256 b = budget();
        uint256 toProvider = owedToProvider < b ? owedToProvider : b;
        uint256 toClient = b - toProvider;
        state = State.SETTLED;
        IERC20 t = IERC20(cfg.token);
        if (toProvider > 0) t.safeTransfer(cfg.payoutProvider, toProvider);
        if (toClient > 0) t.safeTransfer(cfg.payoutClient, toClient);
        uint256 jobId = channelIdField();
        emit Settled(seq, cumulativeAmount, penalty, toProvider, toClient, cooperative);
        emit PaymentReleased(jobId, cfg.provider, toProvider);
        emit Refunded(jobId, cfg.client, toClient);
    }

    // ---------- internal ----------
    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
    function _requireBothSigned(bytes32 structHash, bytes calldata sigClient, bytes calldata sigProvider) internal view {
        bytes32 d = _digest(structHash);
        if (!SignatureChecker.isValidSignatureNow(cfg.client, d, sigClient)) revert BadSignature();
        if (!SignatureChecker.isValidSignatureNow(cfg.provider, d, sigProvider)) revert BadSignature();
    }
}
