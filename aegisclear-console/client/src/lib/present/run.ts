// Run tape structure (LAYOUT_SPEC /runs/:runId, API_CONTRACT §5.4): legs split on "▶" markers, acts by phase,
// and a resolution block in logical order whatever order the steps arrived in.
import type { RunSnapshot, RunStatus, ScenarioId, Step } from "@aegis/types";

export type ActKind = "fund" | "service" | "resolution" | "close" | "escrow" | "other";
export type StationKind = "opened" | "state" | "proof" | "claim" | "window" | "settled" | "other";
export interface Station { kind: StationKind; steps: Step[] }
export interface Act { kind: ActKind; steps: Step[]; stations?: Station[] }
export interface Leg { scenario?: ScenarioId; client?: "A" | "B"; marker?: Step; acts: Act[] }

const MARKER = /^▶ (?<scenario>[\w-]+) — klien (?<client>[AB]) /;
const ACT_OF: Record<string, ActKind> = {
  fund: "fund", open: "fund", serve: "service", ack: "service",
  dispute: "resolution", prove: "resolution", wait: "resolution", settle: "resolution",
  close: "close", escrow: "escrow",
};
const STATION_ORDER: StationKind[] = ["opened", "state", "proof", "claim", "window", "settled", "other"];

function stationOf(s: Step): StationKind {
  if (s.txHash && (s.label === "submitCheckpoint" || s.label === "startClose")) return "state";
  if (s.txHash && s.label === "claimPenalty") return "claim";
  if (s.phase === "dispute" && !s.txHash) return "opened";
  if (s.phase === "prove") return "proof";
  if (s.phase === "wait") return "window";
  if (s.phase === "settle") return "settled";
  return "other";
}

function withStations(act: Act): Act {
  if (act.kind !== "resolution") return act;
  const stations = STATION_ORDER.map((kind) => ({ kind, steps: act.steps.filter((s) => stationOf(s) === kind) })).filter((st) => st.steps.length);
  return { ...act, stations };
}

export function groupRun(run: RunSnapshot): { legs: Leg[] } {
  const legs: Leg[] = [];
  let pending: Step[] = []; // e.g. a faucet mint, emitted before its leg's marker
  const push = (leg: Leg, s: Step) => {
    const kind = ACT_OF[s.phase] ?? "other";
    const last = leg.acts.at(-1);
    if (last && last.kind === kind) last.steps.push(s);
    else leg.acts.push({ kind, steps: [s] });
  };
  for (const s of [...run.steps].sort((a, b) => a.i - b.i)) {
    const m = MARKER.exec(s.label);
    if (m?.groups) {
      const leg: Leg = { scenario: m.groups.scenario as ScenarioId, client: m.groups.client as "A" | "B", marker: s, acts: [] };
      legs.push(leg);
      pending.forEach((p) => push(leg, p));
      pending = [];
    } else if (!legs.length && s.label.startsWith("faucet:")) {
      pending.push(s);
    } else {
      if (!legs.length) legs.push({ scenario: run.scenario === "all" ? undefined : run.scenario, acts: [] });
      push(legs.at(-1)!, s);
    }
  }
  if (pending.length) {
    if (!legs.length) legs.push({ scenario: run.scenario === "all" ? undefined : run.scenario, acts: [] });
    pending.forEach((p) => push(legs.at(-1)!, p));
  }
  return { legs: legs.map((l) => ({ ...l, acts: l.acts.map(withStations) })) };
}

/** Local countdown between the testnet's 10-second wait steps; null when there is nothing to count. */
export function waitClock(lastWait: { step: Step; receivedAt: number } | undefined, now: number): { left: number; total: number; overdue: boolean } | null {
  const p = lastWait?.step.progress;
  if (!lastWait || !p) return null;
  const left = Math.max(0, p.total - p.done - Math.floor((now - lastWait.receivedAt) / 1000));
  return { left, total: p.total, overdue: left === 0 };
}

