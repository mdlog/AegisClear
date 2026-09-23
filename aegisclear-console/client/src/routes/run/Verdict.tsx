// Verdict mode (LAYOUT_SPEC): the slip for Market-B runs, one tab per channel for the comparison run (dispute first),
// and Market A's calldata panel, where the terms travel in plain text. Below: the result table (F8) and next actions.
import { useRef, type KeyboardEvent, type Ref } from "react";
import { Link } from "react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ChannelDetail, ConfigResponse, LeakResponse, Row, RunSnapshot, ScenarioId } from "@aegis/types";
import { runCopy as copy, scenarioCopy, txCopy } from "@/copy/en";
import { useLaunch } from "@/features/runs/useLaunch";
import { gas, shortHex } from "@/lib/format";
import { presentRow } from "@/lib/present/labels";
import type { Leg } from "@/lib/present/run";
import { HatchBar } from "@/ui/Bars";
import { CopyButton, Hex } from "@/ui/Hex";
import { Slip } from "./Slip";
import styles from "./run.module.css";

/** The result row of each scenario, by its fixed server label (API_CONTRACT §7.3). */
const PASAR: Record<ScenarioId, string> = {
  "B-dispute": "B: AegisClear sengketa (bukti)",
  "B-cooperative": "B: AegisClear kooperatif",
  "B-anchored-dispute": "B: AegisClear anchored (ack on-chain, sengketa)",
  "B-rollover": "B: AegisClear rollover (128 + 5 unit, 1 deposit)",
  "A-complete": "A: evaluator biner (complete)",
  "A-reject": "A: evaluator biner (reject)",
  all: "",
};

export interface VerdictLeg { scenario: ScenarioId; channel: string; pasar: string; title: string }

/** The Market-B legs that opened a channel, dispute first (LAYOUT_SPEC per-scenario verdict table). */
export function verdictLegs(legs: Leg[], run: RunSnapshot): VerdictLeg[] {
  const out: VerdictLeg[] = [];
  for (const leg of legs) {
    const scenario = leg.scenario ?? run.scenario;
    const channel = leg.acts.flatMap((a) => a.steps).find((s) => s.channel)?.channel;
    if (scenario.startsWith("B-") && channel) out.push({ scenario, channel, pasar: PASAR[scenario], title: scenarioCopy[scenario].title });
  }
  return out.sort((a, b) => Number(b.scenario === "B-dispute") - Number(a.scenario === "B-dispute"));
}

export function Verdict({ run, tabs, tab, onTab, config, chain, leak, onLeak, headingRef }: {
  run: RunSnapshot; legs: Leg[]; tabs: VerdictLeg[]; tab: number; onTab: (i: number) => void; config: ConfigResponse;
  chain?: ChannelDetail; leak: UseQueryResult<LeakResponse[], unknown>; onLeak: () => void; headingRef: Ref<HTMLHeadingElement>;
}) {
  const launch = useLaunch();
  const control = (id: ScenarioId) => launch.runs?.find((r) => r.status === "done" && (r.scenario === id || r.scenario === "all"))?.id;
  const current = tabs[Math.min(tab, tabs.length - 1)];
  const row = current ? run.result?.find((r) => r.pasar === current.pasar) ?? (run.scenario !== "all" ? run.result?.[0] : undefined) : undefined;
  const leakFor = current && leak.data?.find((l) => l.channel.toLowerCase() === current.channel.toLowerCase());
  const detail = chain && current && chain.channel.toLowerCase() === current.channel.toLowerCase() ? chain : undefined;
  return (
    <section className={styles.verdict} aria-labelledby="verdict-title">
      <h2 id="verdict-title" ref={headingRef} tabIndex={-1} className="sr-only">{copy.verdict}</h2>
      {run.scenario.startsWith("A-") ? (
        <CalldataPanel run={run} config={config} launchRun={() => launch.run("B-dispute")} disabled={launch.disabled} />
      ) : (
        <>
          {tabs.length > 1 && <Tabs tabs={tabs} tab={tab} onTab={onTab} />}
          <div role={tabs.length > 1 ? "tabpanel" : undefined} id={tabs.length > 1 ? "verdict-panel" : undefined} aria-labelledby={tabs.length > 1 ? `verdict-tab-${tab}` : undefined}>
            <Slip
              row={row} detail={detail} config={config} anchored={current?.scenario === "B-anchored-dispute"}
              leak={{ data: leakFor, pending: leak.isFetching, failed: leak.isError, applicable: Boolean(current), ask: onLeak }}
              control={{ complete: control("A-complete"), reject: control("A-reject"), canRun: !launch.disabled, run: () => launch.run("A-reject") }}
            />
          </div>
        </>
      )}
    </section>
  );
}

function Tabs({ tabs, tab, onTab }: { tabs: VerdictLeg[]; tab: number; onTab: (i: number) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : -1;
    if (next < 0) return;
    e.preventDefault();
    onTab(next);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={copy.tabs} className={styles.tabs}>
      {tabs.map((t, i) => (
        <button key={t.channel} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`verdict-tab-${i}`}
          aria-selected={i === tab} aria-controls="verdict-panel" tabIndex={i === tab ? 0 : -1}
          className={styles.tab} onClick={() => onTab(i)} onKeyDown={(e) => move(e, i)}>
          {t.title}
        </button>
      ))}
    </div>
  );
}

