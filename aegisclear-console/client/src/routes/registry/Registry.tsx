// /channels (LAYOUT_SPEC; README §6.6): every channel of the deployment's factories in server order (newest first),
// URL filters, 50 rows per page, and no money figures for settled channels (the split lives in the record).
import { memo, useEffect } from "react";
import type { ChannelState, ChannelSummary, ConfigResponse } from "@aegis/types";
import { Link, useLocation, useNavigate } from "react-router";
import { registryCopy as copy, titles } from "@/copy/en";
import { rememberRegistrySearch } from "@/app/lastRegistry";
import { useAppConfig } from "@/app/loaders";
import { useChannels, useRuns } from "@/lib/api/queries";
import { int, relativeTime, shortHex } from "@/lib/format";
import { clientLabel, filterChannels, filtersToSearch, parseRegistryFilters, type RegistryFilters } from "@/lib/present/registry";
import { Amount } from "@/ui/Figures";
import { CopyButton, ExplorerLink } from "@/ui/Hex";
import { Seal } from "@/ui/Seal";
import { ChannelStateMark } from "@/ui/State";
import { Countdown } from "@/ui/Clock";
import { useDocumentTitle } from "@/ui/useDocumentTitle";
import { useNow } from "@/ui/useNow";
import styles from "./Registry.module.css";

const PAGE_SIZE = 50;
const STATES: ChannelState[] = ["OPEN", "CLOSING", "SETTLED"];
const MODES = ["co-signed", "anchored"] as const;
const FACTORIES = ["factory", "factoryProd", "factoryAnchored"] as const;
const CLIENTS = ["A", "B", "other"] as const;

export function Registry() {
  const config = useAppConfig();
  const { search } = useLocation();
  const navigate = useNavigate();
  const filters = parseRegistryFilters(search);
  const { data: runs } = useRuns();
  const runLive = Boolean(runs?.some((r) => r.status === "running"));
  const currentRunId = (runs?.find((r) => r.status === "running") ?? runs?.[0])?.id;
  const query = useChannels({ runLive });
  useDocumentTitle(titles.channels);
  useEffect(() => rememberRegistrySearch(search), [search]);

  // Filter changes replace the history entry and go back to page 1 (LAYOUT_SPEC: shareable, reload-safe).
  const apply = (next: RegistryFilters) => navigate({ search: filtersToSearch({ ...next, page: undefined }) }, { replace: true });
  const active = Boolean(filters.state?.length || filters.mode || filters.factory || filters.client || filters.session);

  const all = query.data?.channels ?? [];
  const shown = filterChannels(all, filters, config);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(filters.page ?? 1, pages);
  const pageRows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{copy.title}</h1>
        <p className="lede">{copy.lede}</p>
        {query.data && (
          <p className={styles.summary}>
            <span className={styles.count}>{copy.count(shown.length, all.length)}</span>
            <ScanAge at={query.data.scannedAt} />
          </p>
        )}
        {query.isError && query.data && <Stale at={query.dataUpdatedAt} />}
      </header>

      <Filters config={config} all={all} filters={filters} active={active} apply={apply} />

      {query.isPending ? (
        <Placeholder />
      ) : !query.data ? (
        <p className={`sheet ${styles.notice}`} role="alert">{copy.error}</p>
      ) : all.length === 0 ? (
        <div className={`sheet ${styles.notice}`}>
          <h2>{copy.empty}</h2>
          <p>{copy.emptyBody}</p>
          <Link to="/" className="btn btn--primary">{copy.emptyAction}</Link>
        </div>
      ) : shown.length === 0 ? (
        <div className={`sheet ${styles.notice}`}>
          <h2>{copy.noMatch}</h2>
          <p>{copy.noMatchBody(all.length)}</p>
          <button type="button" className="btn" onClick={() => apply({})}>{copy.showAll}</button>
        </div>
      ) : (
        <>
          <ChannelTable rows={pageRows} config={config} currentRunId={currentRunId} />
          {pages > 1 && <Pager page={page} pages={pages} filters={filters} />}
        </>
      )}
    </div>
  );
}

