// Addresses, hashes and tx hashes (DESIGN_BRIEF §5 hex handling): mono, middle-ellipsised, the full value in the
// accessible name and tooltip, a 24 px copy button, and a Blockscout link only when the network has an explorer.
import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { explorerUrl, shortHex } from "@/lib/format";
import { useAnnounce } from "./Announcer";
import styles from "./Hex.module.css";

export function CopyButton({ value, what }: { value: string; what: string }) {
  const announce = useAnnounce();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard unavailable (insecure context, preview): the value stays selectable on screen */
    }
    setCopied(true);
    announce("Copied");
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button type="button" className="icon-btn" onClick={copy} aria-label={`Copy ${what}`} title={copied ? "Copied" : `Copy ${what}`}>
      {copied ? <Check size={14} strokeWidth={1.5} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.5} aria-hidden="true" />}
    </button>
  );
}

export function ExplorerLink({ base, kind, value }: { base: string | null | undefined; kind: "address" | "tx"; value: string }) {
  const href = explorerUrl(base ?? undefined, kind, value);
  if (!href) return null;
  return (
    <a className="icon-btn" href={href} target="_blank" rel="noopener noreferrer" title="View on Blockscout">
      <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only">View on Blockscout (opens in a new tab)</span>
    </a>
  );
}

export interface HexProps {
  value: string;
  kind?: "address" | "tx" | "hash";
  /** Characters kept on each side: 4 in dense lists, 8 in detail views. Omit with `full` to show everything. */
  keep?: number;
  full?: boolean;
  /** Spoken before the value, e.g. "Terms commitment T". */
  label?: string;
  explorerBase?: string | null;
  copy?: boolean;
}

export function Hex({ value, kind = "hash", keep = 4, full = false, label, explorerBase, copy = true }: HexProps) {
  const what = label ?? (kind === "tx" ? "transaction hash" : kind === "address" ? "address" : "hash");
  return (
    <span className={styles.hex}>
      {full ? (
        <span className={`${styles.value} ${styles.full}`}>
          {label && <span className="sr-only">{label}: </span>}
          {value}
        </span>
      ) : (
        <span className={styles.value} title={value}>
          <span aria-hidden="true">{shortHex(value, keep)}</span>
          <span className="sr-only">{label ? `${label}: ` : ""}{value}</span>
        </span>
      )}
      {copy && <CopyButton value={value} what={what} />}
      {kind !== "hash" && <ExplorerLink base={explorerBase} kind={kind} value={value} />}
    </span>
  );
}
