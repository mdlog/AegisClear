// /offer (LAYOUT_SPEC; API_CONTRACT §8): the 402 a demo client receives, explained rather than dumped. To a
// facilitator it is an ordinary x402 `exact` offer; payTo is an escrow that does not exist yet.
import { useEffect, useId, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { ConfigResponse } from "@aegis/types";
import { offerCopy as copy, titles } from "@/copy/en";
import { useAppConfig } from "@/app/loaders";
import { useChannels, useOffer } from "@/lib/api/queries";
import { bps, usdg, windowLength } from "@/lib/format";
import { offerAnatomy, type OfferAnatomy } from "@/lib/present/offer";
import { clientLabel } from "@/lib/present/registry";
import { CopyButton, Hex } from "@/ui/Hex";
import { useDocumentTitle } from "@/ui/useDocumentTitle";
import styles from "./OfferView.module.css";

type Client = "A" | "B";

export function OfferView() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get("client");
  useDocumentTitle(titles.offer);
  // A missing param is normalised to the dispute client of runbook step 2, without a history entry.
  useEffect(() => {
    if (raw === null) navigate({ search: "?client=B" }, { replace: true });
  }, [raw, navigate]);
  const client: Client | undefined = raw === "A" || raw === "B" ? raw : raw === null ? "B" : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{copy.title}</h1>
        <p className="lede">{copy.lede}</p>
      </header>
      {client ? (
        <>
          <ClientSwitch client={client} onChange={(c) => navigate({ search: `?client=${c}` }, { replace: true })} />
          <Offer client={client} />
        </>
      ) : (
        <section className={`sheet ${styles.notice}`} role="alert">
          <h2>{copy.invalidClient}</h2>
          <p className={styles.links}>
            <Link to="?client=A">{copy.client("A")}</Link>
            <Link to="?client=B">{copy.client("B")}</Link>
          </p>
        </section>
      )}
    </div>
  );
}

function ClientSwitch({ client, onChange }: { client: Client; onChange: (c: Client) => void }) {
  const name = useId();
  return (
    <fieldset className={styles.switch}>
      <legend>{copy.clientLegend}</legend>
      {(["A", "B"] as const).map((c) => (
        <label key={c} className={styles.option}>
          <input type="radio" name={name} value={c} checked={client === c} onChange={() => onChange(c)} />
          {copy.client(c)}
        </label>
      ))}
    </fieldset>
  );
}

function Offer({ client }: { client: Client }) {
  const config = useAppConfig();
  const offer = useOffer(client);
  const channels = useChannels({ poll: false });

  if (offer.isPending) return <div className={`sheet ${styles.placeholder}`} role="status" aria-label={copy.loading} />;
  if (!offer.data) return <p className={`sheet ${styles.notice}`} role="alert">{copy.failed}</p>;

  const anatomy = offerAnatomy(offer.data.body);
  const deployed = anatomy ? channels.data?.channels.find((c) => c.channel.toLowerCase() === anatomy.payTo.toLowerCase()) : undefined;

  return (
    <div className={styles.offer} aria-busy={offer.isPlaceholderData}>
      <section className={`sheet ${styles.status}`} aria-labelledby="offer-status">
        <h2 id="offer-status" className={styles.statusCode}>{copy.status(offer.data.status)}</h2>
        <p><strong>{copy.session}</strong> <span className="meta">{copy.sessionNote}</span></p>
        <p className={styles.caveat}>{copy.caveat}</p>
      </section>

      {anatomy ? (
        <div className={styles.columns}>
          <Facilitator anatomy={anatomy} config={config} deployedState={deployed?.state} />
          <AegisExtra anatomy={anatomy} config={config} />
        </div>
      ) : (
        <p className={`sheet ${styles.notice}`}>{copy.unexpected}</p>
      )}

      <RawJson body={offer.data.body} />
    </div>
  );
}

function Field({ name, value, children, marked = false }: { name: string; value?: ReactNode; children?: ReactNode; marked?: boolean }) {
  return (
    <div className={`${styles.field} ${marked ? styles.marked : ""}`}>
      <dt><code>{name}</code></dt>
      <dd>
        {value !== undefined && <div className={styles.value}>{value}</div>}
        {children && <div className={styles.note}>{children}</div>}
      </dd>
    </div>
  );
}