function CalldataPanel({ run, config, launchRun, disabled }: { run: RunSnapshot; config: ConfigResponse; launchRun: () => void; disabled: boolean }) {
  const row = run.result?.[0];
  const createJob = run.steps.find((s) => s.txHash && s.label.startsWith("createJob"));
  const shares = row ? presentRow(row) : undefined;
  return (
    <div className={`sheet ${styles.calldata}`}>
      <h3 className={styles.calldataTitle}>{copy.calldata.title}</h3>
      {shares && (
        <div className={styles.calldataSplit}>
          <p className={styles.calldataFigure}>{shares.clientShare} / {shares.providerShare} <span className="meta">MockUSDG, client / provider</span></p>
          <HatchBar height={10} />
          <p className="meta">{shares.decidedBy}</p>
        </div>
      )}
      <p>{copy.calldata.body}</p>
      <blockquote className={styles.quote}><code>{copy.calldata.quote}</code></blockquote>
      <p className="meta">{copy.calldata.caption}</p>
      {createJob?.txHash && <p className={styles.txLine}>{copy.calldata.tx} <Hex value={createJob.txHash} kind="tx" keep={8} label={copy.calldata.tx} explorerBase={config.explorerBase} /></p>}
      <button type="button" className="btn btn--primary" disabled={disabled} onClick={launchRun}>{copy.calldata.compare}</button>
    </div>
  );
}

export function ResultTable({ run }: { run: RunSnapshot }) {
  const rows = run.result ?? [];
  if (!rows.length) return null;
  const c = copy.resultCols;
  const control = rows.filter((r) => r.pasar.startsWith("A:"));
  const aegis = rows.filter((r) => !r.pasar.startsWith("A:"));
  const grouped = run.scenario === "all";
  const line = (r: Row) => {
    const p = presentRow(r);
    const verdictRow = grouped && r.pasar === PASAR["B-dispute"];
    return (
      <tr key={r.pasar} className={verdictRow ? styles.verdictRow : undefined}>
        <th scope="row">{p.market}{verdictRow && <span className={styles.tag}>{copy.verdictRow}</span>}</th>
        <td className={styles.num}>{p.clientShare} / {p.providerShare}</td>
        <td>{p.decidedBy}</td>
        <td>{p.visible}</td>
        <td className={styles.num}>{gas(r.gas)}</td>
        <td className={styles.num}>{r.proving_ms === "-" ? copy.na : `${(Number(r.proving_ms) / 1000).toFixed(1)} s`}</td>
        <td>
          <details className={styles.txs}>
            <summary>{r.txs.length} tx</summary>
            <ol>{r.txs.map((t) => <li key={t.hash}><span>{txCopy[t.label] ?? t.label}</span> <Hex value={t.hash} kind="tx" label={txCopy[t.label] ?? t.label} /></li>)}</ol>
          </details>
        </td>
      </tr>
    );
  };
  return (
    <section className={`sheet ${styles.results}`}>
      <div className={styles.tableWrap}>
        <table className={styles.resultTable}>
          <caption className={styles.resultCaption}>{copy.results}</caption>
          <thead>
            <tr>
              <th scope="col">{c.market}</th><th scope="col" className={styles.num}>{c.split}</th><th scope="col">{c.decided}</th>
              <th scope="col">{c.visible}</th><th scope="col" className={styles.num}>{c.gas}</th><th scope="col" className={styles.num}>{c.proving}</th><th scope="col">{c.txs}</th>
            </tr>
          </thead>
          {grouped ? (
            <>
              <tbody><tr className={styles.groupRow}><th scope="rowgroup" colSpan={7}>{copy.resultGroups.control}</th></tr>{control.map(line)}</tbody>
              <tbody><tr className={styles.groupRow}><th scope="rowgroup" colSpan={7}>{copy.resultGroups.aegis}</th></tr>{aegis.map(line)}</tbody>
            </>
          ) : (
            <tbody>{rows.map(line)}</tbody>
          )}
        </table>
      </div>
    </section>
  );
}

export function NextActions({ channels, run }: { channels: string[]; run: RunSnapshot }) {
  const recovery = `${globalThis.location?.origin ?? ""}/runs/${run.id}?leak=1${channels[0] ? `&ch=${channels[0]}` : ""}`;
  return (
    <section className={`sheet ${styles.next}`} aria-labelledby="next-title">
      <h2 id="next-title">{copy.nextAction}</h2>
      <ul className={styles.nextList}>
        {channels.map((c) => <li key={c}><Link to={`/channels/${c}`}>{copy.openRecord(shortHex(c))}</Link></li>)}
        <li><Link to="/">{copy.runAnother}</Link></li>
        <li className={styles.recovery}><span>{copy.copyRecovery}</span><CopyButton value={recovery} what="recovery link" /></li>
      </ul>
    </section>
  );
}
