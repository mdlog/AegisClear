import { describe, expect, it } from "vitest";
import type { ScenarioId } from "@aegis/types";
import { scenarioInfo, SCENARIO_IDS } from "./scenarios";

describe("scenarioInfo", () => {
  it("names the demo client that funds each scenario (web/server/demo.ts CLIENT_OF)", () => {
    const clients = Object.fromEntries(SCENARIO_IDS.filter((id) => id !== "all").map((id) => [id, scenarioInfo(id, "testnet").client]));
    expect(clients).toEqual({ "B-cooperative": "A", "B-dispute": "B", "B-anchored-dispute": "A", "B-rollover": "B", "A-complete": "A", "A-reject": "B" });
  });

  it("announces the longer testnet duration than the local one for every scenario", () => {
    for (const id of SCENARIO_IDS) {
      expect(scenarioInfo(id, "testnet").durationSec).toBeGreaterThan(scenarioInfo(id, "local").durationSec);
    }
  });

  it("gives the expected client / provider split for the deterministic scenarios", () => {
    const want: Partial<Record<ScenarioId, string>> = { "B-dispute": "0.07 / 1.93", "B-anchored-dispute": "0.02 / 0.38", "B-rollover": "0.00 / 2.66", "B-cooperative": "0.00 / 2.00", "A-complete": "0 / 2.00", "A-reject": "2.00 / 0" };
    for (const [id, split] of Object.entries(want)) expect(scenarioInfo(id as ScenarioId, "testnet").expected).toBe(split);
  });

  it("marks only the anchored scenario as anchored mode and Market A as the control", () => {
    expect(SCENARIO_IDS.filter((id) => scenarioInfo(id, "testnet").mode === "anchored")).toEqual(["B-anchored-dispute"]);
    expect(SCENARIO_IDS.filter((id) => scenarioInfo(id, "testnet").market === "control")).toEqual(["A-complete", "A-reject"]);
  });
});
