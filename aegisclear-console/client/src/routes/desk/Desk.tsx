// / Desk (LAYOUT_SPEC): in five seconds, what AegisClear does beside the other two rails; then start a scenario.
// The AegisClear row is bound to a real finished run when the session has one, and labelled a worked example otherwise.
import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import type { ConfigResponse, RunSnapshot } from "@aegis/types";
import { deskCopy as copy, scenarioCopy, titles } from "@/copy/en";
import { useAppConfig } from "@/app/loaders";
import { ScenarioLauncher } from "@/features/runs/ScenarioLauncher";
import { useLaunch, type Launch } from "@/features/runs/useLaunch";
import { useChannels } from "@/lib/api/queries";
import { elapsed, parseUsdg, relativeTime } from "@/lib/format";
import { presentRow } from "@/lib/present/labels";
import { scenarioInfo } from "@/lib/present/scenarios";
import { HatchBar, SplitBar } from "@/ui/Bars";
import { RunStatusMark } from "@/ui/State";
import { Ago, Elapsed, WithNow } from "@/ui/Clock";
import { useDocumentTitle } from "@/ui/useDocumentTitle";
import { useScrollToHash } from "@/ui/useScrollToHash";
import styles from "./Desk.module.css";

const DISPUTE_ROW = "B: AegisClear sengketa (bukti)";
// The worked example of spec §6.5 (PRODUCT_CONTEXT §1): 100 × 0.02, 7 breaches, 50 % penalty per breach.
const WORKED = { client: "0.07", provider: "1.93" };
const TWO = 2_000_000n;

const proofRun = (runs: RunSnapshot[] | undefined) =>
  runs?.find((r) => r.status === "done" && (r.scenario === "B-dispute" || r.scenario === "all") && r.result?.some((row) => row.pasar === DISPUTE_ROW));
const controlRun = (runs: RunSnapshot[] | undefined) =>
  runs?.find((r) => r.status === "done" && (r.scenario === "A-complete" || r.scenario === "A-reject" || r.scenario === "all"));
const summary = (run: RunSnapshot) => (run.scenario === "all" ? copy.fourRows : run.result?.[0]?.klien_provider);

export function Desk() {
  const config = useAppConfig();
  const launch = useLaunch();
  const location = useLocation();
  useDocumentTitle(titles.desk);
  useScrollToHash(Boolean(launch.runs));
  // The `n` shortcut lands here asking for the featured Run.
  useEffect(() => {
    if ((location.state as { focus?: string } | null)?.focus === "featured-run") document.getElementById("featured-run")?.focus();
  }, [location.key, location.state]);
  return (
    <div className={styles.page}>
      <div className={styles.framing}>
        <Problem />
        <Rails launch={launch} />
        <OnChainNow config={config} runLive={Boolean(launch.live)} />
      </div>
      <div className={styles.controls}>
        <LatestRun runs={launch.runs} />
        <ScenarioLauncher launch={launch} />
      </div>
      <SessionRuns runs={launch.runs} />
    </div>
  );
}

function Problem() {
  return (
    <header className={styles.problem}>
      <h1 className={styles.problemLine}>{copy.problem}</h1>
      <p className={styles.answer}>{copy.answer}</p>
      <figure className={styles.evidence}>
        <figcaption className={styles.evidenceTitle}>{copy.evidence}</figcaption>
        <dl className={styles.evidenceFigures}>
          {copy.evidenceFigures.map((f) => (
            <div key={f.label}><dd className={styles.evidenceValue}>{f.value}</dd><dt className="meta">{f.label}</dt></div>
          ))}
        </dl>
        <p className="meta">{copy.evidenceSource}</p>
      </figure>
    </header>
  );
}

