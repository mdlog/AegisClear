// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RunSnapshot } from "@aegis/types";
import { ApiError } from "@/lib/api/client";
import { createFixtureApi } from "@/lib/api/fixtures";
import { renderApp } from "@/test/app";

const rails = () => screen.findByRole("table", { name: /Same job on three rails/ });
const failingStart = (error: ApiError) => ({ ...createFixtureApi({ set: "testnet" }), startRun: () => Promise.reject(error) });

describe("/ Desk (F3, F5, F7; LAYOUT_SPEC three-rail scoreboard)", () => {
  it("opens on the problem, with its market evidence", async () => {
    renderApp("/", { set: "testnet" });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("pay first, receive later, no recourse");
    expect(screen.getByText("1,030")).toBeInTheDocument();
    expect(screen.getByText("15,718")).toBeInTheDocument();
  });

  it("sets the same job on three rails", async () => {
    renderApp("/", { set: "testnet" });
    const rows = within(await rails()).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["x402 exact (today)", "ERC-8183-style binary escrow", "AegisClear"]);
    expect(rows[0]).toHaveTextContent("Nothing: 2.00 is gone");
    expect(rows[1]).toHaveTextContent("0 or 2.00");
    expect(rows[2]).toHaveTextContent("0.07 back, 1.93 to the provider");
  });

  it("labels the AegisClear row a worked example, with Prove it live, until a dispute runs", async () => {
    renderApp("/", { set: "testnet" });
    const table = await rails();
    expect(table).toHaveTextContent("Worked example (spec §6.5)");
    expect(within(table).getByRole("button", { name: "Prove it live" })).toBeEnabled();
  });

  it("binds the AegisClear row to the latest finished dispute run", async () => {
    renderApp("/");
    const table = await rails();
    await waitFor(() => expect(table).toHaveTextContent("3.2 s"));
    const aegis = within(table).getByRole("row", { name: /^AegisClear/ });
    expect(within(aegis).getByRole("link", { name: /mudg39dg-1815b0/ })).toHaveAttribute("href", "/runs/mudg39dg-1815b0");
  });

  it("counts what is on-chain now and links each count to the filtered registry", async () => {
    renderApp("/", { set: "testnet" });
    expect(await screen.findByRole("link", { name: "14 settled" })).toHaveAttribute("href", "/channels?state=SETTLED");
    expect(screen.getByRole("link", { name: "2 open" })).toHaveAttribute("href", "/channels?state=OPEN");
    expect(screen.getByText(/16 channels/)).toBeInTheDocument();
  });

  it("offers the latest run from this session", async () => {
    renderApp("/");
    const card = await screen.findByRole("region", { name: /Latest run/ });
    expect(card).toHaveTextContent("Run the four comparison rows");
    expect(within(card).getByRole("link", { name: "Open run" })).toHaveAttribute("href", "/runs/mudg39dg-1815b0");
  });

  it("features the dispute: its client, the expected split and the announced wait", async () => {
    renderApp("/", { set: "testnet" });
    const featured = await screen.findByRole("region", { name: "Dispute settled by proof" });
    expect(featured).toHaveTextContent("Client B");
    expect(featured).toHaveTextContent("0.07 / 1.93");
    expect(featured).toHaveTextContent("≈ 2.6 min on testnet, including the 60 s challenge window");
  });

  it("offers the other six scenarios, each with a button that names its action", async () => {
    renderApp("/", { set: "testnet" });
    await screen.findByRole("button", { name: "Run dispute" });
    for (const name of ["Run anchored dispute", "Run rollover", "Run cooperative close", "Run binary complete", "Run binary reject", "Run all four"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
  });

  it("starts a run and opens its tape", async () => {
    const { router } = renderApp("/");
    await userEvent.click(await screen.findByRole("button", { name: "Run dispute" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/runs\/[a-z0-9]+-[0-9a-f]{6}$/));
  });

  it("disables every Run while a run is live, and says why", async () => {
    const live: RunSnapshot = { id: "mudg1f4b-60a0fd", scenario: "B-dispute", status: "running", startedAt: Date.now(), steps: [], channels: [] };
    renderApp("/", { api: { ...createFixtureApi(), getRuns: async () => [live] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Run dispute" })).toBeDisabled());
    expect(screen.getByText("One run at a time, server-wide.")).toBeInTheDocument();
  });

  it("explains a busy server", async () => {
    renderApp("/", { api: failingStart(new ApiError(409, "busy", { error: "busy" })) });
    await userEvent.click(await screen.findByRole("button", { name: "Run dispute" }));
    expect(await screen.findByText("Another run is in progress.")).toBeInTheDocument();
  });

  it("explains a client that still holds an open channel, with a link to it", async () => {
    const channel = "0x9AA0C0c281338295505003B6D80017B56e335e69";
    renderApp("/", { api: failingStart(new ApiError(409, "client-has-open-channel", { error: "client-has-open-channel", channel })) });
    await userEvent.click(await screen.findByRole("button", { name: "Run dispute" }));
    expect(await screen.findByText(/Client B still has an open channel/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open channel" })).toHaveAttribute("href", `/channels/${channel}`);
  });

  it("shows a preflight failure with the server's own message", async () => {
    const message = "provider anchored tidak dikonfigurasi";
    renderApp("/", { api: failingStart(new ApiError(502, "preflight-failed", { error: "preflight-failed", message })) });
    await userEvent.click(await screen.findByRole("button", { name: "Run dispute" }));
    expect(await screen.findByText("The scenario could not start.")).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("lists the session's runs, newest first", async () => {
    renderApp("/");
    const table = await screen.findByRole("table", { name: /Kept in server memory only/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent("Run the four comparison rows");
    expect(within(rows[6]).getByRole("link")).toHaveAttribute("href", "/runs/mudg1f4b-60a0fd");
  });

  it("says so when the session has no runs yet", async () => {
    renderApp("/", { set: "testnet" });
    expect(await screen.findByText("No runs in this server session yet.")).toBeInTheDocument();
  });
});
