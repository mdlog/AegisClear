import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "./client";

describe("createApi (VITE_API_MODE, README §2.2 #10)", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("talks to the console server by default", async () => {
    vi.stubGlobal("fetch", async (url: string) => new Response(JSON.stringify({ asked: url }), { status: 200 }));
    expect(await createApi().getConfig()).toEqual({ asked: "/api/config" });
  });

  it("replays the local recordings in fixture mode", async () => {
    vi.stubEnv("VITE_API_MODE", "fixtures");
    expect(await createApi().getConfig()).toMatchObject({ network: "local", chainId: 31337 });
  });

  it("replays the testnet capture when VITE_FIXTURE_SET=testnet", async () => {
    vi.stubEnv("VITE_API_MODE", "fixtures");
    vi.stubEnv("VITE_FIXTURE_SET", "testnet");
    expect(await createApi().getConfig()).toMatchObject({ network: "testnet", chainId: 46630 });
  });

  it("streams a recorded run through the lazily loaded fixture client", async () => {
    vi.stubEnv("VITE_API_MODE", "fixtures");
    const types = await new Promise<string[]>((resolve) => {
      const seen: string[] = [];
      createApi().subscribeRun("mudg364o-57d0c1", (e) => { seen.push(e.type); if (e.type === "done") resolve(seen); });
    });
    expect(types).toEqual([...Array(6).fill("step"), "done"]); // A-complete: 6 steps
  });
});
