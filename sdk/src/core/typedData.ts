import { type Address, type Hex, type PrivateKeyAccount, verifyTypedData, toHex } from "viem";

export const EIP712_NAME = "AegisClear";
export const EIP712_VERSION = "1";

export function domain(channel: Address, chainId: number) {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract: channel } as const;
}

export const CHANNEL_TERMS_TYPES = {
  ChannelTerms: [
    { name: "client", type: "address" }, { name: "provider", type: "address" }, { name: "token", type: "address" },
    { name: "termsCommitment", type: "bytes32" }, { name: "challengeWindow", type: "uint32" }, { name: "responseWindow", type: "uint32" },
    { name: "payoutClient", type: "address" }, { name: "payoutProvider", type: "address" }, { name: "salt", type: "bytes32" },
  ],
} as const;
export const CHECKPOINT_TYPES = {
  Checkpoint: [{ name: "seq", type: "uint64" }, { name: "cumulativeAmount", type: "uint128" }, { name: "receiptsRoot", type: "bytes32" }],
} as const;
export const CLOSE_TYPES = { Close: [{ name: "seq", type: "uint64" }, { name: "toProvider", type: "uint128" }] } as const;

export interface ChannelConfig {
  client: Address; provider: Address; token: Address; termsCommitment: Hex;
  challengeWindow: number; responseWindow: number; payoutClient: Address; payoutProvider: Address; salt: Hex;
}
export interface Checkpoint { seq: number; cumulativeAmount: bigint; receiptsRoot: bigint }
export interface CloseMsg { seq: number; toProvider: bigint }

export const rootHex = (r: bigint): Hex => toHex(r, { size: 32 });
const cpMsg = (cp: Checkpoint) => ({ seq: BigInt(cp.seq), cumulativeAmount: cp.cumulativeAmount, receiptsRoot: rootHex(cp.receiptsRoot) });
const closeMsg = (m: CloseMsg) => ({ seq: BigInt(m.seq), toProvider: m.toProvider });

export function signChannelTerms(a: PrivateKeyAccount, channel: Address, chainId: number, c: ChannelConfig): Promise<Hex> {
  return a.signTypedData({ domain: domain(channel, chainId), types: CHANNEL_TERMS_TYPES, primaryType: "ChannelTerms", message: c });
}
export function verifyChannelTermsSig(signer: Address, channel: Address, chainId: number, c: ChannelConfig, signature: Hex): Promise<boolean> {
  return verifyTypedData({ address: signer, domain: domain(channel, chainId), types: CHANNEL_TERMS_TYPES, primaryType: "ChannelTerms", message: c, signature });
}
export function signCheckpoint(a: PrivateKeyAccount, channel: Address, chainId: number, cp: Checkpoint): Promise<Hex> {
  return a.signTypedData({ domain: domain(channel, chainId), types: CHECKPOINT_TYPES, primaryType: "Checkpoint", message: cpMsg(cp) });
}
export function verifyCheckpointSig(signer: Address, channel: Address, chainId: number, cp: Checkpoint, signature: Hex): Promise<boolean> {
  return verifyTypedData({ address: signer, domain: domain(channel, chainId), types: CHECKPOINT_TYPES, primaryType: "Checkpoint", message: cpMsg(cp), signature });
}
export function signClose(a: PrivateKeyAccount, channel: Address, chainId: number, m: CloseMsg): Promise<Hex> {
  return a.signTypedData({ domain: domain(channel, chainId), types: CLOSE_TYPES, primaryType: "Close", message: closeMsg(m) });
}
export function verifyCloseSig(signer: Address, channel: Address, chainId: number, m: CloseMsg, signature: Hex): Promise<boolean> {
  return verifyTypedData({ address: signer, domain: domain(channel, chainId), types: CLOSE_TYPES, primaryType: "Close", message: closeMsg(m), signature });
}
