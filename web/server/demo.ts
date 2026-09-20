import type { Address, Hex } from "viem";
import { defaultArtifacts, readChannel, type createProviderApp } from "@aegisclear/sdk";
import {
  runMarketA, runMarketB, toRows, privateValues, DEPOSIT_B, ESCROW_AMOUNT_A,
  type MarketAResult, type MarketBResult, type ScenarioEnv, type StepInput,
} from "@aegisclear/demo";
import type { ScenarioId } from "../shared/types.js";
import { REPO_ROOT, type WebConfig } from "./config.js";
import type { ChainServices } from "./chain.js";
import type { ChannelIndex } from "./channels.js";
import type { RunStore } from "./runs.js";

export type StartResult = { runId: string } | { error: "busy" } | { error: "unknown-scenario" } | { error: "client-has-open-channel"; channel: Address } | { error: "preflight-failed"; message: string };
export interface RunnerDeps {
  cfg: WebConfig; chain: ChainServices; store: RunStore; provider: ReturnType<typeof createProviderApp>;
  runIdOf: Map<Address, string>; providerUrl: string; index: ChannelIndex;
}
export interface PrivateRecord { channel: Address; values: bigint[]; txs: Hex[] }
type Single = Exclude<ScenarioId, "all">;
const CLIENT_OF: Record<Single, "a" | "b"> = { "B-cooperative": "a", "B-dispute": "b", "A-complete": "a", "A-reject": "b" };
const ALL: Single[] = ["B-cooperative", "B-dispute", "A-complete", "A-reject"];   // urutan tabel §14 dijaga oleh toRows

export function makeRunner(d: RunnerDeps) {
  const privates = new Map<string, PrivateRecord[]>();
  let starting = false;
  const env: ScenarioEnv = {
    ctx: d.chain.ctx, publicClient: d.chain.publicClient, d: d.cfg.deployment, art: defaultArtifacts(REPO_ROOT),
    providerUrl: d.providerUrl, providerAddress: d.chain.addressOf(d.cfg.keys.provider), providerPk: d.cfg.keys.provider,
    challengeWindow: d.cfg.windows.challenge, timeTravel: d.chain.timeTravel,
  };

  /**
   * Sesi provider (`createProviderApp().sessions`) dikunci per alamat klien; run baru untuk klien yang sama
   * butuh sesi baru. Hapus sesi bila belum punya channel atau channel-nya SETTLED; bila channel masih
   * OPEN/CLOSING kembalikan alamatnya (JANGAN hapus — co-signed checkpoint di sesi itu dibutuhkan responder T1).
   */
  async function resetSession(client: Address): Promise<Address | undefined> {
    const key = client.toLowerCase();
    const s = d.provider.sessions.get(key);
    if (!s) return undefined;
    if (s.channel && (await readChannel(d.chain.ctx(d.cfg.keys.provider), s.channel)).state !== "SETTLED") return s.channel;
    d.provider.sessions.delete(key);
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
        const open = await resetSession(d.chain.addressOf(d.cfg.keys[CLIENT_OF[p]]));
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
    const res: { aOk?: MarketAResult; aRej?: MarketAResult; bCoop?: MarketBResult; bDisp?: MarketBResult } = {};
    for (const p of parts) {
      const pk = d.cfg.keys[CLIENT_OF[p]]; const who = d.chain.addressOf(pk); const isB = p.startsWith("B-");
      const { minted } = await d.chain.ensureUsdg(who, isB ? DEPOSIT_B : ESCROW_AMOUNT_A);
      if (minted) emit({ phase: isB ? "fund" : "escrow", label: `faucet: mint ${Number(minted) / 1e6} USDG ke klien ${CLIENT_OF[p].toUpperCase()}` });
      emit({ phase: isB ? "fund" : "escrow", label: `▶ ${p} — klien ${CLIENT_OF[p].toUpperCase()} ${who}` });
      if (isB) {
        const r = await runMarketB(env, pk, p === "B-dispute", emit);
        privates.set(runId, [...(privates.get(runId) ?? []), { channel: r.channel, values: privateValues(r.terms), txs: r.txs.map((t) => t.hash) }]);
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
