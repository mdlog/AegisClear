// Channel selectors (API_CONTRACT §4.1). The split of a settled channel comes from its Settled event plus every
// RolledOver event before it; cumulativeAmount can read 0 after a cooperative close or a rollover.
import type { ChannelDetail, ChannelEvent } from "@aegis/types";

type Hex = ChannelEvent["txHash"];

export interface EpochSettlement {
  epoch: number;
  kind: "rollover" | "settled";
  toProvider: bigint;
  /** rollover: the remainder carried into the next epoch */
  carried?: bigint;
  toClient?: bigint;
  penalty?: bigint;
  cooperative?: boolean;
  txHash: Hex;
}
export interface Settlement { toProvider: bigint; toClient: bigint; penalty: bigint; cooperative: boolean; epochs: EpochSettlement[] }

export function settlementOf(detail: ChannelDetail): Settlement | null {
  const settled = detail.events.findLast((e) => e.name === "Settled");
  if (!settled) return null;
  const epochs: EpochSettlement[] = [];
  let epoch = 0;
  for (const e of detail.events) {
    if (e.name !== "RolledOver") continue;
    const next = Number(e.args.newEpoch);
    epochs.push({ epoch: next - 1, kind: "rollover", toProvider: BigInt(e.args.toProvider), carried: BigInt(e.args.remaining), txHash: e.txHash });
    epoch = next;
  }
  const final: EpochSettlement = {
    epoch, kind: "settled", toProvider: BigInt(settled.args.toProvider), toClient: BigInt(settled.args.toClient),
    penalty: BigInt(settled.args.penalty), cooperative: settled.args.cooperative === "true", txHash: settled.txHash,
  };
  epochs.push(final);
  return {
    toProvider: epochs.reduce((sum, x) => sum + x.toProvider, 0n),
    toClient: final.toClient!, penalty: final.penalty!, cooperative: final.cooperative!, epochs,
  };
}

export interface Station {
  kind: string;
  /** > 1 only for the grouped run of consecutive Acked events (anchored mode) */
  count: number;
  gasMin: bigint;
  gasMax: bigint;
  events: ChannelEvent[];
}

/** One station per event, with consecutive Acked events grouped into a single station. Unknown events stay generic. */
export function lifecycleOf(detail: ChannelDetail): Station[] {
  const stations: Station[] = [];
  for (const e of detail.events) {
    const gas = BigInt(e.gasUsed);
    const last = stations.at(-1);
    if (e.name === "Acked" && last?.kind === "Acked") {
      last.count += 1;
      last.gasMin = gas < last.gasMin ? gas : last.gasMin;
      last.gasMax = gas > last.gasMax ? gas : last.gasMax;
      last.events.push(e);
      continue;
    }
    stations.push({ kind: e.name, count: 1, gasMin: gas, gasMax: gas, events: [e] });
  }
  return stations;
}
