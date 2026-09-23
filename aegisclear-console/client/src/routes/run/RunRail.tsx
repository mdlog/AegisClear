// The lifecycle rail (LAYOUT_SPEC live mode section 2): stations named after the protocol, each carrying its client
// transaction count, so "Serve: 100 units, 0 tx" is visible structurally. Every station links to its act.
import type { RunSnapshot } from "@aegis/types";
import { runCopy as copy, scenarioCopy } from "@/copy/en";
import { gas } from "@/lib/format";
import { railOf, type Leg, type RailKey, type RailStation } from "@/lib/present/run";
import styles from "./run.module.css";

/** Act anchor for a station: the rail and the tape share these ids (LAYOUT_SPEC hash anchors). */
export function actAnchor(key: RailKey, leg: number, legs: number): string {
  const act: Record<RailKey, string> = {
    fund: "fund", open: "fund", serve: "serve", serve0: "serve", serve1: "serve-1", rollover: "close", resolve: "resolve", settle: "settle",
    close: "close", approve: "escrow", createJob: "escrow", fundEscrow: "escrow", submit: "escrow", evaluate: "escrow", other: "other",
  };
  return legs > 1 ? `leg${leg + 1}-act-${act[key]}` : `act-${act[key]}`;
}

function label(key: RailKey, scenario: string | undefined): string {
  if (key === "evaluate") return scenario === "A-reject" ? copy.station.evaluateReject : copy.station.evaluateComplete;
  return copy.station[key as keyof typeof copy.station] as string;
}

function detail(s: RailStation): string | undefined {
  if (s.state === "pending") return undefined;
  if (s.units !== undefined) return copy.units(s.units, s.txCount);
  if (s.key === "open") return copy.providerTx;
  return s.txCount ? `${copy.tx(s.txCount)}, ${gas(s.gas)} gas` : copy.tx(0);
}

function Stations({ stations, scenario, leg, legs }: { stations: RailStation[]; scenario?: string; leg: number; legs: number }) {
  return (
    <ol className={styles.railList}>
      {stations.map((s) => (
        <li key={s.key} className={`${styles.station} ${styles[`st-${s.state}`]}`}>
          <a href={`#${actAnchor(s.key, leg, legs)}`} className={styles.stationLink} aria-current={s.state === "current" ? "step" : undefined}>
            <i className={styles.stationGlyph} aria-hidden="true" />
            <span className={styles.stationName}>{label(s.key, scenario)}</span>
            <span className="sr-only">, {copy.stationState[s.state]}</span>
            {detail(s) && <span className={styles.stationDetail}>{detail(s)}</span>}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function RunRail({ legs, run }: { legs: Leg[]; run: RunSnapshot }) {
  const legSteps = legs.map((l) => l.acts.flatMap((a) => a.steps));
  if (legs.length <= 1) {
    const scenario = legs[0]?.scenario ?? (run.scenario === "all" ? "B-cooperative" : run.scenario);
    return (
      <nav aria-label={copy.rail} className={styles.rail}>
        <Stations stations={railOf(scenario, legSteps[0] ?? [], run.status)} scenario={scenario} leg={0} legs={1} />
      </nav>
    );
  }
  // `all`: four leg segments in server order; while live, the current leg also shows its own stations.
  const current = legs.length - 1;
  return (
    <nav aria-label={copy.rail} className={styles.rail}>
      <ol className={styles.railList}>
        {legs.map((leg, i) => {
          const state = run.status === "done" || i < current ? "done" : run.status === "error" ? "stopped" : "current";
          const txs = legSteps[i].filter((s) => s.txHash).length;
          return (
            <li key={i} className={`${styles.station} ${styles[`st-${state}`]}`}>
              <a href={`#leg${i + 1}`} className={styles.stationLink}>
                <i className={styles.stationGlyph} aria-hidden="true" />
                <span className={styles.stationName}>{copy.legOf(i + 1, legs.length)}</span>
                <span className={styles.stationDetail}>{leg.scenario ? scenarioCopy[leg.scenario].title : ""}, {copy.tx(txs)}</span>
              </a>
            </li>
          );
        })}
      </ol>
      {run.status === "running" && legs[current].scenario && (
        <Stations stations={railOf(legs[current].scenario!, legSteps[current], "running")} scenario={legs[current].scenario} leg={current} legs={legs.length} />
      )}
    </nav>
  );
}
