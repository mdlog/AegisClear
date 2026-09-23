// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFixtureApi } from "@/lib/api/fixtures";
import { renderApp } from "@/test/app";

const HERO = "0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1";
const ROLLOVER = "0xD1F69213799aDbc595ff8Eae6B8C20f917a22b1D";
const OPEN = "0x9AA0C0c281338295505003B6D80017B56e335e69";

async function bodyRows() {
  const table = await screen.findByRole("table", { name: /channels/i });
  return within(table).getAllByRole("row").slice(1);
}
const rowOf = (address: string) => screen.getByRole("row", { name: new RegExp(address) });
const cell = (row: HTMLElement, column: string) => {
  const headers = within(screen.getByRole("table", { name: /channels/i })).getAllByRole("columnheader").map((h) => h.textContent);
  return within(row).getAllByRole("cell")[headers.indexOf(column) - 1]; // the channel column is a row header
};

describe("/channels registry (F3, I3; counts checked by hand with jq)", () => {
  it("lists the 16 testnet channels newest first, each linking to its record", async () => {
    renderApp("/channels", { set: "testnet" });
    const rows = await bodyRows();
    expect(rows).toHaveLength(16);
    expect(within(rows[0]).getByRole("link", { name: "Channel 0x66C493f712648419C11Ab8f21f8C6b0A21ff05dC" })).toHaveAttribute("href", "/channels/0x66C493f712648419C11Ab8f21f8C6b0A21ff05dC");
    expect(screen.getByText("16 channels")).toBeInTheDocument();
  });

  it("reads epoch 1 and seq 5 on the rollover row (runbook step 9)", async () => {
    renderApp("/channels", { set: "testnet" });
    await bodyRows();
    const row = rowOf(ROLLOVER);
    expect(cell(row, "Seq")).toHaveTextContent("5");
    expect(cell(row, "Epoch")).toHaveTextContent("1");
    expect(cell(row, "State")).toHaveTextContent("Settled");
  });

  it("shows the proven refund on the hero row", async () => {
    renderApp("/channels", { set: "testnet" });
    await bodyRows();
    expect(cell(rowOf(HERO), "Proof")).toHaveTextContent("0.07");
  });

  it("defers settled money to the record, and shows A only while a channel is open", async () => {
    renderApp("/channels", { set: "testnet" });
    await bodyRows();
    expect(within(cell(rowOf(HERO), "A")).getByRole("link", { name: /split in the record/i })).toHaveAttribute("href", `/channels/${HERO}#settlement`);
    expect(cell(rowOf(OPEN), "A")).toHaveTextContent("0.00");
  });

  it("filters by state from the URL and says how many match", async () => {
    renderApp("/channels?state=OPEN", { set: "testnet" });
    expect(await bodyRows()).toHaveLength(2);
    expect(screen.getByText("2 of 16 channels")).toBeInTheDocument();
  });

  it("writes a filter change into the URL", async () => {
    const { router } = renderApp("/channels", { set: "testnet" });
    await bodyRows();
    await userEvent.click(screen.getByRole("checkbox", { name: /^Open/ }));
    await waitFor(() => expect(router.state.location.search).toBe("?state=OPEN"));
    expect(await bodyRows()).toHaveLength(2);
  });

  it("tells a filter with no match apart from an empty registry, and clears it", async () => {
    const { router } = renderApp("/channels?session=1", { set: "testnet" });
    expect(await screen.findByText("No channels match these filters")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(await bodyRows()).toHaveLength(16);
  });

  it("paginates the 129 local channels at 50 per page", async () => {
    renderApp("/channels");
    expect(await bodyRows()).toHaveLength(50);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("serves the last page from the URL", async () => {
    renderApp("/channels?page=3");
    expect(await bodyRows()).toHaveLength(29);
  });

  it("tags channels created by a run in this server session", async () => {
    renderApp("/channels");
    await bodyRows();
    expect(within(rowOf("0xa7DfeabF6536a89FCC10221F5ADc4e1759ff57eC")).getByRole("link", { name: /mudg39dg-1815b0/ })).toHaveAttribute("href", "/runs/mudg39dg-1815b0");
  });

  it("flags an open channel of a demo client, because it blocks that client's next run", async () => {
    const real = createFixtureApi({ set: "testnet" });
    const api = {
      ...real,
      getChannels: async () => {
        const list = await real.getChannels();
        return { ...list, channels: list.channels.map((c) => (c.channel === OPEN ? { ...c, client: "0x4AD7A1FBB8330e834cf0a6Aa63ae576A13f827A4" as const } : c)) };
      },
    };
    renderApp("/channels", { api });
    await bodyRows();
    expect(rowOf(OPEN)).toHaveTextContent("Blocks new runs for client B");
  });

  it("invites a first run when the deployment has no channels at all", async () => {
    const real = createFixtureApi({ set: "testnet" });
    renderApp("/channels", { api: { ...real, getChannels: async () => ({ scannedAt: Date.now(), channels: [] }) } });
    expect(await screen.findByText("No channels yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run a scenario" })).toHaveAttribute("href", "/");
  });
});
