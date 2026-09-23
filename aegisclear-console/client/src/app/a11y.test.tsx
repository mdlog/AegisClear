// @vitest-environment jsdom
// README §6.7: axe with 0 serious or critical violations on every route. jsdom has no layout, so colour contrast is
// checked in a real browser instead (both themes); the token pairs are measured in DESIGN_BRIEF §4.
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import axe from "axe-core";
import { renderApp } from "@/test/app";

const ROUTES: [string, string | RegExp][] = [
  ["/", /pay first, receive later/],
  ["/runs/mudg1f4b-60a0fd?leak=1", "Dispute settled by proof"],
  ["/runs/mudg364o-57d0c1", "Binary escrow, complete"],
  ["/runs/mudg39dg-1815b0", "Run the four comparison rows"],
  ["/runs/abcdef12-123456", "This run is no longer in the console's memory"],
  ["/channels", "Channels"],
  ["/channels/0x1E12393dA190449B9CA32D1f280C4D45fB21C6C4", "Channel record"],
  ["/offer?client=B", "x402 offer"],
  ["/deployment", "Deployment"],
  ["/no-such-page", "No page at this address"],
];

describe("accessibility: axe finds no serious or critical violation", () => {
  it.each(ROUTES)("%s", async (url, heading) => {
    renderApp(url);
    await screen.findByRole("heading", { level: 1, name: heading });
    await new Promise((r) => setTimeout(r, 50)); // let the lazy data sections settle
    const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }, 20_000); // axe over the 50-row registry takes seconds in jsdom under a loaded CPU
});
