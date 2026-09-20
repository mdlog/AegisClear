import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { AegisClient, defaultArtifacts } from "@aegisclear/sdk";
import { loadConfig, REPO_ROOT } from "../server/config.js";
import { createWebServer, type WebServer } from "../server/app.js";
import type { ChannelSummary, ConfigResponse, LeakResponse, RunSnapshot } from "../shared/types.js";

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

  it("GET /%zz (path persen tidak valid) → 400, bukan 500", async () => {
    const r = await fetch(`${BASE}/%zz`);
    expect(r.status).toBe(400);
  });

  const waitRun = async (id: string) => {
    for (let i = 0; i < 600; i++) { const r = await get<RunSnapshot>(`/api/demo/runs/${id}`); if (r.status !== "running") return r; await new Promise((res) => setTimeout(res, 500)); }
    throw new Error("run timeout");
  };
  const post = (scenario: string) => fetch(`${BASE}/api/demo/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }) });

  it("POST /api/demo/run B-cooperative → 202; run selesai dengan 1 baris; channel bertanda runId", async () => {
    const r = await post("B-cooperative"); expect(r.status).toBe(202);
    const { runId } = (await r.json()) as { runId: string };
    const run = await waitRun(runId);
    expect(run.status, run.error).toBe("done");
    expect(run.result!.map((x) => x.pasar)).toEqual(["B: AegisClear kooperatif"]);
    expect(run.result![0].klien_provider).toBe("0.00 / 2.00");
    expect(run.steps.some((s) => s.phase === "serve" && s.progress?.total === 100)).toBe(true);
    expect(run.channels.length).toBe(1);
    const ch = (await get<{ channels: ChannelSummary[] }>("/api/channels")).channels.find((x) => x.channel === run.channels[0]);
    expect(ch?.runId).toBe(runId);
  });

  it("dua POST /api/demo/run bersamaan: satu 202, satu 409 busy (tanpa unhandled rejection)", async () => {
    const [r1, r2] = await Promise.all([post("B-cooperative"), post("B-cooperative")]);
    expect([r1.status, r2.status].sort()).toEqual([202, 409]);
    const [accepted, rejected] = r1.status === 202 ? [r1, r2] : [r2, r1];
    expect(await rejected.json()).toEqual({ error: "busy" });
    const { runId } = (await accepted.json()) as { runId: string };
    const run = await waitRun(runId);
    expect(run.status, run.error).toBe("done");
    expect(run.result!.map((x) => x.pasar)).toEqual(["B: AegisClear kooperatif"]);
  });

  it("B-dispute: busy saat berjalan; hasil 0.07 / 1.93 dengan bukti; SSE replay + done", async () => {
    const r = await post("B-dispute"); expect(r.status).toBe(202);
    const { runId } = (await r.json()) as { runId: string };
    const ssePromise = fetch(`${BASE}/api/demo/runs/${runId}/events`);
    expect((await post("A-complete")).status).toBe(409);
    const run = await waitRun(runId);
    expect(run.status, run.error).toBe("done");
    expect(run.result![0].klien_provider).toBe("0.07 / 1.93");
    expect(Number(run.result![0].proving_ms)).toBeGreaterThan(0);
    expect(run.steps.map((s) => s.phase)).toEqual(expect.arrayContaining(["fund", "serve", "dispute", "prove", "wait", "settle"]));
    expect(run.steps.filter((s) => s.txHash).map((s) => s.label)).toEqual(expect.arrayContaining(["fund", "submitCheckpoint", "claimPenalty", "settle"]));
    const sse = await (await ssePromise).text();
    expect(sse).toMatch(/event: step\n/); expect(sse).toMatch(/event: done\n/);
    expect(sse.split("event: step").length - 1).toBe(run.steps.length);
  });

  it("skenario tidak dikenal → 400; run ulang untuk klien yang sesinya SETTLED diterima", async () => {
    expect((await post("nope")).status).toBe(400);
    const r = await post("A-reject"); expect(r.status).toBe(202);
    const run = await waitRun(((await r.json()) as { runId: string }).runId);
    expect(run.status, run.error).toBe("done"); expect(run.result![0].klien_provider).toBe("2.00 / 0");
    expect(run.steps.filter((s) => s.phase === "escrow" && s.txHash).length).toBe(5);
  });

  it("leak-check untuk run Pasar B: bocor 0; offer 402 memuat extra.aegis tanpa nonce di config", async () => {
    const runs = await get<RunSnapshot[]>("/api/demo/runs");
    const disp = runs.find((r) => r.scenario === "B-dispute" && r.status === "done")!;
    const rep = await get<LeakResponse[]>(`/api/demo/leak-check/${disp.id}`);
    expect(rep.length).toBe(1); expect(rep[0].channel).toBe(disp.channels[0]);
    expect(rep[0].leaks).toBe(0); expect(rep[0].ambiguous).toBe(0); expect(rep[0].txs.length).toBe(5); // open + fund + submitCheckpoint + claimPenalty + settle
    const aRun = runs.find((r) => r.scenario === "A-reject")!;
    expect((await fetch(`${BASE}/api/demo/leak-check/${aRun.id}`)).status).toBe(404);
    const offer = await get<{ status: number; body: any }>("/api/offer?client=B");
    expect(offer.status).toBe(402);
    expect(offer.body.accepts[0].extra.aegis.config.client).toBe(privateKeyToAccount(srv.cfg.keys.b).address);
    expect(offer.body.accepts[0].payTo).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
