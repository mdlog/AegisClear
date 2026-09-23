// The record's lifecycle rail (LAYOUT_SPEC LifecycleRail, record feed): one station per event group from
// lifecycleOf(detail), each with its block, gas and transaction, ending on the channel's current state.
import { useState } from "react";
import type { ChannelDetail, ChannelEvent, ConfigResponse } from "@aegis/types";
import { recordCopy as copy } from "@/copy/en";
import { countdown, gas, int, usdg } from "@/lib/format";
import { WithNow } from "@/ui/Clock";
import { lifecycleOf, type Station } from "@/lib/present/channel";
import { Hex } from "@/ui/Hex";
import styles from "./ChannelRecord.module.css";

function title(station: Station): string {
  const e = station.events[0];
  switch (station.kind) {
    case "Opened": return copy.station.Opened;
    case "Acked": return copy.station.Acked(station.count);
    case "CheckpointSubmitted": return copy.station.CheckpointSubmitted;
    case "CloseStarted": return copy.station.CloseStarted;
    case "PenaltyClaimed": return copy.station.PenaltyClaimed;
    case "RolledOver": return copy.station.RolledOver(e.args.newEpoch ?? "");
    case "Settled": return copy.station.Settled;
    default: return station.kind;
  }
}

function meta(station: Station): string | undefined {
  const e = station.events[0];
  switch (station.kind) {
    case "Opened": return copy.station.OpenedMeta;
    case "Acked": return copy.station.AckedRange(gas(station.gasMin), gas(station.gasMax));
    case "CheckpointSubmitted":
    case "CloseStarted": return copy.station.windowStarted;
    case "PenaltyClaimed": return e.args.payToClient ? copy.station.penaltyMeta(usdg(e.args.payToClient)) : undefined;
    case "RolledOver": return copy.station.rolledMeta(usdg(e.args.toProvider ?? "0"), usdg(e.args.remaining ?? "0"));
    case "Settled": return copy.station.settledMeta;
    default: return Object.entries(e.args).map(([k, v]) => `${k} ${v}`).join(", ");
  }
}

export function Lifecycle({ detail, config }: { detail: ChannelDetail; config: ConfigResponse }) {
  const stations = lifecycleOf(detail);
  const onlyOpened = detail.state === "OPEN" && stations.every((s) => s.kind === "Opened");
  return (
    <section className={`sheet ${styles.section}`} aria-labelledby="rec-lifecycle">
      <h2 id="rec-lifecycle">{copy.lifecycle}</h2>
      <ol className={styles.rail}>
        {stations.map((s, i) => <StationItem key={`${s.kind}-${i}`} station={s} config={config} />)}
        {detail.state === "CLOSING" && (
          <WithNow>
            {(now) => {
              const left = detail.deadline - Math.floor(now / 1000);
              return (
                <li className={`${styles.station} ${styles.current}`}>
                  <h3>{left > 0 ? copy.station.closing(`≈ ${countdown(detail.deadline, Math.floor(now / 1000))}`) : copy.station.deadlinePassed}</h3>
                  {left > 0 && <p className="meta">{copy.station.closingMeta}</p>}
                </li>
              );
            }}
          </WithNow>
        )}
        {onlyOpened && (
          <li className={`${styles.station} ${styles.current}`}>
            <h3>{copy.station.open}</h3>
            <p className="meta">{copy.station.openMeta}</p>
          </li>
        )}
      </ol>
    </section>
  );
}

function StationItem({ station, config }: { station: Station; config: ConfigResponse }) {
  const [open, setOpen] = useState(false);
  const e: ChannelEvent = station.events[0];
  const grouped = station.count > 1;
  return (
    <li className={styles.station}>
      <h3>{title(station)}</h3>
      {meta(station) && <p className={station.kind === "PenaltyClaimed" ? styles.proofMeta : "meta"}>{meta(station)}</p>}
      {!grouped && (
        <p className={styles.stationFacts}>
          <span>{copy.block(int(e.blockNumber))}</span>
          <span>{gas(e.gasUsed)} gas</span>
          <Hex value={e.txHash} kind="tx" label={`${title(station)} transaction`} explorerBase={config.explorerBase} />
        </p>
      )}
      {grouped && (
        <>
          <button type="button" className="btn btn--quiet btn--small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? copy.station.hideAcks : copy.station.showAcks(station.count)}
          </button>
          {open && (
            <ol className={styles.ackList}>
              {station.events.map((ack) => (
                <li key={ack.txHash}>
                  <span>seq {ack.args.seq}</span>
                  <span>A {usdg(ack.args.cumulativeAmount ?? "0")}</span>
                  <span>{gas(ack.gasUsed)} gas</span>
                  <Hex value={ack.txHash} kind="tx" label={`Ack seq ${ack.args.seq} transaction`} explorerBase={config.explorerBase} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </li>
  );
}
