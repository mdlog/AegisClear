// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RunSnapshot } from "@aegis/types";
import { ApiError, type ApiClient } from "@/lib/api/client";
import { createFixtureApi } from "@/lib/api/fixtures";
import { renderApp } from "@/test/app";

describe("app shell (LAYOUT_SPEC navigation and root states)", () => {
  it("shows the local chain plate with explorer links disabled", async () => {
    renderApp("/deployment");
    const plate = await screen.findByRole("link", { name: /Local chain/ });
    expect(plate).toHaveTextContent("31337");
    expect(plate).toHaveTextContent("explorer links disabled");
  });

  it("shows Robinhood Chain testnet 46630 on the testnet capture", async () => {
    renderApp("/deployment", { set: "testnet" });
    expect(await screen.findByRole("link", { name: /Robinhood Chain testnet/ })).toHaveTextContent("46630");
  });

  it("marks the current page in the main navigation", async () => {
    renderApp("/channels");
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Channels" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Desk" })).not.toHaveAttribute("aria-current");
  });

  it("blocks with the server-down gate, then renders the requested page once the server answers", async () => {
    const real = createFixtureApi({ set: "testnet" });
    let up = false;
    const api: ApiClient = { ...real, getConfig: () => (up ? real.getConfig() : Promise.reject(new ApiError(0, "server-unreachable", undefined))) };
    renderApp("/deployment", { api });
    expect(await screen.findByRole("heading", { name: "Console server is not running" })).toBeInTheDocument();
    expect(screen.getByText("AEGIS_NETWORK=testnet pnpm --filter @aegisclear/web serve")).toBeInTheDocument();
    up = true;
    await userEvent.click(screen.getByRole("button", { name: "Retry now" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Deployment" })).toBeInTheDocument();
  });

  it("offers the live run from any page while one is running", async () => {
    const real = createFixtureApi();
    const live: RunSnapshot = { id: "mudg1f4b-60a0fd", scenario: "B-dispute", status: "running", startedAt: Date.now() - 72_000, steps: [], channels: [] };
    renderApp("/channels", { api: { ...real, getRuns: async () => [live] } });
    const chip = await screen.findByRole("link", { name: /Live run/ });
    expect(chip).toHaveAttribute("href", "/runs/mudg1f4b-60a0fd");
    expect(chip).toHaveTextContent("Dispute settled by proof");
  });

  it("shows no live-run chip when nothing is running", async () => {
    renderApp("/channels");
    await screen.findByRole("navigation", { name: "Main" });
    await waitFor(() => expect(screen.queryByRole("link", { name: /Live run/ })).not.toBeInTheDocument());
  });

  it("sends /runs to the session runs on the Desk", async () => {
    const { router } = renderApp("/runs");
    await waitFor(() => expect(router.state.location).toMatchObject({ pathname: "/", hash: "#session-runs" }));
  });

  it("recovers a mistyped channel URL with a suggestion", async () => {
    renderApp("/channel/0x1E12393dA190449B9CA32D1f280C4D45fB21C6C4");
    expect(await screen.findByRole("heading", { name: "No page at this address" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "/channels/0x1E12393dA190449B9CA32D1f280C4D45fB21C6C4" })).toBeInTheDocument();
  });

  it("shows the fixture replay badge only in fixture mode", async () => {
    vi.stubEnv("VITE_API_MODE", "fixtures");
    try {
      renderApp("/deployment");
      expect(await screen.findByText("Fixture replay")).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["/", "Desk – AegisClear console"],
    ["/channels", "Channels – AegisClear console"],
    ["/runs/mudg1f4b-60a0fd", "Dispute settled by proof, run mudg1f4b-60a0fd – AegisClear console"],
    ["/channels/0x1E12393dA190449B9CA32D1f280C4D45fB21C6C4", "Channel 0x1E12…C6C4 – AegisClear console"],
  ])("names %s in the browser tab", async (url, title) => {
    renderApp(url);
    await waitFor(() => expect(document.title).toBe(title));
  });

  it("moves focus to the new page's heading after a navigation", async () => {
    renderApp("/deployment");
    const nav = await screen.findByRole("navigation", { name: "Main" });
    await userEvent.click(within(nav).getByRole("link", { name: "Channels" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Channels" })).toHaveFocus());
  });
});

