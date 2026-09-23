// /channels/:address (LAYOUT_SPEC): everything the chain knows about one channel, read from its events, and what it
// does not know. It reads only the chain, so it survives server restarts: the permanent fallback for a verdict.
import type { ChannelDetail, ConfigResponse } from "@aegis/types";
import { Link, useLoaderData } from "react-router";
import { contractRoles, recordCopy as copy, titles } from "@/copy/en";
import { lastRegistryUrl } from "@/app/lastRegistry";
import { useAppConfig, type ChannelData } from "@/app/loaders";
import { ApiError } from "@/lib/api/client";
import { useChannel } from "@/lib/api/queries";
import { relativeTime, shortHex, windowLength } from "@/lib/format";
import { clientLabel } from "@/lib/present/registry";
import { Hex } from "@/ui/Hex";
import { Seal } from "@/ui/Seal";
import { ChannelStateMark } from "@/ui/State";
import { Countdown } from "@/ui/Clock";
import { useDocumentTitle } from "@/ui/useDocumentTitle";
import { useNow } from "@/ui/useNow";
import { useScrollToHash } from "@/ui/useScrollToHash";
import { ChainState } from "./ChainState";
import { EventTrail } from "./EventTrail";
import { Lifecycle } from "./Lifecycle";
import { PrivacyPanel } from "./PrivacyPanel";
import { Settlement } from "./Settlement";
import styles from "./ChannelRecord.module.css";

export function ChannelRecord() {
  const data = useLoaderData() as ChannelData;
  useDocumentTitle(data.kind === "ok" ? titles.channel(shortHex(data.address)) : copy.invalid);
  if (data.kind === "invalid") {
    return (
      <div className={styles.page}>
        <Head />
        <section className={`sheet ${styles.notice}`}>
          <h2>{copy.invalid}</h2>
          <p>{copy.invalidBody}</p>
          <Link to={lastRegistryUrl()}>{copy.toRegistry}</Link>
        </section>
      </div>
    );
  }
  return <Record key={data.address} address={data.address} />;
}

function Head({ address }: { address?: string }) {
  return (
    <header className={styles.head}>
      <nav aria-label={copy.breadcrumb} className={styles.crumbs}>
        <Link to={lastRegistryUrl()}>{copy.crumbChannels}</Link>
        {address && (
          <>
            <span aria-hidden="true">›</span>
            <span className="mono" aria-current="page" title={address}>{shortHex(address)}</span>
          </>
        )}
      </nav>
      <h1>{copy.title}</h1>
      <p className="lede">{copy.lede}</p>
    </header>
  );
}

function Record({ address }: { address: string }) {
  const config = useAppConfig();
  const query = useChannel(address);
  useScrollToHash(Boolean(query.data));

  if (query.isPending) {
    return (
      <div className={styles.page}>
        <Head address={address} />
        <div className={styles.placeholder} role="status" aria-label={copy.loading}><span /><span /><span /></div>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className={styles.page}>
        <Head address={address} />
        <Failure error={query.error} address={address} config={config} />
      </div>
    );
  }
  const detail = query.data;
  return (
    <div className={styles.page}>
      <Head address={address} />
      {query.isError && <Stale at={query.dataUpdatedAt} />}
      <Identity detail={detail} config={config} />
      <Lifecycle detail={detail} config={config} />
      <Settlement detail={detail} config={config} />
      <div className={styles.split}>
        <ChainState detail={detail} config={config} />
        <PrivacyPanel detail={detail} config={config} />
      </div>
      <EventTrail detail={detail} config={config} />
    </div>
  );
}

function Stale({ at }: { at: number }) {
  const now = useNow();
  return <p className={styles.stale} role="status">{copy.stale(relativeTime(at, now))}</p>;
}

function Identity({ detail, config }: { detail: ChannelDetail; config: ConfigResponse }) {
  const label = clientLabel(detail.client, config);
  const window = windowLength(detail.cfg.challengeWindow);
  const factory =
    detail.factoryName === "factoryProd" ? copy.factoryMeaning.factoryProd(window)
    : detail.factoryName === "factoryAnchored" ? copy.factoryMeaning.factoryAnchored(config.network === "testnet")
    : copy.factoryMeaning.factory(window);
  const left = detail.state === "CLOSING" ? <Countdown deadline={detail.deadline} /> : undefined;
  return (
    <section className={`sheet ${styles.identity}`} aria-labelledby="rec-identity">
      <h2 id="rec-identity" className="sr-only">{copy.identity}</h2>
      <Seal hash={detail.termsCommitment} letter="T" size={64} />
      <div className={styles.identityBody}>
        <div className="field">
          <span className="field-label">{copy.address}</span>
          <span className={styles.address}><Hex value={detail.channel} kind="address" full label={copy.address} explorerBase={config.explorerBase} /></span>
        </div>
        <dl className={styles.facts}>
          <div className="field"><dt>{copy.stateLabel}</dt><dd><ChannelStateMark state={detail.state} countdown={left} /></dd></div>
          <div className="field"><dt>{copy.mode}</dt><dd>{copy.modeNames[detail.mode] ?? detail.mode}</dd></div>
          <div className="field"><dt>{copy.factory}</dt><dd>{factory}</dd></div>
          <div className="field"><dt>{copy.epoch}</dt><dd>{detail.epoch}</dd></div>
          <div className="field"><dt>{copy.client}</dt><dd>{label ? copy.clientLabel(label) : copy.otherClient}</dd></div>
          {detail.runId && (
            <div className="field"><dt>{copy.runLabel}</dt><dd><Link to={`/runs/${detail.runId}`}>{copy.createdByRun(detail.runId)}</Link></dd></div>
          )}
        </dl>
      </div>
    </section>
  );
}

function Failure({ error, address, config }: { error: unknown; address: string; config: ConfigResponse }) {
  const role = Object.entries(config.addresses).find(([, a]) => a.toLowerCase() === address.toLowerCase());
  const api = error instanceof ApiError ? error : undefined;
  if (api?.status === 404) {
    return (
      <section className={`sheet ${styles.notice}`} role="alert">
        <p>{api.code === "not-recorded" ? copy.notRecorded : copy.unknown}</p>
        {role && (
          <p>
            {copy.contract(contractRoles[role[0]]?.({ challenge: config.windows.challenge, network: config.network }).name ?? role[0])}{" "}
            <Link to="/deployment">{copy.toDeployment}</Link>
          </p>
        )}
        <Link to="/channels">{copy.toRegistry}</Link>
      </section>
    );
  }
  return <p className={`sheet ${styles.notice}`} role="alert">{copy.rpcDown}</p>;
}
