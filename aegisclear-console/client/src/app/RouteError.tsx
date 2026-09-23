// Root error element: for truly unexpected render or loader failures only. Expected API errors never reach it,
// because loaders return discriminated results. Never a blank page.
import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import { rootErrorCopy as copy } from "@/copy/en";
import styles from "./ServerDown.module.css";

export function RouteError() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? `${error.name}: ${error.message}\n\n${error.stack ?? ""}` : String(error);
  return (
    <div className={styles.page}>
      <main id="main" className={styles.main}>
        <section className={`sheet ${styles.notice}`} aria-labelledby="route-error-title">
          <h1 id="route-error-title">{copy.title}</h1>
          <p className={styles.body}>{copy.body}</p>
          <div className={styles.actions}>
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>{copy.reload}</button>
            <Link to="/">{copy.home}</Link>
          </div>
          <details>
            <summary>{copy.details}</summary>
            <pre className={styles.body} style={{ whiteSpace: "pre-wrap" }}>{detail}</pre>
          </details>
        </section>
      </main>
    </div>
  );
}
