// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RunSnapshot, SseEvent } from "@aegis/types";
import { createFixtureApi } from "@/lib/api/fixtures";
import { renderApp } from "@/test/app";

// Recorded local runs (docs/frontend/fixtures/local-31337/runs); figures read with jq.
const DISPUTE = "mudg1f4b-60a0fd";
const ANCHORED = "mudg1kzg-7066ea";
const ROLLOVER = "mudg2zjn-faee38";
const COMPLETE = "mudg364o-57d0c1";
const ALL = "mudg39dg-1815b0";
const CHANNEL = "0x1E12393dA190449B9CA32D1f280C4D45fB21C6C4";

const slip = () => screen.findByRole("region", { name: "Verdict" });

describe("/runs/:runId in verdict mode (the screenshot state)", () => {
  it("prints the dispute's split: 0.07 back to the client, 1.93 to the provider", async () => {
    renderApp(`/runs/${DISPUTE}`);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Dispute settled by proof");
    const verdict = await slip();
    expect(within(verdict).getByText("0.07", { selector: "[data-figure='client']" })).toBeInTheDocument();
    expect(within(verdict).getByText("1.93", { selector: "[data-figure='provider']" })).toBeInTheDocument();
  });

  it("sets the private terms opposite what the chain shows, row by row", async () => {
    renderApp(`/runs/${DISPUTE}`);
    const verdict = await slip();
    const table = await within(verdict).findByRole("table", { name: /private terms/i });
    const row = (fact: string) => within(table).getByRole("row", { name: new RegExp(`^${fact}`) });
    expect(row("Unit price")).toHaveTextContent("0.02");
    expect(row("Unit price")).toHaveTextContent("Hidden inside the terms commitment T");
    expect(row("Breaching units")).toHaveTextContent("seq 3, 17, 29, 44, 58, 71, 90");
    expect(await within(table).findByText("payToClient 0.07")).toBeInTheDocument();
    expect(row("Units served")).toHaveTextContent("seq 100");
  });

  it("explains 0.07 from the private terms and reconciles the whole deposit from the Settled event", async () => {
    renderApp(`/runs/${DISPUTE}`);
    const verdict = await slip();
    expect(await within(verdict).findByText(/7 breaching units × 50 % of 0.02 = 0.07/)).toBeInTheDocument();
    expect(verdict).toHaveTextContent("Deposit 5.00 = 1.93 to the provider + 3.07 to the client (0.07 proven refund + 3.00 unused)");
  });

  it("names who decided and what it cost: a Groth16 proof, 4.7 s, 545,726 gas", async () => {
    renderApp(`/runs/${DISPUTE}`);
    const verdict = await slip();
    expect(verdict).toHaveTextContent("A Groth16 proof");
    expect(verdict).toHaveTextContent("4.7 s");
    expect(verdict).toHaveTextContent("545,726");
  });

  it("runs the leak check from ?leak=1 and prints the three figures", async () => {
    renderApp(`/runs/${DISPUTE}?leak=1`);
    const verdict = await slip();
    const figures = await within(verdict).findByRole("group", { name: "Leak check" });
    expect(within(figures).getByText("Leaks").nextSibling).toHaveTextContent("0");
    expect(figures).toHaveTextContent("Ambiguous");
    expect(figures).toHaveTextContent("Transactions scanned");
    expect(figures).toHaveTextContent("5");
  });

  it("runs the leak check on demand", async () => {
    const api = createFixtureApi({ speed: 10_000 });
    const leakCheck = vi.spyOn(api, "leakCheck");
    renderApp(`/runs/${DISPUTE}`, { api });
    await slip();
    expect(leakCheck).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Check for leaks" }));
    expect(await screen.findByRole("group", { name: "Leak check" })).toHaveTextContent("5");
    expect(leakCheck).toHaveBeenCalledWith(DISPUTE);
  });

  it("keeps the result table and the channel link below the slip", async () => {
    renderApp(`/runs/${DISPUTE}`);
    const results = await screen.findByRole("table", { name: "Result" });
    expect(within(results).getAllByRole("row")[1]).toHaveTextContent("AegisClear: dispute settled by proof");
    expect(screen.getAllByRole("link", { name: /Open channel record/ })[0]).toHaveAttribute("href", `/channels/${CHANNEL}`);
  });

  it("writes the recovery link into the address bar", async () => {
    const { router } = renderApp(`/runs/${DISPUTE}`);
    await waitFor(() => expect(router.state.location.search).toBe(`?ch=${CHANNEL}`));
  });

  it("prints the anchored split with its caveat, and the 20 acks with gas in the evidence", async () => {
    renderApp(`/runs/${ANCHORED}`);
    const verdict = await slip();
    expect(within(verdict).getByText("0.02", { selector: "[data-figure='client']" })).toBeInTheDocument();
    expect(within(verdict).getByText("0.38", { selector: "[data-figure='provider']" })).toBeInTheDocument();
    await waitFor(() => expect(verdict).toHaveTextContent("Implied on-chain by A per ack; excluded from the scan."));
    expect(screen.getAllByRole("listitem", { name: /^Ack \d+/ })).toHaveLength(20);
  });

  it("decides the rollover by signatures and shows both epochs", async () => {
    renderApp(`/runs/${ROLLOVER}`);
    const verdict = await slip();
    expect(within(verdict).getByText("2.66", { selector: "[data-figure='provider']" })).toBeInTheDocument();
    expect(verdict).toHaveTextContent("Two signatures, twice (rollover and close)");
    await waitFor(() => expect(verdict).toHaveTextContent("Epoch 0: seq 3, 17, 29, 44, 58, 71, 90. Epoch 1: seq 3"));
  });

  it("gives Market A the calldata panel instead of a slip, and no leak check", async () => {
    renderApp(`/runs/${COMPLETE}`);
    expect(await screen.findByRole("heading", { name: "Market A put the terms in plain calldata" })).toBeInTheDocument();
    expect(screen.getByText("100 units @ 0.02 USDG; maxLatency 800ms; minQuality 90; penalty 50%; cap 30%")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check for leaks" })).not.toBeInTheDocument();
  });

  it("lays out the comparison run's four rows, grouped, with the dispute channel first", async () => {
    renderApp(`/runs/${ALL}`);
    const results = await screen.findByRole("table", { name: "Result" });
    expect(within(results).getAllByRole("row").filter((r) => within(r).queryAllByRole("cell").length)).toHaveLength(4);
    const tabs = await screen.findByRole("tablist", { name: "Channels of this run" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Dispute settled by proof", "Cooperative close"]);
  });
});

describe("/runs/:runId in live mode", () => {
  it("streams a run live, then turns into its verdict when the run ends", async () => {
    const api = createFixtureApi({ speed: 5 }); // the 7.3 s recorded dispute in about 1.5 s
    const { runId } = await api.startRun("B-dispute");
    renderApp(`/runs/${runId}`, { api });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Dispute settled by proof");
    expect(await screen.findByText(/On-chain transactions during service/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Lifecycle" })).toHaveTextContent("Serve");
    expect(await screen.findByRole("region", { name: "Verdict" }, { timeout: 6_000 })).toBeInTheDocument();
  }, 10_000);

  it("marks a dropped stream and keeps the tape", async () => {
    const real = createFixtureApi();
    const run = await real.getRun(DISPUTE);
    const live: RunSnapshot = { ...run, status: "running", result: undefined, endedAt: undefined, steps: run.steps.slice(0, 8) };
    const api = { ...real, getRun: async () => live, subscribeRun: (_id: string, _on: unknown, onTransportError?: () => void) => { setTimeout(() => onTransportError?.(), 0); return () => {}; } };
    renderApp(`/runs/${DISPUTE}`, { api });
    expect(await screen.findByText(/Reconnecting/)).toBeInTheDocument();
    expect(screen.getByText(/On-chain transactions during service/)).toBeInTheDocument();
  });
});

describe("/runs/:runId follows the live tape (LAYOUT_SPEC follow-live behaviour)", () => {
  async function liveRun() {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const real = createFixtureApi();
    const run = await real.getRun(DISPUTE);
    const live: RunSnapshot = { ...run, status: "running", result: undefined, endedAt: undefined, steps: run.steps.slice(0, 8) };
    let push: (e: SseEvent) => void = () => {};
    const api = { ...real, getRun: async () => live, subscribeRun: (_id: string, onEvent: (e: SseEvent) => void) => { push = onEvent; return () => {}; } };
    renderApp(`/runs/${DISPUTE}`, { api });
    await screen.findByText(/On-chain transactions during service/);
    return { scroll, push: (i: number) => act(() => push({ type: "step", data: run.steps[i] })) };
  }

  it("keeps the act being played in view as steps arrive", async () => {
    const { scroll, push } = await liveRun();
    scroll.mockClear();
    push(8);
    await waitFor(() => expect(scroll).toHaveBeenCalled());
  });

  it("stops following when the operator scrolls up, and offers Jump to live", async () => {
    const { scroll, push } = await liveRun();
    expect(screen.queryByRole("button", { name: "Jump to live" })).not.toBeInTheDocument();
    fireEvent.wheel(window, { deltaY: -120 });
    const jump = await screen.findByRole("button", { name: "Jump to live" });
    scroll.mockClear();
    push(8);
    await new Promise((r) => setTimeout(r, 50));
    expect(scroll).not.toHaveBeenCalled();
    await userEvent.click(jump);
    expect(scroll).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Jump to live" })).not.toBeInTheDocument();
  });
});

describe("/runs/:runId when it cannot be shown", () => {
  it("keeps the partial tape and quotes the server when the run stopped with an error", async () => {
    const real = createFixtureApi();
    const run = await real.getRun(DISPUTE);
    const failed: RunSnapshot = { ...run, status: "error", result: undefined, error: "mint ke klien gagal: nonce too low", steps: run.steps.slice(0, 16) };
    renderApp(`/runs/${DISPUTE}`, { api: { ...real, getRun: async () => failed } });
    expect(await screen.findByRole("heading", { name: "The run stopped with an error" })).toBeInTheDocument();
    expect(screen.getByText("mint ke klien gagal: nonce too low")).toBeInTheDocument();
    expect(screen.getByText(/On-chain transactions during service/)).toBeInTheDocument();
  });

  it("explains a run the server no longer holds, and points to its permanent channel", async () => {
    renderApp(`/runs/abcdef12-123456?ch=${CHANNEL}`);
    expect(await screen.findByRole("heading", { name: "This run is no longer in the console's memory" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the channel's settlement" })).toHaveAttribute("href", `/channels/${CHANNEL}#settlement`);
    expect(screen.getByRole("link", { name: "Start a new run" })).toHaveAttribute("href", "/");
  });

  it("refuses a malformed run id without a request", async () => {
    const api = createFixtureApi();
    const getRun = vi.spyOn(api, "getRun");
    renderApp("/runs/not-a-run", { api });
    expect(await screen.findByRole("heading", { name: "That is not a run id" })).toBeInTheDocument();
    expect(getRun).not.toHaveBeenCalled();
  });
});