function Filters({ config, all, filters, active, apply }: {
  config: ConfigResponse; all: ChannelSummary[]; filters: RegistryFilters; active: boolean; apply: (f: RegistryFilters) => void;
}) {
  const count = (pred: (c: ChannelSummary) => boolean) => all.filter(pred).length;
  const toggleState = (s: ChannelState) => {
    const current = filters.state ?? [];
    apply({ ...filters, state: current.includes(s) ? current.filter((x) => x !== s) : [...current, s] });
  };
  const factories = FACTORIES.filter((f) => f in config.addresses);
  return (
    <form className={`sheet ${styles.filters}`} aria-label={copy.filters} onSubmit={(e) => e.preventDefault()}>
      <fieldset className={styles.group}>
        <legend>{copy.state}</legend>
        {STATES.map((s) => (
          <label key={s} className={styles.check}>
            <input type="checkbox" checked={filters.state?.includes(s) ?? false} onChange={() => toggleState(s)} />
            {copy.stateNames[s]} <span className={styles.optCount}>{count((c) => c.state === s)}</span>
          </label>
        ))}
      </fieldset>
      <label className={styles.select}>
        <span>{copy.mode}</span>
        <select value={filters.mode ?? ""} onChange={(e) => apply({ ...filters, mode: (e.target.value || undefined) as RegistryFilters["mode"] })}>
          <option value="">{copy.any}</option>
          {MODES.map((m) => <option key={m} value={m}>{copy.modeNames[m]} ({count((c) => c.mode === m)})</option>)}
        </select>
      </label>
      {factories.length > 1 && (
        <label className={styles.select}>
          <span>{copy.factory}</span>
          <select value={filters.factory ?? ""} onChange={(e) => apply({ ...filters, factory: (e.target.value || undefined) as RegistryFilters["factory"] })}>
            <option value="">{copy.any}</option>
            {factories.map((f) => <option key={f} value={f}>{copy.factoryNames[f]} ({count((c) => c.factoryName === f)})</option>)}
          </select>
        </label>
      )}
      <label className={styles.select}>
        <span>{copy.client}</span>
        <select value={filters.client ?? ""} onChange={(e) => apply({ ...filters, client: (e.target.value || undefined) as RegistryFilters["client"] })}>
          <option value="">{copy.any}</option>
          {CLIENTS.map((k) => <option key={k} value={k}>{copy.clientNames[k]} ({count((c) => (clientLabel(c.client, config) ?? "other") === k)})</option>)}
        </select>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={filters.session ?? false} onChange={() => apply({ ...filters, session: !filters.session || undefined })} />
        {copy.session} <span className={styles.optCount}>{count((c) => Boolean(c.runId))}</span>
      </label>
      <button type="button" className={`btn btn--quiet btn--small ${styles.clear}`} onClick={() => apply({})} disabled={!active}>{copy.clear}</button>
    </form>
  );
}

/** Only these two lines tick every second, not the table (README §6.2). */
function ScanAge({ at }: { at: number }) {
  const now = useNow();
  return <span className="meta">{copy.scanned(relativeTime(at, now))}</span>;
}

function Stale({ at }: { at: number }) {
  const now = useNow();
  return <p className={styles.stale} role="status">{copy.stale(relativeTime(at, now))}</p>;
}

function ChannelTable({ rows, config, currentRunId }: { rows: ChannelSummary[]; config: ConfigResponse; currentRunId?: string }) {
  const c = copy.columns;
  return (
    <div className={styles.tableWrap}>
      {/* Explicit roles keep table semantics when narrow layouts restyle rows as cards. */}
      <table className={styles.table} role="table">
        <caption className="sr-only">{copy.caption}</caption>
        <colgroup>
          <col className={styles.colChannel} /><col className={styles.colClient} /><col className={styles.colMode} /><col className={styles.colState} />
          <col className={styles.colNum} /><col className={styles.colNum} /><col className={styles.colMoney} /><col className={styles.colMoney} />
          <col className={styles.colMoney} /><col className={styles.colBlock} />
        </colgroup>
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">{c.channel}</th>
            <th role="columnheader" scope="col">{c.client}</th>
            <th role="columnheader" scope="col" data-hide="narrow">{c.mode}</th>
            <th role="columnheader" scope="col">{c.state}</th>
            <th role="columnheader" scope="col" className={styles.num}>{c.seq}</th>
            <th role="columnheader" scope="col" className={styles.num} data-hide="medium">{c.epoch}</th>
            <th role="columnheader" scope="col" className={styles.num}><abbr title={copy.ackedTotal}>{c.a}</abbr></th>
            <th role="columnheader" scope="col" className={styles.num} data-hide="medium"><abbr title={copy.budgetTitle}>{c.budget}</abbr></th>
            <th role="columnheader" scope="col" className={styles.num}><abbr title={copy.proofTitle}>{c.proof}</abbr></th>
            <th role="columnheader" scope="col" className={styles.num} data-hide="medium">{c.opened}</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((ch) => <ChannelRow key={ch.channel} ch={ch} config={config} currentRunId={currentRunId} />)}
        </tbody>
      </table>
    </div>
  );
}

