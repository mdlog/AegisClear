// The settlement slip (DESIGN_BRIEF §5 and §7; README §1.1 C1): the one component with display type and ornament.
// Stub (what only the two parties hold) | perforation (where the leak check stamps) | chain half (what Robinhood
// Chain shows). Rows stay aligned across the perforation; the private rows are sealed into T and R on the chain side.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { ChannelDetail, ConfigResponse, LeakResponse, Row } from "@aegis/types";
import { inferenceLine, recordCopy, runCopy } from "@/copy/en";
import { bps, gas, int, parseUsdg, usdg } from "@/lib/format";
import { settlementOf } from "@/lib/present/channel";
import { presentRow } from "@/lib/present/labels";
import { breachesFor, penaltyMath, privacyMirror, type MirrorRow } from "@/lib/present/privacy";
import { HatchBar, SplitBar } from "@/ui/Bars";
import { Hex } from "@/ui/Hex";
import { Seal } from "@/ui/Seal";
import styles from "./slip.module.css";

const copy = runCopy.slip;
const leakCopy = runCopy.leak;

export interface LeakState {
  data?: LeakResponse;
  pending: boolean;
  failed: boolean;
  applicable: boolean;
  ask: () => void;
}

export interface ControlLinks { complete?: string; reject?: string; canRun: boolean; run: () => void }

