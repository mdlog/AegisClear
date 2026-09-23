// Privacy panel (F10 per channel, the mirror's panel variant): what this channel shows on-chain against what stays
// with the two parties. Private values appear only for the demo clients, whose terms the console knows.
import { Link } from "react-router";
import type { ChannelDetail, ConfigResponse } from "@aegis/types";
import { inferenceLine, recordCopy as copy } from "@/copy/en";
import { privacyMirror } from "@/lib/present/privacy";
import { clientLabel } from "@/lib/present/registry";
import styles from "./ChannelRecord.module.css";

export function PrivacyPanel({ detail, config }: { detail: ChannelDetail; config: ConfigResponse }) {
  const demo = Boolean(clientLabel(detail.client, config));
  const rows = privacyMirror(config, detail);
  return (
    <section className={`sheet ${styles.section}`} aria-labelledby="rec-privacy">
      <h2 id="rec-privacy">{copy.privacy}</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.caption}>{demo ? copy.demoTerms : copy.privateOnly}</caption>
          <thead>
            <tr><th scope="col">{copy.factCol}</th><th scope="col">{copy.privateCol}</th><th scope="col">{copy.visibleCol}</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.fact}</th>
                <td className={demo ? styles.privateValue : "meta"}>{demo ? r.known : copy.privateCol}</td>
                <td>{r.chain}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail.mode === "anchored" && <p className={styles.caveat}>{copy.anchoredCaveat}</p>}
      <p className="meta">{inferenceLine}</p>
      <p>
        {detail.runId ? <Link to={`/runs/${detail.runId}?leak=1`}>{copy.leakFromRun}</Link> : <span className="meta">{copy.leakNeedsRun}</span>}
      </p>
    </section>
  );
}
