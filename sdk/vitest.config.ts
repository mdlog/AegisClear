import { defineConfig } from "vitest/config";
// fileParallelism: false — integration.test.ts dan watcher.test.ts berbagi SATU Anvil hidup (waktu EVM
// global via evm_increaseTime, saldo & nonce akun anvil #1/#2 yang sama). Dijalankan paralel antar file,
// keduanya saling menganggu (waktu blok meloncat, transfer nyasar ke saldo yang sedang diukur test lain).
// reporters: ["default"] dipaksa eksplisit (bukan cuma andalkan default CLI) karena vitest diam-diam
// memilih reporter yang lebih ringkas saat stdout bukan TTY (mis. lewat pipe/redirect — kasus umum di
// CI atau saat dijalankan skrip lain), dan reporter ringkas itu MEMBUANG blok `stderr | <file>` untuk
// file yang seluruh test-nya ter-skip — termasuk console.warn "deploy file not found" yang sengaja
// ditambahkan (Task 17 fix round 1) supaya integration.test.ts tidak diam-diam skip 0 sinyal.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 120_000, hookTimeout: 120_000, fileParallelism: false, reporters: ["default"] } });
