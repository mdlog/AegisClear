// On-chain state (F4 key-value block): what the channel contract reports now, with payouts and token named.
import type { ChannelDetail, ConfigResponse } from "@aegis/types";
import { recordCopy as copy } from "@/copy/en";
import { int, usdg, windowLength } from "@/lib/format";
import { Amount } from "@/ui/Figures";
import { Hex } from "@/ui/Hex";
import styles from "./ChannelRecord.module.css";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function ChainState({ detail, config }: { detail: ChannelDetail; config: ConfigResponse }) {
  const k = copy.kv;
  const payoutNote = (payout: string, party: string) =>
    config.addresses.router && same(payout, config.addresses.router) ? k.router : same(payout, party) ? k.samePayout : k.otherPayout;
  const opened = detail.events.find((e) => e.name === "Opened");
  return (
    <section className={`sheet ${styles.section}`} aria-labelledby="rec-state">
      <h2 id="rec-state">{copy.state}</h2>
      <dl className={styles.kv}>
        <div className="field"><dt>{k.seq}</dt><dd>{int(detail.seq)}</dd></div>
        <div className="field"><dt>{k.epoch}</dt><dd>{detail.epoch}</dd></div>
        <div className="field"><dt>{k.a}</dt><dd><Amount base={detail.cumulativeAmount} /><span className={`meta ${styles.block}`}>{k.aNote}</span></dd></div>
        <div className="field"><dt>{k.budget}</dt><dd><Amount base={detail.budget} /></dd></div>
        <div className={`field ${styles.wide}`}><dt>{k.t}</dt><dd><Hex value={detail.termsCommitment} keep={8} label={k.t} /></dd></div>
        <div className={`field ${styles.wide}`}><dt>{k.r}</dt><dd><Hex value={detail.receiptsRoot} keep={8} label={k.r} /></dd></div>
        <div className="field">
          <dt>{k.proof}</dt>
          <dd className={detail.hasProof ? styles.proofValue : undefined}>{detail.hasProof ? k.proofYes(usdg(detail.payToClient)) : k.proofNo}</dd>
        </div>
        <div className="field"><dt>{k.windows}</dt><dd>{k.windowsValue(windowLength(detail.cfg.challengeWindow), windowLength(detail.cfg.responseWindow))}</dd></div>
        <div className={`field ${styles.wide}`}>
          <dt>{k.payoutClient}</dt>
          <dd><Hex value={detail.cfg.payoutClient} kind="address" keep={8} label={k.payoutClient} explorerBase={config.explorerBase} /><span className={`meta ${styles.block}`}>{payoutNote(detail.cfg.payoutClient, detail.cfg.client)}</span></dd>
        </div>
        <div className={`field ${styles.wide}`}>
          <dt>{k.payoutProvider}</dt>
          <dd><Hex value={detail.cfg.payoutProvider} kind="address" keep={8} label={k.payoutProvider} explorerBase={config.explorerBase} /><span className={`meta ${styles.block}`}>{payoutNote(detail.cfg.payoutProvider, detail.cfg.provider)}</span></dd>
        </div>
        <div className={`field ${styles.wide}`}>
          <dt>{k.token}</dt>
          <dd>
            {config.addresses.usdg && same(detail.cfg.token, config.addresses.usdg) && <span className={styles.tokenName}>{k.tokenMock}</span>}
            <Hex value={detail.cfg.token} kind="address" keep={8} label={k.token} explorerBase={config.explorerBase} />
          </dd>
        </div>
        <div className={`field ${styles.wide}`}>
          <dt>{k.opened}</dt>
          <dd>
            <Hex value={detail.openedTx} kind="tx" keep={8} label="Opened transaction" explorerBase={config.explorerBase} />
            <span className={`meta ${styles.block}`}>{k.openedBlock(int(detail.openedBlock))}, {detail.factoryName}{opened ? `, ${int(opened.gasUsed)} gas` : ""}</span>
          </dd>
        </div>
        <div className={`field ${styles.wide}`}><dt>{k.salt}</dt><dd><Hex value={detail.cfg.salt} keep={8} label={k.salt} /></dd></div>
      </dl>
    </section>
  );
}