function Facilitator({ anatomy, config, deployedState }: { anatomy: OfferAnatomy; config: ConfigResponse; deployedState?: string }) {
  const isMock = Boolean(config.addresses.usdg && config.addresses.usdg.toLowerCase() === anatomy.asset.toLowerCase());
  return (
    <section className={`sheet ${styles.column}`} aria-labelledby="offer-facilitator">
      <h2 id="offer-facilitator">{copy.facilitator}</h2>
      <dl className={styles.fields}>
        <Field name="x402Version" value={anatomy.x402Version}>{copy.x402Version}</Field>
        <Field name="scheme" value={anatomy.scheme}>{copy.scheme}</Field>
        <Field name="network" value={anatomy.network}>{copy.networkNames[anatomy.chainId] ?? `Chain ${anatomy.chainId}`}</Field>
        <Field name="asset" value={<Hex value={anatomy.asset} kind="address" keep={8} label="Asset address" explorerBase={config.explorerBase} />}>{copy.asset(isMock)}</Field>
        <Field name="payTo" marked value={<Hex value={anatomy.payTo} kind={deployedState ? "address" : "hash"} full label="payTo address" explorerBase={config.explorerBase} />}>
          <p>{copy.payTo}</p>
          {deployedState ? (
            <p className={styles.already}>
              {copy.already(deployedState.toLowerCase())} <Link to={`/channels/${anatomy.payTo}`}>{copy.openChannel}</Link>
            </p>
          ) : (
            <p className={styles.notYet}>{copy.notYet}</p>
          )}
        </Field>
        <Field name="maxAmountRequired" value={anatomy.deposit.toString()}>{copy.deposit(`${usdg(anatomy.deposit)} MockUSDG`)}</Field>
      </dl>
    </section>
  );
}

function AegisExtra({ anatomy, config }: { anatomy: OfferAnatomy; config: ConfigResponse }) {
  const cfg = anatomy.config as Record<string, unknown>;
  const str = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : undefined);
  const num = (k: string) => (typeof cfg[k] === "number" ? (cfg[k] as number) : undefined);
  const party = (k: string) => {
    const v = str(k);
    if (!v) return null;
    const label = clientLabel(v, config);
    return <span className={styles.party}><span className={styles.partyName}>{k}{label ? ` (client ${label})` : ""}</span><Hex value={v} kind="address" keep={6} label={k} explorerBase={config.explorerBase} /></span>;
  };
  const t = anatomy.terms;
  return (
    <section className={`sheet ${styles.column}`} aria-labelledby="offer-aegis">
      <h2 id="offer-aegis">{copy.aegis} <code className={styles.key}>{copy.aegisKey}</code></h2>
      <dl className={styles.fields}>
        <Field name="config" marked>
          <p>{copy.config}</p>
          <div className={styles.configList}>
            {party("client")}
            {party("provider")}
            {party("token")}
            {str("termsCommitment") && <span className={styles.party}><span className={styles.partyName}>termsCommitment (T)</span><Hex value={str("termsCommitment")!} keep={6} label="Terms commitment T" /></span>}
            {num("challengeWindow") !== undefined && <span className={styles.party}><span className={styles.partyName}>windows</span>{copy.windows(windowLength(num("challengeWindow")!), windowLength(num("responseWindow") ?? 0))}</span>}
            {party("payoutClient")}
            {party("payoutProvider")}
            {str("salt") && <span className={styles.party}><span className={styles.partyName}>salt</span><Hex value={str("salt")!} keep={6} label="Salt" /></span>}
          </div>
        </Field>
        {anatomy.sigProvider && <Field name="sigProvider" value={<Hex value={anatomy.sigProvider} keep={8} label="Provider signature" />} marked>{copy.sigProvider}</Field>}
        <Field name="terms" marked>
          <p>{copy.terms}</p>
          <p className={styles.terms}>{copy.termsValues(usdg(t.unitPrice), t.maxM1, t.minM2, bps(t.penaltyBps), bps(t.capBps))}</p>
          {t.nonce && <p className={styles.party}><span className={styles.partyName}>nonce</span><Hex value={t.nonce} keep={6} label="Session nonce" /></p>}
        </Field>
        {anatomy.unitQty && <Field name="unitQty" value={anatomy.unitQty} marked>{copy.unitQty}</Field>}
        {anatomy.exitSig && <Field name="exitSig" value={<Hex value={anatomy.exitSig} keep={8} label="Exit ticket signature" />} marked>{copy.exitSig}</Field>}
        <Field name="anchored" value={String(anatomy.anchored)} marked>{copy.anchored(anatomy.anchored)}</Field>
      </dl>
    </section>
  );
}

/** The raw JSON with payTo and extra.aegis marked, so the annotations above can be checked against it. */
function RawJson({ body }: { body: unknown }) {
  const json = JSON.stringify(body, null, 2);
  let aegisIndent: string | undefined;
  const lines = json.split("\n").map((line) => {
    const open = /^(\s*)"aegis": \{/.exec(line);
    if (open) aegisIndent = open[1];
    const inAegis = aegisIndent !== undefined;
    if (inAegis && !open && new RegExp(`^${aegisIndent}\\}`).test(line)) aegisIndent = undefined;
    return { line, marked: inAegis || /"payTo":/.test(line) };
  });
  return (
    <details className={`sheet ${styles.raw}`}>
      <summary>{copy.raw}</summary>
      <div className={styles.rawBar}><CopyButton value={json} what={copy.copyJson} /></div>
      <pre className={styles.json}>
        {lines.map((l, i) => <span key={i} className={l.marked ? styles.jsonMarked : undefined}>{l.line}{"\n"}</span>)}
      </pre>
    </details>
  );
}
