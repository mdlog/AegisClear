import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import {
  signCheckpoint, verifyCheckpointSig, signChannelTerms, verifyChannelTermsSig, signClose, verifyCloseSig, makeTypedDataVerifier, type ChannelConfig,
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
  it("checkpoint sign/verify roundtrip; nilai berbeda gagal", async () => {
    const cp = { seq: 100, cumulativeAmount: 2_000_000n, receiptsRoot: 777n };
    const sig = await signCheckpoint(acct, channel, 31337, cp);
    expect(await verifyCheckpointSig(acct.address, channel, 31337, cp, sig)).toBe(true);
    expect(await verifyCheckpointSig(acct.address, channel, 31337, { ...cp, seq: 101 }, sig)).toBe(false);
    expect(await verifyCheckpointSig(acct.address, channel, 4663, cp, sig)).toBe(false);
  });
  it("channel terms & close roundtrip", async () => {
    const s1 = await signChannelTerms(acct, channel, 31337, cfg);
    expect(await verifyChannelTermsSig(acct.address, channel, 31337, cfg, s1)).toBe(true);
    const s2 = await signClose(acct, channel, 31337, { seq: 10, toProvider: 5n });
    expect(await verifyCloseSig(acct.address, channel, 31337, { seq: 10, toProvider: 5n }, s2)).toBe(true);
    expect(await verifyCloseSig(acct.address, channel, 31337, { seq: 10, toProvider: 6n }, s2)).toBe(false);
  });
});

// F6: verifier sadar ERC-1271/6492 (publicClient.verifyTypedData → eth_call validator universal di Anvil).
// Butuh RPC hidup (gate sama seperti suite integrasi: file deploy lokal ada ⇒ Anvil diasumsikan berjalan).
describe.skipIf(!existsSync(DEPLOY))("makeTypedDataVerifier (ERC-1271/6492-aware)", () => {
  const v = makeTypedDataVerifier(createPublicClient({ chain: foundry, transport: http(RPC) }));
  it("checkpoint EOA: sah → true; pesan/chainId/penandatangan lain → false; setara fungsi murni", async () => {
    const cp = { seq: 100, cumulativeAmount: 2_000_000n, receiptsRoot: 777n };
    const sig = await signCheckpoint(acct, channel, 31337, cp);
    expect(await v.verifyCheckpointSig(acct.address, channel, 31337, cp, sig)).toBe(true);
    expect(await v.verifyCheckpointSig(acct.address, channel, 31337, { ...cp, seq: 101 }, sig)).toBe(false);
    expect(await v.verifyCheckpointSig(acct.address, channel, 4663, cp, sig)).toBe(false);
    expect(await v.verifyCheckpointSig(other.address, channel, 31337, cp, sig)).toBe(false);
    expect(await v.verifyCheckpointSig(acct.address, channel, 31337, cp, sig)).toBe(await verifyCheckpointSig(acct.address, channel, 31337, cp, sig));
  });
  it("channel terms & close EOA lewat verifier on-chain", async () => {
    const s1 = await signChannelTerms(acct, channel, 31337, cfg);
    expect(await v.verifyChannelTermsSig(acct.address, channel, 31337, cfg, s1)).toBe(true);
    expect(await v.verifyChannelTermsSig(acct.address, channel, 31337, { ...cfg, challengeWindow: 121 }, s1)).toBe(false);
    expect(await v.verifyChannelTermsSig(other.address, channel, 31337, cfg, s1)).toBe(false);
    const s2 = await signClose(acct, channel, 31337, { seq: 10, toProvider: 5n });
    expect(await v.verifyCloseSig(acct.address, channel, 31337, { seq: 10, toProvider: 5n }, s2)).toBe(true);
    expect(await v.verifyCloseSig(acct.address, channel, 31337, { seq: 10, toProvider: 6n }, s2)).toBe(false);
  });
});
