import { useEffect, useRef, useState } from "react";
import type { ConfigResponse, LeakResponse, Row, RunSnapshot, ScenarioId, Step } from "../../shared/types";
import { SCENARIOS } from "../../shared/types";
import { getRun, getRuns, leakCheck, startRun, subscribeRun } from "../api";
import { gasFmt } from "../format";
import { Tx } from "./Header";
import { PrivacyCards } from "./PrivacyCards";
import { OfferView } from "./OfferView";

const LABEL: Record<ScenarioId, string> = {
  "B-cooperative": "B · kooperatif (klien A)", "B-dispute": "B · sengketa + bukti (klien B)",
  "A-complete": "A · escrow biner: complete", "A-reject": "A · escrow biner: reject", all: "Jalankan semua (4 baris §14)",
};

export function DemoPanel({ cfg }: { cfg: ConfigResponse | null }) {
  const [run, setRun] = useState<RunSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [leak, setLeak] = useState<LeakResponse[] | null>(null);
  const [checking, setChecking] = useState(false);
  const unsub = useRef<(() => void) | undefined>(undefined);
  const gen = useRef(0);
  const attach = (id: string) => {
    unsub.current?.();
    unsub.current = subscribeRun(id, (ev) => {
      if (ev.type === "step") setRun((r) => (r && r.id === id ? { ...r, steps: [...r.steps.filter((s) => s.i !== ev.data.i), ev.data].sort((a, b) => a.i - b.i) } : r));
      else setRun(ev.data);
    });
  };
  useEffect(() => {
    const g = ++gen.current;
    getRuns()
      .then((rs) => { if (rs[0]) return getRun(rs[0].id).then((r) => { if (g === gen.current) { setRun(r); if (r.status === "running") attach(r.id); } }); })
      .catch((e) => { if (g === gen.current) setErr(String((e as Error).message)); });
    return () => unsub.current?.();
  }, []);
  const start = async (s: ScenarioId) => {
    setErr(null); setLeak(null);
    const g = ++gen.current;
    try {
      const { runId } = await startRun(s);
      const r = await getRun(runId);
      if (g === gen.current) { setRun(r); attach(runId); }
    } catch (e) {
      if (g === gen.current) setErr(String((e as Error).message));
    }
  };
  const running = run?.status === "running";
  return (
    <>
      <h2>Demo: Pasar A (escrow biner) vs Pasar B (AegisClear)</h2>
      <div className="buttons">{SCENARIOS.map((s) => <button key={s} disabled={running || !cfg} onClick={() => void start(s)}>{LABEL[s]}</button>)}</div>
      {err && <p className="banner error">{err}</p>}
      {run && (
        <>
          <div className="runhead"><span className={`pill st-${run.status}`}>{run.status}</span> <code>{run.scenario}</code> <span className="muted">#{run.id}</span></div>
          <StepLog steps={run.steps} base={cfg?.explorerBase} />
          {run.error && <p className="banner error">{run.error}</p>}
          {run.result && <div className="scroll"><ResultTable rows={run.result} base={cfg?.explorerBase} /></div>}
          {run.status === "done" && run.channels.length > 0 && (
            <>
              <div className="buttons">
                <button
                  disabled={checking}
                  onClick={() => { setChecking(true); leakCheck(run.id).then(setLeak).catch((e) => setErr(String((e as Error).message))).finally(() => setChecking(false)); }}
                >
                  Periksa kebocoran (calldata + log semua tx channel)
                </button>
              </div>
              <PrivacyCards cfg={cfg} run={run} leak={leak} />
            </>
          )}
        </>
      )}
      {cfg && <OfferView />}
    </>
  );
}

function StepLog({ steps, base }: { steps: Step[]; base?: string }) {
  const last = [...steps].reverse().find((s) => s.progress);
  return (
    <ol className="log">
      {steps.map((s) => (
        <li key={s.i} className={`ph-${s.phase}`}>
          <span className="t">{(s.t / 1000).toFixed(1)}s</span> <span className="ph">{s.phase}</span> {s.label}
          {s.detail && <span className="muted"> — {s.detail}</span>}
          {s.txHash && <> <Tx h={s.txHash} base={base} />{s.gasUsed && <span className="muted"> {gasFmt(s.gasUsed)} gas</span>}</>}
          {s.progress && s === last && <progress value={s.progress.done} max={s.progress.total} />}
        </li>
      ))}
    </ol>
  );
}

function ResultTable({ rows, base }: { rows: Row[]; base?: string }) {
  return (
    <table className="table result">
      <thead><tr><th>pasar</th><th>klien / provider (USDG)</th><th>siapa yang memutuskan</th><th>terbaca di explorer</th><th>gas siklus penuh</th><th>proving (ms)</th><th>tx</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.pasar}>
            <td>{r.pasar}</td><td className="mono">{r.klien_provider}</td><td>{r.penentu}</td><td>{r.terlihat}</td><td className="mono">{gasFmt(r.gas)}</td><td className="mono">{r.proving_ms}</td>
            <td>{r.txs.map((t) => <span key={t.hash} className="txlink"><Tx h={t.hash} base={base} /> </span>)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
