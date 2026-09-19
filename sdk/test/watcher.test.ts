import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { Watcher } from "../src/watcher/watcher.js";
import { predictChannel, openChannel, submitCheckpointTx, erc20Transfer, erc20Balance, signChannelTerms, signCheckpoint, readChannel, type ChainCtx, type ChannelConfig, type Checkpoint } from "../src/index.js";

const DEPLOY = new URL("../../contracts/deployments/local.json", import.meta.url).pathname;
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const PK_C = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const PK_P = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex;

describe.skipIf(!existsSync(DEPLOY))("watcher", () => {
  it("settle setelah deadline, lalu sweep dana yang masuk belakangan", async () => {
    const d = JSON.parse(readFileSync(DEPLOY, "utf8")) as { usdg: Address; factory: Address };
    const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
    const ctx = (pk: Hex): ChainCtx => ({ publicClient, chainId: 31337, factory: d.factory, walletClient: createWalletClient({ account: privateKeyToAccount(pk), chain: foundry, transport: http(RPC) }) });
    const client = privateKeyToAccount(PK_C), provider = privateKeyToAccount(PK_P);
    const cfg: ChannelConfig = { client: client.address, provider: provider.address, token: d.usdg, termsCommitment: ("0x" + "42".padStart(64, "0")) as Hex,
      challengeWindow: 60, responseWindow: 30, payoutClient: client.address, payoutProvider: provider.address, salt: ("0x" + Date.now().toString(16).padStart(64, "0")) as Hex };
    const predicted = await predictChannel(ctx(PK_C), cfg);
    const sigP = await signChannelTerms(provider, predicted, 31337, cfg);
    const { channel } = await openChannel(ctx(PK_C), cfg, "0x", sigP);   // klien membuka, provider menandatangani
    await erc20Transfer(ctx(PK_C), d.usdg, channel, 500_000n);
    const cp = { seq: 3, cumulativeAmount: 60_000n, receiptsRoot: 5n };
    await submitCheckpointTx(ctx(PK_P), channel, cp, await signCheckpoint(client, channel, 31337, cp), await signCheckpoint(provider, channel, 31337, cp));

    const w = new Watcher({ ctx: ctx(PK_P) });
    expect((await w.tick()).settled).not.toContain(channel);            // belum deadline
    await publicClient.request({ method: "evm_increaseTime", params: [61] } as any);
    await publicClient.request({ method: "evm_mine", params: [] } as any);
    expect((await w.tick()).settled).toContain(channel);
    expect((await readChannel(ctx(PK_P), channel)).state).toBe("SETTLED");
    await erc20Transfer(ctx(PK_C), d.usdg, channel, 1_000n);              // dana terlambat
    const c0 = await erc20Balance(ctx(PK_C), d.usdg, client.address);
    expect((await w.tick()).swept).toContain(channel);
    expect((await erc20Balance(ctx(PK_C), d.usdg, client.address)) - c0).toBe(1_000n);
  });

  it("challenge responder: checkpoint basi klien (seq 3) diganti provider dengan seq 7 co-signed, lalu settle membayar seq 7", async () => {
    const d = JSON.parse(readFileSync(DEPLOY, "utf8")) as { usdg: Address; factory: Address };
    const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
    const ctx = (pk: Hex): ChainCtx => ({ publicClient, chainId: 31337, factory: d.factory, walletClient: createWalletClient({ account: privateKeyToAccount(pk), chain: foundry, transport: http(RPC) }) });
    const client = privateKeyToAccount(PK_C), provider = privateKeyToAccount(PK_P);
    const cfg: ChannelConfig = { client: client.address, provider: provider.address, token: d.usdg, termsCommitment: ("0x" + "42".padStart(64, "0")) as Hex,
      challengeWindow: 60, responseWindow: 30, payoutClient: client.address, payoutProvider: provider.address, salt: ("0x" + randomBytes(32).toString("hex")) as Hex };
    const predicted = await predictChannel(ctx(PK_C), cfg);
    const sigP = await signChannelTerms(provider, predicted, 31337, cfg);
    const { channel } = await openChannel(ctx(PK_C), cfg, "0x", sigP);
    await erc20Transfer(ctx(PK_C), d.usdg, channel, 500_000n);

    // klien & provider co-sign DUA checkpoint off-chain: seq 3 (basi) dan seq 7 (tertinggi/benar)
    const cpStale: Checkpoint = { seq: 3, cumulativeAmount: 60_000n, receiptsRoot: 5n };
    const cpLatest: Checkpoint = { seq: 7, cumulativeAmount: 140_000n, receiptsRoot: 9n };
    const bothSign = async (cp: Checkpoint) => ({
      cp, sigClient: await signCheckpoint(client, channel, 31337, cp), sigProvider: await signCheckpoint(provider, channel, 31337, cp),
    });
    const stale = await bothSign(cpStale);
    const latest = await bothSign(cpLatest);

    // klien mencoba menutup channel di on-chain dengan checkpoint BASI (seq 3)
    await submitCheckpointTx(ctx(PK_C), channel, stale.cp, stale.sigClient, stale.sigProvider);
    expect((await readChannel(ctx(PK_P), channel)).seq).toBe(3);

    // Watcher milik provider tahu co-signed checkpoint yang lebih tinggi (seq 7) untuk channel ini
    const w = new Watcher({ ctx: ctx(PK_P), coSigned: (ch) => (ch.toLowerCase() === channel.toLowerCase() ? latest : undefined) });
    const r1 = await w.tick();
    expect(r1.responded).toContain(channel);
    expect(r1.settled).not.toContain(channel);
    expect((await readChannel(ctx(PK_P), channel)).seq).toBe(7);

    // lewati deadline asli (t0+60) — tetap di situ karena respons datang jauh sebelum t0+30
    await publicClient.request({ method: "evm_increaseTime", params: [61] } as any);
    await publicClient.request({ method: "evm_mine", params: [] } as any);
    const p0 = await erc20Balance(ctx(PK_C), d.usdg, provider.address);
    const r2 = await w.tick();
    expect(r2.settled).toContain(channel);
    expect((await readChannel(ctx(PK_P), channel)).state).toBe("SETTLED");
    expect((await erc20Balance(ctx(PK_C), d.usdg, provider.address)) - p0).toBe(140_000n);
  });
});
