// Starting a scenario: one mutation per page, so every Run button shares the pending state and the error line.
// On 202 the operator lands on the run's tape (LAYOUT_SPEC key interactions).
import { useNavigate } from "react-router";
import type { ScenarioId } from "@aegis/types";
import { useRuns, useStartRun } from "@/lib/api/queries";

export function useLaunch() {
  const navigate = useNavigate();
  const { data: runs } = useRuns();
  const start = useStartRun();
  const live = runs?.find((r) => r.status === "running");
  return {
    live,
    runs,
    pending: start.isPending,
    error: start.error,
    scenario: start.variables,
    /** Every Run action is disabled while any run is live: one run at a time, server-wide. */
    disabled: Boolean(live) || start.isPending,
    run: (scenario: ScenarioId) => start.mutate(scenario, { onSuccess: ({ runId }) => navigate(`/runs/${runId}`) }),
  };
}

export type Launch = ReturnType<typeof useLaunch>;
