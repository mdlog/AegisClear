import { describe, expect, it } from "vitest";
import { offerAnatomy } from "./offer";

// Real /api/offer responses: { status, body } where body is the provider's x402 402 challenge.
const files = import.meta.glob("@fixtures/*/offer-B.json", { eager: true, import: "default" }) as Record<string, { body: { status: number; body: unknown } }>;
const offer = (set: string) => Object.entries(files).find(([p]) => p.includes(`/${set}/`))![1].body.body;

describe("offerAnatomy", () => {
  it("reads the testnet challenge: network, token, predicted payTo and the 5.00 deposit", () => {
    expect(offerAnatomy(offer("testnet-46630"))).toMatchObject({
      network: "eip155:46630",
      chainId: 46630,
      asset: "0x5A9BC1441DE45D7a722339Bec093637bc5042382",
      payTo: "0x506c9e93A11c5Be8e86A9c8A4DEC4dE8297C7B2a",
      deposit: 5_000_000n,
      anchored: false,
      terms: { unitPrice: "20000", maxM1: "800", minM2: "90", penaltyBps: "5000", capBps: "3000" },
    });
  });

  it("reads the local chain id", () => {
    expect(offerAnatomy(offer("local-31337"))?.chainId).toBe(31337);
  });

  it.each([
    ["null", null],
    ["a string", "not json"],
    ["no accepts", { x402Version: 1, accepts: [] }],
    ["an accepts entry without payTo", { x402Version: 1, accepts: [{ scheme: "exact", network: "eip155:46630" }] }],
  ])("returns null for %s", (_name, body) => {
    expect(offerAnatomy(body)).toBeNull();
  });
});
