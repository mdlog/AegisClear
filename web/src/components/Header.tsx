import type { ConfigResponse } from "../../shared/types";
import { explorer, shortAddr } from "../format";

export function Addr({ a, base, full }: { a: string; base?: string; full?: boolean }) {
  const href = explorer(base, "address", a); const text = full ? a : shortAddr(a);
  return href ? <a className="mono" href={href} target="_blank" rel="noreferrer" title={a}>{text}</a> : <code title={a}>{text}</code>;
}
export function Tx({ h, base }: { h: string; base?: string }) {
  const href = explorer(base, "tx", h);
  return href ? <a className="mono" href={href} target="_blank" rel="noreferrer" title={h}>{shortAddr(h)}</a> : <code title={h}>{shortAddr(h)}</code>;
}
export function Header({ cfg, error }: { cfg: ConfigResponse | null; error: string | null }) {
  return (
    <header className="header">
      <div>
        <h1>AegisClear <span className="muted">console</span></h1>
        <p className="muted">micro-escrow USDG per pasangan agen · penyelesaian proporsional dengan bukti Groth16 · syarat &amp; metrik tetap privat</p>
      </div>
      {error && <div className="banner error">server tidak jalan — <code>pnpm --filter @aegisclear/web start</code> ({error})</div>}
      {cfg && (
        <div className="badges">
          <span className={`pill net-${cfg.network}`}>{cfg.network} · chain {cfg.chainId}</span>
          {(["factory", "factoryProd", "factoryAnchored", "usdg", "verifier", "escrow"] as const).map((k) =>
            cfg.addresses[k] ? <span key={k} className="pill">{k} <Addr a={cfg.addresses[k]} base={cfg.explorerBase} /></span> : null,
          )}
          <span className="pill">provider <Addr a={cfg.provider} base={cfg.explorerBase} /></span>
          {cfg.clients.map((c) => <span key={c.label} className="pill">klien {c.label} <Addr a={c.address} base={cfg.explorerBase} /></span>)}
        </div>
      )}
    </header>
  );
}
