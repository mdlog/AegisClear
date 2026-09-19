import type { Address, Hex, PublicClient, WalletClient, Transport, Chain, Account } from "viem";
import { factoryAbi, channelAbi, erc20Abi, CHANNEL_STATE } from "./abi.js";
import { type ChannelConfig, type Checkpoint, rootHex } from "../core/typedData.js";
import type { ProofCalldata } from "../core/prover.js";

export interface ChainCtx {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, Account>;
  factory: Address;
  chainId: number;
}

export interface ChannelView {
  state: (typeof CHANNEL_STATE)[number]; seq: number; cumulativeAmount: bigint; receiptsRoot: bigint;
  deadline: number; hasProof: boolean; payToClient: bigint; budget: bigint;
}

export async function waitTx(ctx: ChainCtx, hash: Hex) {
  const r = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`tx ${hash} reverted`);
  return r;
}

export function predictChannel(ctx: ChainCtx, cfg: ChannelConfig): Promise<Address> {
  return ctx.publicClient.readContract({ address: ctx.factory, abi: factoryAbi, functionName: "predict", args: [cfg] });
}

export async function openChannel(ctx: ChainCtx, cfg: ChannelConfig, sigClient: Hex, sigProvider: Hex) {
  const channel = await predictChannel(ctx, cfg);
  const hash = await ctx.walletClient.writeContract({ address: ctx.factory, abi: factoryAbi, functionName: "open", args: [cfg, sigClient, sigProvider] });
  const receipt = await waitTx(ctx, hash);
  return { channel, hash, gasUsed: receipt.gasUsed };
}

export async function readChannel(ctx: ChainCtx, channel: Address): Promise<ChannelView> {
  const c = { address: channel, abi: channelAbi } as const;
  const [st, seq, A, R, dl, hp, pc, b] = await Promise.all([
    ctx.publicClient.readContract({ ...c, functionName: "state" }),
    ctx.publicClient.readContract({ ...c, functionName: "seq" }),
    ctx.publicClient.readContract({ ...c, functionName: "cumulativeAmount" }),
    ctx.publicClient.readContract({ ...c, functionName: "receiptsRoot" }),
    ctx.publicClient.readContract({ ...c, functionName: "deadline" }),
    ctx.publicClient.readContract({ ...c, functionName: "hasProof" }),
    ctx.publicClient.readContract({ ...c, functionName: "payToClient" }),
    ctx.publicClient.readContract({ ...c, functionName: "budget" }),
  ]);
  return { state: CHANNEL_STATE[Number(st)], seq: Number(seq), cumulativeAmount: A, receiptsRoot: BigInt(R), deadline: Number(dl), hasProof: hp, payToClient: pc, budget: b };
}

async function write(ctx: ChainCtx, channel: Address, functionName: any, args: any[]) {
  const hash = await ctx.walletClient.writeContract({ address: channel, abi: channelAbi, functionName, args } as any);
  const receipt = await waitTx(ctx, hash);
  return { hash, gasUsed: receipt.gasUsed };
}
export const submitCheckpointTx = (ctx: ChainCtx, ch: Address, cp: Checkpoint, sigC: Hex, sigP: Hex) =>
  write(ctx, ch, "submitCheckpoint", [BigInt(cp.seq), cp.cumulativeAmount, rootHex(cp.receiptsRoot), sigC, sigP]);
export const claimPenaltyTx = (ctx: ChainCtx, ch: Address, cd: ProofCalldata) =>
  write(ctx, ch, "claimPenalty", [cd.proof, cd.inputs[5]]);
export const settleTx = (ctx: ChainCtx, ch: Address) => write(ctx, ch, "settle", []);
export const sweepTx = (ctx: ChainCtx, ch: Address) => write(ctx, ch, "sweep", []);
export const closeCooperativeTx = (ctx: ChainCtx, ch: Address, seq: number, toProvider: bigint, sigC: Hex, sigP: Hex) =>
  write(ctx, ch, "closeCooperative", [BigInt(seq), toProvider, sigC, sigP]);

export async function erc20Transfer(ctx: ChainCtx, token: Address, to: Address, amount: bigint) {
  const hash = await ctx.walletClient.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [to, amount] });
  const receipt = await waitTx(ctx, hash);
  return { hash, gasUsed: receipt.gasUsed };
}
export const erc20Balance = (ctx: ChainCtx, token: Address, who: Address) =>
  ctx.publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });
