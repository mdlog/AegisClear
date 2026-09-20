import type { Address, Hex } from "viem";
import { defaultArtifacts, readChannel, type createProviderApp } from "@aegisclear/sdk";
import {
  runMarketA, runMarketB, runRollover, toRows, privateValues, ANCHORED_UNITS, DEPOSIT_B, ESCROW_AMOUNT_A,
  type MarketAResult, type MarketBResult, type RolloverResult, type ScenarioEnv, type StepInput,
} from "@aegisclear/demo";
import type { ScenarioId } from "../shared/types.js";
import { REPO_ROOT, type WebConfig } from "./config.js";
import type { ChainServices } from "./chain.js";
import type { ChannelIndex } from "./channels.js";
import type { RunStore } from "./runs.js";

export type StartResult = { runId: string } | { error: "busy" } | { error: "unknown-scenario" } | { error: "client-has-open-channel"; channel: Address } | { error: "preflight-failed"; message: string };
export interface RunnerDeps {
  cfg: WebConfig; chain: ChainServices; store: RunStore; provider: ReturnType<typeof createProviderApp>;
  /** provider anchored (`/provider-anchored`) — undefined bila deployment ini tidak punya `factoryAnchored`. */
  providerAnchored?: ReturnType<typeof createProviderApp>;
  runIdOf: Map<Address, string>; providerUrl: string; providerAnchoredUrl?: string; index: ChannelIndex;
}
export interface PrivateRecord { channel: Address; values: bigint[]; txs: Hex[]; /** sesi ini dilayani provider anchored (factoryAnchored) — menentukan factory yang dipakai leak-check. */ anchored?: boolean }
type Single = Exclude<ScenarioId, "all">;
const CLIENT_OF: Record<Single, "a" | "b"> = {
  "B-cooperative": "a", "B-dispute": "b", "B-anchored-dispute": "a", "B-rollover": "b", "A-complete": "a", "A-reject": "b",
};
const ALL: Single[] = ["B-cooperative", "B-dispute", "A-complete", "A-reject"];   // urutan tabel §14 dijaga oleh toRows — "all" TIDAK mencakup anchored/rollover

export function makeRunner(d: RunnerDeps) {
  const privates = new Map<string, PrivateRecord[]>();
  let starting = false;
  const env: ScenarioEnv = {
    ctx: d.chain.ctx, publicClient: d.chain.publicClient, d: d.cfg.deployment, art: defaultArtifacts(REPO_ROOT),
    providerUrl: d.providerUrl, providerAddress: d.chain.addressOf(d.cfg.keys.provider), providerPk: d.cfg.keys.provider,
    challengeWindow: d.cfg.windows.challenge, timeTravel: d.chain.timeTravel,
  };
  // Env skenario anchored (FR-25): ctx terikat ke factoryAnchored, providerUrl menunjuk /provider-anchored.
  // undefined bila deployment ini tidak punya factoryAnchored — B-anchored-dispute lalu ditolak di preflight start().
  const factoryAnchored = d.cfg.deployment.factoryAnchored;
  const providerAnchoredUrl = d.providerAnchoredUrl;
  const envAnchored: ScenarioEnv | undefined = d.providerAnchored && providerAnchoredUrl && factoryAnchored
    ? { ...env, ctx: (pk) => d.chain.ctx(pk, factoryAnchored), providerUrl: providerAnchoredUrl }
    : undefined;

  /** Provider (createProviderApp) yang melayani leg `p`: anchored untuk B-anchored-dispute, co-signed untuk sisanya. */
  const providerAppFor = (p: Single) => (p === "B-anchored-dispute" ? d.providerAnchored : d.provider);

  /**
   * Sesi provider (`createProviderApp().sessions`) dikunci per alamat klien; run baru untuk klien yang sama
   * butuh sesi baru. Hapus sesi bila belum punya channel atau channel-nya SETTLED; bila channel masih
   * OPEN/CLOSING kembalikan alamatnya (JANGAN hapus — co-signed checkpoint di sesi itu dibutuhkan responder T1).
   * `provider`: instance provider (co-signed atau anchored) yang melayani leg ini — sesi keduanya terpisah.
   */
  async function resetSession(provider: ReturnType<typeof createProviderApp>, client: Address): Promise<Address | undefined> {
    const key = client.toLowerCase();
    const s = provider.sessions.get(key);
    if (!s) return undefined;
    if (s.channel && (await readChannel(d.chain.ctx(d.cfg.keys.provider), s.channel)).state !== "SETTLED") return s.channel;
    provider.sessions.delete(key);
    return undefined;
  }

  async function start(scenario: ScenarioId): Promise<StartResult> {
    if (scenario !== "all" && !(scenario in CLIENT_OF)) return { error: "unknown-scenario" };
    if (starting || d.store.busy) return { error: "busy" };
    starting = true;
    try {
      const parts: Single[] = scenario === "all" ? ALL : [scenario];
      for (const p of parts) {
        if (!p.startsWith("B-")) continue;
        const app = providerAppFor(p);
        if (!app) return { error: "preflight-failed", message: `provider anchored tidak dikonfigurasi (factoryAnchored hilang di deployment) — skenario ${p} tidak bisa dijalankan` };
        const open = await resetSession(app, d.chain.addressOf(d.cfg.keys[CLIENT_OF[p]]));
        if (open) return { error: "client-has-open-channel", channel: open };
      }
      const run = d.store.create(scenario);
      void execute(run.id, parts)
        .then((rows) => { d.index.invalidate(); d.store.finish(run.id, rows); })
        .catch((e) => { d.index.invalidate(); d.store.fail(run.id, e instanceof Error ? e.message : String(e)); });
      return { runId: run.id };
    } catch (e) {
      return { error: "preflight-failed", message: e instanceof Error ? e.message : String(e) };
    } finally {
      starting = false;
    }
  }

  async function execute(runId: string, parts: Single[]) {
    const emit = (s: StepInput) => {
      if (s.channel && !d.runIdOf.has(s.channel)) { d.runIdOf.set(s.channel, runId); d.index.invalidate(); }
      d.store.emit(runId, s);
    };
    const res: { aOk?: MarketAResult; aRej?: MarketAResult; bCoop?: MarketBResult; bDisp?: MarketBResult; bAnch?: MarketBResult; bRoll?: RolloverResult } = {};
    const record = (r: MarketBResult, anchored: boolean) => {
      privates.set(runId, [...(privates.get(runId) ?? []), { channel: r.channel, values: privateValues(r.terms, { anchored }), txs: r.txs.map((t) => t.hash), anchored }]);
    };
    for (const p of parts) {
      const pk = d.cfg.keys[CLIENT_OF[p]]; const who = d.chain.addressOf(pk); const isB = p.startsWith("B-");
      const { minted } = await d.chain.ensureUsdg(who, isB ? DEPOSIT_B : ESCROW_AMOUNT_A);
      if (minted) emit({ phase: isB ? "fund" : "escrow", label: `faucet: mint ${Number(minted) / 1e6} USDG ke klien ${CLIENT_OF[p].toUpperCase()}` });
      emit({ phase: isB ? "fund" : "escrow", label: `▶ ${p} — klien ${CLIENT_OF[p].toUpperCase()} ${who}` });
      if (p === "B-anchored-dispute") {
        if (!envAnchored) throw new Error("factoryAnchored tidak dikonfigurasi — provider anchored tidak tersedia");
        const r = await runMarketB(envAnchored, pk, true, emit, ANCHORED_UNITS);
        record(r, true);
        res.bAnch = r;
      } else if (p === "B-rollover") {
        const r = await runRollover(env, pk, emit);
        record(r, false);
        res.bRoll = r;
      } else if (isB) {
        const r = await runMarketB(env, pk, p === "B-dispute", emit);
        record(r, false);
        if (p === "B-dispute") res.bDisp = r; else res.bCoop = r;
      } else {
        const r = await runMarketA(env, pk, p === "A-complete", emit);
        if (p === "A-complete") res.aOk = r; else res.aRej = r;
      }
    }
    return toRows(res);
  }

  const privateOf = (runId: string): PrivateRecord[] | undefined => privates.get(runId);
  return { start, resetSession, privateOf };
}