function Rails({ launch }: { launch: Launch }) {
  const bound = proofRun(launch.runs);
  const row = bound?.result?.find((r) => r.pasar === DISPUTE_ROW);
  const shares = row ? presentRow(row) : undefined;
  const client = shares?.clientShare ?? WORKED.client;
  const provider = shares?.providerShare ?? WORKED.provider;
  const control = controlRun(launch.runs);
  const c = copy.rails;
  return (
    <section id="rails" className={`sheet ${styles.rails}`} aria-labelledby="rails-title">
      <h2 id="rails-title" className="sr-only">{copy.railsTitle}</h2>
      <table className={styles.railTable}>
        <caption className={styles.railCaption}>{copy.railsCaption}</caption>
        <thead>
          <tr><th scope="col">{copy.railCols.rail}</th><th scope="col">{copy.railCols.back}</th><th scope="col">{copy.railCols.decides}</th><th scope="col">{copy.railCols.sees}</th></tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{c.x402.name}</th>
            <td><div className={styles.backCell}><span className={styles.back}>{c.x402.back}</span><SplitBar client={0n} provider={TWO} /></div></td>
            <td>{c.x402.decides}</td>
            <td>{c.x402.sees}</td>
          </tr>
          <tr>
            <th scope="row">{c.binary.name}</th>
            <td>
              <div className={styles.backCell}>
                <span className={styles.back}>{c.binary.back}</span><HatchBar />
                {control && <Link className={styles.bound} to={`/runs/${control.id}`}>{copy.seenLive(control.id)}</Link>}
              </div>
            </td>
            <td>{c.binary.decides}</td>
            <td>{c.binary.sees}</td>
          </tr>
          <tr className={styles.aegisRow}>
            <th scope="row">{c.aegis.name}</th>
            <td>
              <div className={styles.backCell}>
              <span className={styles.back}>{c.aegis.back(client, provider)}</span>
              <SplitBar client={parseUsdg(client) ?? 0n} provider={parseUsdg(provider) ?? 0n} />
              {bound && row ? (
                <span className={styles.bound}>
                  <Link to={`/runs/${bound.id}`}>{copy.seenLive(bound.id)}</Link>
                  {row.proving_ms !== "-" && <span className="meta">{copy.provedIn((Number(row.proving_ms) / 1000).toFixed(1))}</span>}
                </span>
              ) : (
                <span className={styles.bound}>
                  <span className="meta">{copy.worked}</span>
                  <button type="button" className="btn btn--small" disabled={launch.disabled} onClick={() => launch.run("B-dispute")}>{copy.prove}</button>
                </span>
              )}
              </div>
            </td>
            <td>{c.aegis.decides}</td>
            <td>{c.aegis.sees}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function OnChainNow({ config, runLive }: { config: ConfigResponse; runLive: boolean }) {
  const { data } = useChannels({ runLive });
  if (!data) return null;
  const counts = (["SETTLED", "OPEN", "CLOSING"] as const).map((s) => ({ s, n: data.channels.filter((c) => c.state === s).length })).filter((x) => x.n > 0);
  return (
    <p className={styles.onChain}>
      <span>{copy.onChain(data.channels.length, copy.networkName(config.network))}</span>
      {counts.map(({ s, n }) => <Link key={s} to={`/channels?state=${s}`}>{copy.onChainState(n, copy.stateWords[s])}</Link>)}
      <span className="meta"><WithNow>{(now) => copy.scanned(relativeTime(data.scannedAt, now))}</WithNow></span>
    </p>
  );
}

function LatestRun({ runs }: { runs?: RunSnapshot[] }) {
  const latest = runs?.[0];
  if (!latest) return null;
  const title = scenarioCopy[latest.scenario].title;
  const live = latest.status === "running";
  return (
    <section className={`sheet ${styles.latest} ${live ? styles.latestLive : ""}`} aria-labelledby="latest-title">
      <h2 id="latest-title" className={styles.latestHeading}>{live ? copy.liveTitle : copy.latestTitle}</h2>
      <p className={styles.latestTitle}>{latest.status === "error" ? copy.latestError(title) : title}</p>
      <p className={styles.latestFacts}>
        <RunStatusMark status={latest.status} extra={live ? <Elapsed since={latest.startedAt} /> : undefined} />
        {latest.status === "done" && summary(latest) && <span>{summary(latest)}</span>}
        {!live && <span className="meta"><Ago at={latest.endedAt ?? latest.startedAt} /></span>}
      </p>
      <Link to={`/runs/${latest.id}`} className="btn btn--primary">{copy.openRun}</Link>
    </section>
  );
}

function SessionRuns({ runs }: { runs?: RunSnapshot[] }) {
  const config = useAppConfig();
  const c = copy.sessionCols;
  return (
    <section id="session-runs" className={`sheet ${styles.session}`} aria-labelledby="session-title">
      <h2 id="session-title">{copy.sessionRuns}</h2>
      {!runs ? (
        <div className={styles.placeholder} role="status" aria-label={copy.loadingRuns} />
      ) : runs.length === 0 ? (
        <p className="meta">{copy.noRuns}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.sessionTable}>
            <caption className={styles.sessionCaption}>{copy.sessionCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{c.scenario}</th><th scope="col">{c.client}</th><th scope="col">{c.status}</th><th scope="col">{c.started}</th>
                <th scope="col" className={styles.num}>{c.duration}</th><th scope="col" className={styles.num}>{c.result}</th><th scope="col" className={styles.num}>{c.channels}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <th scope="row"><Link to={`/runs/${r.id}`}>{scenarioCopy[r.scenario].title}</Link></th>
                  <td>{copy.client(scenarioInfo(r.scenario, config.network).client)}</td>
                  <td><RunStatusMark status={r.status} /></td>
                  <td><Ago at={r.startedAt} /></td>
                  <td className={styles.num}>{r.endedAt ? elapsed(r.endedAt - r.startedAt) : <Elapsed since={r.startedAt} tenths />}</td>
                  <td className={styles.num}>{r.status === "done" ? summary(r) : ""}</td>
                  <td className={styles.num}>{r.channels.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
