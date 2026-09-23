// Why a run did not start (API_CONTRACT §9; README §7 baseline copy). The UI branches on the error code, never on
// message text. preflight-failed carries free Indonesian text from the server, shown verbatim.
import { Link } from "react-router";
import type { RunSnapshot, ScenarioId } from "@aegis/types";
import { startErrorCopy as copy } from "@/copy/en";
import { ApiError } from "@/lib/api/client";
import { shortHex } from "@/lib/format";
import { scenarioInfo } from "@/lib/present/scenarios";
import styles from "./runs.module.css";

export function StartError({ error, scenario, live }: { error: unknown; scenario?: ScenarioId; live?: RunSnapshot }) {
  const api = error instanceof ApiError ? error : undefined;
  const body = (api?.body ?? {}) as { channel?: string; message?: string };
  let content: React.ReactNode;
  if (api?.code === "busy") {
    content = (
      <>
        <p><strong>{copy.busy}</strong> {copy.busyBody}</p>
        {live && <Link to={`/runs/${live.id}`}>{copy.openRunning}</Link>}
      </>
    );
  } else if (api?.code === "client-has-open-channel" && body.channel) {
    const client = scenario ? scenarioInfo(scenario, "testnet").client : "";
    content = (
      <>
        <p><strong>{copy.openChannel(client, shortHex(body.channel))}</strong> {copy.openChannelBody}</p>
        <Link to={`/channels/${body.channel}`}>{copy.openChannelLink}</Link>
      </>
    );
  } else if (api?.code === "preflight-failed") {
    content = (
      <>
        <p><strong>{copy.preflight}</strong> {copy.preflightBody}</p>
        <pre className={styles.serverText}>{body.message ?? api.code}</pre>
      </>
    );
  } else if (api?.status === 0) {
    content = <p>{copy.unreachable}</p>;
  } else {
    content = <p>{copy.other(api?.code ?? String(error))}</p>;
  }
  return <div className={styles.startError} role="alert">{content}</div>;
}
