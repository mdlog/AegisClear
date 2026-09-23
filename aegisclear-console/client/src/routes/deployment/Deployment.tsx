// /deployment (LAYOUT_SPEC): network, contracts, parties, measured facts, known limits. The config is the only live
// data; static facts and limits come from the copy module, each with its source.
import { Check } from "lucide-react";
import type { ConfigResponse } from "@aegis/types";
import { contractRoles, deploymentCopy as copy, inferenceLine, knownLimits, measuredFacts, sourceLinks, titles } from "@/copy/en";
import { useAppConfig } from "@/app/loaders";
import { int } from "@/lib/format";
import { Amount } from "@/ui/Figures";
import { Hex } from "@/ui/Hex";
import { useDocumentTitle } from "@/ui/useDocumentTitle";
import { useScrollToHash } from "@/ui/useScrollToHash";
import styles from "./Deployment.module.css";

/** The testnet v2 claims are static facts about one deployment, so they never describe another one. */
const isTestnetV2 = (c: ConfigResponse) => c.chainId === 46630 && c.deployBlock === "122028843";
const GROUP_ORDER = ["factories", "settlement", "hashing", "token", "control", "other"] as const;

export function Deployment() {
  const config = useAppConfig();
  useDocumentTitle(titles.deployment);
  useScrollToHash(true);
  const v2 = isTestnetV2(config);
  const local = config.network === "local";

  const contracts = Object.entries(config.addresses).map(([key, address]) => {
    const role = contractRoles[key]?.({ challenge: config.windows.challenge, network: config.network }) ?? { name: key, meaning: "", group: "other" as const };
    return { key, address, ...role };
  });

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{copy.title}</h1>
        <p className="lede">{copy.lede}</p>
      </header>

      <section className={`sheet ${styles.section}`} aria-labelledby="dep-network">
        <h2 id="dep-network">{copy.network}</h2>
        <p className={`${styles.networkName} ${local ? styles.local : ""}`}>
          {local ? copy.localName : copy.testnetName}
          {!local && <span className={styles.chainId}>{copy.chain} {config.chainId}</span>}
        </p>
        <dl className={styles.kv}>
          <div className="field"><dt>{copy.rpc}</dt><dd className="mono">{config.rpcUrl}</dd></div>
          <div className="field">
            <dt>{copy.explorer}</dt>
            <dd>{config.explorerBase ? <a href={config.explorerBase} target="_blank" rel="noopener noreferrer">{config.explorerBase.replace(/^https?:\/\//, "")}</a> : copy.noExplorer}</dd>
          </div>
          <div className="field"><dt>{copy.deployBlock}</dt><dd>{int(config.deployBlock)}</dd></div>
          <div className="field"><dt>{copy.challengeWindow}</dt><dd>{config.windows.challenge} s</dd></div>
          <div className="field"><dt>{copy.responseWindow}</dt><dd>{config.windows.response} s</dd></div>
          <div className="field"><dt>{copy.deposit}</dt><dd><Amount base={config.deposit} /></dd></div>
        </dl>
        {v2 && <p className={styles.verified}><Check size={16} strokeWidth={1.5} aria-hidden="true" />{copy.verified}</p>}
        {local && <p className="meta">{copy.localNote}</p>}
      </section>

      <section className={`sheet ${styles.section}`} aria-labelledby="dep-contracts">
        <h2 id="dep-contracts">{copy.contracts}</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">{copy.contracts}</caption>
            <thead><tr><th scope="col">{copy.role}</th><th scope="col">{copy.address}</th></tr></thead>
            {GROUP_ORDER.map((group) => {
              const rows = contracts.filter((c) => c.group === group);
              if (!rows.length) return null;
              return (
                <tbody key={group}>
                  <tr className={styles.groupRow}><th scope="rowgroup" colSpan={2}>{copy.groups[group]}</th></tr>
                  {rows.map((c) => (
                    <tr key={c.key}>
                      <th scope="row" className={styles.role}>
                        <span className={styles.roleName}>{c.name}</span>
                        {c.meaning && <span className="meta">{c.meaning}</span>}
                      </th>
                      <td><Hex value={c.address} kind="address" full label={`${c.name} address`} explorerBase={config.explorerBase} /></td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      </section>

      <section className={`sheet ${styles.section}`} aria-labelledby="dep-parties">
        <h2 id="dep-parties">{copy.parties}</h2>
        <dl className={styles.parties}>
          <div className="field"><dt>{copy.provider}</dt><dd><Hex value={config.provider} kind="address" full label="Provider address" explorerBase={config.explorerBase} /></dd></div>
          {config.clients.map((c) => (
            <div key={c.label} className="field"><dt>{copy.client(c.label)}</dt><dd><Hex value={c.address} kind="address" full label={`Client ${c.label} address`} explorerBase={config.explorerBase} /></dd></div>
          ))}
        </dl>
        <p className="meta">{copy.keys}</p>
      </section>

      <section className={`sheet ${styles.section}`} aria-labelledby="dep-facts">
        <h2 id="dep-facts">{copy.facts}</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">{copy.facts}</caption>
            <thead><tr><th scope="col">{copy.fact}</th><th scope="col">{copy.value}</th><th scope="col">{copy.source}</th></tr></thead>
            <tbody>
              {measuredFacts.filter((f) => !f.deploymentSpecific || v2).map((f) => (
                <tr key={f.fact}><th scope="row">{f.fact}</th><td>{f.value}</td><td className="meta">{f.source}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="limits" className={`sheet ${styles.section} ${styles.limits}`} aria-labelledby="dep-limits">
        <h2 id="dep-limits">{copy.limits}</h2>
        <ul className={styles.limitList}>{knownLimits.map((l) => <li key={l}>{l}</li>)}</ul>
        <p className="meta">{inferenceLine}</p>
      </section>

      <section className={`sheet ${styles.section}`} aria-labelledby="dep-sources">
        <h2 id="dep-sources">{copy.sources}</h2>
        <ul className={styles.sources}>
          {sourceLinks.map((s) => <li key={s.href}><a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a></li>)}
        </ul>
      </section>
    </div>
  );
}
