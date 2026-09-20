import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// dev: halaman di :4043, API & provider di-proxy ke server :4040 (`pnpm --filter @aegisclear/web serve`).
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 4043, proxy: { "/api": "http://127.0.0.1:4040", "/provider": "http://127.0.0.1:4040" } },
});
