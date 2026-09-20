import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import { privateKeyToAccount } from "viem/accounts";
import { BREACHES, DEPOSIT_B, TERMS_BASE } from "@aegisclear/demo";
import type { ConfigResponse } from "../shared/types.js";
import type { WebConfig } from "./config.js";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
  ".json": "application/json", ".ico": "image/x-icon", ".map": "application/json", ".woff2": "font/woff2", ".png": "image/png",
};
/** JSON dengan bigint → string desimal. */
export const j = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

export interface WebServer { app: Hono; cfg: WebConfig; start(): Promise<{ port: number }>; stop(): Promise<void> }

export function createWebServer(cfg: WebConfig): WebServer {
  const app = new Hono();
  const provider = privateKeyToAccount(cfg.keys.provider).address;
  const clients = [{ label: "A" as const, address: privateKeyToAccount(cfg.keys.a).address }, { label: "B" as const, address: privateKeyToAccount(cfg.keys.b).address }];
  const { chainId: _c, deployBlock: _b, ...addresses } = cfg.deployment as unknown as Record<string, unknown>;

  app.get("/api/config", (c) => {
    const body: ConfigResponse = {
      network: cfg.network, chainId: cfg.chainId, rpcUrl: cfg.rpcUrl, explorerBase: cfg.explorerBase, deployBlock: cfg.deployBlock.toString(),
      addresses: addresses as ConfigResponse["addresses"], provider, clients, windows: cfg.windows,
      terms: j({ unitPrice: TERMS_BASE.unitPrice, maxM1: TERMS_BASE.maxM1, minM2: TERMS_BASE.minM2, penaltyBps: TERMS_BASE.penaltyBps, capBps: TERMS_BASE.capBps }),
      breaches: [...BREACHES].sort((a, b) => a - b), deposit: DEPOSIT_B.toString(),
    };
    return c.json(body);
  });

  // ---- static (web/dist) dengan fallback SPA; selalu terdaftar TERAKHIR ----
  app.get("/*", (c) => {
    let p = decodeURIComponent(new URL(c.req.url).pathname);
    if (p === "/" || !path.extname(p)) p = "/index.html";
    const file = path.join(DIST, path.normalize(p));
    if (!file.startsWith(DIST)) return c.text("forbidden", 403);
    if (!existsSync(file)) return c.text(p === "/index.html" ? "web/dist belum ada — jalankan `pnpm --filter @aegisclear/web build`" : "not found", 404);
    return c.body(readFileSync(file), 200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  });

  let server: ServerType | undefined;
  return {
    app, cfg,
    start: () => new Promise((resolve) => { server = serve({ fetch: app.fetch, port: cfg.port }, (info) => resolve({ port: info.port })); }),
    stop: () => new Promise((resolve) => (server ? server.close(() => resolve()) : resolve())),
  };
}
