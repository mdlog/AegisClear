import { test } from "node:test";
import assert from "node:assert/strict";
import { beats, narrationFor, splitParts, LIVE, type Take } from "../script.ts";

const tx = (label: string) => ({ label, hash: `0x${"ab".repeat(32)}` });
const take: Take = {
  base: "http://127.0.0.1:4040", explorer: "https://explorer.testnet.chain.robinhood.com", chainId: 46630,
  factory: "0x52773ab546e78828DDAbC4F3dA13eaCb167941B6", poseidon: "0x1027cf7DC26152012ed9Ef949Aa1432Bf1C7ef34",
  dispute: { id: "mudz0cew-80ba92", channel: "0x862Fea9De214303D146DA79596EEe35e30273b5a", split: "0.07 / 1.93", gas: "584859", provingMs: "3496", txs: [tx("claimPenalty")] },
  anchored: { id: "mudz3oew-8137c9", channel: "0x14C5d55B081c5a7F2fD169f71F77b4d9112D5a44", split: "0.02 / 0.38", gas: "4891559", provingMs: "3371", txs: [], acks: 20 },
  rollover: { id: "mudz70v1-aa8f0b", channel: "0x4073eF031b160a40927Af6593f902cA50969Ef8f", split: "0.00 / 2.66", gas: "304002", provingMs: "-", txs: [], units: 133, epochUnits: 128 },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

test("ten beats, every variable resolved from the take, no braces left", () => {
  const b = beats(take);
  assert.equal(b.length, 10);
  for (const beat of b) assert.doesNotMatch(beat.narration, /[{}]/, beat.id);
  assert.match(b[0].narration, /AegisClear sends 0\.07 back and 1\.93 to the provider/);
  assert.match(b[7].narration, /Here, 20 acks and 0\.02 back\./);
  assert.match(b[8].narration, /One epoch holds 128 receipts\..*one deposit, 133 units\./);
});

test("every anchored phrase is spoken in its own beat, or the recorder would stop mid-take", () => {
  for (const beat of beats(take)) {
    for (const a of beat.actions) if (a.at) assert.ok(norm(beat.narration).includes(norm(a.at)), `${beat.id}: "${a.at}"`);
  }
});

test("beats 4–6 film the live run started on camera in beat 3, after off-camera waits, in order", () => {
  const b = beats(take);
  const start = b[2].actions.find((a) => a.kind === "click");
  assert.ok(start && start.kind === "click" && start.startsRun);
  assert.deepEqual([b[3].before?.live, b[4].before?.live, b[5].before?.live], ["serve", "prove", "done"]);
  for (const beat of [b[3], b[4], b[5]]) assert.ok(beat.actions.some((a) => a.kind === "goto" && a.path.includes(LIVE)), beat.id);
});

test("explorer shots are captured off-camera before the beat that shows them", () => {
  for (const beat of beats(take)) {
    for (const a of beat.actions) if (a.kind === "explorer") assert.ok(beat.before?.shots?.includes(a.shot), `${beat.id}: ${a.shot}`);
  }
});

test("splitParts reads the console's client / provider split, and refuses anything else", () => {
  assert.deepEqual(splitParts("0.07 / 1.93"), ["0.07", "1.93"]);
  assert.throws(() => splitParts("0.07 to 1.93"));
});

test("narrationFor carries delay and minimum visual length", () => {
  const n = narrationFor(take);
  assert.equal(n[0].delayMs, 500);
  assert.ok(n.every((x) => x.minVisualMs >= 8000));
});
