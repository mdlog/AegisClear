/**
 * Env parsing murni untuk `cli.ts` (Task 8 Step 4) — dipisah ke modul sendiri supaya bisa diuji tanpa proses/RPC:
 * tidak ada `process.exit`, tidak ada I/O, hanya validasi + parsing. `cli.ts` mengimpor `parseWatcherEnv` dan
 * menangani pencetakan pesan + exit code di titik masuk proses sebenarnya.
 */
import type { Address, Hex } from "viem";

export interface WatcherEnv {
  rpcUrl: string;
  factory: Address;
  privateKey: Hex;
  chainId: number;
  /** Opsional: blok deployment factory. Default undefined → Watcher memindai dari blok 0. */
  fromBlock?: bigint;
}

const REQUIRED = ["RPC_URL", "FACTORY", "PRIVATE_KEY", "CHAIN_ID"] as const;

/** Bentuk minimal `process.env` yang dibutuhkan — Record biasa supaya gampang diuji dengan objek literal. */
export type WatcherEnvInput = Record<string, string | undefined>;

export function parseWatcherEnv(env: WatcherEnvInput): WatcherEnv {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length > 0) throw new Error(`watcher: missing required env: ${missing.join(", ")}`);
  return {
    rpcUrl: env.RPC_URL!,
    factory: env.FACTORY! as Address,
    privateKey: env.PRIVATE_KEY! as Hex,
    chainId: Number(env.CHAIN_ID!),
    // FROM_BLOCK (opsional): blok deployment factory. scan() memanggil eth_getLogs(ChannelOpened) dari sini sampai
    // latest tiap tick; default 0 memindai seluruh riwayat dan biasanya ditolak RPC publik (batas rentang blok / jumlah log).
    fromBlock: env.FROM_BLOCK ? BigInt(env.FROM_BLOCK) : undefined,
  };
}