export function Slip({ row, detail, config, leak, control, anchored }: {
  row?: Row; detail?: ChannelDetail; config: ConfigResponse; leak: LeakState; control: ControlLinks; anchored: boolean;
}) {
  const shares = row ? presentRow(row) : undefined;
  const client = shares ? parseUsdg(shares.clientShare) ?? 0n : 0n;
  const provider = shares ? parseUsdg(shares.providerShare) ?? 0n : 0n;
  const acked = client + provider;
  const settlement = detail ? settlementOf(detail) : null;
  const mirror = detail ? orderMirror(privacyMirror(config, detail)) : [];
  const hidden = mirror.filter((r) => r.chain.startsWith("Hidden inside"));
  const disputed = Boolean(detail?.hasProof);
  const scanned = scanRows(mirror, anchored);
  const clean = leak.data && leak.data.leaks === 0 && leak.data.ambiguous === 0;

  // The leak scan plays once, when a real response arrives in this view (DESIGN_BRIEF §6); never simulated.
  const [scanning, setScanning] = useState(false);
  const hadData = useRef(Boolean(leak.data));
  useEffect(() => {
    if (leak.data && !hadData.current) setScanning(true);
    hadData.current = Boolean(leak.data);
  }, [leak.data]);

  const firstRow = 3; // grid rows: 1 heads, 2 top block, then one per mirror row, then the foot
  const footRow = firstRow + Math.max(mirror.length, 1);
  return (
    <div
      className={`${styles.slip} ${scanning ? styles.scanning : ""}`} data-disputed={disputed || undefined}
      style={{ gridTemplateRows: `auto auto repeat(${Math.max(mirror.length, 1)}, minmax(28px, auto)) auto` }}
    >
      <span className={styles.stubBg} aria-hidden="true" />
      <p className={styles.stubHead}>{copy.stub}</p>
      <p className={styles.chainHead}>{config.network === "local" ? copy.chainLocal : copy.chain}</p>

      <div className={styles.stubTop}>
        <Why detail={detail} config={config} disputed={disputed} />
      </div>

      <div className={styles.chainTop}>
        <div className={styles.split}>
          <div className={styles.numerals}>
            <p className={styles.figure}>
              <span className={styles.figureLabel}>{copy.client}</span>
              <span data-figure="client" className={styles.clientFigure}>{shares?.clientShare ?? "…"}</span>
            </p>
            <p className={styles.figure}>
              <span className={styles.figureLabel}>{copy.provider}</span>
              <span data-figure="provider" className={styles.providerFigure}>{shares?.providerShare ?? "…"}</span>
            </p>
            <p className={styles.unit}>MockUSDG</p>
          </div>
          <div className={styles.bar}>
            <SplitBar client={client} provider={provider} height={14} label={copy.barLabel(usdg(acked), shares?.providerShare ?? "", shares?.clientShare ?? "")} />
            <p className={styles.barLabels}>
              <span>{copy.acked(usdg(acked))}</span>
              {acked > 0n && <span>{copy.provider} {pct(provider, acked)}, {copy.client.toLowerCase()} {pct(client, acked)}</span>}
            </p>
          </div>
          <Binary control={control} />
        </div>
        <LeakFigures leak={leak} anchored={anchored} />
        {settlement && <p className={styles.deposit}>{depositLine(config, settlement)}</p>}
        {shares && row && (
          <dl className={styles.facts}>
            <div><dt>{copy.decidedBy}</dt><dd>{shares.decidedBy}</dd></div>
            <div><dt>{copy.proving}</dt><dd>{row.proving_ms === "-" ? runCopy.na : `${(Number(row.proving_ms) / 1000).toFixed(1)} s`}</dd></div>
            <div><dt>{copy.gas}</dt><dd>{gas(row.gas)}</dd></div>
          </dl>
        )}
      </div>

      <div className={styles.perf} aria-hidden="true" style={{ gridRow: "1 / -1" }} />

      {mirror.length === 0 ? (
        <p className={styles.reading} style={{ gridRow: firstRow }}>{runCopy.context.reading}</p>
      ) : (
        <div role="table" aria-label={copy.mirrorLabel} className={styles.mirror}>
          <div role="row" className={styles.srOnlyRow}>
            <span role="columnheader">{copy.factCol}</span><span role="columnheader">{copy.stub}</span><span role="columnheader">{copy.chain}</span>
          </div>
          {mirror.map((r, i) => {
            const gridRow = firstRow + i;
            const isHidden = hidden.includes(r);
            const scan = scanned.includes(r.key);
            return (
              <div role="row" key={r.key} className={styles.mirrorRow}>
                <span role="rowheader" className={styles.fact} style={{ gridRow }}>{r.fact}</span>
                <span role="cell" className={styles.private} style={{ gridRow, "--i": i } as React.CSSProperties}>
                  {r.known}
                  {r.key === "unitPrice" && anchored && <span className={styles.privateNote}>{copy.anchoredPrice}</span>}
                  {scan && clean && <span className="sr-only">. {copy.notFound(leak.data!.txs.length)}</span>}
                </span>
                {scan && clean && <span className={styles.mark} style={{ gridRow, "--i": i } as React.CSSProperties} title={copy.notFound(leak.data!.txs.length)} aria-hidden="true" />}
                <span role="cell" className={isHidden ? `${styles.chainCell} sr-only` : styles.chainCell} style={isHidden ? undefined : { gridRow }}>
                  {isHidden ? (r.chain.includes("inside R") ? copy.hiddenR : copy.hiddenT) : r.chain}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {detail && hidden.length > 0 && (
        <div className={styles.seals} aria-hidden="true" style={{ gridRow: `${firstRow} / span ${hidden.length}` }}>
          <div className={styles.sealPair}>
            <SealBlock hash={detail.termsCommitment} letter="T" label={copy.hiddenT} />
            {!/^0x0+$/.test(detail.receiptsRoot) && <SealBlock hash={detail.receiptsRoot} letter="R" label={copy.hiddenR} />}
          </div>
          <p className={styles.sealCaption}>{copy.sealCaption}</p>
        </div>
      )}

      {scanning && <span className={styles.scanRule} aria-hidden="true" style={{ gridRow: `${firstRow} / ${footRow}` }} />}

      <p className={styles.stubFoot} style={{ gridRow: footRow }}>{copy.nonce}</p>
      <div className={styles.chainFoot} style={{ gridRow: footRow }}>
        {anchored && <p className={styles.caveat}>{recordCopy.anchoredCaveat}</p>}
        <p>{inferenceLine}</p>
      </div>
    </div>
  );
}

/** The hidden rows first (so the seals can span them), then what the chain shows in the clear. */
function orderMirror(rows: MirrorRow[]): MirrorRow[] {
  const shown = rows.filter((r) => r.key !== "commitments" && (r.key !== "epoch" || !r.chain.startsWith("epoch 0")));
  return [...shown.filter((r) => r.chain.startsWith("Hidden inside")), ...shown.filter((r) => !r.chain.startsWith("Hidden inside"))];
}

/** Rows whose private values the leak check scans (API_CONTRACT §4.1): the price only when it is not public. */
function scanRows(rows: MirrorRow[], anchored: boolean): string[] {
  const keys = ["thresholds", "penalty", "nonce", "receipts", "breaches"];
  if (!anchored) keys.push("unitPrice");
  return rows.filter((r) => keys.includes(r.key)).map((r) => r.key);
}

const pct = (part: bigint, whole: bigint) => `${(Number((part * 10_000n) / whole) / 100).toFixed(1)} %`;

function depositLine(config: ConfigResponse, s: NonNullable<ReturnType<typeof settlementOf>>) {
  const deposit = usdg(config.deposit);
  if (s.penalty > 0n) return copy.deposit(deposit, usdg(s.toProvider), usdg(s.toClient), usdg(s.penalty), usdg(s.toClient - s.penalty));
  return copy.depositSigned(deposit, usdg(s.toProvider), usdg(s.toClient));
}

function Why({ detail, config, disputed }: { detail?: ChannelDetail; config: ConfigResponse; disputed: boolean }) {
  if (!detail) return <p className={styles.reading}>{runCopy.context.reading}</p>;
  if (!disputed) return <p className={styles.whyQuiet}>{copy.notDisputed}</p>;
  const breaches = breachesFor(config, detail).length;
  const m = penaltyMath(config, breaches, BigInt(detail.cumulativeAmount));
  // The chain is authoritative: if the private computation disagrees with payToClient, say nothing.
  if (m.payToClient !== BigInt(detail.payToClient)) return null;
  return (
    <div className={styles.why}>
      <p className={styles.whyLabel}>{copy.why} {usdg(m.payToClient)}</p>
      <p className={styles.whyLine}>{copy.whyLine(breaches, bps(config.terms.penaltyBps), usdg(config.terms.unitPrice), usdg(m.raw), bps(config.terms.capBps), usdg(m.cap), m.raw >= m.cap)}</p>
      <p className={styles.whyCaption}>{copy.whyCaption}</p>
    </div>
  );
}

function Binary({ control }: { control: ControlLinks }) {
  return (
    <div className={styles.binary}>
      <p className={styles.binaryCaption}>{copy.binary}</p>
      <div className={styles.binaryBars}>
        <div className={styles.binaryBar}>
          <span>{copy.complete}</span>
          <HatchBar height={8} />
          {control.complete && <Link to={`/runs/${control.complete}`}>{copy.seenLive}</Link>}
        </div>
        <div className={styles.binaryBar}>
          <span>{copy.reject}</span>
          <HatchBar height={8} />
          {control.reject && <Link to={`/runs/${control.reject}`}>{copy.seenLive}</Link>}
        </div>
      </div>
      {!control.complete && !control.reject && control.canRun && (
        <button type="button" className="btn btn--quiet btn--small" onClick={control.run}>{copy.runControl}</button>
      )}
    </div>
  );
}

function SealBlock({ hash, letter, label }: { hash: string; letter: "T" | "R"; label: string }) {
  return (
    <figure className={styles.sealBlock}>
      <Seal hash={hash} letter={letter} size={96} />
      <figcaption>
        <span className={styles.sealLabel}>{label}</span>
        <Hex value={hash} keep={6} label={label} copy={false} />
      </figcaption>
    </figure>
  );
}

function LeakFigures({ leak, anchored }: { leak: LeakState; anchored: boolean }) {
  if (!leak.applicable) return null;
  if (leak.data) {
    const d = leak.data;
    return (
      <div className={styles.leak}>
        <div role="group" aria-label="Leak check" className={styles.leakFigures}>
          <dl>
            <div className={styles.leakMain}><dt>{leakCopy.leaks}</dt><dd className={d.leaks ? styles.bad : undefined}>{d.leaks}</dd></div>
            <div><dt>{leakCopy.ambiguous}</dt><dd className={d.ambiguous ? styles.warn : undefined}>{d.ambiguous}</dd></div>
            <div><dt>{leakCopy.scanned}</dt><dd>{int(d.txs.length)}</dd></div>
          </dl>
        </div>
        {d.leaks === 0 && d.ambiguous === 0 ? <p className={styles.leakNote}>{leakCopy.none}</p> : (
          <ul className={styles.leakDetails}>
            {d.details.map((x, i) => <li key={i} className={x.kind === "leak" ? styles.bad : styles.warn}>{leakCopy.found}: {x.word} ({x.kind}) <Hex value={x.txHash} kind="tx" label="Transaction" /></li>)}
          </ul>
        )}
        {anchored && <p className={styles.leakNote}>{leakCopy.anchored}</p>}
        <details className={styles.leakTxs}>
          <summary>{leakCopy.txs}</summary>
          <ol>{d.txs.map((tx) => <li key={tx}><Hex value={tx} kind="tx" label="Scanned transaction" /></li>)}</ol>
        </details>
      </div>
    );
  }
  if (leak.pending) return <div className={styles.leak}><p className={styles.leakNote} role="status">{leakCopy.pending}</p></div>;
  return (
    <div className={styles.leak}>
      {leak.failed && <p className={styles.bad} role="alert">{leakCopy.failed}</p>}
      <p className={styles.leakNote}>{leakCopy.idle}</p>
      <button type="button" className="btn btn--primary" onClick={leak.ask}>{leak.failed ? leakCopy.retry : leakCopy.action}</button>
    </div>
  );
}
