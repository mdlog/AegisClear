// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChannelSummary } from "@aegis/types";
import { createFixtureApi } from "@/lib/api/fixtures";
import { renderApp } from "@/test/app";

// fixtures/testnet-46630/offer-{A,B}.json
const PAY_TO_B = "0x506c9e93A11c5Be8e86A9c8A4DEC4dE8297C7B2a";
const PAY_TO_A = "0x7805f1C89D2eC985C8a6B8db89e7b26668271729";

describe("/offer: the x402 402 challenge, annotated (F11)", () => {
  it("defaults to client B and writes it into the URL", async () => {
    const { router } = renderApp("/offer", { set: "testnet" });
    await waitFor(() => expect(router.state.location.search).toBe("?client=B"));
    expect(await screen.findByRole("radio", { name: "Client B" })).toBeChecked();
  });

  it("states the 402 and that it is the current session's offer", async () => {
    renderApp("/offer?client=B", { set: "testnet" });
    expect(await screen.findByRole("heading", { name: "402 Payment Required" })).toBeInTheDocument();
    expect(screen.getByText(/Current session offer/)).toBeInTheDocument();
    expect(screen.getByText("x402-compatible offer: facilitators need no change (untested with Mesh).")).toBeInTheDocument();
  });

  it("annotates what any x402 facilitator sees, payTo first among equals", async () => {
    renderApp("/offer?client=B", { set: "testnet" });
    const facilitator = await screen.findByRole("region", { name: "What any x402 facilitator sees" });
    expect(facilitator).toHaveTextContent("exact");
    expect(facilitator).toHaveTextContent("Robinhood Chain testnet");
    expect(facilitator).toHaveTextContent("MockUSDG");
    expect(facilitator).toHaveTextContent(PAY_TO_B);
    expect(facilitator).toHaveTextContent("No contract exists here until the provider opens it");
    expect(facilitator).toHaveTextContent("Not yet a channel");
    expect(facilitator).toHaveTextContent("5.00");
  });

  it("annotates what only the AegisClear client reads in extra.aegis", async () => {
    renderApp("/offer?client=B", { set: "testnet" });
    const aegis = await screen.findByRole("region", { name: /What only the AegisClear client reads/ });
    expect(aegis).toHaveTextContent("EIP-712 signature over this config");
    expect(aegis).toHaveTextContent("private from the chain, not from the counterparty");
    expect(aegis).toHaveTextContent("seq-0 exit ticket");
    expect(aegis).toHaveTextContent("≤ 800 ms");
  });

  it("switches to client A with the radio group", async () => {
    const { router } = renderApp("/offer?client=B", { set: "testnet" });
    await userEvent.click(await screen.findByRole("radio", { name: "Client A" }));
    await waitFor(() => expect(router.state.location.search).toBe("?client=A"));
    await waitFor(() => expect(screen.getByRole("region", { name: "What any x402 facilitator sees" })).toHaveTextContent(PAY_TO_A));
  });

  it("says when payTo is already a channel from the previous session", async () => {
    const real = createFixtureApi({ set: "testnet" });
    const settled = { channel: PAY_TO_B, state: "SETTLED" } as unknown as ChannelSummary;
    const api = { ...real, getChannels: async () => ({ scannedAt: Date.now(), channels: [settled] }) };
    renderApp("/offer?client=B", { api });
    const facilitator = await screen.findByRole("region", { name: "What any x402 facilitator sees" });
    expect(await within(facilitator).findByText(/This offer belongs to the previous session/)).toBeInTheDocument();
    expect(within(facilitator).getByRole("link", { name: /Open channel/ })).toHaveAttribute("href", `/channels/${PAY_TO_B}`);
  });

  it("keeps the raw 402 JSON one disclosure away", async () => {
    renderApp("/offer?client=B", { set: "testnet" });
    await screen.findByRole("heading", { name: "402 Payment Required" });
    const raw = screen.getByText("Raw 402 response").closest("details")!;
    expect(raw).toHaveTextContent('"x402Version": 1');
  });

  it("refuses a client other than A or B without a request", async () => {
    const api = createFixtureApi({ set: "testnet" });
    const getOffer = vi.spyOn(api, "getOffer");
    renderApp("/offer?client=C", { api });
    expect(await screen.findByText("Client must be A or B")).toBeInTheDocument();
    expect(getOffer).not.toHaveBeenCalled();
  });
});
