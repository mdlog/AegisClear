// /runs/:runId, the clearing tape (LAYOUT_SPEC wow-moment hero). One URL, two modes: live (tape first, while the
// SSE stream grows the document) and verdict (the settlement slip first, the tape below as evidence).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { RunSnapshot, Step } from "@aegis/types";
import { followCopy, runCopy as copy, titles } from "@/copy/en";
import { useAppConfig, type RunData } from "@/app/loaders";
import { useShortcut } from "@/app/shortcuts";
import { channelQuery, useApi, useLeakCheck } from "@/lib/api/queries";
import { useRunStream } from "@/lib/api/useRunStream";
import { groupRun } from "@/lib/present/run";
import { presentRow } from "@/lib/present/labels";
import { scenarioInfo } from "@/lib/present/scenarios";
import { useAnnounce } from "@/ui/Announcer";
import { useDocumentTitle } from "@/ui/useDocumentTitle";
import { ContextRail } from "./ContextRail";
import { RunHeader } from "./RunHeader";
import { RunRail } from "./RunRail";
import { StepLog } from "./StepLog";
import { Tape } from "./Tape";
import { useFollowLive } from "./useFollowLive";
import { NextActions, ResultTable, Verdict, verdictLegs } from "./Verdict";
import styles from "./run.module.css";

export function RunView() {
  const data = useLoaderData() as RunData;
  if (data.kind === "ok") return <RunScreen key={data.run.id} initial={data.run} />;
  return <RunNotice data={data} />;
}

function RunNotice({ data }: { data: Exclude<RunData, { kind: "ok" }> }) {
  const [params] = useSearchParams();
  useDocumentTitle(data.kind === "invalid" ? copy.invalidTitle : data.kind === "gone" ? copy.goneTitle : copy.unreachable);
  const ch = params.get("ch");
  return (
    <section className={`sheet ${styles.notice}`} aria-labelledby="run-notice">
      {data.kind === "invalid" && (
        <>
          <h1 id="run-notice">{copy.invalidTitle}</h1>
          <p>{copy.invalidBody}</p>
        </>
      )}
      {data.kind === "gone" && (
        <>
          <h1 id="run-notice">{copy.goneTitle}</h1>
          <p>{copy.goneBody}</p>
          {ch && /^0x[0-9a-fA-F]{40}$/.test(ch) && (
            <p>{copy.goneChannel} <Link to={`/channels/${ch}#settlement`}>{copy.goneChannelLink}</Link></p>
          )}
        </>
      )}
      {data.kind === "unreachable" && <h1 id="run-notice">{copy.unreachable}</h1>}
      <p className={styles.actions}>
        <Link to="/" className="btn btn--primary">{copy.startNew}</Link>
        <Link to="/channels" className="btn">{copy.browse}</Link>
      </p>
    </section>
  );
}

/** Channel addresses in the order the stream first named them (the server's `run.channels` order). */
function channelsOf(steps: Step[], known: string[]): string[] {
  const seen: string[] = [];
  for (const s of steps) if (s.channel && !seen.includes(s.channel)) seen.push(s.channel);
  for (const c of known) if (!seen.includes(c)) seen.push(c);
  return seen;
}

