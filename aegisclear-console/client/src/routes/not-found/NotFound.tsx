// `*`: recover from a mistyped URL in one click (LAYOUT_SPEC). Every extension-less path reaches the SPA.
import { Link, useLocation } from "react-router";
import { notFoundCopy as copy, shellCopy, titles } from "@/copy/en";
import { useDocumentTitle } from "@/ui/useDocumentTitle";
import styles from "./NotFound.module.css";

function nearMiss(path: string): string | undefined {
  const channel = /^\/channel\/(0x[0-9a-fA-F]{40})\/?$/.exec(path) ?? /^\/(0x[0-9a-fA-F]{40})\/?$/.exec(path);
  if (channel) return `/channels/${channel[1]}`;
  const run = /^\/run\/([a-z0-9]+-[0-9a-f]{6})\/?$/.exec(path);
  if (run) return `/runs/${run[1]}`;
  return undefined;
}

export function NotFound() {
  const { pathname } = useLocation();
  useDocumentTitle(titles.notFound);
  const suggestion = nearMiss(pathname);
  return (
    <section className={`sheet ${styles.notice}`} aria-labelledby="not-found-title">
      <h1 id="not-found-title">{copy.title}</h1>
      <p>{copy.asked} <code>{pathname}</code>.</p>
      {suggestion && <p>{copy.suggestion} <Link to={suggestion}>{suggestion}</Link>?</p>}
      <nav aria-label={copy.links}>
        <ul className={styles.links}>
          {shellCopy.nav.map((item) => <li key={item.to}><Link to={item.to}>{item.label}</Link></li>)}
        </ul>
      </nav>
    </section>
  );
}
