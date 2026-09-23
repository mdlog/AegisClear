// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderApp } from "@/test/app";

const EXPLORER = "https://explorer.testnet.chain.robinhood.com";
/** Contract rows carry a full address; the group header rows ("Channel factories") do not. */
const addressRows = (region: HTMLElement) => within(region).getAllByRole("row").filter((r) => /0x[0-9a-fA-F]{40}/.test(r.textContent ?? ""));

describe("/deployment (F1, I5)", () => {
  it("states the testnet v2 network with its verified line", async () => {
    renderApp("/deployment", { set: "testnet" });
    const network = await screen.findByRole("region", { name: "Network" });
    expect(network).toHaveTextContent("Robinhood Chain testnet");
    expect(network).toHaveTextContent("46630");
    expect(network).toHaveTextContent("122,028,843");
    expect(network).toHaveTextContent("Deploy v2: 7/7 contracts verified on Blockscout");
  });

  it("lists all 8 contracts with the full address and a Blockscout link", async () => {
    renderApp("/deployment", { set: "testnet" });
    const contracts = await screen.findByRole("region", { name: "Contracts" });
    expect(addressRows(contracts)).toHaveLength(8);
    const verifier = within(contracts).getByRole("row", { name: /Groth16 verifier/ });
    expect(verifier).toHaveTextContent("0x2729cbdCd07719A40DC8d458ba7cDA5e40Afa405");
    expect(within(verifier).getByRole("link", { name: /Blockscout/ })).toHaveAttribute("href", `${EXPLORER}/address/0x2729cbdCd07719A40DC8d458ba7cDA5e40Afa405`);
  });

  it("omits what the local chain does not have: factoryProd, explorer links, the testnet line", async () => {
    renderApp("/deployment");
    const network = await screen.findByRole("region", { name: "Network" });
    expect(network).toHaveTextContent("Local private chain 31337");
    expect(network).not.toHaveTextContent("7/7 contracts verified");
    const contracts = screen.getByRole("region", { name: "Contracts" });
    expect(addressRows(contracts)).toHaveLength(7);
    expect(within(contracts).queryByRole("link", { name: /Blockscout/ })).not.toBeInTheDocument();
  });

  it("names the parties and says the browser holds no keys", async () => {
    renderApp("/deployment", { set: "testnet" });
    const parties = await screen.findByRole("region", { name: "Parties" });
    expect(parties).toHaveTextContent("0x90351bB1E85a17D5f70c62C0cC076D39D897076D");
    expect(parties).toHaveTextContent("0x4AD7A1FBB8330e834cf0a6Aa63ae576A13f827A4");
    expect(parties).toHaveTextContent("The browser holds none and never signs.");
  });

  it("lists the five known limits, including the Stylus keepalive", async () => {
    renderApp("/deployment", { set: "testnet" });
    const limits = await screen.findByRole("region", { name: "Known limits" });
    expect(within(limits).getAllByRole("listitem")).toHaveLength(5);
    expect(limits).toHaveTextContent("keepalive");
  });
});
