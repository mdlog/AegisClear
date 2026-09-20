import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { AegisClient, defaultArtifacts } from "@aegisclear/sdk";
import { loadConfig, REPO_ROOT } from "../server/config.js";
import { createWebServer, type WebServer } from "../server/app.js";
import type { ChannelSummary, ConfigResponse } from "../shared/types.js";

const DEPLOY = path.resolve(REPO_ROOT, process.env.DEPLOY_FILE ?? "contracts/deployments/local.json");
const DEPLOY_EXISTS = existsSync(DEPLOY);
if (!DEPLOY_EXISTS) console.warn(`web server.test: deploy file not found at ${DEPLOY} — suite skipped`);
const PORT = 4042;
const BASE = `http://127.0.0.1:${PORT}`;
const get = async <T>(p: string): Promise<T> => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(`${p} → ${r.status} ${await r.text()}`); return r.json() as Promise<T>; };

describe.skipIf(!DEPLOY_EXISTS)("web console server (Anvil)", () => {
  let srv: WebServer;
  beforeAll(async () => {
    srv = createWebServer(loadConfig({ ...process.env, AEGIS_NETWORK: "local", WEB_PORT: String(PORT), DEPLOY_FILE: DEPLOY }));
    await srv.start();
  });
  afterAll(async () => { await srv?.stop(); });

  it("GET /api/config: bentuk, tanpa kunci privat", async () => {
    const c = await get<ConfigResponse>("/api/config");
    expect(c.network).toBe("local"); expect(c.chainId).toBe(31337);
    expect(c.clients.map((x) => x.label)).toEqual(["A", "B"]);
    expect(c.terms.unitPrice).toBe("20000"); expect(c.breaches).toEqual([3, 17, 29, 44, 58, 71, 90]); expect(c.deposit).toBe("5000000");
    expect(JSON.stringify(c)).not.toMatch(/0x[0-9a-f]{64}/i);
  });

  it("provider di /provider: klien SDK membuka channel; /api/channels & /api/channels/:addr melihatnya", async () => {
    const cfg = srv.cfg; const chain = srv.services.chain;
    const c = new AegisClient({ ctx: chain.ctx(cfg.keys.a), account: privateKeyToAccount(cfg.keys.a), providerUrl: `${BASE}/provider`, usdg: cfg.deployment.usdg, artifacts: defaultArtifacts(REPO_ROOT) });
    await c.start();
    await c.requestUnit(); await c.requestUnit(); await c.finalAck();
    const list = await get<{ channels: ChannelSummary[] }>("/api/channels");
    const mine = list.channels.find((x) => x.channel === c.channel);
    expect(mine).toBeDefined();
    expect(mine!.state).toBe("OPEN"); expect(mine!.client).toBe(privateKeyToAccount(cfg.keys.a).address);
    expect(mine!.budget).toBe("5000000"); expect(mine!.factoryName).toBe("factory");
    await c.closeCooperative();
    const d = await get<any>(`/api/channels/${c.channel}`);   // detail memaksa refresh cache bila perlu
    expect(d.cfg.client).toBe(mine!.client); expect(d.cfg.challengeWindow).toBe(120);
    expect(d.events.map((e: any) => e.name)).toContain("Settled");
    expect(d.events.find((e: any) => e.name === "Settled").args.cooperative).toBe("true");
    // detail() only force-refreshes the cache when the channel is missing, so right after
    // closeCooperative() the 3 s cache may still report the pre-close state — poll until it expires.
    let state: string | undefined;
    for (let i = 0; i < 10; i++) {
      state = (await get<{ channels: ChannelSummary[] }>("/api/channels")).channels.find((x) => x.channel === c.channel)?.state;
      if (state === "SETTLED") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(state).toBe("SETTLED");
  });

  it("GET /api/channels/:addr untuk alamat asing → 404", async () => {
    const r = await fetch(`${BASE}/api/channels/0x0000000000000000000000000000000000000001`);
    expect(r.status).toBe(404);
    expect((await fetch(`${BASE}/api/channels/not-an-address`)).status).toBe(404);
  });
});
