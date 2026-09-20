import { randomBytes } from "node:crypto";
import type { StepInput } from "@aegisclear/demo";
import type { Row, RunSnapshot, ScenarioId, SseEvent, Step } from "../shared/types.js";

type Listener = (ev: SseEvent) => void;

/** Run demo di memori proses: satu run aktif, maksimum `max` run tersimpan (yang selesai, tertua dibuang). */
export class RunStore {
  private readonly runs = new Map<string, RunSnapshot>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private activeId?: string;
  constructor(private readonly max = 50) {}
  get busy(): boolean { return this.activeId !== undefined; }
  get active(): RunSnapshot | undefined { return this.activeId ? this.runs.get(this.activeId) : undefined; }

  create(scenario: ScenarioId): RunSnapshot {
    if (this.busy) throw new Error("busy");
    const id = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
    const run: RunSnapshot = { id, scenario, status: "running", startedAt: Date.now(), steps: [], channels: [] };
    this.runs.set(id, run); this.activeId = id;
    for (const old of this.runs.keys()) {
      if (this.runs.size <= this.max) break;
      if (old === this.activeId) continue;
      this.runs.delete(old); this.listeners.delete(old);
    }
    return run;
  }
  emit(id: string, s: StepInput): Step {
    const run = this.must(id);
    const step: Step = { ...s, i: run.steps.length, t: Date.now() - run.startedAt };
    run.steps.push(step);
    if (s.channel && !run.channels.includes(s.channel)) run.channels.push(s.channel);
    this.notify(id, { type: "step", data: step });
    return step;
  }
  finish(id: string, result: Row[]): void {
    const run = this.must(id); run.status = "done"; run.result = result; run.endedAt = Date.now();
    this.release(id); this.notify(id, { type: "done", data: run });
  }
  fail(id: string, error: string): void {
    const run = this.must(id); run.status = "error"; run.error = error; run.endedAt = Date.now();
    this.release(id); this.notify(id, { type: "error", data: run });
  }
  get(id: string): RunSnapshot | undefined { return this.runs.get(id); }
  /** Terbaru dulu, tanpa steps (ringkas). */
  list(): RunSnapshot[] { return [...this.runs.values()].reverse().map((r) => ({ ...r, steps: [] })); }
  /** Replay step yang ada dulu; run yang sudah selesai langsung diakhiri dengan done/error. */
  subscribe(id: string, fn: Listener): () => void {
    const run = this.must(id);
    for (const st of run.steps) fn({ type: "step", data: st });
    if (run.status !== "running") { fn(run.status === "done" ? { type: "done", data: run } : { type: "error", data: run }); return () => {}; }
    let set = this.listeners.get(id);
    if (!set) { set = new Set(); this.listeners.set(id, set); }
    set.add(fn);
    return () => { set!.delete(fn); };
  }
  private must(id: string): RunSnapshot { const r = this.runs.get(id); if (!r) throw new Error(`run ${id} tidak ada`); return r; }
  private release(id: string): void { if (this.activeId === id) this.activeId = undefined; }
  private notify(id: string, ev: SseEvent): void {
    for (const fn of this.listeners.get(id) ?? []) fn(ev);
    if (ev.type !== "step") this.listeners.delete(id);
  }
}
