import { type Address, type Hex, type PrivateKeyAccount, type PublicClient, verifyTypedData, toHex } from "viem";

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
  Checkpoint: [{ name: "epoch", type: "uint32" }, { name: "seq", type: "uint64" }, { name: "cumulativeAmount", type: "uint128" }, { name: "receiptsRoot", type: "bytes32" }],
} as const;
export const CLOSE_TYPES = { Close: [{ name: "epoch", type: "uint32" }, { name: "seq", type: "uint64" }, { name: "toProvider", type: "uint128" }] } as const;
export const ROLLOVER_TYPES = { Rollover: [{ name: "epoch", type: "uint32" }, { name: "seq", type: "uint64" }, { name: "toProvider", type: "uint128" }] } as const;
export const LEAF_TYPES = { Leaf: [{ name: "epoch", type: "uint32" }, { name: "seq", type: "uint64" }, { name: "leaf", type: "bytes32" }, { name: "cumulativeAmount", type: "uint128" }] } as const;

export interface ChannelConfig {
  client: Address; provider: Address; token: Address; termsCommitment: Hex;
  challengeWindow: number; responseWindow: number; payoutClient: Address; payoutProvider: Address; salt: Hex;
}
/** Setiap pesan memuat `epoch` (FR-10): tanda tangan epoch lama mati setelah `rollover`. */
export interface Checkpoint { epoch: number; seq: number; cumulativeAmount: bigint; receiptsRoot: bigint }
export interface CloseMsg { epoch: number; seq: number; toProvider: bigint }
export type RolloverMsg = CloseMsg;
/** Anchored (FR-25): provider menandatangani daun Poseidon + kumulatif; klien mengirimnya ke `ack()`. */
export interface LeafMsg { epoch: number; seq: number; leaf: Hex; cumulativeAmount: bigint }

export const rootHex = (r: bigint): Hex => toHex(r, { size: 32 });
const cpMsg = (cp: Checkpoint) => ({ epoch: cp.epoch, seq: BigInt(cp.seq), cumulativeAmount: cp.cumulativeAmount, receiptsRoot: rootHex(cp.receiptsRoot) });
const closeMsg = (m: CloseMsg) => ({ epoch: m.epoch, seq: BigInt(m.seq), toProvider: m.toProvider });
const leafMsg = (m: LeafMsg) => ({ epoch: m.epoch, seq: BigInt(m.seq), leaf: m.leaf, cumulativeAmount: m.cumulativeAmount });

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
export function signRollover(a: PrivateKeyAccount, channel: Address, chainId: number, m: RolloverMsg): Promise<Hex> {
  return a.signTypedData({ domain: domain(channel, chainId), types: ROLLOVER_TYPES, primaryType: "Rollover", message: closeMsg(m) });
}
export function verifyRolloverSig(signer: Address, channel: Address, chainId: number, m: RolloverMsg, signature: Hex): Promise<boolean> {
  return verifyTypedData({ address: signer, domain: domain(channel, chainId), types: ROLLOVER_TYPES, primaryType: "Rollover", message: closeMsg(m), signature });
}
export function signLeaf(a: PrivateKeyAccount, channel: Address, chainId: number, m: LeafMsg): Promise<Hex> {
  return a.signTypedData({ domain: domain(channel, chainId), types: LEAF_TYPES, primaryType: "Leaf", message: leafMsg(m) });
}
export function verifyLeafSig(signer: Address, channel: Address, chainId: number, m: LeafMsg, signature: Hex): Promise<boolean> {
  return verifyTypedData({ address: signer, domain: domain(channel, chainId), types: LEAF_TYPES, primaryType: "Leaf", message: leafMsg(m), signature });
}

/**
 * Verifier tanda tangan EIP-712 yang SADAR KONTRAK. `verifyChannelTermsSig`/`verifyCheckpointSig`/
 * `verifyCloseSig`/`verifyRolloverSig` murni di atas hanya melakukan ecrecover (EOA), sedangkan `AegisChannel`
 * menerima tanda tangan ERC-1271 (`SignatureChecker.isValidSignatureNow`, T12) — smart account / brankas
 * ERC-4337 sah di kontrak tetapi akan ditolak SDK bila SDK hanya ecrecover. Factory ini memakai
 * `publicClient.verifyTypedData` (viem): EOA lewat ecrecover, akun kontrak lewat `isValidSignature`
 * (eth_call on-chain), termasuk pembungkus ERC-6492 untuk akun yang belum di-deploy. `false` untuk
 * tanda tangan tidak sah; melempar hanya bila RPC gagal. Fungsi murni tetap tersedia untuk EOA/offline.
 */
export interface TypedDataVerifier {
  verifyChannelTermsSig(signer: Address, channel: Address, chainId: number, c: ChannelConfig, signature: Hex): Promise<boolean>;
  verifyCheckpointSig(signer: Address, channel: Address, chainId: number, cp: Checkpoint, signature: Hex): Promise<boolean>;
  verifyCloseSig(signer: Address, channel: Address, chainId: number, m: CloseMsg, signature: Hex): Promise<boolean>;
  verifyRolloverSig(signer: Address, channel: Address, chainId: number, m: RolloverMsg, signature: Hex): Promise<boolean>;
  verifyLeafSig(signer: Address, channel: Address, chainId: number, m: LeafMsg, signature: Hex): Promise<boolean>;
}
export function makeTypedDataVerifier(publicClient: PublicClient): TypedDataVerifier {
  return {
    verifyChannelTermsSig: (signer, channel, chainId, c, signature) =>
      publicClient.verifyTypedData({ address: signer, domain: domain(channel, chainId), types: CHANNEL_TERMS_TYPES, primaryType: "ChannelTerms", message: { ...c }, signature }),
    verifyCheckpointSig: (signer, channel, chainId, cp, signature) =>
      publicClient.verifyTypedData({ address: signer, domain: domain(channel, chainId), types: CHECKPOINT_TYPES, primaryType: "Checkpoint", message: cpMsg(cp), signature }),
    verifyCloseSig: (signer, channel, chainId, m, signature) =>
      publicClient.verifyTypedData({ address: signer, domain: domain(channel, chainId), types: CLOSE_TYPES, primaryType: "Close", message: closeMsg(m), signature }),
    verifyRolloverSig: (signer, channel, chainId, m, signature) =>
      publicClient.verifyTypedData({ address: signer, domain: domain(channel, chainId), types: ROLLOVER_TYPES, primaryType: "Rollover", message: closeMsg(m), signature }),
    verifyLeafSig: (signer, channel, chainId, m, signature) =>
      publicClient.verifyTypedData({ address: signer, domain: domain(channel, chainId), types: LEAF_TYPES, primaryType: "Leaf", message: leafMsg(m), signature }),
  };
}
