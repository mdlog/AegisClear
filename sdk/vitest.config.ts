import { defineConfig } from "vitest/config";
// fileParallelism: false — integration.test.ts dan watcher.test.ts berbagi SATU Anvil hidup (waktu EVM
// global via evm_increaseTime, saldo & nonce akun anvil #1/#2 yang sama). Dijalankan paralel antar file,
// keduanya saling menganggu (waktu blok meloncat, transfer nyasar ke saldo yang sedang diukur test lain).
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 120_000, hookTimeout: 120_000, fileParallelism: false } });
