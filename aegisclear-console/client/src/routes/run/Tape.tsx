// The tape (LAYOUT_SPEC "Acts", built by groupRun): a document that grows with the stream. Live mode expands the
// act being played and folds finished ones to a line; verdict mode keeps the Resolution block open as evidence.
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { ConfigResponse, RunSnapshot, Step } from "@aegis/types";
import { runCopy as copy, scenarioCopy } from "@/copy/en";
import { gas, shortHex } from "@/lib/format";
import { presentStep } from "@/lib/present/labels";
import type { Act, Leg } from "@/lib/present/run";
import { Hex } from "@/ui/Hex";
import { ResolutionBlock } from "./ResolutionBlock";
import { ServiceAct } from "./ServiceAct";
import styles from "./run.module.css";

export type TapeMode = "live" | "verdict" | "error";

export function Tape({ legs, run, mode, config }: { legs: Leg[]; run: RunSnapshot; mode: TapeMode; config: ConfigResponse }) {
  const lastI = Math.max(-1, ...run.steps.map((s) => s.i));
  return (
    <div className={styles.tape}>
      {legs.map((leg, li) => {
        const counts: Record<string, number> = {};
        const prefix = legs.length > 1 ? `leg${li + 1}-` : "";
        return (
          <section key={li} id={legs.length > 1 ? `leg${li + 1}` : undefined} className={styles.leg} aria-label={legs.length > 1 ? copy.legOf(li + 1, legs.length) : undefined}>
            {leg.marker && <LegLine id={`${prefix}leg-title`} leg={leg} n={li + 1} of={legs.length} />}
            {leg.acts.map((act, ai) => {
              const k = counts[act.kind] ?? 0;
              counts[act.kind] = k + 1;
              const id = `${prefix}act-${ACT_ID[act.kind]}${k ? `-${k}` : ""}`;
              const holdsLast = act.steps.some((s) => s.i === lastI);
              const anchored = (leg.scenario ?? run.scenario) === "B-anchored-dispute";
              const auto =
                mode === "live" ? holdsLast
                : mode === "error" ? holdsLast || act.kind === "resolution"
                : act.kind === "resolution" || (act.kind === "service" && anchored); // DECISION: the 20 on-chain acks are the anchored run's evidence
              return (
                <ActSection key={ai} id={id} legTitleId={prefix && leg.marker ? `${prefix}leg-title` : undefined} live={mode === "live" && holdsLast} act={act} auto={auto} summary={summaryOf(act, leg, run)}>
                  <ActBody act={act} leg={leg} run={run} mode={mode} config={config} epochIndex={k} idPrefix={prefix} />
                </ActSection>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

const ACT_ID: Record<Act["kind"], string> = { fund: "fund", service: "serve", resolution: "resolve", close: "close", escrow: "escrow", other: "other" };

function LegLine({ id, leg, n, of }: { id: string; leg: Leg; n: number; of: number }) {
  const addr = /0x[0-9a-fA-F]{40}/.exec(leg.marker?.label ?? "")?.[0];
  return (
    <p id={id} className={styles.legLine}>
      {of > 1 && <span className={styles.legCount}>{copy.legOf(n, of)}</span>}
      <strong>{leg.scenario ? scenarioCopy[leg.scenario].title : leg.marker?.label}</strong>
      {leg.client && <span className="meta">{copy.client(leg.client)}{addr ? ` (${shortHex(addr)})` : ""}</span>}
    </p>
  );
}

function ActSection({ id, legTitleId, live, act, auto, summary, children }: {
  id: string; legTitleId?: string; live: boolean; act: Act; auto: boolean; summary: string; children: ReactNode;
}) {
  const [override, setOverride] = useState<boolean>();
  const open = override ?? auto;
  // In a multi-leg run every leg has its own Fund act, so the leg names the act too (unique landmarks).
  return (
    <section id={id} data-live-act={live || undefined} className={`${styles.act} ${open ? styles.actOpen : ""}`} aria-labelledby={legTitleId ? `${legTitleId} ${id}-title` : `${id}-title`}>
      <div className={styles.actHead}>
        <h2 id={`${id}-title`} className={styles.actTitle}>{copy.acts[act.kind]}</h2>
        {!open && <p className={styles.actSummary}>{summary}</p>}
        <button type="button" className={`btn btn--quiet btn--small ${styles.actToggle}`} aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOverride(!open)}>
          {open ? copy.hideAct : copy.showAct}
        </button>
      </div>
      <div id={`${id}-body`} hidden={!open} className={styles.actBody}>{open && children}</div>
    </section>
  );
}

/** One line per folded act. The service line always states its on-chain transaction count. */
function summaryOf(act: Act, leg: Leg, run: RunSnapshot): string {
  const txs = act.steps.filter((s) => s.txHash);
  const gasSum = txs.reduce((g, s) => g + BigInt(s.gasUsed ?? 0), 0n);
  if (act.kind === "service") {
    const done = Math.max(0, ...act.steps.map((s) => s.progress?.done ?? 0), act.steps.filter((s) => s.label === "ack" && s.txHash).length);
    const total = Math.max(done, ...act.steps.map((s) => s.progress?.total ?? 0));
    return `${copy.unitsServed(done, total)}. ${copy.serviceTx}: ${txs.length}`;
  }
  if (act.kind === "resolution") {
    const proof = act.steps.find((s) => s.phase === "prove");
    return proof ? presentStep(proof, { scenario: leg.scenario ?? run.scenario }).title : `${act.steps.length} steps`;
  }
  return `${copy.tx(txs.length)}${txs.length ? `, ${gas(gasSum)} gas` : ""}`;
}

function ActBody({ act, leg, run, mode, config, epochIndex, idPrefix }: {
  act: Act; leg: Leg; run: RunSnapshot; mode: TapeMode; config: ConfigResponse; epochIndex: number; idPrefix: string;
}) {
  const scenario = leg.scenario ?? run.scenario;
  if (act.kind === "service") return <ServiceAct act={act} scenario={scenario} config={config} epochIndex={epochIndex} />;
  if (act.kind === "resolution") return <ResolutionBlock act={act} run={run} scenario={scenario} config={config} mode={mode} idPrefix={idPrefix} />;
  const closeSigned = act.kind === "close" && act.steps.some((s) => s.txHash && s.label === "closeCooperative");
  return (
    <>
      <ol className={styles.steps}>
        {act.steps.map((s) => <StepLine key={s.i} step={s} scenario={scenario} config={config} />)}
      </ol>
      {closeSigned && <p className={styles.note}>{copy.closeSigned}</p>}
    </>
  );
}

export function StepLine({ step, scenario, config }: { step: Step; scenario: RunSnapshot["scenario"]; config: ConfigResponse }) {
  const p = presentStep(step, { scenario });
  const opens = step.phase === "open" && step.channel;
  const flagged = step.txHash && step.label.startsWith("createJob");
  return (
    <li className={`${styles.step} ${p.kind === "proof" ? styles.proofStep : ""}`}>
      <span className={styles.stepTitle}>{p.title}</span>
      {p.meta && <span className={styles.stepMeta}>{p.meta}</span>}
      {step.txHash && <Hex value={step.txHash} kind="tx" label={`${p.title} transaction`} explorerBase={config.explorerBase} />}
      {opens && <Link className={styles.stepLink} to={`/channels/${step.channel}`}>{copy.openRecord(shortHex(step.channel!))}</Link>}
      {flagged && <span className={styles.flag}>{copy.calldataFlag}</span>}
    </li>
  );
}
