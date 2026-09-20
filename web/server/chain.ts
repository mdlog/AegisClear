import { createPublicClient, createWalletClient, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { erc20Abi, erc20Balance, type ChainCtx } from "@aegisclear/sdk";
import type { StepInput } from "@aegisclear/demo";
import type { WebConfig } from "./config.js";

export interface ChainServices {
  publicClient: PublicClient;
  ctx: (pk: Hex) => ChainCtx;
  addressOf: (pk: Hex) => Address;
  /** MockUSDG.mint (permissionless) dari kunci faucet bila saldo `who` < `min`; 50 USDG per mint. */
  ensureUsdg: (who: Address, min: bigint) => Promise<{ minted: bigint }>;
  /** local: evm_increaseTime + evm_mine; testnet: tunggu nyata, step "wait" tiap 10 s. */
  timeTravel: (seconds: number, emit: (s: StepInput) => void) => Promise<void>;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const MINT_AMOUNT = 50_000_000n;

export function makeChain(cfg: WebConfig): ChainServices {
  const publicClient = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl) });
  const ctx = (pk: Hex): ChainCtx => ({
    publicClient, chainId: cfg.chainId, factory: cfg.deployment.factory,
    walletClient: createWalletClient({ account: privateKeyToAccount(pk), chain: cfg.chain, transport: http(cfg.rpcUrl) }),
  });
  const addressOf = (pk: Hex) => privateKeyToAccount(pk).address;
  const ensureUsdg: ChainServices["ensureUsdg"] = async (who, min) => {
    const faucet = ctx(cfg.keys.faucet);
    if ((await erc20Balance(faucet, cfg.deployment.usdg, who)) >= min) return { minted: 0n };
    const hash = await faucet.walletClient.writeContract({ address: cfg.deployment.usdg, abi: erc20Abi, functionName: "mint", args: [who, MINT_AMOUNT] });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`mint ke ${who} gagal (${hash})`);
    return { minted: MINT_AMOUNT };
  };
  const timeTravel: ChainServices["timeTravel"] = cfg.network === "local"
    ? async (seconds, emit) => {
        emit({ phase: "wait", label: `Anvil: evm_increaseTime(${seconds}) + evm_mine` });
        await publicClient.request({ method: "evm_increaseTime", params: [seconds] } as any);
        await publicClient.request({ method: "evm_mine", params: [] } as any);
      }
    : async (seconds, emit) => {
        for (let left = seconds; left > 0; left -= 10) {
          emit({ phase: "wait", label: `menunggu jendela tantangan: ${left} s tersisa`, progress: { done: seconds - left, total: seconds } });
          await sleep(Math.min(10, left) * 1000);
        }
      };
  return { publicClient, ctx, addressOf, ensureUsdg, timeTravel };
}
