// The Serve act (README §1.1 C2 and C3): the brief's geometry with LAYOUT's data rules. A 16 × 8 grid is one
// 128-receipt epoch, filled from `progress` (never from label text); anchored runs get 20 slots that each gain their
// ack transaction; the rollover prints both epochs. Breaches are marked in every Market-B run, per epoch.
import type { ConfigResponse, ScenarioId } from "@aegis/types";
import { runCopy as copy } from "@/copy/en";
import { gas } from "@/lib/format";
import { breachesFor } from "@/lib/present/privacy";
import type { Act } from "@/lib/present/run";
import { Hex } from "@/ui/Hex";
import { StepLine } from "./Tape";
import styles from "./run.module.css";

const EPOCH = 128;
const ANCHORED_UNITS = 20;

export function ServiceAct({ act, scenario, config, epochIndex }: { act: Act; scenario: ScenarioId; config: ConfigResponse; epochIndex: number }) {
  const txs = act.steps.filter((s) => s.txHash);
  const narrative = act.steps.filter((s) => !s.txHash && !s.progress);
  const done = Math.max(0, ...act.steps.map((s) => s.progress?.done ?? 0));
  const total = Math.max(0, ...act.steps.map((s) => s.progress?.total ?? 0));
  const disputed = scenario === "B-dispute" || scenario === "B-anchored-dispute";

  if (scenario === "B-anchored-dispute") {
    const acks = act.steps.filter((s) => s.txHash && s.label === "ack");
    const units = Math.max(total, ANCHORED_UNITS);
    const breaches = breachesFor(config).filter((seq) => seq < units);
    return (
      <div className={styles.service}>
        <h3 className={styles.serviceTitle}>{copy.ackTitle}</h3>
        <ol className={styles.ackSlots}>
          {Array.from({ length: units }, (_, seq) => {
            const ack = acks[seq];
            const breach = breaches.includes(seq);
            return (
              <li key={seq} aria-label={`${copy.ackSlot(seq)}${ack ? `, ${gas(ack.gasUsed ?? 0)} gas` : ""}${breach ? ", breaching unit" : ""}`}
                className={`${styles.ackSlot} ${ack ? styles.ackFilled : ""} ${breach ? styles.ackBreach : ""}`}>
                <span className={styles.ackSeq}>{seq}</span>
                {ack ? (
                  <>
                    <span className={styles.ackGas}>{gas(ack.gasUsed ?? 0)}</span>
                    <Hex value={ack.txHash!} kind="tx" label={`${copy.ackSlot(seq)} transaction`} explorerBase={config.explorerBase} copy={false} />
                  </>
                ) : <span className="meta">…</span>}
              </li>
            );
          })}
        </ol>
        <p className={styles.serviceCount}>{copy.serviceTx}: <strong>{acks.length}</strong></p>
        {config.network === "testnet" && <p className="meta">{copy.stylus}</p>}
        <p className={styles.breachNote}>{copy.breachDispute}</p>
        <Narrative act={act} scenario={scenario} config={config} only={narrative.map((s) => s.i)} />
      </div>
    );
  }

  // Co-signed: one epoch grid. Rollover: this act is epoch 0 (up to 128) or epoch 1 (the units after 128).
  const rollover = scenario === "B-rollover";
  const filled = rollover ? (epochIndex === 0 ? Math.min(done, EPOCH) : Math.max(0, done - EPOCH)) : Math.min(done, EPOCH);
  const epochUnits = rollover ? (epochIndex === 0 ? EPOCH : Math.max(0, total - EPOCH)) : total || filled;
  const breaches = breachesFor(config).filter((seq) => seq < filled);
  return (
    <div className={styles.service}>
      <h3 className={styles.serviceTitle}>{rollover ? copy.epochTitle(epochIndex, filled, epochUnits) : copy.gridTitle}</h3>
      <div className={styles.unitGrid} role="img" aria-label={copy.gridLabel(filled, EPOCH, breaches.length)}>
        {Array.from({ length: EPOCH }, (_, seq) => (
          <span key={seq} className={breaches.includes(seq) ? styles.cellBreach : seq < filled ? styles.cellFilled : undefined} />
        ))}
      </div>
      <p className={styles.serviceCount}>
        {copy.unitsServed(filled, epochUnits)}. {copy.serviceTx}: <strong>{txs.length}</strong>
      </p>
      {breaches.length > 0 && <p className={styles.breachNote}>{disputed ? copy.breachDispute : copy.breachClosed}</p>}
      <Narrative act={act} scenario={scenario} config={config} only={narrative.map((s) => s.i)} />
    </div>
  );
}

function Narrative({ act, scenario, config, only }: { act: Act; scenario: ScenarioId; config: ConfigResponse; only: number[] }) {
  const steps = act.steps.filter((s) => only.includes(s.i));
  if (!steps.length) return null;
  return <ol className={styles.steps}>{steps.map((s) => <StepLine key={s.i} step={s} scenario={scenario} config={config} />)}</ol>;
}
