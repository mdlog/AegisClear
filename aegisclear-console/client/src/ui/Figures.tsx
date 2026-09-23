// Numbers as text (DESIGN_BRIEF §3): Archivo with tabular lining figures, never mono. Amounts show 2 decimals
// and the full 6 in the tooltip; the unit is always named (slot H1: MockUSDG, never a bare USDG).
import { TOKEN } from "@/copy/en";
import { gas, usdg, usdgFull } from "@/lib/format";
import styles from "./Figures.module.css";

export function Amount({ base, unit = true, tone }: { base: string | bigint; unit?: boolean; tone?: "proof" | "engrave" }) {
  return (
    <span className={[styles.amount, tone ? styles[tone] : ""].join(" ")} title={`${usdgFull(base)} ${TOKEN}`}>
      {usdg(base)}
      {unit && <span className={styles.unit} data-unit=""> {TOKEN}</span>}
    </span>
  );
}

export function Gas({ value }: { value: string | number | bigint }) {
  return <span className={styles.gas}>{gas(value)}<span className={styles.unit}> gas</span></span>;
}
