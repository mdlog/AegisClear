import { parseAbi } from "viem";

export const factoryAbi = parseAbi([
  "struct Config { address client; address provider; address token; bytes32 termsCommitment; uint32 challengeWindow; uint32 responseWindow; address payoutClient; address payoutProvider; bytes32 salt; }",
  "function predict(Config c) view returns (address)",
  "function open(Config c, bytes sigClient, bytes sigProvider) returns (address)",
  "function IMPLEMENTATION() view returns (address)",
  "function MIN_CHALLENGE_WINDOW() view returns (uint32)",
  "event ChannelOpened(address indexed channel, address indexed client, address indexed provider, bytes32 termsCommitment)",
]);

export const channelAbi = parseAbi([
  "function state() view returns (uint8)",
  "function seq() view returns (uint64)",
  "function cumulativeAmount() view returns (uint128)",
  "function receiptsRoot() view returns (bytes32)",
  "function deadline() view returns (uint64)",
  "function hasProof() view returns (bool)",
  "function payToClient() view returns (uint128)",
  "function budget() view returns (uint256)",
  "function epoch() view returns (uint32)",
  "function cfg() view returns (address client, address provider, address token, bytes32 termsCommitment, uint32 challengeWindow, uint32 responseWindow, address payoutClient, address payoutProvider, bytes32 salt)",
  "event Opened(address indexed client, address indexed provider, bytes32 termsCommitment, uint32 challengeWindow)",
  "event Funded(address indexed from, uint256 amount)",
  "event Swept(uint256 amount)",
  "function submitCheckpoint(uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, bytes sigClient, bytes sigProvider)",
  "function claimPenalty(uint256[8] proof, uint128 payToClient)",
  "function settle()",
  "function sweep()",
  "function closeCooperative(uint64 seq, uint128 toProvider, bytes sigClient, bytes sigProvider)",
  "function rollover(uint64 seq, uint128 toProvider, bytes sigClient, bytes sigProvider)",
  "event Settled(uint64 seq, uint128 cumulativeAmount, uint256 penalty, uint256 toProvider, uint256 toClient, bool cooperative)",
  "event CheckpointSubmitted(uint64 seq, uint128 cumulativeAmount, bytes32 receiptsRoot, uint64 deadline)",
  "event PenaltyClaimed(address indexed by, uint64 seq, uint128 payToClient)",
  "event RolledOver(uint32 indexed newEpoch, uint64 closedSeq, uint256 toProvider, uint256 remaining)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
  "function decimals() view returns (uint8)",
]);

export const CHANNEL_STATE = ["UNINIT", "OPEN", "CLOSING", "SETTLED"] as const;
