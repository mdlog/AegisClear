import { defineConfig } from "vitest/config";
// server.test.ts menjalankan skenario demo nyata di Anvil (proving Groth16 ≈ 4 s + 100 unit) — timeout besar,
// fileParallelism false karena semua file berbagi satu Anvil dan port 4042.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 300_000, hookTimeout: 300_000, fileParallelism: false, reporters: ["default"] } });
