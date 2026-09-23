// Fixture replay (API_CONTRACT §11): the recordings in docs/frontend/fixtures behind the same ApiClient as the
// console server, so the UI runs with no chain. Reached only through createApi() in fixture mode.
// A replayed run re-emits a recorded snapshot on its own clock (recorded t / speed). Channel details are the
// recorded final state, so a replayed run's channel already reads SETTLED while the tape is still playing.
import { SCENARIOS, type ChannelDetail, type ChannelSummary, type ConfigResponse, type LeakResponse, type RunSnapshot, type ScenarioId, type SseEvent } from "@aegis/types";
import { ApiError, type ApiClient } from "./client";

export type FixtureSet = "local" | "testnet";
export interface FixtureOptions { set?: FixtureSet; speed?: number }

interface Envelope<T> { httpStatus: number; body: T }
const files = import.meta.glob<Envelope<unknown>>("@fixtures/**/*.json", { import: "default" });
const DIR: Record<FixtureSet, string> = { local: "/local-31337/", testnet: "/testnet-46630/" };
// Error bodies and leak checks were recorded on the local server only; the server code is the same on both networks.
const ERRORS = "/local-31337/errors/";
const NO_MARKET_B = "/local-31337/leak-check/A-complete.json"; // the server's single 404 for "unknown run or no Market-B channel"
const NO_RUNS = "/local-31337/runs-list.empty.json";

async function read<T>(match: (key: string) => boolean): Promise<Envelope<T> | undefined> {
  const key = Object.keys(files).find(match);
  return key ? ((await files[key]()) as Envelope<T>) : undefined;
}

/** A recorded response: its body when 2xx, else the ApiError the live client would throw. */
async function answer<T>(suffix: string): Promise<T> {
  const env = await read<T>((key) => key.endsWith(suffix));
  if (!env) throw new Error(`fixture missing: ${suffix}`);
  if (env.httpStatus >= 300) throw new ApiError(env.httpStatus, (env.body as { error: string }).error, env.body);
  return env.body;
}

const recordedError = (name: string) => answer<never>(`${ERRORS}${name}.json`).catch((e: unknown) => e);

interface Replay { run: RunSnapshot; listeners: Set<(ev: SseEvent) => void> }

