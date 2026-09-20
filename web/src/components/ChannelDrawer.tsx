import { useEffect, useState } from "react";
import type { ChannelDetail, ConfigResponse } from "../../shared/types";
import { getChannel } from "../api";
import { fmtUsdg, gasFmt } from "../format";
import { Addr, Tx } from "./Header";

export function ChannelDrawer({ addr, cfg, onClose }: { addr: string; cfg: ConfigResponse | null; onClose: () => void }) {
  const [d, setD] = useState<ChannelDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setD(null); setErr(null);
    getChannel(addr).then((x) => { if (alive) setD(x); }).catch((e) => { if (alive) setErr(String((e as Error).message)); });
    return () => { alive = false; };
  }, [addr]);
  const base = cfg?.explorerBase;
  return (
    <aside className="drawer" aria-label="detail channel">
      <div className="drawer-head"><h3>Channel <Addr a={addr} base={base} full /></h3><button onClick={onClose}>tutup</button></div>
      {err && <p className="banner error">{err}</p>}
      {!d && !err && <p className="muted">memuat…</p>}
      {d && (
        <>
          <dl className="kv">
            <dt>state</dt><dd><span className={`pill st-${d.state}`}>{d.state}</span> <span className={`pill mode-${d.mode}`}>{d.mode}</span> · seq {d.seq} · epoch {d.epoch} · A {fmtUsdg(d.cumulativeAmount)} USDG · budget {fmtUsdg(d.budget)} USDG</dd>
            <dt>T (termsCommitment)</dt><dd><code>{d.termsCommitment}</code></dd>
            <dt>R (receiptsRoot)</dt><dd><code>{d.receiptsRoot}</code></dd>
            <dt>klien → payoutClient</dt><dd><Addr a={d.cfg.client} base={base} /> → <Addr a={d.cfg.payoutClient} base={base} /></dd>
            <dt>provider → payoutProvider</dt><dd><Addr a={d.cfg.provider} base={base} /> → <Addr a={d.cfg.payoutProvider} base={base} /></dd>
            <dt>jendela</dt><dd>challenge {d.cfg.challengeWindow} s · response {d.cfg.responseWindow} s</dd>
            <dt>bukti</dt><dd>{d.hasProof ? `payToClient ${fmtUsdg(d.payToClient)} USDG` : "—"}</dd>
            <dt>dibuka</dt><dd><Tx h={d.openedTx} base={base} /> · blok {d.openedBlock} · {d.factoryName}</dd>
          </dl>
          <h4>Event on-chain</h4>
          {d.events.length === 0 && <p className="muted">belum ada</p>}
          <ol className="log">
            {d.events.map((e, i) => (
              <li key={e.txHash + i}>
                <span className="ph">{e.name}</span> <Tx h={e.txHash} base={base} /> <span className="muted">{gasFmt(e.gasUsed)} gas</span>
                <div className="args">{Object.entries(e.args).map(([k, v]) => <span key={k}><b>{k}</b>={v} </span>)}</div>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  );
}
