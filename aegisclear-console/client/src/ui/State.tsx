// State glyphs instead of pills (DESIGN_BRIEF §5): a glyph shape plus a word, no container.
// Colour is never the only signal: open is hollow, closing half-filled, settled filled, uninitialised dotted.
import type { ReactNode } from "react";
import type { ChannelState, RunStatus } from "@aegis/types";
import styles from "./State.module.css";

type Glyph = "hollow" | "half" | "filled" | "dotted" | "cross";
type Tone = "ink" | "ink-2" | "caution" | "engrave" | "danger";

function StateMark({ glyph, tone, word, extra }: { glyph: Glyph; tone: Tone; word: string; extra?: ReactNode }) {
  return (
    <span className={`${styles.state} ${styles[`tone-${tone}`]}`}>
      <i className={`${styles.glyph} ${styles[glyph]}`} aria-hidden="true" />
      {word}
      {extra && <span className={styles.extra}>{extra}</span>}
    </span>
  );
}

const CHANNEL: Record<ChannelState, { glyph: Glyph; tone: Tone; word: string }> = {
  OPEN: { glyph: "hollow", tone: "ink", word: "Open" },
  CLOSING: { glyph: "half", tone: "caution", word: "Closing" },
  SETTLED: { glyph: "filled", tone: "ink-2", word: "Settled" },
  UNINIT: { glyph: "dotted", tone: "ink-2", word: "Uninitialised" },
};

/** `countdown` is shown after the word for CLOSING channels ("Closing 42 s"). */
export function ChannelStateMark({ state, countdown }: { state: ChannelState; countdown?: ReactNode }) {
  const s = CHANNEL[state] ?? { glyph: "dotted" as const, tone: "ink-2" as const, word: state };
  return <StateMark {...s} extra={state === "CLOSING" ? countdown : undefined} />;
}

const RUN: Record<RunStatus, { glyph: Glyph; tone: Tone; word: string }> = {
  running: { glyph: "half", tone: "caution", word: "Live" },
  done: { glyph: "filled", tone: "engrave", word: "Done" },
  error: { glyph: "cross", tone: "danger", word: "Stopped with an error" },
};

export function RunStatusMark({ status, extra }: { status: RunStatus; extra?: ReactNode }) {
  return <StateMark {...RUN[status]} extra={extra} />;
}
