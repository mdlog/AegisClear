import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { createPublicClient, http, encodeAbiParameters, hashTypedData, hashDomain, getTypesForEIP712Domain, keccak256, toBytes, concatHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import {
  signCheckpoint, verifyCheckpointSig, signChannelTerms, verifyChannelTermsSig, signClose, verifyCloseSig, signRollover, verifyRolloverSig,
  makeTypedDataVerifier, domain, CHECKPOINT_TYPES, CLOSE_TYPES, ROLLOVER_TYPES, LEAF_TYPES, rootHex, signLeaf, verifyLeafSig, type ChannelConfig,
} from "../src/core/typedData.js";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const other = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const DEPLOY = new URL("../../contracts/deployments/local.json", import.meta.url).pathname;
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const channel = "0x00000000000000000000000000000000000001ff" as const;
const cfg: ChannelConfig = {
  client: acct.address, provider: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", token: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  termsCommitment: "0x" + "12".padStart(64, "0") as `0x${string}`, challengeWindow: 120, responseWindow: 60,
  payoutClient: acct.address, payoutProvider: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", salt: "0x" + "1".padStart(64, "0") as `0x${string}`,
};

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
    // Generik eksplisit: getTypesForEIP712Domain() mengembalikan TypedDataParameter[] biasa (field `type`
    // melebar jadi `string`), bukan literal `as const` — tanpa ini `hashDomain` mencoba memetakannya lewat
    // TypedDataToPrimitiveTypes (abitype) dan gagal di level tipe (bukan di runtime; nilai hash tidak berubah).
    const domSep = hashDomain<Record<string, unknown>>({ domain: dom, types: { EIP712Domain: getTypesForEIP712Domain({ domain: dom }) } });
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
  it("leaf sign/verify (anchored) dan struct hash cocok dengan typehash kontrak", async () => {
    const m = { epoch: 0, seq: 3, leaf: rootHex(16723296179585495516306154995438540387388995699464725696412698533727287537557n), cumulativeAmount: 80_000n };
    const sig = await signLeaf(acct, channel, 31337, m);
    expect(await verifyLeafSig(acct.address, channel, 31337, m, sig)).toBe(true);
    expect(await verifyLeafSig(acct.address, channel, 31337, { ...m, cumulativeAmount: 80_001n }, sig)).toBe(false);
    const dom = domain(channel, 31337);
    // Generik eksplisit — lihat catatan di "struct hash cocok dengan typehash kontrak" di atas.
    const domSep = hashDomain<Record<string, unknown>>({ domain: dom, types: { EIP712Domain: getTypesForEIP712Domain({ domain: dom }) } });
    const encoded = encodeAbiParameters([{ type: "bytes32" }, { type: "uint32" }, { type: "uint64" }, { type: "bytes32" }, { type: "uint128" }],
      [keccak256(toBytes("Leaf(uint32 epoch,uint64 seq,bytes32 leaf,uint128 cumulativeAmount)")), 0, 3n, m.leaf, 80_000n]);
    expect(hashTypedData({ domain: dom, types: LEAF_TYPES, primaryType: "Leaf", message: { epoch: 0, seq: 3n, leaf: m.leaf, cumulativeAmount: 80_000n } }))
      .toBe(keccak256(concatHex(["0x1901", domSep, keccak256(encoded)])));
  });
});

// F6: verifier sadar ERC-1271/6492 (publicClient.verifyTypedData → eth_call validator universal di Anvil).
// Butuh RPC hidup (gate sama seperti suite integrasi: file deploy lokal ada ⇒ Anvil diasumsikan berjalan).
describe.skipIf(!existsSync(DEPLOY))("makeTypedDataVerifier (ERC-1271/6492-aware)", () => {
  const v = makeTypedDataVerifier(createPublicClient({ chain: foundry, transport: http(RPC) }));
  it("checkpoint EOA (epoch 0): sah → true; pesan/chainId/penandatangan lain → false; setara fungsi murni", async () => {
    const cp = { epoch: 0, seq: 100, cumulativeAmount: 2_000_000n, receiptsRoot: 777n };
    const sig = await signCheckpoint(acct, channel, 31337, cp);
    expect(await v.verifyCheckpointSig(acct.address, channel, 31337, cp, sig)).toBe(true);
    expect(await v.verifyCheckpointSig(acct.address, channel, 31337, { ...cp, seq: 101 }, sig)).toBe(false);
    expect(await v.verifyCheckpointSig(acct.address, channel, 4663, cp, sig)).toBe(false);
    expect(await v.verifyCheckpointSig(other.address, channel, 31337, cp, sig)).toBe(false);
    expect(await v.verifyCheckpointSig(acct.address, channel, 31337, cp, sig)).toBe(await verifyCheckpointSig(acct.address, channel, 31337, cp, sig));
  });
  it("channel terms, close & rollover (epoch 0) EOA lewat verifier on-chain", async () => {
    const s1 = await signChannelTerms(acct, channel, 31337, cfg);
    expect(await v.verifyChannelTermsSig(acct.address, channel, 31337, cfg, s1)).toBe(true);
    expect(await v.verifyChannelTermsSig(acct.address, channel, 31337, { ...cfg, challengeWindow: 121 }, s1)).toBe(false);
    expect(await v.verifyChannelTermsSig(other.address, channel, 31337, cfg, s1)).toBe(false);
    const m = { epoch: 0, seq: 10, toProvider: 5n };
    const s2 = await signClose(acct, channel, 31337, m);
    expect(await v.verifyCloseSig(acct.address, channel, 31337, m, s2)).toBe(true);
    expect(await v.verifyCloseSig(acct.address, channel, 31337, { ...m, toProvider: 6n }, s2)).toBe(false);
    const s3 = await signRollover(acct, channel, 31337, m);
    expect(await v.verifyRolloverSig(acct.address, channel, 31337, m, s3)).toBe(true);
  });
});
