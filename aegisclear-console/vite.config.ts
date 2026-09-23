import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

// The console API, SSE and demo keys live only in the Hono server (web/server, :4040). It sends no
// CORS headers, so the browser always reaches it same-origin: through the proxy below in dev, and
// by `pnpm build:web` writing into web/dist, which that server serves (docs/frontend/README.md §2.3).
const here = import.meta.dirname;
const repoRoot = path.resolve(here, "..");
const API = "http://127.0.0.1:4040";
const proxy = { "/api": API, "/provider": API };

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(here, "client", "src"),
      "@aegis/types": path.resolve(repoRoot, "web", "shared", "types.ts"),
      "@fixtures": path.resolve(repoRoot, "docs", "frontend", "fixtures"),
    },
  },
  envDir: here,
  root: path.resolve(here, "client"),
  build: {
    outDir: process.env.CONSOLE_TARGET === "web" ? path.resolve(repoRoot, "web", "dist") : path.resolve(here, "dist", "public"),
    emptyOutDir: true,
  },
  // Loopback only: the proxied API is unauthenticated and drives server-held keys (README §2.2 #12).
  server: {
    host: "127.0.0.1",
    port: 4047, // not 4045: browsers refuse it (ERR_UNSAFE_PORT, the NFS lockd port)
    strictPort: true,
    proxy,
    fs: { allow: [here, path.resolve(repoRoot, "web", "shared"), path.resolve(repoRoot, "docs", "frontend", "fixtures")] },
  },
  preview: { host: "127.0.0.1", port: 4046, strictPort: true, proxy },
  // Unit tests run in node; component tests opt into jsdom with a `// @vitest-environment jsdom` docblock.
  test: {
    setupFiles: ["./src/test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
