// A run's live tape (API_CONTRACT §5.2). The server replays every step on each (re)connection, so steps are
// merged by `i`. Only the SSE stream or a polled snapshot ends a run; after done/error nothing changes.
import type { RunSnapshot, RunStatus, SseEvent, Step } from "@aegis/types";
import type { ApiClient } from "./client";

export interface RunStreamState {
  /** The latest snapshot: the loader's, then the server's final one (with `result`) or the last poll. */
  run: RunSnapshot;
  /** Deduped and sorted by `i`. */
  steps: Step[];
  status: RunStatus;
  error?: string;
  /** "reconnecting": the stream dropped and getRun polling stands in until it recovers. */
  transport: "live" | "reconnecting";
}
export type RunStreamAction = SseEvent | { type: "transport-error" } | { type: "snapshot"; data: RunSnapshot };

export function initialRunStream(run: RunSnapshot): RunStreamState {
  return { run, steps: mergeSteps([], run.steps), status: run.status, error: run.error, transport: "live" };
}

export function runStreamReducer(state: RunStreamState, action: RunStreamAction): RunStreamState {
  if (state.status !== "running") return state;
  switch (action.type) {
    case "step": {
      const steps = mergeSteps(state.steps, [action.data]);
      return steps === state.steps && state.transport === "live" ? state : { ...state, steps, transport: "live" };
    }
    case "transport-error":
      return state.transport === "reconnecting" ? state : { ...state, transport: "reconnecting" };
    case "done":
    case "error":
    case "snapshot": {
      const run = action.data;
      return { ...state, run, steps: mergeSteps(state.steps, run.steps), status: run.status, error: run.error };
    }
  }
}

function mergeSteps(have: Step[], incoming: Step[]): Step[] {
  const seen = new Set(have.map((s) => s.i));
  const fresh = incoming.filter((s) => !seen.has(s.i) && seen.add(s.i));
  return fresh.length ? [...have, ...fresh].sort((a, b) => a.i - b.i) : have;
}

/** Subscribes to the run and polls getRun every `pollMs` while the stream is down. Returns the cleanup. */
export function connectRunStream(api: ApiClient, runId: string, dispatch: (action: RunStreamAction) => void, pollMs = 2_000): () => void {
  let poll: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const stopPolling = () => { clearInterval(poll); poll = undefined; };
  const close = api.subscribeRun(
    runId,
    (ev) => { stopPolling(); dispatch(ev); },
    () => {
      dispatch({ type: "transport-error" });
      poll ??= setInterval(() => {
        api.getRun(runId).then((run) => {
          if (stopped) return;
          dispatch({ type: "snapshot", data: run });
          if (run.status !== "running") { stopPolling(); close(); }
        }, () => { /* still down: keep the tape and the reconnecting marker */ });
      }, pollMs);
    },
  );
  return () => { stopped = true; stopPolling(); close(); };
}
