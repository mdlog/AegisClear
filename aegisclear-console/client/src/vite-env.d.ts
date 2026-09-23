/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "fixtures" replays docs/frontend/fixtures instead of calling the console server (README §2.2 #10). Default: live. */
  readonly VITE_API_MODE?: "live" | "fixtures";
  /** Fixture mode only: "local" (default, every scenario recorded) or "testnet" (read-only capture, no runs). */
  readonly VITE_FIXTURE_SET?: "local" | "testnet";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
