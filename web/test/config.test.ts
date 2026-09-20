import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, loadDotEnv, REPO_ROOT, ANVIL_KEYS } from "../server/config.js";

const dir = mkdtempSync(path.join(tmpdir(), "aegis-web-"));
const dep = (name: string, obj: object) => { const f = path.join(dir, name); writeFileSync(f, JSON.stringify(obj)); return f; };
const LOCAL = dep("local.json", { chainId: 31337, usdg: "0x5fbdb2315678afecb367f032d93f642f64180aa3", verifier: "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512", factory: "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0", escrow: "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9" });
const TESTNET = dep("testnet.json", { chainId: 46630, usdg: "0xCadd4526b6E7Beb640c3e920e80Ff28B327B5a83", verifier: "0x5EC99814dF5A78ECB4dbC83f066FB62970847462", factory: "0x0922ee7D6D518681Fd94E98e56D3f161A0574ED3", factoryProd: "0x201BaC41758a45925E1eD7a9Ad79757F19337fDD", escrow: "0x5017C9e556bF750aEE1aB9e74aA094a91924964a", deployBlock: 121731938 });
const PK = "0x" + "11".repeat(32);

describe("loadConfig", () => {
  it("local: default Anvil, kunci default, jendela 120/60, tanpa explorer", () => {
    const c = loadConfig({ DEPLOY_FILE: LOCAL });
    expect(c.network).toBe("local"); expect(c.chainId).toBe(31337); expect(c.port).toBe(4040);
    expect(c.rpcUrl).toBe("http://127.0.0.1:8545"); expect(c.explorerBase).toBeUndefined(); expect(c.deployBlock).toBe(0n);
    expect(c.keys).toEqual(ANVIL_KEYS); expect(c.windows).toEqual({ challenge: 120, response: 60 });
    expect(c.deployment.factory).toBe("0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"); // checksum
  });
  it("local: RPC_URL, WEB_PORT dan DEPLOY_FILE relatif (terhadap root repo) dihormati", () => {
    const rel = path.relative(REPO_ROOT, LOCAL);
    const c = loadConfig({ DEPLOY_FILE: rel, RPC_URL: "http://127.0.0.1:8547", WEB_PORT: "4042" });
    expect(c.rpcUrl).toBe("http://127.0.0.1:8547"); expect(c.port).toBe(4042); expect(c.deployFile).toBe(LOCAL);
  });
  it("testnet: env wajib disebutkan bila hilang", () => {
    expect(() => loadConfig({ AEGIS_NETWORK: "testnet", DEPLOY_FILE: TESTNET, RPC_URL: "x" })).toThrow(/PK_PROVIDER, PK_CLIENT_A, PK_CLIENT_B, PK_DEPLOYER/);
  });
  it("testnet: chain 46630, explorer, deployBlock dari JSON lalu FACTORY_BLOCK, jendela 60/30", () => {
    const env = { AEGIS_NETWORK: "testnet", DEPLOY_FILE: TESTNET, RPC_URL: "https://rpc.testnet.chain.robinhood.com", PK_PROVIDER: PK, PK_CLIENT_A: PK, PK_CLIENT_B: PK, PK_DEPLOYER: PK };
    const c = loadConfig(env);
    expect(c.chainId).toBe(46630); expect(c.chain.id).toBe(46630);
    expect(c.explorerBase).toBe("https://explorer.testnet.chain.robinhood.com");
    expect(c.deployBlock).toBe(121731938n); expect(c.windows).toEqual({ challenge: 60, response: 30 });
    expect(c.keys.faucet).toBe(PK);
    const noBlock = dep("testnet2.json", { chainId: 46630, usdg: "0xCadd4526b6E7Beb640c3e920e80Ff28B327B5a83", verifier: "0x5EC99814dF5A78ECB4dbC83f066FB62970847462", factory: "0x0922ee7D6D518681Fd94E98e56D3f161A0574ED3", escrow: "0x5017C9e556bF750aEE1aB9e74aA094a91924964a" });
    expect(loadConfig({ ...env, DEPLOY_FILE: noBlock, FACTORY_BLOCK: "5" }).deployBlock).toBe(5n);
    expect(loadConfig({ ...env, DEPLOY_FILE: noBlock }).deployBlock).toBe(0n);
  });
  it("testnet: deployment dengan chainId lain ditolak", () => {
    expect(() => loadConfig({ AEGIS_NETWORK: "testnet", DEPLOY_FILE: LOCAL, RPC_URL: "x", PK_PROVIDER: PK, PK_CLIENT_A: PK, PK_CLIENT_B: PK, PK_DEPLOYER: PK })).toThrow(/chainId 31337/);
  });
  it("AEGIS_NETWORK tidak dikenal ditolak", () => {
    expect(() => loadConfig({ AEGIS_NETWORK: "mainnet", DEPLOY_FILE: LOCAL })).toThrow(/local\|testnet/);
  });
});

describe("loadDotEnv", () => {
  it("mengisi hanya variabel yang belum ada, membuang kutip & komentar", () => {
    const f = path.join(dir, ".env");
    writeFileSync(f, `# komentar\nFOO=bar\nexport BAR="baz qux"\nBAZ='q'\nEXISTING=new\n\nINVALID LINE\n`);
    const env: NodeJS.ProcessEnv = { EXISTING: "old" };
    expect(loadDotEnv(f, env)).toBe(3);
    expect(env).toEqual({ EXISTING: "old", FOO: "bar", BAR: "baz qux", BAZ: "q" });
    expect(loadDotEnv(path.join(dir, "missing.env"), env)).toBe(0);
  });
});