// ── The lifecycle rail (LAYOUT_SPEC "Lifecycle rail, per scenario") ──────────────────────────────────────────────
export type RailKey = "fund" | "open" | "serve" | "serve0" | "rollover" | "serve1" | "resolve" | "settle" | "close"
  | "approve" | "createJob" | "fundEscrow" | "submit" | "evaluate" | "other";
export type RailState = "pending" | "current" | "done" | "stopped";
export interface RailStation { key: RailKey; steps: Step[]; state: RailState; txCount: number; gas: bigint; units?: number }

type RailKind = "dispute" | "cooperative" | "rollover" | "escrow";
const RAIL: Record<RailKind, RailKey[]> = {
  dispute: ["fund", "open", "serve", "resolve", "settle"],
  cooperative: ["fund", "open", "serve", "close"],
  rollover: ["fund", "serve0", "rollover", "serve1", "close"], // the rollover stream has no open step (API_CONTRACT §5.4.2)
  escrow: ["approve", "createJob", "fundEscrow", "submit", "evaluate"],
};
const ESCROW_TX: Record<string, RailKey> = {
  approve: "approve", "createJob (syarat di calldata)": "createJob", fund: "fundEscrow", "submit (provider)": "submit",
  "complete (evaluator = klien)": "evaluate", "reject (evaluator = klien)": "evaluate",
};
const MAX_SEQ = 128;

const railKind = (scenario: ScenarioId): RailKind =>
  scenario === "B-rollover" ? "rollover" : scenario === "B-cooperative" ? "cooperative" : scenario.startsWith("A-") ? "escrow" : "dispute";

/** One leg's stations, each with its client transactions and gas; units come from `progress`, never from label text. */
export function railOf(scenario: ScenarioId, steps: Step[], status: RunStatus): RailStation[] {
  const kind = railKind(scenario);
  const keys: RailKey[] = [...RAIL[kind], "other"];
  const buckets = new Map<RailKey, Step[]>(keys.map((k) => [k, []]));
  let rolled = false;
  for (const s of [...steps].sort((a, b) => a.i - b.i)) {
    let key: RailKey = "other";
    if (kind === "escrow") key = s.txHash ? ESCROW_TX[s.label] ?? "other" : "approve";
    else if (s.phase === "fund") key = "fund";
    else if (s.phase === "open") key = "open";
    else if (kind === "rollover" && s.phase === "serve") key = rolled ? "serve1" : "serve0";
    else if (s.phase === "serve" || s.phase === "ack") key = "serve";
    else if (kind === "rollover" && s.phase === "close") key = s.label === "closeCooperative" ? "close" : "rollover";
    else if (s.phase === "close") key = "close";
    else if (s.phase === "dispute" || s.phase === "prove" || s.phase === "wait") key = "resolve";
    else if (s.phase === "settle") key = "settle";
    if (!buckets.has(key)) key = "other";
    buckets.get(key)!.push(s);
    if (kind === "rollover" && s.txHash && s.label === "rollover") rolled = true;
  }
  const present = keys.filter((k) => k !== "other" || buckets.get("other")!.length);
  const last = present.reduce((at, k, idx) => (buckets.get(k)!.length ? idx : at), -1);
  return present.map((key, idx) => {
    const own = buckets.get(key)!;
    const state: RailState =
      status === "done" ? "done"
      : idx < last ? "done"
      : idx === Math.max(last, 0) ? (status === "error" ? "stopped" : "current")
      : "pending";
    return { key, steps: own, state, txCount: own.filter((s) => s.txHash).length, gas: own.reduce((g, s) => g + BigInt(s.gasUsed ?? 0), 0n), units: unitsOf(key, own) };
  });
}

function unitsOf(key: RailKey, steps: Step[]): number | undefined {
  if (key !== "serve" && key !== "serve0" && key !== "serve1") return undefined;
  const done = Math.max(0, ...steps.map((s) => s.progress?.done ?? 0));
  if (key === "serve0") return Math.min(done, MAX_SEQ);
  if (key === "serve1") return Math.max(0, done - MAX_SEQ);
  // Anchored runs report progress only at 10 and 20; the ack transactions count every unit in between.
  return Math.max(done, steps.filter((s) => s.txHash && s.label === "ack").length);
}

