// A run's tape as React state: the loader's snapshot, then SSE, with getRun polling while the stream is down.
import { useEffect, useMemo, useReducer } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RunSnapshot } from "@aegis/types";
import { queryKeys, useApi } from "./queries";
import { connectRunStream, initialRunStream, runStreamReducer, type RunStreamAction, type RunStreamState } from "./runStream";

/** Steps that land in one burst (same flush of the stream) render in one update (LAYOUT_SPEC follow-live). */
function frameBatched(dispatch: (a: RunStreamAction) => void): (a: RunStreamAction) => void {
  let queue: RunStreamAction[] = [];
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const actions = queue;
    queue = [];
    actions.forEach(dispatch);
  };
  return (action) => {
    queue.push(action);
    if (scheduled) return;
    scheduled = true;
    // A hidden tab gets no animation frames, so flush at once there.
    if (document.hidden || typeof requestAnimationFrame !== "function") queueMicrotask(flush);
    else requestAnimationFrame(flush);
  };
}

/** `initial` is the route loader's getRun snapshot. Render the consumer with `key={runId}` so another run starts clean. */
export function useRunStream(initial: RunSnapshot): RunStreamState {
  const api = useApi();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(runStreamReducer, initial, initialRunStream);
  const batched = useMemo(() => frameBatched(dispatch), []);
  const streams = initial.status === "running";

  useEffect(() => (streams ? connectRunStream(api, initial.id, batched) : undefined), [api, initial.id, streams, batched]);

  // The run just ended: its channels settled and the runs list changed (API_CONTRACT §10).
  const ended = streams && state.status !== "running";
  useEffect(() => {
    if (!ended) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.runs });
    void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
  }, [ended, queryClient]);

  return state;
}
