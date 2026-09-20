import { describe, it, expect } from "vitest";
import { parseWatcherEnv } from "../src/watcher/env.js";

// Task 8 Step 4: unit murni — tidak ada RPC/chain di sini, hanya parsing/validasi env. Juga menjaga bahwa
// mengimpor cli.ts (lewat env.ts, modul yang benar-benar dipakainya) tidak pernah menyalakan apa pun sebagai
// efek samping impor — parseWatcherEnv adalah fungsi biasa, dipanggil eksplisit oleh test di bawah.
const FULL_ENV = {
  RPC_URL: "http://127.0.0.1:8547",
  FACTORY: "0xAbC0000000000000000000000000000000000A",
  PRIVATE_KEY: "0x" + "1".repeat(64),
  CHAIN_ID: "31337",
};

describe("parseWatcherEnv", () => {
  it("mem-parsing env lengkap", () => {
    const env = parseWatcherEnv(FULL_ENV);
    expect(env.rpcUrl).toBe(FULL_ENV.RPC_URL);
    expect(env.factory).toBe(FULL_ENV.FACTORY);
    expect(env.privateKey).toBe(FULL_ENV.PRIVATE_KEY);
    expect(env.chainId).toBe(31337);
    expect(env.fromBlock).toBeUndefined();
  });

  it("FROM_BLOCK opsional diparsing sebagai bigint bila ada", () => {
    const env = parseWatcherEnv({ ...FULL_ENV, FROM_BLOCK: "123" });
    expect(env.fromBlock).toBe(123n);
  });

  it("FROM_BLOCK tidak wajib — hilang tetap sukses", () => {
    expect(() => parseWatcherEnv(FULL_ENV)).not.toThrow();
  });

  it("melempar dan menyebut SEMUA nama env wajib yang hilang", () => {
    expect(() => parseWatcherEnv({})).toThrow(/RPC_URL/);
    expect(() => parseWatcherEnv({})).toThrow(/FACTORY/);
    expect(() => parseWatcherEnv({})).toThrow(/PRIVATE_KEY/);
    expect(() => parseWatcherEnv({})).toThrow(/CHAIN_ID/);
  });

  it("melempar hanya untuk variabel yang benar-benar hilang (tidak menyebut yang sudah ada)", () => {
    const { CHAIN_ID: _omit, ...rest } = FULL_ENV;
    expect(() => parseWatcherEnv(rest)).toThrow(/CHAIN_ID/);
    try {
      parseWatcherEnv(rest);
      throw new Error("should have thrown");
    } catch (e) {
      expect(String(e)).not.toMatch(/RPC_URL/);
      expect(String(e)).not.toMatch(/FACTORY/);
      expect(String(e)).not.toMatch(/PRIVATE_KEY/);
    }
  });
});
