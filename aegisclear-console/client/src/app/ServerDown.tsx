// F2 ServerDown gate (LAYOUT_SPEC root-level states): a full-page notice under a wordmark-only header, the two start
// commands, Retry now, and an automatic retry every 3 s. The requested URL never changes, so deep links survive.
import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { SERVE_LOCAL, SERVE_TESTNET, serverDownCopy as copy } from "@/copy/en";
import type { ApiError } from "@/lib/api/client";
import { relativeTime } from "@/lib/format";
import { CopyButton } from "@/ui/Hex";
import { useDocumentTitle } from "@/ui/useDocumentTitle";
import { WithNow } from "@/ui/Clock";
import { Wordmark } from "./AppShell";
import styles from "./ServerDown.module.css";

const RETRY_MS = 3_000;

export function ServerDown({ error }: { error: ApiError }) {
  const { state, revalidate } = useRevalidator();
  const [lastAttempt, setLastAttempt] = useState(() => Date.now());
  useDocumentTitle(copy.title);

  // Re-armed after each attempt: wait 3 s, retry, repeat until the root loader returns the config.
  useEffect(() => {
    if (state !== "idle") return;
    const timer = setTimeout(() => {
      setLastAttempt(Date.now());
      void revalidate();
    }, RETRY_MS);
    return () => clearTimeout(timer);
  }, [state, lastAttempt, revalidate]);

  const retryNow = () => {
    setLastAttempt(Date.now());
    void revalidate();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}><Wordmark /></header>
      <main id="main" className={styles.main}>
        <section className={`sheet ${styles.notice}`} aria-labelledby="server-down-title">
          <h1 id="server-down-title">{copy.title}</h1>
          <p className={styles.body}>{copy.body}</p>
          <dl className={styles.commands}>
            {[{ label: copy.testnet, command: SERVE_TESTNET }, { label: copy.local, command: SERVE_LOCAL }].map((c) => (
              <div key={c.command} className={styles.command}>
                <dt className="meta">{c.label}</dt>
                <dd><code>{c.command}</code><CopyButton value={c.command} what="command" /></dd>
              </div>
            ))}
          </dl>
          <div className={styles.actions}>
            <button type="button" className="btn btn--primary" onClick={retryNow} disabled={state !== "idle"}>
              {state === "idle" ? copy.retry : copy.retrying}
            </button>
            <p className="meta"><WithNow>{(now) => copy.auto(relativeTime(lastAttempt, now))}</WithNow></p>
          </div>
          <p className="meta">{error.status === 0 ? copy.noAnswer : copy.answered(error.status, error.code)}</p>
        </section>
      </main>
    </div>
  );
}
