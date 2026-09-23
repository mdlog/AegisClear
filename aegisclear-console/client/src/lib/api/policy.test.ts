import { describe, expect, it } from "vitest";
import type { ChannelDetail, RunSnapshot } from "@aegis/types";
import { ApiError } from "./client";
import { channelRefetchMs, channelsRefetchMs, runsRefetchMs, shouldRetry } from "./policy";

const detail = (state: ChannelDetail["state"]) => ({ state }) as ChannelDetail;
const run = (status: RunSnapshot["status"]) => ({ status }) as RunSnapshot;

describe("polling policy (API_CONTRACT §10)", () => {
  it("stops refetching a channel once it is settled (terminal)", () => {
    expect(channelRefetchMs(detail("SETTLED"))).toBe(false);
    expect(channelRefetchMs(detail("CLOSING"))).toBe(5_000);
    expect(channelRefetchMs(undefined)).toBe(5_000);
  });

  it("polls the registry faster while a run is live", () => {
    expect(channelsRefetchMs(true)).toBe(2_000);
    expect(channelsRefetchMs(false)).toBe(4_000);
  });

  it("polls the runs list only while a run is live", () => {
    expect(runsRefetchMs([run("done"), run("running")])).toBe(5_000);
    expect(runsRefetchMs([run("done"), run("error")])).toBe(false);
    expect(runsRefetchMs(undefined)).toBe(false);
  });

  it("retries an unreachable server and 5xx answers three times, and never a 4xx answer", () => {
    expect(shouldRetry(0, new ApiError(0, "server-unreachable", undefined))).toBe(true);
    expect(shouldRetry(2, new ApiError(502, "preflight-failed", {}))).toBe(true);
    expect(shouldRetry(3, new ApiError(502, "http-502", ""))).toBe(false);
    expect(shouldRetry(0, new ApiError(404, "unknown channel", {}))).toBe(false);
    expect(shouldRetry(0, new ApiError(409, "busy", {}))).toBe(false);
  });
});
