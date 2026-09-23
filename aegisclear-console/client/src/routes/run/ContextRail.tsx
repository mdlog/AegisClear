// Context rail (LAYOUT_SPEC live mode section 4): follows the act being played. Fund shows the offer being funded;
// Serve shows what the chain has seen so far; Resolve shows what the chain holds now, polled every 5 s until settled.
import { Link } from "react-router";
import type { ChannelDetail, ConfigResponse, RunSnapshot } from "@aegis/types";
import { runCopy as copy } from "@/copy/en";
import { usdg } from "@/lib/format";
import { settlementOf } from "@/lib/present/channel";
import type { Leg } from "@/lib/present/run";
import { Countdown } from "@/ui/Clock";
import { Amount } from "@/ui/Figures";
import { Hex } from "@/ui/Hex";
import { ChannelStateMark } from "@/ui/State";
import styles from "./run.module.css";

export function ContextRail({ legs, config, chain }: {
  legs: Leg[]; run: RunSnapshot; config: ConfigResponse; chain?: ChannelDetail;
}) {
  const leg = legs.at(-1);
  const act = leg?.acts.at(-1);
  const steps = leg?.acts.flatMap((a) => a.steps) ?? [];
  const channel = steps.find((s) => s.channel)?.channel;
  const clientTx = steps.filter((s) => s.txHash).length;
  const served = Math.max(0, ...steps.map((s) => s.progress?.done ?? 0), steps.filter((s) => s.txHash && s.label === "ack").length);

  let body: React.ReactNode;
  if (!act || act.kind === "fund" || act.kind === "escrow") {
    body = (
      <>
        <h2 className={styles.contextTitle}>{copy.context.offerTitle}</h2>
        {channel && <p><Hex value={channel} kind="address" keep={6} label="payTo" /></p>}
        <p className="meta">{copy.context.payTo}</p>
        <dl className={styles.contextFacts}><div><dt>{copy.context.deposit}</dt><dd><Amount base={config.deposit} /></dd></div></dl>
        {leg?.client && <Link to={`/offer?client=${leg.client}`}>{copy.context.offerLink}</Link>}
      </>
    );
  } else if (act.kind === "service") {
    body = (
      <>
        <h2 className={styles.contextTitle}>{copy.context.seenTitle}</h2>
        <dl className={styles.contextFacts}>
          <div><dt>{copy.context.clientTx}</dt><dd>{clientTx}</dd></div>
          <div><dt>{copy.context.served}</dt><dd>{served}</dd></div>
        </dl>
        <p className="meta">{copy.context.providerOpen}</p>
      </>
    );
  } else {
    const settled = chain ? settlementOf(chain) : null;
    body = (
      <>
        <h2 className={styles.contextTitle}>{copy.context.chainTitle}</h2>
        {!chain ? (
          <p className="meta">{copy.context.reading}</p>
        ) : (
          <dl className={styles.contextFacts}>
            <div><dt>{copy.context.state}</dt><dd><ChannelStateMark state={chain.state} countdown={chain.state === "CLOSING" ? <Countdown deadline={chain.deadline} /> : undefined} /></dd></div>
            <div><dt>T</dt><dd><Hex value={chain.termsCommitment} label="Terms commitment T" /></dd></div>
            <div><dt>R</dt><dd><Hex value={chain.receiptsRoot} label="Receipts root R" /></dd></div>
            <div><dt>seq</dt><dd>{chain.seq}</dd></div>
            <div><dt>A</dt><dd><Amount base={chain.cumulativeAmount} /></dd></div>
            <div><dt>payToClient</dt><dd className={chain.hasProof ? styles.proofValue : undefined}>{chain.hasProof ? `${usdg(chain.payToClient)} MockUSDG` : "0.00"}</dd></div>
            {settled && <div><dt>{copy.context.settled}</dt><dd>{usdg(settled.toProvider)} / {usdg(settled.toClient)}</dd></div>}
          </dl>
        )}
        <p className="meta">{copy.context.polled}</p>
      </>
    );
  }
  return <aside className={`sheet ${styles.context}`} aria-label={copy.context.chainTitle}>{body}</aside>;
}
