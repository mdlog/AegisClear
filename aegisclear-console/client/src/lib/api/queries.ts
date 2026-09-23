// TanStack Query bindings for the ApiClient (README §4): one key per endpoint, freshness per API_CONTRACT §10.
// The *Query factories are shared by route loaders (queryClient.ensureQueryData) and the hooks.
import { createContext, useContext } from "react";
import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScenarioId } from "@aegis/types";
import type { ApiClient } from "./client";
import { channelRefetchMs, channelsRefetchMs, runsRefetchMs, shouldRetry } from "./policy";

export const ApiContext = createContext<ApiClient | null>(null);

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi() needs <ApiContext.Provider value={createApi()}> above it");
  return api;
}

export const queryKeys = {
  config: ["config"] as const,
  channels: ["channels"] as const,
  channel: (addr: string) => ["channel", addr.toLowerCase()] as const,
  runs: ["runs"] as const,
  run: (id: string) => ["run", id] as const,
  leakCheck: (runId: string) => ["leak-check", runId] as const,
  offer: (client: "A" | "B") => ["offer", client] as const,
};

/** Static for the server's lifetime. */
export const configQuery = (api: ApiClient) =>
  queryOptions({ queryKey: queryKeys.config, queryFn: () => api.getConfig(), staleTime: Infinity, retry: shouldRetry });

export const channelQuery = (api: ApiClient, addr: string) =>
  queryOptions({ queryKey: queryKeys.channel(addr), queryFn: () => api.getChannel(addr), retry: shouldRetry, refetchInterval: (q) => channelRefetchMs(q.state.data) });

export const runQuery = (api: ApiClient, id: string) =>
  queryOptions({ queryKey: queryKeys.run(id), queryFn: () => api.getRun(id), retry: shouldRetry });

export const useConfig = () => useQuery(configQuery(useApi()));
export const useChannel = (addr: string) => useQuery(channelQuery(useApi(), addr));
export const useRun = (id: string) => useQuery(runQuery(useApi(), id));

/** `poll: false` reads once (the offer's "is payTo already a channel?" check); otherwise 4 s, or 2 s while a run is live. */
export function useChannels({ runLive = false, poll = true }: { runLive?: boolean; poll?: boolean } = {}) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.channels, queryFn: () => api.getChannels(), retry: shouldRetry, refetchInterval: poll ? channelsRefetchMs(runLive) : false });
}

export function useRuns() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.runs, queryFn: () => api.getRuns(), retry: shouldRetry, refetchInterval: (q) => runsRefetchMs(q.state.data) });
}

/** Scans every tx of the run's channels over RPC, so it runs on demand and its answer never goes stale. */
export function useLeakCheck(runId: string, enabled: boolean) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.leakCheck(runId), queryFn: () => api.leakCheck(runId), enabled, staleTime: Infinity, retry: shouldRetry });
}

/** Switching A/B keeps the previous offer on screen (flagged by isPlaceholderData) until the new one arrives. */
export function useOffer(client: "A" | "B") {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.offer(client), queryFn: () => api.getOffer(client), retry: shouldRetry, placeholderData: keepPreviousData });
}

export function useStartRun() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scenario: ScenarioId) => api.startRun(scenario),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.runs }),
  });
}
