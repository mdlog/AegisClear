import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineChain, getAddress, type Address, type Chain, type Hex } from "viem";
import { foundry } from "viem/chains";
import type { Network } from "../shared/types.js";

/** web/server/config.ts → root repo (dua tingkat ke atas). */
export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export interface Deployment {
  chainId: number; usdg: Address; factory: Address; factoryProd?: Address; factoryAnchored?: Address; escrow: Address; verifier: Address;
  router?: Address; poseidon?: Address; deployBlock?: number;
}
export interface WebConfig {
  network: Network; chainId: number; rpcUrl: string; chain: Chain; explorerBase?: string; port: number;
  deployment: Deployment; deployFile: string; deployBlock: bigint;
  /** kunci demo — TIDAK PERNAH dikembalikan lewat API atau ditulis ke log */
  keys: { provider: Hex; a: Hex; b: Hex; faucet: Hex };
  windows: { challenge: number; response: number };
}

// anvil #0 (faucet/deployer), #1 (klien A), #2 (provider), #3 (klien B) — sama dengan demo/run.ts & DeployLocal.
export const ANVIL_KEYS = {
  faucet: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  a: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  provider: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  b: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
} as const satisfies WebConfig["keys"];
export const TESTNET = { chainId: 46630, explorerBase: "https://explorer.testnet.chain.robinhood.com", deployFile: "contracts/deployments/testnet-46630.json" } as const;
const ADDRESS_KEYS = ["usdg", "factory", "factoryProd", "factoryAnchored", "escrow", "verifier", "router", "poseidon"] as const;

/** Memuat KEY=VALUE dari file .env ke `env` — hanya variabel yang belum ada. Mengembalikan jumlah yang diisi. */
export function loadDotEnv(file = path.join(REPO_ROOT, ".env"), env: NodeJS.ProcessEnv = process.env): number {
  if (!existsSync(file)) return 0;
  let n = 0;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (env[m[1]] === undefined) { env[m[1]] = v; n++; }
  }
  return n;
}

export function readDeployment(file: string): Deployment {
  if (!existsSync(file)) throw new Error(`deployment file tidak ada: ${file} (jalankan DeployLocal/DeployTestnet dulu)`);
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  for (const k of ["usdg", "factory", "escrow", "verifier"]) if (!raw[k]) throw new Error(`deployment ${file}: field ${k} hilang`);
  const d: Record<string, unknown> = { ...raw };
  for (const k of ADDRESS_KEYS) if (typeof raw[k] === "string") d[k] = getAddress(raw[k] as string);
  return d as unknown as Deployment;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  const network = env.AEGIS_NETWORK ?? "local";
  if (network !== "local" && network !== "testnet") throw new Error(`AEGIS_NETWORK harus local|testnet, dapat "${network}"`);
  const port = Number(env.WEB_PORT ?? 4040);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`WEB_PORT tidak valid: ${env.WEB_PORT}`);
  if (network === "local") {
    const deployFile = path.resolve(REPO_ROOT, env.DEPLOY_FILE ?? "contracts/deployments/local.json");
    return {
      network, chainId: 31337, rpcUrl: env.RPC_URL ?? "http://127.0.0.1:8545", chain: foundry, port,
      deployment: readDeployment(deployFile), deployFile, deployBlock: 0n, keys: { ...ANVIL_KEYS }, windows: { challenge: 120, response: 60 },
    };
  }
  const missing = ["RPC_URL", "PK_PROVIDER", "PK_CLIENT_A", "PK_CLIENT_B", "PK_DEPLOYER"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`AEGIS_NETWORK=testnet butuh env: ${missing.join(", ")}`);
  const deployFile = path.resolve(REPO_ROOT, env.DEPLOY_FILE ?? TESTNET.deployFile);
  const deployment = readDeployment(deployFile);
  if (Number(deployment.chainId) !== TESTNET.chainId) throw new Error(`deployment ${deployFile} untuk chainId ${deployment.chainId}, bukan ${TESTNET.chainId}`);
  const rpcUrl = env.RPC_URL!;
  const chain = defineChain({
    id: TESTNET.chainId, name: "robinhood-testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }, blockExplorers: { default: { name: "Blockscout", url: TESTNET.explorerBase } },
  });
  return {
    network, chainId: TESTNET.chainId, rpcUrl, chain, explorerBase: TESTNET.explorerBase, port, deployment, deployFile,
    deployBlock: BigInt(deployment.deployBlock ?? env.FACTORY_BLOCK ?? 0),
    keys: { provider: env.PK_PROVIDER as Hex, a: env.PK_CLIENT_A as Hex, b: env.PK_CLIENT_B as Hex, faucet: env.PK_DEPLOYER as Hex },
    windows: { challenge: 60, response: 30 },
  };
}
