import { useEffect, useState } from "react";
import type { ConfigResponse } from "../shared/types";
export function App() {
  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/config").then((r) => r.json()).then(setCfg).catch((e) => setErr(String(e))); }, []);
  return (
    <main className="wrap">
      <h1>AegisClear console</h1>
      {err && <p className="banner error">server tidak jalan: <code>pnpm --filter @aegisclear/web start</code> ({err})</p>}
      {cfg && <p>network <span className="pill">{cfg.network} · {cfg.chainId}</span> factory <code>{cfg.addresses.factory}</code></p>}
    </main>
  );
}
