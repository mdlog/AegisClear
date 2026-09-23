// Route loaders (LAYOUT_SPEC routing rules): they return discriminated results for expected API errors and never
// throw for 404, 409 or 502. Live data (polling, SSE) lives in components, not here.
import type { QueryClient } from "@tanstack/react-query";
import { useRouteLoaderData, type LoaderFunctionArgs } from "react-router";
import type { ConfigResponse, RunSnapshot } from "@aegis/types";
import { ApiError, type ApiClient } from "@/lib/api/client";
import { channelQuery, configQuery, runQuery } from "@/lib/api/queries";

export interface AppDeps { api: ApiClient; queryClient: QueryClient }

/** Unreachable server (fetch rejected) or a 5xx: the ServerDown gate (API_CONTRACT §9 row 1). */
export const isServerDown = (e: unknown): e is ApiError => e instanceof ApiError && (e.status === 0 || e.status >= 500);

export type RootData = { kind: "ok"; config: ConfigResponse } | { kind: "server-down"; error: ApiError };

export const rootLoader = ({ api, queryClient }: AppDeps) => async (): Promise<RootData> => {
  try {
    return { kind: "ok", config: await queryClient.ensureQueryData({ ...configQuery(api), retry: false }) };
  } catch (e) {
    if (isServerDown(e)) return { kind: "server-down", error: e };
    throw e;
  }
};

/** The deployment config, static for the server's lifetime. Only rendered under a root that loaded it. */
export function useAppConfig(): ConfigResponse {
  const data = useRouteLoaderData("root") as RootData | undefined;
  if (data?.kind !== "ok") throw new Error("The deployment config is not loaded.");
  return data.config;
}

export const RUN_ID = /^[a-z0-9]+-[0-9a-f]{6}$/;
export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type RunData = { kind: "ok"; run: RunSnapshot } | { kind: "gone" } | { kind: "invalid" } | { kind: "unreachable"; error: ApiError };

export const runLoader = ({ api, queryClient }: AppDeps) => async ({ params }: LoaderFunctionArgs): Promise<RunData> => {
  const id = params.runId ?? "";
  if (!RUN_ID.test(id)) return { kind: "invalid" };
  try {
    return { kind: "ok", run: await queryClient.fetchQuery({ ...runQuery(api, id), retry: false }) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { kind: "gone" };
    if (e instanceof ApiError) return { kind: "unreachable", error: e };
    throw e;
  }
};

export type ChannelData = { kind: "ok"; address: string } | { kind: "invalid" };

/** E3 costs one receipt per event, so the page renders at once with placeholders while this prefetch runs. */
export const channelLoader = ({ api, queryClient }: AppDeps) => ({ params }: LoaderFunctionArgs): ChannelData => {
  const address = params.address ?? "";
  if (!ADDRESS.test(address)) return { kind: "invalid" };
  void queryClient.prefetchQuery({ ...channelQuery(api, address), retry: false });
  return { kind: "ok", address };
};
