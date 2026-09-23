// The Resolution block (LAYOUT_SPEC): dispute, state, proof, claim, challenge window, settle, always in logical
// order, whatever order the steps arrived in (the proof step lands after the claim, API_CONTRACT §5.4.1). The quiet
// proving interval shows one combined in-progress state with an elapsed timer; there is no per-station fake progress.
import type { ConfigResponse, RunSnapshot, ScenarioId, Step } from "@aegis/types";
import { runCopy as copy } from "@/copy/en";
import { elapsed, gas } from "@/lib/format";
import { presentStep, proofFacts } from "@/lib/present/labels";
import { waitClock, type Act } from "@/lib/present/run";
import { WithNow } from "@/ui/Clock";
import { Hex } from "@/ui/Hex";
import type { TapeMode } from "./Tape";
import styles from "./run.module.css";

type Mark = "done" | "current" | "pending";

export function ResolutionBlock({ act, run, scenario, config, mode, idPrefix }: {
  act: Act; run: RunSnapshot; scenario: ScenarioId; config: ConfigResponse; mode: TapeMode; idPrefix: string;
}) {
  const at = (kind: string) => act.stations?.find((s) => s.kind === kind)?.steps ?? [];
  const [opened] = at("opened");
  const [state] = at("state");
  const [proof] = at("proof");
  const [claim] = at("claim");
  const waits = at("window");
  const settles = at("settled");
  const ctx = { scenario };
  const live = mode === "live";
  // Nothing arrives between the dispute line and the burst of state, claim and proof (API_CONTRACT §5.4.8).
  const pendingBurst = live && opened && !state && !claim && !proof;
  const lastWait = waits.at(-1);
  const windowOpen = live && waits.length > 0 && !settles.length;
  const { amount: proofAmount, provingMs } = proof ? proofFacts(proof) : {};
  const mark = (step: Step | undefined, next: boolean): Mark => (step ? "done" : live && next ? "current" : "pending");

  return (
    <div className={styles.resolution}>
      <ol className={styles.stations}>
        <Station mark={mark(opened, true)} title={copy.r.opened}>
          {opened && <p>{scenario === "B-anchored-dispute" ? copy.r.openedAnchored : copy.r.openedCoSigned}</p>}
        </Station>

        {pendingBurst ? (
          <Station mark="current" title={copy.r.waiting}>
            <p>{copy.r.pending}</p>
            <p className={styles.timer}>
              <WithNow>{(now) => copy.r.pendingSince(elapsed(Math.max(0, now - (run.startedAt + opened.t))))}</WithNow>
            </p>
          </Station>
        ) : (
          <>
            <Station mark={mark(state, Boolean(opened))} title={copy.r.state}>
              {state && <TxLine step={state} scenario={scenario} config={config} />}
              {state && <p className="meta">{copy.r.stateMeta}</p>}
            </Station>
            <Station mark={mark(proof, Boolean(state))} title={copy.r.proof} proof>
              {proof && (
                <>
                  <p className={styles.proofTitle}>{presentStep(proof, ctx).title}</p>
                  {presentStep(proof, ctx).meta && <p className={styles.timer}>{presentStep(proof, ctx).meta}</p>}
                  {proofAmount && <p>{copy.r.proofStatement(proofAmount)}</p>}
                  <p className="meta">{copy.r.proofVerified}</p>
                </>
              )}
            </Station>
            <Station mark={mark(claim, Boolean(proof))} title={copy.r.claim}>
              {claim && <TxLine step={claim} scenario={scenario} config={config} />}
            </Station>
          </>
        )}

        <Station mark={waits.length ? (settles.length || mode !== "live" ? "done" : "current") : "pending"} title={copy.r.window}>
          {lastWait && !lastWait.progress && <p>{presentStep(lastWait, ctx).title}</p>}
          {lastWait?.progress && windowOpen && (
            <WithNow>
              {(now) => {
                const clock = waitClock({ step: lastWait, receivedAt: run.startedAt + lastWait.t }, now);
                return clock && (
                  <>
                    <p className={styles.countdown}>{clock.overdue ? copy.r.deadlinePassed : copy.r.left(clock.left)}</p>
                    <span className={styles.drain} aria-hidden="true"><span style={{ width: `${(clock.left / clock.total) * 100}%` }} /></span>
                  </>
                );
              }}
            </WithNow>
          )}
          {(waits.length > 0 || windowOpen) && (
            <ul className={styles.windowFacts}>
              {copy.r.facts.map((f) => <li key={f}>{f}</li>)}
              <li>{copy.r.factWindow(config.windows.challenge)}</li>
            </ul>
          )}
        </Station>

        <Station id={`${idPrefix}act-settle`} mark={settles.length ? "done" : live && waits.length ? "current" : "pending"} title={copy.r.settled}>
          {settles.map((s) => (s.txHash ? <TxLine key={s.i} step={s} scenario={scenario} config={config} /> : <p key={s.i}>{presentStep(s, ctx).title}</p>))}
        </Station>
      </ol>

      {settles.length > 0 && proofAmount && (
        <dl className={styles.blockSummary}>
          <dt>{copy.r.summary}</dt>
          <dd>{copy.r.summaryRefund(proofAmount)}</dd>
          {provingMs !== undefined && <dd>{copy.r.summaryProof((provingMs / 1000).toFixed(1))}</dd>}
          <dd>{copy.r.summaryWindow(config.windows.challenge)}</dd>
          <dd>{copy.r.settled}</dd>
        </dl>
      )}
    </div>
  );
}

function Station({ id, mark, title, proof = false, children }: { id?: string; mark: Mark; title: string; proof?: boolean; children?: React.ReactNode }) {
  return (
    <li id={id} className={`${styles.rStation} ${styles[`r-${mark}`]} ${proof ? styles.rProof : ""}`}>
      <i className={styles.rGlyph} aria-hidden="true" />
      <div className={styles.rBody}>
        <h3 className={styles.rTitle}>{title}</h3>
        {children}
      </div>
    </li>
  );
}

function TxLine({ step, scenario, config }: { step: Step; scenario: ScenarioId; config: ConfigResponse }) {
  const p = presentStep(step, { scenario });
  return (
    <p className={styles.txLine}>
      <span>{p.title}</span>
      {step.gasUsed && <span className={styles.stepMeta}>{gas(step.gasUsed)} gas</span>}
      {step.txHash && <Hex value={step.txHash} kind="tx" label={`${p.title} transaction`} explorerBase={config.explorerBase} />}
    </p>
  );
}
