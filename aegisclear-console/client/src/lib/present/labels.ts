// Label adapter: the server's Indonesian step and row text → English (API_CONTRACT §7).
// Pure. Anything unrecognised falls back to the raw server text and reports matched: false.
import type { Row, ScenarioId, Step } from "@aegis/types";
import { escrowFundCopy, rowCopy, scenarioCopy, stepCopy, txCopy } from "../../copy/en";
import { gas, shortHex } from "../format";

export type StepKind = "leg" | "tx" | "narrative" | "wait" | "proof";
export type StepTone = "neutral" | "ok" | "proof" | "caution" | "danger";
export interface PresentedStep { title: string; meta?: string; tone: StepTone; kind: StepKind; matched: boolean }
export interface StepContext { scenario?: ScenarioId; mode?: "co-signed" | "anchored" }

type Groups = Record<string, string>;
interface Rule { re: RegExp; render: (g: Groups, step: Step, ctx: StepContext) => Omit<PresentedStep, "matched"> }

const HEX40 = "0x[0-9a-fA-F]{40}";
const isAnchored = (ctx: StepContext) => ctx.mode === "anchored" || ctx.scenario === "B-anchored-dispute";

// Order matters only where patterns could overlap; every pattern is anchored ^…$.
const RULES: Rule[] = [
  { re: new RegExp(`^▶ (?<scenario>[\\w-]+) — klien (?<client>[AB]) (?<addr>${HEX40})$`),
    render: (g) => ({ title: scenarioCopy[g.scenario as ScenarioId]?.title ?? g.scenario, meta: stepCopy.legMeta(g.client, shortHex(g.addr)), tone: "neutral", kind: "leg" }) },
  { re: /^faucet: mint (?<n>[\d.]+) USDG ke klien (?<client>[AB])$/, render: (g) => ({ title: stepCopy.faucet(g.n, g.client), tone: "neutral", kind: "narrative" }) },
  { re: new RegExp(`^402 diterima: payTo (?<channel>${HEX40}), deposit (?<amt>[\\d.]+) USDG$`),
    render: (g) => ({ title: stepCopy.offer402(g.amt, shortHex(g.channel)), tone: "neutral", kind: "narrative" }) },
  { re: /^provider membuka channel saat ack pertama \(tx provider, lihat kolom channel\)$/, render: () => ({ title: stepCopy.providerOpens, tone: "neutral", kind: "narrative" }) },
  { re: /^(?<k>\d+)\/(?<n>\d+) unit dilayani & di-ack \(checkpoint co-signed\)$/, render: (g) => ({ title: stepCopy.servedCoSigned(g.k, g.n), tone: "ok", kind: "narrative" }) },
  { re: /^(?<k>\d+)\/(?<n>\d+) unit dilayani & di-ack on-chain$/, render: (g) => ({ title: stepCopy.servedOnChain(g.k, g.n), tone: "ok", kind: "narrative" }) },
  { re: /^ack terakhir dikirim \(POST \/ack\)$/, render: () => ({ title: stepCopy.finalAck, tone: "ok", kind: "narrative" }) },
  // L8: the server sends the co-signed wording for anchored runs too; the next tx there is startClose.
  { re: /^sengketa: submit checkpoint co-signed tertinggi, lalu bukti penalti$/,
    render: (_g, _s, ctx) => ({ title: isAnchored(ctx) ? stepCopy.disputeAnchored : stepCopy.disputeCoSigned, tone: "caution", kind: "narrative" }) },
  { re: /^bukti Groth16: payToClient (?<amt>[\d.]+) USDG$/,
    render: (g, step) => {
      const ms = /^(?<ms>\d+) ms proving$/.exec(step.detail ?? "")?.groups?.ms;
      return { title: stepCopy.proof(g.amt), meta: ms ? stepCopy.provedIn((Number(ms) / 1000).toFixed(1)) : step.detail, tone: "proof", kind: "proof" };
    } },
  { re: /^menunggu jendela tantangan: (?<left>\d+) s tersisa$/, render: (g) => ({ title: stepCopy.windowLeft(g.left), tone: "caution", kind: "wait" }) },
  { re: /^Anvil: evm_increaseTime\((?<s>\d+)\) \+ evm_mine$/, render: (g) => ({ title: stepCopy.fastForward(g.s), tone: "caution", kind: "wait" }) },
  { re: /^sudah di-settle oleh watcher provider \(permissionless\) — tanpa tx klien$/, render: () => ({ title: stepCopy.watcherSettled, tone: "ok", kind: "narrative" }) },
  { re: /^settle\(\) klien kalah balapan dengan watcher provider — channel sudah SETTLED$/, render: () => ({ title: stepCopy.watcherRaceLost, tone: "ok", kind: "narrative" }) },
  { re: /^(?<k>\d+)\/(?<max>\d+) unit epoch (?<e>\d+)$/, render: (g) => ({ title: stepCopy.epochServed(g.k, g.max, g.e), tone: "ok", kind: "narrative" }) },
  { re: /^epoch (?<e>\d+) penuh \(MAX_SEQ (?<max>\d+)\) → rollover: bayar (?<amt>[\d.,]+) USDG, sisa jadi budget epoch (?<next>\d+)$/,
    render: (g) => ({ title: stepCopy.epochFull(g.e, g.max, g.amt.replace(",", "."), g.next), tone: "ok", kind: "narrative" }) },
  { re: /^epoch (?<e>\d+) dimulai: seq kembali ke 0, deposit tidak diulang$/, render: (g) => ({ title: stepCopy.epochStarted(g.e), tone: "ok", kind: "narrative" }) },
  { re: /^(?<k>\d+)\/(?<n>\d+) unit dilayani \((?<m>\d+) di epoch (?<e>\d+)\)$/, render: (g) => ({ title: stepCopy.servedAcrossEpochs(g.k, g.n, g.m, g.e), tone: "ok", kind: "narrative" }) },
];

