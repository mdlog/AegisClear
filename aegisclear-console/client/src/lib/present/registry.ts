// Channel registry selectors. Filters live in the URL (LAYOUT_SPEC /channels, README §6.6).
import type { ChannelState, ChannelSummary, ConfigResponse } from "@aegis/types";

const STATES: ChannelState[] = ["UNINIT", "OPEN", "CLOSING", "SETTLED"];
const MODES = ["co-signed", "anchored"] as const;
const FACTORIES = ["factory", "factoryProd", "factoryAnchored"] as const;
const CLIENTS = ["A", "B", "other"] as const;

export interface RegistryFilters {
  state?: ChannelState[];
  mode?: (typeof MODES)[number];
  factory?: (typeof FACTORIES)[number];
  client?: (typeof CLIENTS)[number];
  /** only channels created by a run in this server session (runId present) */
  session?: boolean;
  page?: number;
}

export function clientLabel(addr: string, cfg: ConfigResponse): "A" | "B" | undefined {
  return cfg.clients.find((c) => c.address.toLowerCase() === addr.toLowerCase())?.label;
}

/** Keeps the server order (newest first); the registry has no column sorting. */
export function filterChannels(list: ChannelSummary[], f: RegistryFilters, cfg: ConfigResponse): ChannelSummary[] {
  return list.filter((c) =>
    (!f.state?.length || f.state.includes(c.state)) &&
    (!f.mode || c.mode === f.mode) &&
    (!f.factory || c.factoryName === f.factory) &&
    (!f.client || (clientLabel(c.client, cfg) ?? "other") === f.client) &&
    (!f.session || Boolean(c.runId)),
  );
}

const pick = <T extends string>(allowed: readonly T[], v: string | null): T | undefined => (v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);

export function parseRegistryFilters(search: string): RegistryFilters {
  const q = new URLSearchParams(search);
  const f: RegistryFilters = {};
  const state = (q.get("state") ?? "").split(",").filter((s): s is ChannelState => (STATES as string[]).includes(s));
  if (state.length) f.state = state;
  const mode = pick(MODES, q.get("mode"));
  if (mode) f.mode = mode;
  const factory = pick(FACTORIES, q.get("factory"));
  if (factory) f.factory = factory;
  const client = pick(CLIENTS, q.get("client"));
  if (client) f.client = client;
  if (q.get("session") === "1") f.session = true;
  const page = Number(q.get("page"));
  if (Number.isInteger(page) && page >= 1) f.page = page;
  return f;
}

export function filtersToSearch(f: RegistryFilters): string {
  const q = new URLSearchParams();
  if (f.state?.length) q.set("state", f.state.join(","));
  if (f.mode) q.set("mode", f.mode);
  if (f.factory) q.set("factory", f.factory);
  if (f.client) q.set("client", f.client);
  if (f.session) q.set("session", "1");
  if (f.page) q.set("page", String(f.page));
  const s = q.toString().replace(/%2C/g, ",");
  return s ? `?${s}` : "";
}
