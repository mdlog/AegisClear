import type { Network, ScenarioId } from "@aegis/types";
import { scenarioCopy } from "../../copy/en";

export const SCENARIO_IDS: ScenarioId[] = ["B-dispute", "B-anchored-dispute", "B-rollover", "B-cooperative", "A-complete", "A-reject", "all"];

export interface ScenarioInfo {
  id: ScenarioId;
  title: string;
  description: string;
  /** Demo client whose keys fund the run (web/server/demo.ts CLIENT_OF). */
  client: "A" | "B" | "A and B";
  market: "aegisclear" | "control" | "both";
  mode: "co-signed" | "anchored" | "escrow" | "mixed";
  /** Deterministic client / provider split (API_CONTRACT §6); identical on local and testnet. */
  expected: string;
  /** Announced before starting: testnet v2 console runs (README) or the local recordings (fixtures). */
  durationSec: number;
}

const META: Record<ScenarioId, Omit<ScenarioInfo, "id" | "title" | "description" | "durationSec"> & { testnet: number; local: number }> = {
  "B-dispute": { client: "B", market: "aegisclear", mode: "co-signed", expected: "0.07 / 1.93", testnet: 158, local: 7.3 },
  "B-anchored-dispute": { client: "A", market: "aegisclear", mode: "anchored", expected: "0.02 / 0.38", testnet: 140, local: 65.1 },
  "B-rollover": { client: "B", market: "aegisclear", mode: "co-signed", expected: "0.00 / 2.66", testnet: 135, local: 3.3 },
  "B-cooperative": { client: "A", market: "aegisclear", mode: "co-signed", expected: "0.00 / 2.00", testnet: 96, local: 2.4 },
  "A-complete": { client: "A", market: "control", mode: "escrow", expected: "0 / 2.00", testnet: 13, local: 0.15 },
  "A-reject": { client: "B", market: "control", mode: "escrow", expected: "2.00 / 0", testnet: 13, local: 0.12 },
  all: { client: "A and B", market: "both", mode: "mixed", expected: "4 rows", testnet: 280, local: 20.5 },
};

export function scenarioInfo(id: ScenarioId, network: Network): ScenarioInfo {
  const { testnet, local, ...rest } = META[id];
  return { id, ...scenarioCopy[id], ...rest, durationSec: network === "testnet" ? testnet : local };
}