export function createFixtureApi({ set = "local", speed = 1 }: FixtureOptions = {}): ApiClient {
  const dir = DIR[set];
  const replays = new Map<string, Replay>(); // runs started in this session, oldest first
  let active: string | undefined;

  const recordedRuns = () => answer<RunSnapshot[]>(set === "local" ? `${dir}runs-list.json` : NO_RUNS);
  async function recordedRun(id: string): Promise<RunSnapshot> {
    const listed = (await recordedRuns()).find((r) => r.id === id);
    if (!listed) throw await recordedError("run-unknown-id.404");
    return answer<RunSnapshot>(`${dir}runs/${listed.scenario}.snapshot.json`);
  }
  const copy = (run: RunSnapshot): RunSnapshot => ({ ...run, steps: [...run.steps], channels: [...run.channels] });
  const terminal = (run: RunSnapshot): SseEvent => (run.status === "error" ? { type: "error", data: run } : { type: "done", data: run });

  function replay(id: string, recorded: RunSnapshot) {
    const startedAt = Date.now();
    const run: RunSnapshot = { id, scenario: recorded.scenario, status: "running", startedAt, steps: [], channels: [] };
    const listeners = new Set<(ev: SseEvent) => void>();
    replays.set(id, { run, listeners });
    const at = (ms: number) => Math.round(ms / speed);
    const duration = recorded.endedAt ? recorded.endedAt - recorded.startedAt : (recorded.steps.at(-1)?.t ?? 0);
    const ticks = [
      ...recorded.steps.map((step) => ({ t: at(step.t), fire: () => {
        const s = { ...step, t: at(step.t) };
        run.steps.push(s);
        if (s.channel && !run.channels.includes(s.channel)) run.channels.push(s.channel);
        listeners.forEach((fn) => fn({ type: "step", data: s }));
      } })),
      { t: at(duration), fire: () => {
        Object.assign(run, { status: recorded.status, result: recorded.result, error: recorded.error, endedAt: startedAt + at(duration) });
        active = undefined;
        listeners.forEach((fn) => fn(terminal(copy(run))));
        listeners.clear();
      } },
    ];
    // One timer at a time keeps the recorded order even when several steps share a millisecond.
    let k = 0;
    const next = (prev: number) => {
      const tick = ticks[k++];
      if (tick) setTimeout(() => { tick.fire(); next(tick.t); }, Math.max(0, tick.t - prev));
    };
    next(0);
  }

  return {
    getConfig: () => answer<ConfigResponse>(`${dir}config.json`),
    getChannels: () => answer<{ scannedAt: number; channels: ChannelSummary[] }>(`${dir}channels.json`),
    async getChannel(addr) {
      const lower = addr.toLowerCase();
      const recorded = await read<ChannelDetail>((k) => k.includes(`${dir}channels/`) && k.toLowerCase().endsWith(`.${lower}.json`));
      if (recorded) return recorded.body;
      const { channels } = await answer<{ channels: ChannelSummary[] }>(`${dir}channels.json`);
      if (channels.some((c) => c.channel.toLowerCase() === lower)) {
        throw new ApiError(404, "not-recorded", { error: "not-recorded", message: `No recorded detail for ${addr} in the ${set} fixture set.` });
      }
      throw await recordedError("channel-unknown.404");
    },
    async startRun(scenario: ScenarioId) {
      if (!SCENARIOS.includes(scenario)) throw await recordedError("run-unknown-scenario.400");
      if (active) throw await recordedError("run-busy.409");
      if (set === "testnet") {
        throw new ApiError(502, "preflight-failed", { error: "preflight-failed", message: "The testnet fixture set has no recorded runs. Start the console with VITE_FIXTURE_SET=local to replay one." });
      }
      const id = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, "0")}`;
      active = id; // claim the single run slot before loading, like the server's `starting` flag
      try {
        replay(id, await answer<RunSnapshot>(`${dir}runs/${scenario}.snapshot.json`));
      } catch (e) {
        active = undefined;
        throw e;
      }
      return { runId: id };
    },
    async getRuns() {
      const session = [...replays.values()].reverse().map(({ run }) => ({ ...run, steps: [], channels: [...run.channels] }));
      return [...session, ...(await recordedRuns())];
    },
    async getRun(id) {
      const live = replays.get(id);
      return live ? copy(live.run) : recordedRun(id);
    },
    subscribeRun(id, onEvent, onTransportError) {
      let closed = false;
      const emit = (ev: SseEvent) => { if (!closed) onEvent(ev); };
      void (async () => {
        const live = replays.get(id);
        const run = live ? copy(live.run) : await recordedRun(id).catch(() => undefined);
        await Promise.resolve(); // deliver asynchronously, like a network stream
        if (closed) return;
        if (!run) return onTransportError?.(); // the server answers 404, which EventSource reports as a bare error
        run.steps.forEach((step) => emit({ type: "step", data: step }));
        if (live && live.run.status === "running") live.listeners.add(emit);
        else emit(terminal(live ? copy(live.run) : run));
      })();
      return () => { closed = true; replays.get(id)?.listeners.delete(emit); };
    },
    async leakCheck(runId) {
      const scenario = replays.get(runId)?.run.scenario ?? (await recordedRuns()).find((r) => r.id === runId)?.scenario;
      return answer<LeakResponse[]>(scenario ? `/local-31337/leak-check/${scenario}.json` : NO_MARKET_B);
    },
    getOffer: (client) => answer<{ status: number; body: unknown }>(`${dir}offer-${client}.json`),
  };
}
