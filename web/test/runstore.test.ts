import { describe, it, expect } from "vitest";
import { RunStore } from "../server/runs.js";
import type { SseEvent } from "../shared/types.js";

const CH = "0x0000000000000000000000000000000000000abc" as const;

describe("RunStore", () => {
  it("satu run aktif; step diberi nomor & waktu; channel dikumpulkan", () => {
    const s = new RunStore();
    const r = s.create("B-cooperative");
    expect(s.busy).toBe(true); expect(s.active?.id).toBe(r.id);
    expect(() => s.create("A-reject")).toThrow(/busy/);
    const st = s.emit(r.id, { phase: "fund", label: "x", channel: CH });
    expect(st.i).toBe(0); expect(st.t).toBeGreaterThanOrEqual(0);
    expect(s.emit(r.id, { phase: "serve", label: "y" }).i).toBe(1);
    expect(s.get(r.id)!.channels).toEqual([CH]);
    s.finish(r.id, []);
    expect(s.busy).toBe(false); expect(s.get(r.id)!.status).toBe("done"); expect(s.get(r.id)!.endedAt).toBeDefined();
  });
  it("subscribe: replay step lama, lalu live, lalu done; pelanggan telat dapat replay + done", () => {
    const s = new RunStore(); const r = s.create("B-dispute");
    s.emit(r.id, { phase: "fund", label: "a" });
    const got: SseEvent[] = []; const unsub = s.subscribe(r.id, (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["step"]);
    s.emit(r.id, { phase: "serve", label: "b" }); s.finish(r.id, [{ pasar: "p", klien_provider: "k", penentu: "x", terlihat: "y", gas: "1", proving_ms: "-", txs: [] }]);
    expect(got.map((e) => e.type)).toEqual(["step", "step", "done"]);
    unsub();
    const late: SseEvent[] = []; s.subscribe(r.id, (e) => late.push(e));
    expect(late.map((e) => e.type)).toEqual(["step", "step", "done"]);
    expect((late[2] as any).data.result[0].pasar).toBe("p");
  });
  it("fail → error event; unsubscribe menghentikan notifikasi", () => {
    const s = new RunStore(); const r = s.create("all");
    const got: SseEvent[] = []; const unsub = s.subscribe(r.id, (e) => got.push(e)); unsub();
    s.emit(r.id, { phase: "fund", label: "a" }); s.fail(r.id, "boom");
    expect(got).toEqual([]); expect(s.get(r.id)!.status).toBe("error"); expect(s.get(r.id)!.error).toBe("boom"); expect(s.busy).toBe(false);
  });
  it("kapasitas: run tertua (yang sudah selesai) dibuang; list() terbaru dulu tanpa steps", () => {
    const s = new RunStore(3); const ids: string[] = [];
    for (let i = 0; i < 5; i++) { const r = s.create("A-complete"); ids.push(r.id); s.emit(r.id, { phase: "escrow", label: String(i) }); s.finish(r.id, []); }
    expect(s.get(ids[0])).toBeUndefined(); expect(s.get(ids[1])).toBeUndefined(); expect(s.get(ids[4])).toBeDefined();
    const l = s.list(); expect(l.length).toBe(3); expect(l[0].id).toBe(ids[4]); expect(l[0].steps).toEqual([]);
  });
});
