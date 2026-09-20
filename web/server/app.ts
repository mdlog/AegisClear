import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { createProviderApp, type Watcher } from "@aegisclear/sdk";
import { BREACHES, DEPOSIT_B, TERMS_BASE, metricsFor, leakCheck } from "@aegisclear/demo";
import type { ConfigResponse, LeakResponse } from "../shared/types.js";
import { ADDRESS_KEYS, type WebConfig } from "./config.js";
import { makeChain, type ChainServices } from "./chain.js";
import { ChannelIndex } from "./channels.js";
import { streamSSE } from "hono/streaming";
import type { ScenarioId, SseEvent } from "../shared/types.js";
import { RunStore } from "./runs.js";
import { makeRunner } from "./demo.js";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
  ".json": "application/json", ".ico": "image/x-icon", ".map": "application/json", ".woff2": "font/woff2", ".png": "image/png",
};
/** JSON dengan bigint → string desimal. */
export const j = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

export interface WebServer {
  app: Hono; cfg: WebConfig;
  services: { chain: ChainServices; index: ChannelIndex; provider: ReturnType<typeof createProviderApp>; runIdOf: Map<Address, string>; store: RunStore; runner: ReturnType<typeof makeRunner> };
  start(): Promise<{ port: number }>; stop(): Promise<void>;
}

