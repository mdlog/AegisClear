// Private-versus-chain selectors (PRODUCT_CONTEXT §4, API_CONTRACT §4.1, spec §6.3).
import type { ChannelDetail, ConfigResponse } from "@aegis/types";
import { TOKEN } from "../../copy/en";
import { bps, shortHex, usdg } from "../format";
import { settlementOf } from "./channel";

/** The demo breach schedule applies to every Market-B session, per epoch, by in-epoch seq (API_CONTRACT §4.1). */
export function breachesFor(cfg: ConfigResponse, detail?: ChannelDetail): number[] {
  const all = [...cfg.breaches].sort((a, b) => a - b);
  return detail ? all.filter((seq) => seq < detail.seq) : all;
}

const MAX_SEQ = 128;

/** Every epoch before the current one closed full (a rollover happens at MAX_SEQ), so it held the whole schedule. */
export function breachesByEpoch(cfg: ConfigResponse, detail: ChannelDetail): { epoch: number; seqs: number[] }[] {
  const full = breachesFor(cfg).filter((seq) => seq < MAX_SEQ);
  const earlier = Array.from({ length: detail.epoch }, (_, epoch) => ({ epoch, seqs: full }));
  return [...earlier, { epoch: detail.epoch, seqs: breachesFor(cfg, detail) }];
}

/** payToClient = min(Σ breach · ⌊unitPrice · penaltyBps / 10000⌋, ⌊A · capBps / 10000⌋) with one unit per receipt. */
export function penaltyMath(cfg: ConfigResponse, breachCount: number, ackedTotal: bigint) {
  const perUnit = (BigInt(cfg.terms.unitPrice) * BigInt(cfg.terms.penaltyBps)) / 10_000n;
  const raw = perUnit * BigInt(breachCount);
  const cap = (ackedTotal * BigInt(cfg.terms.capBps)) / 10_000n;
  return { perUnit, raw, cap, payToClient: raw < cap ? raw : cap };
}

export interface MirrorRow { key: string; fact: string; known: string; chain: string }

/** Row-aligned mirror: what only the two parties know, opposite what Robinhood Chain shows. */
const ZERO_ROOT = /^0x0+$/;
const NEVER_SENT = "Never sent: the close was co-signed, so no receipts root was published";

export function privacyMirror(cfg: ConfigResponse, detail: ChannelDetail): MirrorRow[] {
  const anchored = detail.mode === "anchored";
  // A close signed by both parties needs no receipts root: R stays zero and the receipts never reach the chain.
  const noRoot = ZERO_ROOT.test(detail.receiptsRoot);
  const insideR = noRoot ? NEVER_SENT : "Hidden inside R";
  const breaches = breachesFor(cfg, detail);
  const settlement = settlementOf(detail);
  const acked = BigInt(detail.cumulativeAmount);

  let ackedKnown: string;
  let ackedChain: string;
  if (settlement && settlement.epochs.length > 1) {
    ackedKnown = usdg(settlement.toProvider + settlement.penalty);
    ackedChain = settlement.epochs.map((e) => (e.kind === "rollover" ? `${usdg(e.toProvider)} paid at rollover` : `${usdg(e.toProvider)} at close`)).join(", ");
  } else if (acked > 0n) {
    ackedKnown = usdg(acked);
    ackedChain = `A ${usdg(acked)}`;
  } else if (settlement) {
    ackedKnown = usdg(settlement.toProvider + settlement.penalty);
    ackedChain = `${usdg(settlement.toProvider)} paid at close (A reads 0.00 on-chain)`;
  } else {
    ackedKnown = usdg(0n);
    ackedChain = "A 0.00";
  }
  const proven = penaltyMath(cfg, breaches.length, acked).payToClient;

  return [
    { key: "unitPrice", fact: "Unit price", known: `${usdg(cfg.terms.unitPrice)} ${TOKEN} per unit`, chain: anchored ? "Implied by A per ack (public)" : "Hidden inside T" },
    { key: "thresholds", fact: "Latency ceiling and quality floor", known: `Latency ≤ ${cfg.terms.maxM1} ms, quality ≥ ${cfg.terms.minM2}`, chain: "Hidden inside T" },
    { key: "penalty", fact: "Penalty and cap", known: `${bps(cfg.terms.penaltyBps)} of the unit price per breaching unit, capped at ${bps(cfg.terms.capBps)} of A`, chain: "Hidden inside T" },
    { key: "nonce", fact: "Session nonce", known: "Known to both parties (never sent to the console)", chain: "Hidden inside T" },
    { key: "receipts", fact: "Per-unit latency, quality and amount due", known: `${detail.seq} ${anchored ? "leaves, acked on-chain" : "co-signed receipts"}`, chain: anchored ? "Leaf hash and A per ack are public; the metrics stay inside the leaf" : insideR },
    { key: "breaches", fact: "Breaching units", known: breachesKnown(cfg, detail), chain: insideR },
    detail.epoch > 0
      ? { key: "units", fact: "Units served", known: `${detail.epoch * MAX_SEQ + detail.seq} (${[...Array.from({ length: detail.epoch }, (_, e) => `${MAX_SEQ} in epoch ${e}`), `${detail.seq} in epoch ${detail.epoch}`].join(", ")})`,
          chain: `seq ${detail.seq} in epoch ${detail.epoch}; ${detail.epoch === 1 ? "epoch 0 closed" : `epochs 0 to ${detail.epoch - 1} each closed`} at ${MAX_SEQ}` }
      : { key: "units", fact: "Units served", known: String(detail.seq), chain: `seq ${detail.seq}` },
    { key: "ackedTotal", fact: "Acked total", known: `${ackedKnown} ${TOKEN}`, chain: ackedChain },
    { key: "refund", fact: "Proven refund", known: detail.hasProof ? `${usdg(proven)} ${TOKEN}` : "Not disputed", chain: detail.hasProof ? `payToClient ${usdg(detail.payToClient)}` : "No proof (closed by signatures)" },
    { key: "split", fact: "Final split", known: settlement ? `${usdg(settlement.toProvider)} to the provider, ${usdg(settlement.toClient)} to the client` : "Not settled yet",
      chain: settlement ? `Settled: ${usdg(settlement.toProvider)} to the provider, ${usdg(settlement.toClient)} to the client` : `In escrow: ${usdg(detail.budget)}` },
    { key: "epoch", fact: "Epoch", known: String(detail.epoch), chain: `epoch ${detail.epoch} (public)` },
    { key: "commitments", fact: "Commitments", known: "Their contents", chain: `T ${shortHex(detail.termsCommitment)}, R ${noRoot ? "none" : shortHex(detail.receiptsRoot)}` },
  ];
}

function breachesKnown(cfg: ConfigResponse, detail: ChannelDetail): string {
  const list = (seqs: number[]) => (seqs.length ? `seq ${seqs.join(", ")}` : "none");
  if (detail.epoch === 0) {
    const seqs = breachesFor(cfg, detail);
    return seqs.length ? list(seqs) : "None";
  }
  return breachesByEpoch(cfg, detail).map((e) => `Epoch ${e.epoch}: ${list(e.seqs)}`).join(". ");
}

