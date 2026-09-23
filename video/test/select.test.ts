import { test } from "node:test";
import assert from "node:assert/strict";
import { factsOf, rolloverUnits, type Snapshot } from "../select.ts";

const step = (label: string, phase = "serve") => ({ i: 0, t: 0, phase, label });

test("factsOf takes the split, gas, proving time and txs from a finished run", () => {
  const run: Snapshot = {
    id: "r1", scenario: "B-dispute", status: "done", steps: [], channels: ["0xabc"],
    result: [{ klien_provider: "0.07 / 1.93", gas: "584859", proving_ms: "3496", txs: [{ label: "claimPenalty", hash: "0x1" }] }],
  };
  assert.deepEqual(factsOf(run), { id: "r1", channel: "0xabc", split: "0.07 / 1.93", gas: "584859", provingMs: "3496", txs: [{ label: "claimPenalty", hash: "0x1" }] });
});

test("factsOf refuses a run that did not finish, or finished without a channel", () => {
  assert.throws(() => factsOf({ id: "r2", scenario: "B-dispute", status: "error", steps: [], channels: [], error: "rpc down" }), /error: rpc down/);
  assert.throws(() => factsOf({ id: "r3", scenario: "B-dispute", status: "done", steps: [], channels: [], result: [{ klien_provider: "0.07 / 1.93", gas: "1", proving_ms: "1", txs: [] }] }));
});

test("rolloverUnits reads the server's own labels", () => {
  const steps = [
    step("16/128 unit epoch 0"),
    step("epoch 0 penuh (MAX_SEQ 128) → rollover: bayar 2,56 USDG, sisa jadi budget epoch 1", "close"),
    step("133/133 unit dilayani (5 di epoch 1)"),
  ];
  assert.deepEqual(rolloverUnits(steps), { units: 133, epochUnits: 128 });
  assert.throws(() => rolloverUnits([step("16/128 unit epoch 0")]));
});
