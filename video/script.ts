/**
 * The single source of truth for the AegisClear demo video: ten beats, their on-screen actions
 * and their narration. Nothing else under video/ contains narration. Every quoted UI string was
 * checked against aegisclear-console/client/src/copy/en.ts on 2026-09-23; run `record.ts --probe`
 * after changing one. Numbers the voice says come from out/take.json (select.ts) or are constants
 * the console itself prints (verifier 229,241 gas, 128 receipts per epoch, 1.75× Stylus vs Yul).
 */
import fs from "node:fs";
import path from "node:path";

export type Tx = { label: string; hash: string };
export type RunFacts = { id: string; channel: string; split: string; gas: string; provingMs: string; txs: Tx[] };

export type Take = {
  base: string;
  explorer: string;
  chainId: number;
  factory: string;
  poseidon: string;
  /** select.ts's finished B-dispute: the Desk scoreboard reads it, and --probe stands it in for the live run. */
  dispute: RunFacts;
  anchored: RunFacts & { acks: number };
  rollover: RunFacts & { units: number; epochUnits: number };
};

/** Real Blockscout pages, screenshotted off-camera before the beat that shows them. */
export type Shot = "claimPenalty" | "poseidon";

/**
 * `at` = do not start this action before the narration reaches this phrase.
 * `liveOnly` = the element exists only while the run is live (a countdown, the growing grid), so
 * `record.ts --probe`, which films nothing and starts no run, skips it.
 */
export type Action = (
  | { kind: "card"; name: "title" | "end"; ms: number }
  | { kind: "goto"; path: string; route: string }
  | { kind: "wait"; ms: number }
  | { kind: "hover"; selector: string; ms?: number }
  /** `startsRun`: the click launches the live testnet run; the recorder reads its id from the URL. */
  | { kind: "click"; selector: string; route: string; startsRun?: boolean; ms?: number }
  | { kind: "scrollTo"; selector: string; ms?: number }
  | { kind: "waitFor"; selector: string; timeoutMs: number }
  | { kind: "explorer"; shot: Shot; ms: number }
) & { at?: string; liveOnly?: boolean };

export type Beat = {
  id: string;
  minVisualMs: number;
  narrationDelayMs: number;
  narration: string;
  /** Off-camera, before the beat's recording context exists: wait for the live run, capture explorer pages. */
  before?: { live?: LivePhase; shots?: Shot[] };
  actions: Action[];
};

/** "serve": at least 30 of the 100 units served, so the receipt grid is visibly filling. */
export type LivePhase = "serve" | "prove" | "done";

/** Paths may name the live run, which only exists once beat 3 has clicked Run dispute. */
export const LIVE = ":live";
export const LIVE_CHANNEL = ":liveChannel";

// Variables in braces are filled from the take.
const N = {
  beat1: `Agents on Robinhood Chain already pay each other in USDG over x402: pay first, no recourse. One job, three rails: 100 requests, 7 breach the latency SLA. With x402 exact, 2 USDG are gone. A binary escrow pays all or nothing, on a trusted evaluator's word. AegisClear sends {disputeClient} back and {disputeProvider} to the provider, decided by a zero-knowledge proof.`,
  beat2: `To an x402 facilitator this is an ordinary offer. The difference is the payTo: the escrow's own address, predicted with CREATE2 before it exists, so it can only become a channel with the terms the provider signed. The terms go to the client alone.`,
  beat3: `Now a live dispute on testnet. The client funds 5 Mock USDG, and the provider opens the channel with its first acknowledgement.`,
  beat3b: `Every unit returns a receipt with latency, quality and price, and both sides co-sign a running checkpoint. A hundred units, zero transactions.`,
  beat4: `Seven units ran over 800 milliseconds. The client submits the highest co-signed checkpoint and a Groth16 proof that, under the committed terms, the refund is 0.07. The contract verifies it for about 229,000 gas and never sees the price, thresholds or metrics. Then a 60-second challenge window.`,
  beat5: `After the window, anyone may settle: 1.93 to the provider, 0.07 back, the unused deposit returned. On the left, what only the two parties hold; on the right, what the chain shows. The leak check scans every transaction of this channel for the private values: zero leaks.`,
  beat6: `Each step is an event on chain: opened, checkpoint, penalty with proof, settled. Here is the penalty claim on Blockscout. There is no owner, pause or proxy on the money path, and settling is permissionless.`,
  beat7: `For high-value jobs, anchored mode makes every acknowledgement a transaction that adds a leaf to an on-chain Poseidon tree. Those hashes run in Rust on Stylus, 1.75 times cheaper than our best Yul, measured on chain; the Groth16 verifier stays in Solidity, where Stylus loses. Here, {acks} acks and {anchoredClient} back.`,
  beat8: `One epoch holds {epochUnits} receipts. A cooperative rollover pays the old epoch and carries the rest of the deposit forward: one deposit, {rolloverUnits} units.`,
  beat9: `The honest part: a one-contributor trusted setup, so the contract caps any loss until a public ceremony; Mock USDG on testnet; no mainnet yet; a self-audit. AegisClear: recourse for machine payments, without opening the books.`,
};

