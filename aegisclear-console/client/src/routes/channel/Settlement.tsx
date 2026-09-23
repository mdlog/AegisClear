// Settlement card (#settlement, improvement I1): from settlementOf(detail), never from cumulativeAmount. Rolled-over
// channels pay the provider in more than one event, so the card shows every epoch and the totals.
import type { ChannelDetail, ConfigResponse } from "@aegis/types";
import { recordCopy as copy } from "@/copy/en";
import { usdg } from "@/lib/format";
import { settlementOf } from "@/lib/present/channel";
import { Amount } from "@/ui/Figures";
import { Hex } from "@/ui/Hex";
import styles from "./ChannelRecord.module.css";

export function Settlement({ detail, config }: { detail: ChannelDetail; config: ConfigResponse }) {
  const s = settlementOf(detail);
  return (
    <section id="settlement" className={`sheet ${styles.section}`} aria-labelledby="rec-settlement">
      <h2 id="rec-settlement">{copy.settlement}</h2>
      {!s ? (
        <div className={styles.money}>
          <div className={styles.figure}><span className="meta">{copy.inEscrow}</span><strong><Amount base={detail.budget} /></strong><span className="meta">{copy.budget}</span></div>
          <div className={styles.figure}><span className="meta">{copy.aSoFar}</span><strong><Amount base={detail.cumulativeAmount} /></strong></div>
          <p className={styles.moneyNote}>{copy.notSettled}</p>
        </div>
      ) : s.epochs.length > 1 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">{copy.epochsCaption}</caption>
            <thead>
              <tr><th scope="col">{copy.epochCol}</th><th scope="col">{copy.howCol}</th><th scope="col" className={styles.num}>{copy.providerCol}</th><th scope="col" className={styles.num}>{copy.clientCol}</th></tr>
            </thead>
            <tbody>
              {s.epochs.map((e) => (
                <tr key={e.txHash}>
                  <th scope="row">{copy.epochCol} {e.epoch}</th>
                  <td>{e.kind === "rollover" ? copy.rollover : e.cooperative ? copy.cooperativeClose : e.penalty ? copy.disputeClose : copy.settledClose}</td>
                  <td className={styles.num}><Amount base={e.toProvider} /></td>
                  <td className={styles.num}>{e.kind === "rollover" ? copy.carried(usdg(e.carried ?? 0n)) : copy.toClientAmt(usdg(e.toClient ?? 0n))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{copy.totalRow}</th>
                <td colSpan={3}>{copy.totals(usdg(s.toProvider), usdg(s.toClient), usdg(s.toProvider + s.toClient))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className={styles.money}>
          <div className={styles.figure}><span className="meta">{copy.toProvider}</span><strong><Amount base={s.toProvider} tone="engrave" /></strong></div>
          <div className={styles.figure}>
            <span className="meta">{copy.toClient}</span>
            <strong><Amount base={s.toClient} /></strong>
            {s.penalty > 0n && <span className={styles.proofMeta}>{copy.clientSplit(usdg(s.penalty), usdg(s.toClient - s.penalty))}</span>}
          </div>
          {s.penalty > 0n && <div className={styles.figure}><span className="meta">{copy.penalty}</span><strong><Amount base={s.penalty} tone="proof" /></strong></div>}
          <Decision detail={detail} config={config} cooperative={s.cooperative} />
        </div>
      )}
    </section>
  );
}

function Decision({ detail, config, cooperative }: { detail: ChannelDetail; config: ConfigResponse; cooperative: boolean }) {
  const claim = detail.events.find((e) => e.name === "PenaltyClaimed");
  return (
    <div className={styles.moneyNote}>
      {cooperative || !claim ? (
        <p>{copy.decidedSignatures}</p>
      ) : (
        <p className={styles.decision}>
          {detail.mode === "anchored" ? copy.decidedProofAnchored : copy.decidedProof}
          <Hex value={claim.txHash} kind="tx" label={copy.proofTx} explorerBase={config.explorerBase} />
        </p>
      )}
      {detail.cumulativeAmount === "0" && <p className="meta">{copy.aZero}</p>}
    </div>
  );
}
