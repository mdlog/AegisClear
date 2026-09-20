import { useEffect, useState, type ReactNode } from "react";
import type { ChannelDetail, ConfigResponse, LeakResponse, RunSnapshot } from "../../shared/types";
import { getChannel } from "../api";
import { fmtUsdg, shortAddr } from "../format";
import { Tx } from "./Header";

export function PrivacyCards({ cfg, run, leak }: { cfg: ConfigResponse | null; run: RunSnapshot; leak: LeakResponse[] | null }) {
  const [chs, setChs] = useState<ChannelDetail[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all(run.channels.map(getChannel))
      .then((cs) => { if (alive) { setChs(cs); setErr(null); } })
      .catch((e) => { if (alive) setErr(String((e as Error).message)); });
    return () => { alive = false; };
  }, [run.id, run.status]);
  return (
    <div className="cards">
      <div className="card private">
        <h3>Privat (off-chain) — hanya provider &amp; klien</h3>
        {cfg && (
          <dl className="kv">
            <dt>harga/unit</dt><dd>{fmtUsdg(cfg.terms.unitPrice)} USDG</dd>
            <dt>ambang</dt><dd>latensi ≤ {cfg.terms.maxM1} ms · kualitas ≥ {cfg.terms.minM2}</dd>
            <dt>penalti</dt><dd>{Number(cfg.terms.penaltyBps) / 100}% per unit melanggar · cap {Number(cfg.terms.capBps) / 100}% dari total</dd>
            <dt>unit melanggar (demo)</dt><dd>seq {cfg.breaches.join(", ")} (latensi 1200 ms)</dd>
          </dl>
        )}
        <p className="muted">Nilai-nilai ini tidak pernah masuk calldata maupun log; di chain hanya ada komitmen Poseidon-nya.</p>
      </div>
      <div className="card chain">
        <h3>Yang dilihat chain</h3>
        {err && <p className="banner error">{err}</p>}
        {chs.map((c) => (
          <dl className="kv" key={c.channel}>
            <dt>channel</dt><dd><code>{shortAddr(c.channel)}</code> · {c.state}</dd>
            <dt>T</dt><dd><code>{shortAddr(c.termsCommitment)}</code></dd>
            <dt>R</dt><dd><code>{shortAddr(c.receiptsRoot)}</code></dd>
            <dt>A</dt><dd>{fmtUsdg(c.cumulativeAmount)} USDG</dd>
            <dt>payToClient</dt><dd>{c.hasProof ? `${fmtUsdg(c.payToClient)} USDG (bukti)` : "— (tanpa bukti)"}</dd>
          </dl>
        ))}
        {leak && leak.map((l) => (
          <p key={l.channel} className={l.leaks === 0 ? "ok" : "bad"}>
            leak-check {shortAddr(l.channel)}: <b>bocor {l.leaks}</b>, ambigu {l.ambiguous}, {l.txs.length} tx dipindai{" "}
            {l.txs.map((h) => <Tx key={h} h={h} base={cfg?.explorerBase} />).reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, " ", el] : [el]), [])}
          </p>
        ))}
      </div>
    </div>
  );
}