/** "0.07 / 1.93" → ["0.07", "1.93"] (client first, as the console prints it). */
export function splitParts(split: string): [string, string] {
  const m = /^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/.exec(split);
  if (!m) throw new Error(`not a client / provider split: "${split}"`);
  return [m[1], m[2]];
}

function fill(template: string, take: Take): string {
  const [disputeClient, disputeProvider] = splitParts(take.dispute.split);
  const vars: Record<string, string> = {
    disputeClient,
    disputeProvider,
    anchoredClient: splitParts(take.anchored.split)[0],
    acks: String(take.anchored.acks),
    rolloverUnits: String(take.rollover.units),
    epochUnits: String(take.rollover.epochUnits),
  };
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`narration variable {${k}} is not in the take`);
    return vars[k];
  });
}

const RAILS = 'table:has(caption:has-text("Same job on three rails"))';
const NUMERALS = '[class*="numerals"]';

export function beats(take: Take): Beat[] {
  const live = `/runs/${LIVE}`;
  return [
    {
      id: "01-three-rails",
      minVisualMs: 14000,
      narrationDelayMs: 500,
      narration: fill(N.beat1, take),
      actions: [
        { kind: "card", name: "title", ms: 3500 },
        { kind: "goto", path: "/", route: "/" },
        { kind: "hover", selector: "main h1", ms: 1500 },
        { kind: "hover", selector: `${RAILS} caption`, at: "One job, three rails", ms: 1200 },
        { kind: "hover", selector: `${RAILS} tr:has-text("x402 exact")`, at: "With x402 exact", ms: 1200 },
        { kind: "hover", selector: `${RAILS} tr:has-text("binary escrow")`, at: "A binary escrow", ms: 1200 },
        { kind: "hover", selector: `${RAILS} tr:has-text("AegisClear")`, at: "AegisClear sends", ms: 2500 },
      ],
    },
    {
      id: "02-the-offer",
      minVisualMs: 12000,
      narrationDelayMs: 300,
      narration: fill(N.beat2, take),
      actions: [
        { kind: "goto", path: "/offer", route: "/offer" },
        { kind: "hover", selector: 'text="What any x402 facilitator sees"', ms: 1500 },
        { kind: "hover", selector: 'dt:has(code:text-is("payTo"))', at: "The difference is the payTo", ms: 2500 },
        { kind: "hover", selector: 'text="What only the AegisClear client reads"', at: "The terms go to the client alone", ms: 2000 },
      ],
    },
    {
      id: "03-live-start",
      minVisualMs: 8000,
      narrationDelayMs: 0,
      narration: fill(N.beat3, take),
      actions: [
        { kind: "goto", path: "/", route: "/" },
        { kind: "click", selector: "#featured-run", route: live, startsRun: true, at: "Now a live dispute" },
      ],
    },
    {
      id: "04-live-serve",
      minVisualMs: 9000,
      narrationDelayMs: 0,
      narration: fill(N.beat3b, take),
      before: { live: "serve" },
      actions: [
        { kind: "goto", path: live, route: live },
        { kind: "hover", selector: 'text="Private receipts, co-signed off-chain"', ms: 2000, liveOnly: true },
        { kind: "hover", selector: "text=/On-chain transactions during service/", at: "A hundred units, zero transactions", ms: 1500, liveOnly: true },
      ],
    },
    {
      id: "05-proof",
      minVisualMs: 16000,
      narrationDelayMs: 0,
      narration: fill(N.beat4, take),
      before: { live: "prove" },
      actions: [
        { kind: "goto", path: live, route: live },
        { kind: "hover", selector: "text=/Groth16 proof accepted/", at: "and a Groth16 proof", ms: 2000, liveOnly: true },
        { kind: "hover", selector: "text=/verifier 229,241 gas/", at: "The contract verifies it", ms: 2000, liveOnly: true },
        { kind: "hover", selector: "text=/s left/", at: "Then a 60-second challenge window", ms: 1500, liveOnly: true },
      ],
    },
    {
      id: "06-verdict",
      minVisualMs: 18000,
      narrationDelayMs: 0,
      narration: fill(N.beat5, take),
      before: { live: "done" },
      actions: [
        { kind: "goto", path: live, route: live },
        { kind: "hover", selector: NUMERALS, ms: 1500 },
        { kind: "hover", selector: 'text="Held by provider and client"', at: "On the left", ms: 1200 },
        { kind: "hover", selector: 'text="Visible on Robinhood Chain"', at: "on the right", ms: 1200 },
        { kind: "click", selector: 'button:has-text("Check for leaks")', route: live, at: "The leak check scans", ms: 300 },
        { kind: "waitFor", selector: "text=/appear nowhere on-chain/", timeoutMs: 60000 },
        { kind: "hover", selector: '[aria-label="Leak check"]', at: "zero leaks", ms: 1500 },
      ],
    },
    {
      id: "07-on-chain",
      minVisualMs: 12000,
      narrationDelayMs: 0,
      narration: fill(N.beat6, take),
      before: { shots: ["claimPenalty"] },
      actions: [
        { kind: "goto", path: `/channels/${LIVE_CHANNEL}`, route: `/channels/${LIVE_CHANNEL}` },
        { kind: "hover", selector: 'text="Opened by the provider"', ms: 1000 },
        { kind: "hover", selector: 'text="Penalty claimed with a Groth16 proof"', at: "penalty with proof", ms: 1000 },
        { kind: "explorer", shot: "claimPenalty", at: "Here is the penalty claim", ms: 3800 },
      ],
    },
    {
      id: "08-anchored-stylus",
      minVisualMs: 16000,
      narrationDelayMs: 0,
      narration: fill(N.beat7, take),
      before: { shots: ["poseidon"] },
      actions: [
        { kind: "goto", path: `/runs/${take.anchored.id}`, route: `/runs/${take.anchored.id}` },
        { kind: "hover", selector: `text=/${take.anchored.acks} units, ${take.anchored.acks} tx/`, at: "makes every acknowledgement a transaction", ms: 1500 },
        { kind: "explorer", shot: "poseidon", at: "Those hashes run in Rust on Stylus", ms: 4200 },
        { kind: "hover", selector: NUMERALS, at: "Here,", ms: 2000 },
      ],
    },
    {
      id: "09-rollover",
      minVisualMs: 9000,
      narrationDelayMs: 0,
      narration: fill(N.beat8, take),
      actions: [
        { kind: "goto", path: `/runs/${take.rollover.id}`, route: `/runs/${take.rollover.id}` },
        { kind: "hover", selector: 'nav[aria-label="Lifecycle"] >> text=Rollover', at: "A cooperative rollover", ms: 1500 },
        { kind: "hover", selector: NUMERALS, at: "one deposit", ms: 1500 },
      ],
    },
    {
      id: "10-limits",
      minVisualMs: 14000,
      narrationDelayMs: 0,
      narration: fill(N.beat9, take),
      actions: [
        { kind: "goto", path: "/deployment", route: "/deployment" },
        { kind: "scrollTo", selector: "h2#dep-limits", ms: 1500 },
        { kind: "card", name: "end", at: "AegisClear: recourse", ms: 5500 },
      ],
    },
  ];
}

export function narrationFor(take: Take) {
  return beats(take).map((b) => ({ id: b.id, text: b.narration, delayMs: b.narrationDelayMs, minVisualMs: b.minVisualMs }));
}

export const VIDEO_DIR = path.dirname(new URL(import.meta.url).pathname);
export const OUT_DIR = path.join(VIDEO_DIR, "out");

export function readTake(): Take {
  return JSON.parse(fs.readFileSync(path.join(OUT_DIR, "take.json"), "utf8")) as Take;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain && process.argv.includes("--narration")) {
  process.stdout.write(JSON.stringify(narrationFor(readTake()), null, 2) + "\n");
}
