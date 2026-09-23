// To-scale bars (DESIGN_BRIEF §4–§5): the provider share in engrave, the client share moved by a proof in proof ink,
// and Market A's all-or-nothing outcome as an ink-2 hatch (an SVG pattern, never a CSS gradient). Segments never
// touch: a 2 px sheet gap separates them. The text beside a bar always carries its figures.
import { useId } from "react";
import styles from "./Bars.module.css";

const pct = (part: bigint, whole: bigint) => (whole > 0n ? Number((part * 1_000_000n) / whole) / 10_000 : 0);

export function SplitBar({ client, provider, height = 8, label }: { client: bigint; provider: bigint; height?: number; label?: string }) {
  const whole = client + provider;
  return (
    <span className={styles.bar} style={{ height }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {provider > 0n && <span className={styles.provider} style={{ width: `${pct(provider, whole)}%` }} />}
      {client > 0n && <span className={styles.client} style={{ width: `${pct(client, whole)}%` }} />}
    </span>
  );
}

/** Market A's outcome: the whole amount goes one way or the other, decided by an evaluator address. */
export function HatchBar({ height = 8, label }: { height?: number; label?: string }) {
  const id = useId();
  return (
    <span className={`${styles.bar} ${styles.hatchFrame}`} style={{ height }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg className={styles.hatch} width="100%" height="100%" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </span>
  );
}