export function createWebServer(cfg: WebConfig): WebServer {
  const app = new Hono();
  // Fallback: RPC hiccup di /api/channels* atau throw dari leakCheck jadi 502 JSON, bukan 500 polos.
  // Rute yang sudah punya response error sendiri (400/404/409/dst.) tidak pernah sampai ke sini.
  app.onError((e, c) => c.json({ error: String((e as Error).message) }, 502));
  const chain = makeChain(cfg);
  const providerAccount = privateKeyToAccount(cfg.keys.provider);
  const provider = providerAccount.address;
  const clients = [{ label: "A" as const, address: privateKeyToAccount(cfg.keys.a).address }, { label: "B" as const, address: privateKeyToAccount(cfg.keys.b).address }];
  // Whitelist eksplisit (bukan spread deployment): field non-alamat yang mungkin ditambahkan ke JSON
  // deployment nanti (mis. catatan deployer) tidak otomatis bocor lewat /api/config.
  const addresses = Object.fromEntries(ADDRESS_KEYS.filter((k) => cfg.deployment[k] !== undefined).map((k) => [k, cfg.deployment[k]])) as ConfigResponse["addresses"];
  const runIdOf = new Map<Address, string>();   // channel → runId (diisi Task 4)
  const index = new ChannelIndex(cfg, chain.ctx(cfg.keys.provider), (ch) => runIdOf.get(ch));
  const providerApp = createProviderApp({
    ctx: chain.ctx(cfg.keys.provider), account: providerAccount, usdg: cfg.deployment.usdg, terms: TERMS_BASE, unitQty: 1n, deposit: DEPOSIT_B,
    challengeWindow: cfg.windows.challenge, responseWindow: cfg.windows.response, metrics: metricsFor,
  });
  app.route("/provider", providerApp.app);
  const store = new RunStore();
  const runner = makeRunner({ cfg, chain, store, provider: providerApp, runIdOf, providerUrl: `http://127.0.0.1:${cfg.port}/provider`, index });

  app.get("/api/config", (c) => {
    const body: ConfigResponse = {
      network: cfg.network, chainId: cfg.chainId, rpcUrl: cfg.rpcUrl, explorerBase: cfg.explorerBase, deployBlock: cfg.deployBlock.toString(),
      addresses, provider, clients, windows: cfg.windows,
      terms: j({ unitPrice: TERMS_BASE.unitPrice, maxM1: TERMS_BASE.maxM1, minM2: TERMS_BASE.minM2, penaltyBps: TERMS_BASE.penaltyBps, capBps: TERMS_BASE.capBps }),
      breaches: [...BREACHES].sort((a, b) => a - b), deposit: DEPOSIT_B.toString(),
    };
    return c.json(body);
  });
  app.get("/api/channels", async (c) => c.json({ scannedAt: Date.now(), channels: await index.list() }));
  app.get("/api/channels/:addr", async (c) => {
    const d = await index.detail(c.req.param("addr"));
    return d ? c.json(d) : c.json({ error: "unknown channel" }, 404);
  });

  app.post("/api/demo/run", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { scenario?: string };
    const r = await runner.start(body.scenario as ScenarioId);
    if ("runId" in r) return c.json(r, 202);
    if (r.error === "unknown-scenario") return c.json(r, 400);
    if (r.error === "preflight-failed") return c.json(r, 502);
    return c.json(r, 409);
  });
  app.get("/api/demo/runs", (c) => c.json(store.list()));
  app.get("/api/demo/runs/:id", (c) => { const r = store.get(c.req.param("id")); return r ? c.json(r) : c.json({ error: "unknown run" }, 404); });
  app.get("/api/demo/runs/:id/events", (c) => {
    const id = c.req.param("id");
    if (!store.get(id)) return c.json({ error: "unknown run" }, 404);
    return streamSSE(c, async (stream) => {
      const queue: SseEvent[] = []; let finished = false; let aborted = false;
      const unsub = store.subscribe(id, (ev) => { queue.push(ev); if (ev.type !== "step") finished = true; });
      stream.onAbort(() => { aborted = true; });
      while (!aborted) {
        while (queue.length) { const ev = queue.shift()!; await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev.data), id: ev.type === "step" ? String(ev.data.i) : "end" }); }
        if (finished) break;
        await stream.sleep(200);
      }
      unsub();
    });
  });

  app.get("/api/demo/leak-check/:runId", async (c) => {
    const recs = runner.privateOf(c.req.param("runId"));
    if (!recs?.length) return c.json({ error: "run tidak dikenal atau tidak punya channel Pasar B" }, 404);
    const out: LeakResponse[] = [];
    for (const p of recs) out.push({ channel: p.channel, ...(await leakCheck(chain.publicClient, cfg.deployment.factory, p.channel, p.txs, p.values, cfg.deployBlock)) });
    return c.json(out);
  });
  // 402 mentah yang dilihat klien x402 — membuat sesi provider untuk klien demo bila belum ada (tanpa efek on-chain).
  app.get("/api/offer", async (c) => {
    const client = c.req.query("client");
    if (client !== "A" && client !== "B") return c.json({ error: "client must be A or B" }, 400);
    const addr = chain.addressOf(cfg.keys[client === "B" ? "b" : "a"]);
    const res = await app.request("/provider/job", { headers: { "Aegis-Client": addr } });
    // Balasan upstream bisa non-JSON (mis. error text polos) — jangan lempar, teruskan apa adanya di `body`.
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* bukan JSON — body tetap string mentah */ }
    return c.json({ status: res.status, body });
  });

  // 404 JSON untuk /api/* dan /provider/* yang tidak cocok rute mana pun di atas — terdaftar SETELAH
  // rute asli (termasuk app.route("/provider", ...)) dan SEBELUM fallback statis, supaya klien x402/API
  // dapat body JSON yang bisa di-parse, bukan fallback SPA (text/html) atau 404 polos bawaan Hono.
  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
  app.all("/provider/*", (c) => c.json({ error: "not found" }, 404));

  // ---- static (web/dist) dengan fallback SPA; selalu terdaftar TERAKHIR ----
  app.get("/*", (c) => {
    let p: string;
    try { p = decodeURIComponent(new URL(c.req.url).pathname); } catch { return c.text("bad path", 400); }
    if (p === "/" || !path.extname(p)) p = "/index.html";
    // path.resolve (bukan path.join) supaya ".." di `p` benar-benar bisa membawa hasilnya keluar dari DIST —
    // itulah yang membuat pengecekan startsWith(DIST) di bawah jadi guard sungguhan, bukan cabang yang tidak
    // pernah tercapai (path.join + path.normalize pada path absolut selalu jatuh kembali ke dalam DIST).
    const file = path.resolve(DIST, "." + p);
    if (!file.startsWith(DIST)) return c.text("forbidden", 403);
    if (!existsSync(file)) return c.text(p === "/index.html" ? "web/dist belum ada — jalankan `pnpm --filter @aegisclear/web build`" : "not found", 404);
    return c.body(readFileSync(file), 200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  });

  let server: ServerType | undefined; let watcher: Watcher | undefined;
  return {
    app, cfg, services: { chain, index, provider: providerApp, runIdOf, store, runner },
    start: () => new Promise((resolve, reject) => {
      (async () => {
        // RPC yang benar-benar dilayani WAJIB cocok dengan chainId config — RPC_URL testnet yang salah
        // ketik, atau mode local yang diam-diam kena RPC lain, harus gagal di sini, bukan mengirim tx
        // ke chain yang salah tanpa peringatan.
        const id = await chain.publicClient.getChainId();
        if (id !== cfg.chainId)
          throw new Error(`RPC ${cfg.rpcUrl} melayani chain ${id}, bukan ${cfg.chainId} — set RPC_URL=http://127.0.0.1:8545 (Anvil) atau AEGIS_NETWORK=testnet`);
        // Responder T1 in-process (README §(d)): wajib berjalan di proses provider ini.
        watcher = providerApp.startProviderWatcher({ intervalMs: cfg.network === "local" ? 2_000 : 15_000, fromBlock: cfg.deployBlock, log: (s) => console.log(`[watcher] ${s}`) });
        // Loopback secara default — semua endpoint di sini TANPA autentikasi dan kunci demo hidup di
        // proses ini (lihat README); WEB_HOST=0.0.0.0 adalah pilihan sadar untuk mengekspos.
        server = serve({ fetch: app.fetch, port: cfg.port, hostname: process.env.WEB_HOST ?? "127.0.0.1" }, (info) => resolve({ port: info.port }));
        server.on("error", reject);   // mis. EADDRINUSE — start() harus reject, bukan diam saja.
      })().catch(reject);
    }),
    stop: () => new Promise((resolve) => {
      watcher?.stop();
      if (!server) { resolve(); return; }
      // ServerType (@hono/node-server) = Server | Http2Server | Http2SecureServer — closeAllConnections
      // ada di ketiganya saat runtime (Node ≥ 18.2) tapi tidak seragam di typing Http2Server; cast sempit
      // ini hanya untuk itu. Stream SSE yang masih terbuka tidak boleh menahan Ctrl-C.
      (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}