function RunScreen({ initial }: { initial: RunSnapshot }) {
  const config = useAppConfig();
  const api = useApi();
  const announce = useAnnounce();
  const stream = useRunStream(initial);
  const [params, setParams] = useSearchParams();
  const run = useMemo<RunSnapshot>(() => ({ ...stream.run, steps: stream.steps, status: stream.status, error: stream.error }), [stream]);
  const { legs } = useMemo(() => groupRun(run), [run]);
  const channels = useMemo(() => channelsOf(stream.steps, stream.run.channels), [stream.steps, stream.run.channels]);
  const mode = stream.status === "running" ? "live" : stream.status === "done" ? "verdict" : "error";
  useDocumentTitle(titles.run(scenarioInfo(run.scenario, config.network).title, run.id));
  const follow = useFollowLive(mode === "live", stream.steps.length);

  // The address bar is always a complete recovery link: ?ch= is written as soon as a channel is known.
  const firstChannel = channels[0];
  useEffect(() => {
    if (!firstChannel || params.get("ch") === firstChannel) return;
    const next = new URLSearchParams(params);
    next.set("ch", firstChannel);
    setParams(next, { replace: true, preventScrollReset: true });
  }, [firstChannel, params, setParams]);

  // Verdict: one tab per Market-B channel (dispute first). Live: the channel of the leg being played.
  const tabs = verdictLegs(legs, run);
  const [tab, setTab] = useState(0);
  const liveLeg = legs.at(-1);
  const liveChannel = liveLeg?.acts.flatMap((a) => a.steps).find((s) => s.channel)?.channel;
  const focusChannel = mode === "live" ? liveChannel : tabs[Math.min(tab, tabs.length - 1)]?.channel ?? firstChannel;
  const chain = useQuery({ ...channelQuery(api, focusChannel ?? ""), enabled: Boolean(focusChannel) });

  // Leak check: on demand, or at once with ?leak=1 (recovery for video 0:00–0:10 and runbook step 6).
  const [leakAsked, setLeakAsked] = useState(false);
  const leakable = mode === "verdict" && tabs.length > 0;
  const leak = useLeakCheck(run.id, leakable && (leakAsked || params.get("leak") === "1"));
  useShortcut("l", () => setLeakAsked(true), leakable);
  useEffect(() => {
    if (!leak.data) return;
    const leaks = leak.data.reduce((n, c) => n + c.leaks, 0);
    announce(copy.leak.announce(leaks, leak.data.reduce((n, c) => n + c.txs.length, 0)));
  }, [leak.data, announce]);

  // Announce phase changes while live, never every row; move focus to the verdict when the run ends.
  const verdictHeading = useRef<HTMLHeadingElement>(null);
  const seen = useRef(stream.steps.length);
  const wasLive = useRef(stream.status === "running");
  useEffect(() => {
    if (!wasLive.current) return;
    const fresh = stream.steps.slice(seen.current);
    seen.current = stream.steps.length;
    if (fresh.some((s) => s.phase === "prove")) announce(copy.announceProof);
    if (fresh.some((s) => s.phase === "settle")) announce(copy.announceSettled);
  }, [stream.steps, announce]);
  useEffect(() => {
    if (!wasLive.current || stream.status === "running") return;
    wasLive.current = false;
    if (stream.status === "error") return announce(copy.announceError);
    const row = run.result?.find((r) => r.pasar === tabs[0]?.pasar) ?? run.result?.[0];
    if (row) {
      const p = presentRow(row);
      announce(copy.announceDone(p.clientShare, p.providerShare));
    }
    verdictHeading.current?.focus();
  }, [stream.status, run.result, tabs, announce]);

  return (
    <div className={styles.page}>
      <RunHeader run={run} config={config} reconnecting={stream.transport === "reconnecting"} channels={channels} />
      <RunRail legs={legs} run={run} />
      {mode === "error" && (
        <section className={`sheet ${styles.errorBanner}`} role="alert" aria-labelledby="run-error">
          <h2 id="run-error">{copy.errorTitle}</h2>
          <details open>
            <summary>{copy.errorDetails}</summary>
            <pre className={styles.serverText}>{run.error}</pre>
          </details>
          {channels.length > 0 && <p>{copy.errorChannel}</p>}
        </section>
      )}
      {mode === "verdict" ? (
        <>
          <Verdict
            run={run} legs={legs} tabs={tabs} tab={tab} onTab={setTab} config={config} chain={chain.data}
            leak={leak} onLeak={() => setLeakAsked(true)} headingRef={verdictHeading}
          />
          <ResultTable run={run} />
          <section className={styles.evidence} aria-labelledby="evidence-title">
            <h2 id="evidence-title">{copy.evidence}</h2>
            <Tape legs={legs} run={run} mode="verdict" config={config} />
          </section>
          <StepLog run={run} config={config} />
          <NextActions channels={channels} run={run} />
        </>
      ) : (
        <div className={styles.liveGrid}>
          <div className={styles.tapeColumn}>
            {stream.steps.length === 0 && <p className={styles.starting}>{copy.starting}</p>}
            <Tape legs={legs} run={run} mode={mode} config={config} />
            <StepLog run={run} config={config} />
          </div>
          {mode === "live" && <ContextRail legs={legs} run={run} config={config} chain={chain.data} />}
        </div>
      )}
      {mode === "live" && !follow.following && (
        <button type="button" className={`btn btn--primary ${styles.jump}`} onClick={follow.jump}>{followCopy.jump}</button>
      )}
    </div>
  );
}
