import { useState } from "react";
import { getOffer } from "../api";

export function OfferView() {
  const [client, setClient] = useState<"A" | "B">("A");
  const [body, setBody] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = (c: "A" | "B") => { setClient(c); setErr(null); getOffer(c).then((o) => setBody(JSON.stringify(o.body, null, 2))).catch((e) => setErr(String((e as Error).message))); };
  return (
    <details className="offer">
      <summary>402 yang dilihat klien x402 (<code>GET /provider/job</code>)</summary>
      <div className="buttons"><button onClick={() => load("A")} disabled={client === "A" && !!body}>klien A</button><button onClick={() => load("B")} disabled={client === "B" && !!body}>klien B</button></div>
      {err && <p className="banner error">{err}</p>}
      {body && <pre className="json">{body}</pre>}
      <p className="muted">`payTo` = alamat channel yang diprediksi (CREATE2); `extra.aegis` memuat config, tanda tangan provider, syarat (hanya untuk klien), tiket keluar seq-0.</p>
    </details>
  );
}
