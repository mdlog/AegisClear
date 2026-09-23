// The raw step log (F6 parity), one disclosure away: elapsed mm:ss.s, phase, the adapted label, detail, transaction
// and gas, progress. Rows are memoised by `i`, so a new step renders one row, not the whole log.
import { memo } from "react";
import type { ConfigResponse, RunSnapshot, ScenarioId, Step } from "@aegis/types";
import { runCopy as copy } from "@/copy/en";
import { elapsed, gas } from "@/lib/format";
import { presentStep } from "@/lib/present/labels";
import { Hex } from "@/ui/Hex";
import styles from "./run.module.css";

export function StepLog({ run, config }: { run: RunSnapshot; config: ConfigResponse }) {
  if (!run.steps.length) return null;
  const c = copy.logCols;
  return (
    <details className={`sheet ${styles.log}`}>
      <summary>{copy.log(run.steps.length)}</summary>
      <div className={styles.logWrap}>
        <table className={styles.logTable}>
          <caption className="sr-only">{copy.log(run.steps.length)}</caption>
          <thead><tr><th scope="col" className={styles.num}>{c.t}</th><th scope="col">{c.phase}</th><th scope="col">{c.step}</th><th scope="col">{c.tx}</th><th scope="col" className={styles.num}>{c.gas}</th></tr></thead>
          <tbody>{run.steps.map((s) => <Row key={s.i} step={s} scenario={run.scenario} explorerBase={config.explorerBase} />)}</tbody>
        </table>
      </div>
    </details>
  );
}

const Row = memo(function Row({ step, scenario, explorerBase }: { step: Step; scenario: ScenarioId; explorerBase?: string | null }) {
  const p = presentStep(step, { scenario });
  return (
    <tr className={p.kind === "proof" ? styles.proofRow : undefined}>
      <td className={styles.num}>{elapsed(step.t)}</td>
      <td className="meta">{step.phase}</td>
      <td>
        {p.title}
        {p.meta && <span className={styles.stepMeta}>{p.meta}</span>}
        {step.progress && <span className={styles.stepMeta}>{step.progress.done}/{step.progress.total}</span>}
      </td>
      <td>{step.txHash && <Hex value={step.txHash} kind="tx" label={`${p.title} transaction`} explorerBase={explorerBase} />}</td>
      <td className={styles.num}>{step.gasUsed ? gas(step.gasUsed) : ""}</td>
    </tr>
  );
});
