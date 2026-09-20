import { useEffect, useState } from "react";
import type { ChannelSummary, ConfigResponse } from "../../shared/types";
import { getChannels } from "../api";
import { countdown, fmtUsdg } from "../format";
import { Addr } from "./Header";

export function ChannelsTable({ cfg, onSelect }: { cfg: ConfigResponse | null; onSelect: (a: string) => void }) {
  const [rows, setRows] = useState<ChannelSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    let alive = true;
    const tick = () => getChannels().then((r) => { if (alive) { setRows(r.channels); setErr(null); } }).catch((e) => { if (alive) setErr(String((e as Error).message)); });
    void tick();
    const id = setInterval(() => { void tick(); setNow(Math.floor(Date.now() / 1000)); }, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return (
    <>
      <h2>Channels <span className="muted">({rows.length})</span></h2>
      {err && <p className="banner error">{err}</p>}
      {rows.length === 0 && !err && <p className="muted">Belum ada channel di factory ini — jalankan skenario di panel Demo.</p>}
      {rows.length > 0 && (
        <div className="scroll">
          <table className="table">
            <thead><tr><th>channel</th><th>klien</th><th>state</th><th>seq</th><th>A (USDG)</th><th>budget</th><th>deadline</th><th>bukti</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.channel} className="row-click" onClick={() => onSelect(r.channel)}>
                  <td><Addr a={r.channel} base={cfg?.explorerBase} />{r.runId && <span className="tag">run</span>}{r.factoryName !== "factory" && <span className="tag">{r.factoryName}</span>}</td>
                  <td><Addr a={r.client} base={cfg?.explorerBase} /></td>
                  <td><span className={`pill st-${r.state}`}>{r.state}</span></td>
                  <td>{r.seq}</td>
                  <td>{fmtUsdg(r.cumulativeAmount)}</td>
                  <td>{fmtUsdg(r.budget)}</td>
                  <td>{r.state === "CLOSING" ? countdown(r.deadline, now) : "—"}</td>
                  <td>{r.hasProof ? `payToClient ${fmtUsdg(r.payToClient)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
