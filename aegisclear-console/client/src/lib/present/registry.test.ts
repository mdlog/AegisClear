import { describe, expect, it } from "vitest";
import type { ChannelSummary, ConfigResponse } from "@aegis/types";
import { clientLabel, filterChannels, filtersToSearch, parseRegistryFilters, type RegistryFilters } from "./registry";

const cfgFile = import.meta.glob("@fixtures/testnet-46630/config.json", { eager: true, import: "default" }) as Record<string, { body: ConfigResponse }>;
const config = Object.values(cfgFile)[0].body;
const listFile = import.meta.glob("@fixtures/testnet-46630/channels.json", { eager: true, import: "default" }) as Record<string, { body: { channels: ChannelSummary[] } }>;
const list = Object.values(listFile)[0].body.channels; // 16 real testnet channels

describe("filterChannels on the 16 testnet channels (counts checked by hand with jq)", () => {
  it.each<[RegistryFilters, number]>([
    [{}, 16],
    [{ state: ["OPEN"] }, 2],
    [{ mode: "anchored" }, 6],
    [{ factory: "factoryAnchored" }, 6],
    [{ client: "A" }, 3],
    [{ client: "B" }, 4],
    [{ client: "other" }, 9],
    [{ session: true }, 0],
    [{ state: ["SETTLED"], mode: "anchored" }, 6],
    [{ state: ["OPEN", "CLOSING"] }, 2],
  ])("%j → %i", (filters, want) => {
    expect(filterChannels(list, filters, config)).toHaveLength(want);
  });

  it("keeps the server order (newest first)", () => {
    expect(filterChannels(list, {}, config).map((c) => c.channel)).toEqual(list.map((c) => c.channel));
  });
});

describe("clientLabel", () => {
  it("recognises demo clients in any letter case", () => {
    expect(clientLabel("0xd4b72f6e5111ade077b2f15f00a4f7954d8e9402", config)).toBe("A");
    expect(clientLabel("0x4AD7A1FBB8330e834cf0a6Aa63ae576A13f827A4", config)).toBe("B");
  });
  it("returns undefined for other addresses", () => {
    expect(clientLabel("0x3bE5635f7f90212fC3f640e279E3d7cb04c5fC29", config)).toBeUndefined();
  });
});

describe("registry filters live in the URL", () => {
  it("parses every supported parameter", () => {
    expect(parseRegistryFilters("?state=OPEN,CLOSING&mode=anchored&factory=factoryProd&client=B&session=1&page=2")).toEqual({
      state: ["OPEN", "CLOSING"], mode: "anchored", factory: "factoryProd", client: "B", session: true, page: 2,
    });
  });
  it("ignores unknown or malformed values", () => {
    expect(parseRegistryFilters("?state=NOPE&mode=weird&client=Z&page=-3&session=yes")).toEqual({});
  });
  it("round-trips through the query string", () => {
    const f = { state: ["SETTLED"] as ("SETTLED")[], mode: "co-signed" as const, client: "A" as const, page: 3 };
    expect(parseRegistryFilters(filtersToSearch(f))).toEqual(f);
  });
});
