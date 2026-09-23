// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { createFixtureApi } from "@/lib/api/fixtures";
import { renderApp } from "@/test/app";

// Real testnet v2 channels, docs/frontend/fixtures/testnet-46630/channels (figures read with jq).
const HERO = "0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1";
const ANCHORED = "0xAD30BC162CCd7cB7680760b4a6181186A28d879c";
const ROLLOVER = "0xD1F69213799aDbc595ff8Eae6B8C20f917a22b1D";
const COOPERATIVE = "0x66C493f712648419C11Ab8f21f8C6b0A21ff05dC";
const OPEN = "0x9AA0C0c281338295505003B6D80017B56e335e69";

const testnet = (address: string) => renderApp(`/channels/${address}`, { set: "testnet" });
const region = (name: string | RegExp) => screen.findByRole("region", { name });

describe("/channels/:address record (F4, I1, I2)", () => {
  it("identifies the hero channel: address, state, mode and factory", async () => {
    testnet(HERO);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Channel record");
    const identity = await region("Identity");
    expect(identity).toHaveTextContent(HERO);
    expect(identity).toHaveTextContent("Settled");
    expect(identity).toHaveTextContent("Co-signed");
    expect(identity).toHaveTextContent("Demo factory with a 60 s challenge window");
    expect(identity).toHaveTextContent("Client B");
  });

  it("draws the co-signed dispute lifecycle in order, with gas", async () => {
    testnet(HERO);
    const rail = await region("Lifecycle");
    const stations = within(rail).getAllByRole("listitem");
    expect(stations.map((s) => s.querySelector("h3")?.textContent)).toEqual([
      "Opened by the provider",
      "Highest co-signed checkpoint submitted",
      "Penalty claimed with a Groth16 proof",
      "Settled",
    ]);
    expect(stations[0]).toHaveTextContent("310,235 gas");
    expect(stations[2]).toHaveTextContent("0.07 back to the client");
  });

  it("reads the split from the Settled event: 1.93 to the provider, 3.07 to the client", async () => {
    testnet(HERO);
    const card = await region("Settlement");
    expect(card).toHaveTextContent("1.93");
    expect(card).toHaveTextContent("3.07");
    expect(card).toHaveTextContent("0.07 proven refund and 3.00 unused deposit");
    expect(card).toHaveTextContent("Decided by a Groth16 proof");
  });

  it("lists every event in the trail with its gas", async () => {
    testnet(HERO);
    const trail = await region("Event trail");
    const rows = within(trail).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent("CheckpointSubmitted");
    expect(rows[1]).toHaveTextContent("114,159");
    expect(rows[2]).toHaveTextContent("payToClient");
  });

  it("groups the 20 anchored acks into one station with their gas range, and shows the anchored caveat", async () => {
    testnet(ANCHORED);
    const rail = await region("Lifecycle");
    expect(within(rail).getByRole("heading", { name: "20 on-chain acks" })).toBeInTheDocument();
    expect(rail).toHaveTextContent("201,020 to 349,751 gas");
    expect(await region("Privacy")).toHaveTextContent("leaf hashes and A per ack are visible on-chain");
    expect(await region("Settlement")).toHaveTextContent("0.38");
  });

  it("sums the rollover: 2.56 at rollover plus 0.10 at close is 2.66 for the provider", async () => {
    testnet(ROLLOVER);
    const card = await region("Settlement");
    const rows = within(card).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Epoch 0");
    expect(rows[0]).toHaveTextContent("2.56");
    expect(rows[0]).toHaveTextContent("2.44");
    expect(rows[1]).toHaveTextContent("Epoch 1");
    expect(rows[1]).toHaveTextContent("0.10");
    expect(rows[1]).toHaveTextContent("2.34");
    expect(card).toHaveTextContent("2.66");
  });

  it("explains a cooperative close whose A reads 0 on-chain", async () => {
    testnet(COOPERATIVE);
    const card = await region("Settlement");
    expect(card).toHaveTextContent("2.00");
    expect(card).toHaveTextContent("3.00");
    expect(card).toHaveTextContent("Decided by two signatures");
    expect(card).toHaveTextContent("A reads 0 on-chain for this channel");
  });

  it("shows an open channel with no on-chain trace yet, and what is in escrow", async () => {
    testnet(OPEN);
    expect(await region("Lifecycle")).toHaveTextContent("Co-signed service leaves no on-chain trace until a checkpoint or close");
    const card = await region("Settlement");
    expect(card).toHaveTextContent("In escrow");
    expect(card).toHaveTextContent("1.00");
  });

  it("shows the demo session terms privately only for a demo client's channel", async () => {
    testnet(HERO);
    const privacy = await region("Privacy");
    expect(privacy).toHaveTextContent("demo session terms, known to both parties");
    expect(privacy).toHaveTextContent("≤ 800 ms");
  });

  it("points to the run for a leak check when the channel came from this session", async () => {
    renderApp("/channels/0x1E12393dA190449B9CA32D1f280C4D45fB21C6C4");
    const identity = await region("Identity");
    expect(within(identity).getByRole("link", { name: /mudg1f4b-60a0fd/ })).toHaveAttribute("href", "/runs/mudg1f4b-60a0fd");
    expect(within(await region("Privacy")).getByRole("link", { name: /leak check/i })).toHaveAttribute("href", "/runs/mudg1f4b-60a0fd?leak=1");
  });

  it("answers an address that is not a channel of this deployment", async () => {
    testnet("0x0000000000000000000000000000000000000001");
    expect(await screen.findByText(/No channel at this address/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse the registry" })).toHaveAttribute("href", "/channels");
  });

  it("recognises a contract of the deployment that is not a channel", async () => {
    testnet("0x2729cbdCd07719A40DC8d458ba7cDA5e40Afa405");
    expect(await screen.findByText(/This is the Groth16 verifier contract, not a channel/)).toBeInTheDocument();
  });

  it("refuses a malformed address without a request", async () => {
    const api = createFixtureApi({ set: "testnet" });
    const getChannel = vi.spyOn(api, "getChannel");
    renderApp("/channels/0x1234", { api });
    expect(await screen.findByText("That is not an address")).toBeInTheDocument();
    expect(getChannel).not.toHaveBeenCalled();
  });
});
