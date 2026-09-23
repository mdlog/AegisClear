// Event trail (#events, F4): one row per on-chain event with humanised args, block, gas and transaction.
// Anchored channels collapse their acks into one row (slot H2: A per ack is public).
import { Fragment, useState } from "react";
import type { ChannelDetail, ChannelEvent, ConfigResponse } from "@aegis/types";
import { recordCopy as copy } from "@/copy/en";
import { gas, int } from "@/lib/format";
import { clientLabel } from "@/lib/present/registry";
import { Amount } from "@/ui/Figures";
import { Hex } from "@/ui/Hex";
import styles from "./ChannelRecord.module.css";

const AMOUNTS = new Set(["cumulativeAmount", "payToClient", "toProvider", "toClient", "penalty", "remaining"]);
const HASHES = new Set(["termsCommitment", "receiptsRoot", "leaf", "root"]);
const ADDRESSES = new Set(["client", "provider", "by"]);

function Arg({ name, value, config, detail }: { name: string; value: string; config: ConfigResponse; detail: ChannelDetail }) {
  let shown: React.ReactNode = value;
  if (AMOUNTS.has(name)) shown = <Amount base={value} />;
  else if (HASHES.has(name)) shown = <Hex value={value} label={name} />;
  else if (ADDRESSES.has(name)) {
    const label = clientLabel(value, config);
    const who = value.toLowerCase() === detail.provider.toLowerCase() ? copy.argProvider : label ? copy.argClient(label) : undefined;
    shown = <>{who && <span className={styles.who}>{who}</span>}<Hex value={value} kind="address" label={name} explorerBase={config.explorerBase} /></>;
  } else if (name === "deadline") shown = value === "0" ? copy.argNone : copy.argDeadline(new Date(Number(value) * 1000).toISOString().replace("T", " ").slice(0, 19));
  else if (name === "cooperative") shown = value === "true" ? copy.yes : copy.no;
  return (
    <span className={styles.arg}>
      <span className={styles.argName}>{name}</span>
      {shown}
    </span>
  );
}

function EventRow({ index, event, config, detail }: { index: number; event: ChannelEvent; config: ConfigResponse; detail: ChannelDetail }) {
  return (
    <tr>
      <td className={`${styles.num} meta`}>{index}</td>
      <th scope="row" className={styles.eventName}>{event.name}</th>
      <td className={styles.args}>{Object.entries(event.args).map(([k, v]) => <Arg key={k} name={k} value={v} config={config} detail={detail} />)}</td>
      <td className={styles.num}>{int(event.blockNumber)}</td>
      <td className={styles.num}>{gas(event.gasUsed)}</td>
      <td><Hex value={event.txHash} kind="tx" label={`${event.name} transaction`} explorerBase={config.explorerBase} /></td>
    </tr>
  );
}

export function EventTrail({ detail, config }: { detail: ChannelDetail; config: ConfigResponse }) {
  const [acksOpen, setAcksOpen] = useState(false);
  const acks = detail.events.filter((e) => e.name === "Acked");
  const gasOf = acks.map((a) => BigInt(a.gasUsed));
  const min = gasOf.reduce((m, g) => (g < m ? g : m), gasOf[0] ?? 0n);
  const max = gasOf.reduce((m, g) => (g > m ? g : m), 0n);
  let ackGroupShown = false;
  return (
    <section id="events" className={`sheet ${styles.section}`} aria-labelledby="rec-events">
      <h2 id="rec-events">{copy.events}</h2>
      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.trail}`}>
          <caption className="sr-only">{copy.events}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.num}>{copy.eventCols.n}</th><th scope="col">{copy.eventCols.name}</th><th scope="col">{copy.eventCols.args}</th>
              <th scope="col" className={styles.num}>{copy.eventCols.block}</th><th scope="col" className={styles.num}>{copy.eventCols.gas}</th><th scope="col">{copy.eventCols.tx}</th>
            </tr>
          </thead>
          <tbody>
            {detail.events.map((e, i) => {
              if (e.name !== "Acked") return <EventRow key={`${e.txHash}-${i}`} index={i + 1} event={e} config={config} detail={detail} />;
              if (ackGroupShown) return acksOpen ? <EventRow key={`${e.txHash}-${i}`} index={i + 1} event={e} config={config} detail={detail} /> : null;
              ackGroupShown = true;
              return (
                <Fragment key="acks">
                  <tr className={styles.groupRow}>
                    <td className={`${styles.num} meta`}>{i + 1}</td>
                    <th scope="row" className={styles.eventName}>{copy.ackedGroup(acks.length)}</th>
                    <td className={styles.args}>
                      <span>{copy.station.AckedRange(gas(min), gas(max))}</span>
                      <span className="meta">{copy.anchoredNote}</span>
                    </td>
                    <td colSpan={3}>
                      <button type="button" className="btn btn--quiet btn--small" aria-expanded={acksOpen} onClick={() => setAcksOpen((o) => !o)}>
                        {acksOpen ? copy.station.hideAcks : copy.station.showAcks(acks.length)}
                      </button>
                    </td>
                  </tr>
                  {acksOpen && <EventRow index={i + 1} event={e} config={config} detail={detail} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
