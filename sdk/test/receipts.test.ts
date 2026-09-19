import { describe, it, expect } from "vitest";
import { ReceiptTree, merkleRoot, leafHash, makeReceipt, MAX_SEQ, EMPTY_LEAF, poseidon } from "../src/core/index.js";

describe("ReceiptTree", () => {
  it("root pohon kosong = hash berlapis dari EMPTY_LEAF", async () => {
    const h = await poseidon();
    let node = EMPTY_LEAF;
    for (let d = 0; d < 7; d++) node = h([node, node]);
    expect(await merkleRoot([])).toBe(node);
  });
  it("append berurutan, root berubah, menolak seq lompat & > MAX_SEQ", async () => {
    const t = new ReceiptTree();
    await t.append(makeReceipt(0, 1n, 300n, 95n, 20_000n));
    const r0 = await t.root();
    await t.append(makeReceipt(1, 1n, 300n, 95n, 20_000n));
    expect(await t.root()).not.toBe(r0);
    await expect(t.append(makeReceipt(5, 1n, 300n, 95n, 20_000n))).rejects.toThrow(/expected seq 2/);
    for (let i = 2; i < MAX_SEQ; i++) await t.append(makeReceipt(i, 1n, 300n, 95n, 20_000n));
    await expect(t.append(makeReceipt(MAX_SEQ, 1n, 300n, 95n, 20_000n))).rejects.toThrow(/seq out of range|MAX_SEQ/);
  });
  it("leafHash deterministik dan sensitif terhadap tiap field", async () => {
    const a = await leafHash(makeReceipt(3, 2n, 300n, 95n, 20_000n));
    expect(await leafHash(makeReceipt(3, 2n, 300n, 95n, 20_000n))).toBe(a);
    expect(await leafHash(makeReceipt(3, 2n, 301n, 95n, 20_000n))).not.toBe(a);
  });
});