/** Memoised: a poll that changes nothing re-renders no row (TanStack keeps unchanged objects). */
const ChannelRow = memo(function ChannelRow({ ch, config, currentRunId }: { ch: ChannelSummary; config: ConfigResponse; currentRunId?: string }) {
  const label = clientLabel(ch.client, config);
  // An OPEN or CLOSING channel of a demo client makes the server refuse that client's next run (409).
  const blocking = Boolean(label && (ch.state === "OPEN" || ch.state === "CLOSING"));
  const left = ch.state === "CLOSING" ? <Countdown deadline={ch.deadline} /> : undefined;
  return (
    <tr role="row" className={blocking ? styles.blocking : undefined}>
      <th role="rowheader" scope="row" className={styles.channelCell} data-label={copy.columns.channel}>
        <span className={styles.channel}>
          <Seal hash={ch.termsCommitment} size={20} bands={1} />
          <Link to={`/channels/${ch.channel}`} className={styles.channelLink}>
            <span aria-hidden="true">{shortHex(ch.channel)}</span>
            <span className="sr-only">{copy.channelLabel(ch.channel)}</span>
          </Link>
          <CopyButton value={ch.channel} what="channel address" />
          <ExplorerLink base={config.explorerBase} kind="address" value={ch.channel} />
          {ch.runId && (
            <Link to={`/runs/${ch.runId}`} className={styles.tag} aria-label={copy.runTagLabel(ch.runId)}>
              {ch.runId === currentRunId ? copy.thisRunTag : copy.runTag}
            </Link>
          )}
          {ch.factoryName === "factoryProd" && <span className={styles.tag} title={copy.prodTagTitle}>{copy.prodTag}</span>}
        </span>
      </th>
      <td role="cell" data-label={copy.columns.client}>
        {label ? <span className={styles.clientLabel}>{label}</span> : <span className="mono" title={ch.client}>{shortHex(ch.client)}</span>}
        {blocking && label && <span className={styles.blockNote}>{copy.blocks(label)}</span>}
      </td>
      <td role="cell" data-label={copy.columns.mode} data-hide="narrow" className={styles.muted}>{copy.modeNames[ch.mode] ?? ch.mode}</td>
      <td role="cell" data-label={copy.columns.state}><ChannelStateMark state={ch.state} countdown={left} /></td>
      <td role="cell" data-label={copy.columns.seq} className={styles.num}>{int(ch.seq)}</td>
      <td role="cell" data-label={copy.columns.epoch} data-hide="medium" className={styles.num}>{int(ch.epoch)}</td>
      <td role="cell" data-label={copy.columns.a} className={styles.num}>
        {ch.state === "SETTLED"
          ? <Link to={`/channels/${ch.channel}#settlement`} aria-label={copy.splitLabel(ch.channel)}>{copy.splitLink}</Link>
          : <Amount base={ch.cumulativeAmount} unit={false} />}
      </td>
      <td role="cell" data-label={copy.columns.budget} data-hide="medium" className={styles.num}><Amount base={ch.budget} unit={false} /></td>
      <td role="cell" data-label={copy.columns.proof} className={styles.num}>
        {ch.hasProof ? <Amount base={ch.payToClient} unit={false} tone="proof" /> : <span className={styles.muted}>{copy.none}</span>}
      </td>
      <td role="cell" data-label={copy.columns.opened} data-hide="medium" className={`${styles.num} ${styles.muted}`}>{int(ch.openedBlock)}</td>
    </tr>
  );
});

function Pager({ page, pages, filters }: { page: number; pages: number; filters: RegistryFilters }) {
  const to = (n: number) => ({ search: filtersToSearch({ ...filters, page: n === 1 ? undefined : n }) });
  return (
    <nav className={styles.pager} aria-label={copy.pages}>
      {page > 1 ? <Link to={to(page - 1)} className="btn btn--small">{copy.prev}</Link> : <span />}
      <span className="meta">{copy.page(page, pages)}</span>
      {page < pages ? <Link to={to(page + 1)} className="btn btn--small">{copy.next}</Link> : <span />}
    </nav>
  );
}

/** First load only: rows at the real 36 px height, no shimmer (DESIGN_BRIEF §6 restraint). */
function Placeholder() {
  return (
    <div className={`sheet ${styles.placeholder}`} role="status" aria-label={copy.loading}>
      {Array.from({ length: 8 }, (_, i) => <span key={i} />)}
    </div>
  );
}
