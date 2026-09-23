// Run header (LAYOUT_SPEC live mode section 1): scenario title, client, status with elapsed time, run id, and the
// next-action menu. Run items are disabled while any run is live: one run at a time, server-wide.
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { ConfigResponse, RunSnapshot } from "@aegis/types";
import { runCopy as copy, runLabel } from "@/copy/en";
import { SCENARIO_IDS, scenarioInfo } from "@/lib/present/scenarios";
import { elapsed, shortHex } from "@/lib/format";
import { StartError } from "@/features/runs/StartError";
import { useLaunch } from "@/features/runs/useLaunch";
import { useAnnounce } from "@/ui/Announcer";
import { Elapsed } from "@/ui/Clock";
import { CopyButton } from "@/ui/Hex";
import { RunStatusMark } from "@/ui/State";
import styles from "./run.module.css";

export function RunHeader({ run, config, reconnecting, channels }: {
  run: RunSnapshot; config: ConfigResponse; reconnecting: boolean; channels: string[];
}) {
  const info = scenarioInfo(run.scenario, config.network);
  // Only the live clock ticks; a finished run shows its fixed duration.
  const clock = run.status === "running" ? <Elapsed since={run.startedAt} /> : run.endedAt ? elapsed(run.endedAt - run.startedAt).slice(0, 7) : undefined;
  return (
    <header className={styles.head}>
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <Link to="/">{copy.crumbDesk}</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{copy.crumb(run.id)}</span>
      </nav>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{info.title}</h1>
        <dl className={styles.headFacts}>
          <div><dt className="sr-only">{copy.clientLabel}</dt><dd>{copy.client(info.client)}</dd></div>
          <div><dt className="sr-only">{copy.statusLabel}</dt><dd><RunStatusMark status={run.status} extra={clock} /></dd></div>
          <div className={styles.runId}><dt className="meta">{copy.runId}</dt><dd><code>{run.id}</code><CopyButton value={run.id} what="run id" /></dd></div>
        </dl>
        <NextActionMenu run={run} channels={channels} />
      </div>
      {reconnecting && <p className={styles.reconnecting} role="status">{copy.reconnecting}</p>}
    </header>
  );
}

function NextActionMenu({ run, channels }: { run: RunSnapshot; channels: string[] }) {
  const launch = useLaunch();
  const announce = useAnnounce();
  const recovery = `${globalThis.location?.origin ?? ""}/runs/${run.id}?leak=1${channels[0] ? `&ch=${channels[0]}` : ""}`;
  const copyRecovery = async () => {
    try {
      await navigator.clipboard.writeText(recovery);
    } catch {
      /* clipboard unavailable: the address bar already holds the same link */
    }
    announce(copy.recoveryCopied);
  };
  // A disclosure that behaves like a menu: Esc closes it and returns focus, a click outside closes it.
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.open = false;
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return (
    <details
      ref={menu}
      className={styles.menu}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !menu.current?.open) return;
        e.preventDefault();
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }}
    >
      <summary className="btn btn--small">{copy.nextAction}</summary>
      <div className={styles.menuBody}>
        <p className={styles.menuTitle}>{copy.runAnother}</p>
        {launch.live && <p className="meta">{copy.nextActionLive}</p>}
        <ul className={styles.menuList}>
          {SCENARIO_IDS.map((id) => (
            <li key={id}>
              <button type="button" className="btn btn--quiet btn--small" disabled={launch.disabled} onClick={() => launch.run(id)}>{runLabel[id]}</button>
            </li>
          ))}
        </ul>
        {launch.error != null && <StartError error={launch.error} scenario={launch.scenario} live={launch.live} />}
        {channels.map((c) => <Link key={c} to={`/channels/${c}`} className={styles.menuLink}>{copy.openRecord(shortHex(c))}</Link>)}
        <button type="button" className="btn btn--quiet btn--small" onClick={copyRecovery}>{copy.copyRecovery}</button>
      </div>
    </details>
  );
}
