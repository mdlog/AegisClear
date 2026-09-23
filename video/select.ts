/**
 * The runbook's pre-flight, as code (docs/SUBMISSION.md §2.1). Reads the live console API, runs the three
 * scenarios the video shows off-camera (B-dispute, anchored, rollover) on Robinhood Chain testnet, checks
 * every number the narration will say, and writes video/out/take.json. Aborts if the take is not
 * filmable — a bad take is cheaper to refuse than to edit out.
 *
 *   BASE=http://127.0.0.1:4040 node --experimental-strip-types video/select.ts
 */
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR, splitParts, type RunFacts, type Take, type Tx } from "./script.ts";

const BASE = process.env.BASE ?? "http://127.0.0.1:4040";
const RUN_TIMEOUT_MS = 6 * 60_000;

type Step = { i: number; t: number; phase: string; label: string; channel?: string };
type ResultRow = { klien_provider: string; gas: string; proving_ms: string; txs: Tx[] };
export type Snapshot = { id: string; scenario: string; status: string; steps: Step[]; channels: string[]; result?: ResultRow[]; error?: string };
type Config = {
  network: string;
  chainId: number;
  explorerBase?: string;
  addresses: Record<string, string>;
  clients: { label: string; address: string }[];
  windows: { challenge: number };
  terms: { maxM1: string };
  breaches: number[];
  deposit: string;
};

/** The facts the video needs from a finished run; throws if the run did not produce them. */
export function factsOf(run: Snapshot): RunFacts {
  const row = run.result?.[0];
  const channel = run.channels[0];
  if (run.status !== "done" || !row || !channel) throw new Error(`run ${run.id} (${run.scenario}) is ${run.status}${run.error ? `: ${run.error}` : ""}, not filmable`);
  splitParts(row.klien_provider);
  return { id: run.id, channel, split: row.klien_provider, gas: row.gas, provingMs: row.proving_ms, txs: row.txs };
}

/** "133/133 unit dilayani (5 di epoch 1)" → 133; "epoch 0 penuh (MAX_SEQ 128)" → 128 (the server's own labels). */
export function rolloverUnits(steps: Step[]): { units: number; epochUnits: number } {
  const served = steps.map((s) => /^(\d+)\/(\d+) unit dilayani/.exec(s.label)).find((m) => m && m[1] === m[2]);
  const epoch = steps.map((s) => /MAX_SEQ (\d+)/.exec(s.label)).find(Boolean);
  if (!served || !epoch) throw new Error("rollover run has no served-units or MAX_SEQ step");
  return { units: Number(served[1]), epochUnits: Number(epoch[1]) };
}

export function expect(cond: boolean, what: string) {
  if (!cond) throw new Error(`not filmable: ${what}`);
}

async function j<T>(p: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + p, { ...init, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${p} → HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

async function run(scenario: string): Promise<Snapshot> {
  const { runId } = await j<{ runId: string }>("/api/demo/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }) });
  const t0 = Date.now();
  process.stdout.write(`  ${scenario} ${runId} `);
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const snap = await j<Snapshot>(`/api/demo/runs/${runId}`);
    if (snap.status !== "running") {
      console.log(`${snap.status} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      return snap;
    }
    if (Date.now() - t0 > RUN_TIMEOUT_MS) throw new Error(`${scenario} ${runId} still running after ${RUN_TIMEOUT_MS / 1000} s`);
    process.stdout.write(".");
  }
}

async function main() {
  const cfg = await j<Config>("/api/config");
  expect(cfg.network === "testnet" && cfg.chainId === 46630, `console is on ${cfg.network} / ${cfg.chainId}, not testnet 46630`);
  // Constants the narration says aloud: 7 breaches, an 800 ms ceiling, a 60 s window, a 5-token deposit.
  expect(cfg.breaches.length === 7, `terms breach ${cfg.breaches.length} units, the narration says 7`);
  expect(cfg.terms.maxM1 === "800", `latency ceiling is ${cfg.terms.maxM1} ms, the narration says 800`);
  expect(cfg.windows.challenge === 60, `challenge window is ${cfg.windows.challenge} s, the narration says 60`);
  expect(cfg.deposit === "5000000", `deposit is ${cfg.deposit}, the narration says 5`);

  const { channels } = await j<{ channels: { client: string; state: string }[] }>("/api/channels");
  const ours = new Set(cfg.clients.map((c) => c.address.toLowerCase()));
  const blocking = channels.filter((c) => ours.has(c.client.toLowerCase()) && (c.state === "OPEN" || c.state === "CLOSING"));
  expect(blocking.length === 0, `${blocking.length} demo-client channel(s) OPEN/CLOSING — the run button would answer 409`);

  console.log("running the three scenarios off-camera (≈ 7 min):");
  const dispute = await run("B-dispute");
  const anchored = await run("B-anchored-dispute");
  const rollover = await run("B-rollover");

  const d = factsOf(dispute);
  const a = factsOf(anchored);
  const r = factsOf(rollover);
  expect(d.split === "0.07 / 1.93", `B-dispute split is ${d.split}`);
  expect(dispute.steps.some((s) => s.label.startsWith("100/100 unit")), "B-dispute did not serve 100 units");
  expect(a.split === "0.02 / 0.38", `anchored split is ${a.split}`);
  const acks = a.txs.filter((t) => t.label === "ack").length;
  expect(acks === 20, `anchored run acked ${acks} times on-chain`);
  expect(r.split === "0.00 / 2.66", `rollover split is ${r.split}`);

  const take: Take = {
    base: BASE,
    explorer: cfg.explorerBase ?? "https://explorer.testnet.chain.robinhood.com",
    chainId: cfg.chainId,
    factory: cfg.addresses.factory,
    poseidon: cfg.addresses.poseidon,
    dispute: d,
    anchored: { ...a, acks },
    rollover: { ...r, ...rolloverUnits(rollover.steps) },
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "take.json"), JSON.stringify(take, null, 2) + "\n");
  console.log(`\nwrote ${path.join(OUT_DIR, "take.json")}: dispute ${d.split}, anchored ${a.split} (${acks} acks), rollover ${r.split} (${take.rollover.units} units)`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  });
}