const TX_TONE: Record<string, StepTone> = {
  ack: "ok", settle: "ok", closeCooperative: "ok", rollover: "ok",
  submitCheckpoint: "caution", startClose: "caution", claimPenalty: "proof",
};

export function presentStep(step: Step, ctx: StepContext = {}): PresentedStep {
  if (step.txHash) {
    const meta = step.gasUsed ? stepCopy.gas(gas(step.gasUsed)) : undefined;
    const title = step.label === "fund" && step.phase === "escrow" ? escrowFundCopy : txCopy[step.label];
    return title
      ? { title, meta, tone: TX_TONE[step.label] ?? "neutral", kind: "tx", matched: true }
      : { title: step.label, meta, tone: "neutral", kind: "tx", matched: false };
  }
  for (const rule of RULES) {
    const m = rule.re.exec(step.label);
    if (m) return { ...rule.render((m.groups ?? {}) as Groups, step, ctx), matched: true };
  }
  return { title: step.label, meta: step.detail, tone: "neutral", kind: "narrative", matched: false };
}

const PROOF = /^bukti Groth16: payToClient (?<amt>[\d.]+) USDG$/;

/** The proven refund and the proving time of a `prove` step (API_CONTRACT §7.1 L9), for the Resolution block. */
export function proofFacts(step: Step): { amount?: string; provingMs?: number } {
  const amount = PROOF.exec(step.label)?.groups?.amt;
  if (!amount) return {};
  const ms = /^(?<ms>\d+) ms proving$/.exec(step.detail ?? "")?.groups?.ms;
  return ms ? { amount, provingMs: Number(ms) } : { amount };
}

export interface PresentedRow { market: string; decidedBy: string; visible: string; clientShare: string; providerShare: string; matched: boolean }

export function presentRow(row: Row): PresentedRow {
  const market = rowCopy.market[row.pasar];
  const decidedBy = rowCopy.decidedBy[row.penentu];
  const visible = rowCopy.visible[row.terlihat];
  const [clientShare = row.klien_provider, providerShare = ""] = row.klien_provider.split(" / ");
  return {
    market: market ?? row.pasar, decidedBy: decidedBy ?? row.penentu, visible: visible ?? row.terlihat,
    clientShare, providerShare, matched: Boolean(market && decidedBy && visible),
  };
}
