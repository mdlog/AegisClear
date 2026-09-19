import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import type { Address, Hex, PrivateKeyAccount } from "viem";
import { type Terms, type Receipt, ReceiptTree, commitTerms, makeReceipt, MAX_SEQ, merkleRoot } from "../core/index.js";
import {
  type ChannelConfig, type Checkpoint, signCheckpoint, verifyCheckpointSig,
  signChannelTerms, verifyChannelTermsSig, signClose, rootHex,
} from "../core/typedData.js";
import { type ChainCtx, predictChannel, openChannel, erc20Balance } from "../chain/channel.js";

export interface ProviderOptions {
  ctx: ChainCtx; account: PrivateKeyAccount; usdg: Address; terms: Terms;
  unitQty: bigint; deposit: bigint; challengeWindow: number; responseWindow: number;
  /** metrik per unit (demo: injeksi pelanggaran) */
  metrics: (seq: number) => { m1: bigint; m2: bigint };
}
export interface CoSigned { cp: Checkpoint; sigProvider: Hex; sigClient?: Hex }
export interface Session {
  cfg: ChannelConfig; predicted: Address; channel?: Address; termsSigProvider: Hex;
  /** tiket keluar unilateral: Checkpoint(0,0,merkleRoot([])) ditandatangani provider di muka (T-exit0) */
  exitSigProvider: Hex;
  tree: ReceiptTree; cumulativeAmount: bigint; checkpoints: Map<number, CoSigned>;
}
const j = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

export function createProviderApp(o: ProviderOptions) {
  const app = new Hono();
  const sessions = new Map<string, Session>();
  const chainId = o.ctx.chainId;

  async function session(client: Address): Promise<Session> {
    const key = client.toLowerCase();
    const found = sessions.get(key);
    if (found) return found;
    const cfg: ChannelConfig = {
      client, provider: o.account.address, token: o.usdg, termsCommitment: rootHex(await commitTerms(o.terms)),
      challengeWindow: o.challengeWindow, responseWindow: o.responseWindow,
      payoutClient: client, payoutProvider: o.account.address, salt: ("0x" + randomBytes(32).toString("hex")) as Hex,
    };
    const predicted = await predictChannel(o.ctx, cfg);
    const cp0: Checkpoint = { seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
    const s: Session = {
      cfg, predicted, termsSigProvider: await signChannelTerms(o.account, predicted, chainId, cfg),
      exitSigProvider: await signCheckpoint(o.account, predicted, chainId, cp0),
      tree: new ReceiptTree(), cumulativeAmount: 0n, checkpoints: new Map(),
    };
    sessions.set(key, s);
    return s;
  }

  // 402 x402-compatible: payTo = alamat channel (§10.2). Terms dikirim ke klien saja — privat dari chain, bukan dari lawan.
  const challenge = (s: Session) => ({
    x402Version: 1,
    accepts: [{
      scheme: "exact", network: `eip155:${chainId}`, asset: o.usdg, payTo: s.predicted, maxAmountRequired: o.deposit.toString(),
      extra: { aegis: { config: j(s.cfg), sigProvider: s.termsSigProvider, terms: j(o.terms), exitSig: s.exitSigProvider } },
    }],
  });
  const clientOf = (c: any) => c.req.header("Aegis-Client") as Address | undefined;

  app.get("/job", async (c) => {
    const client = clientOf(c);
    if (!client) return c.json({ error: "Aegis-Client header required" }, 400);
    const body = challenge(await session(client));
    c.header("PAYMENT-REQUIRED", JSON.stringify(body));
    return c.json(body, 402);
  });

  app.post("/job", async (c) => {
    const client = clientOf(c);
    if (!client) return c.json({ error: "Aegis-Client header required" }, 400);
    const s = sessions.get(client.toLowerCase());
    if (!s) return c.json({ error: "no session; GET /job first" }, 409);

    // (1) buka channel saat ack pertama membawa tanda tangan ChannelTerms klien (D7)
    if (!s.channel) {
      const sigClient = c.req.header("Aegis-Terms-Signature") as Hex | undefined;
      if (!sigClient || !(await verifyChannelTermsSig(client, s.predicted, chainId, s.cfg, sigClient)))
        return c.json({ error: "terms-signature-required" }, 402);
      const { channel } = await openChannel(o.ctx, s.cfg, sigClient, "0x"); // provider = msg.sender
      s.channel = channel;
    }
    // (2) ack checkpoint sebelumnya (§6.2, FR-24)
    const n = s.tree.size;
    if (n > 0) {
      const pending = s.checkpoints.get(n)!;
      if (!pending.sigClient) {
        const hdr = c.req.header("Aegis-Ack");
        const ack = hdr ? (JSON.parse(hdr) as { seq: number; signature: Hex }) : undefined;
        if (!ack || ack.seq !== n || !(await verifyCheckpointSig(client, s.channel, chainId, pending.cp, ack.signature)))
          return c.json({ error: "ack-required", seq: n }, 409);
        pending.sigClient = ack.signature;
      }
    }
    if (n >= MAX_SEQ) return c.json({ error: "epoch-full" }, 409);
    // (3) tidak melayani melebihi deposit (FR-24)
    const due = o.unitQty * o.terms.unitPrice;
    if ((await erc20Balance(o.ctx, o.usdg, s.channel)) < s.cumulativeAmount + due) return c.json(challenge(s), 402);
    // (4) layani unit n; receipt + checkpoint n+1 ditandatangani provider
    const { m1, m2 } = o.metrics(n);
    const r: Receipt = makeReceipt(n, o.unitQty, m1, m2, o.terms.unitPrice);
    await s.tree.append(r);
    s.cumulativeAmount += due;
    const cp: Checkpoint = { seq: n + 1, cumulativeAmount: s.cumulativeAmount, receiptsRoot: await s.tree.root() };
    const sigProvider = await signCheckpoint(o.account, s.channel, chainId, cp);
    s.checkpoints.set(n + 1, { cp, sigProvider });
    return c.json({ result: `unit-${n}`, receipt: j(r), checkpoint: j(cp), sigProvider, channel: s.channel });
  });

  app.post("/ack", async (c) => {
    const client = clientOf(c); const s = client && sessions.get(client.toLowerCase());
    if (!s?.channel) return c.json({ error: "no channel" }, 409);
    const { seq, signature } = (await c.req.json()) as { seq: number; signature: Hex };
    const pending = s.checkpoints.get(seq);
    if (!pending || !(await verifyCheckpointSig(client!, s.channel, chainId, pending.cp, signature))) return c.json({ error: "bad-ack" }, 400);
    pending.sigClient = signature;
    return c.json({ ok: true });
  });

  app.post("/close", async (c) => {
    const client = clientOf(c); const s = client && sessions.get(client.toLowerCase());
    if (!s?.channel) return c.json({ error: "no channel" }, 409);
    const { seq } = (await c.req.json()) as { seq: number };
    // T-close-hi: hanya checkpoint co-signed TERTINGGI yang boleh ditutup. Klien tidak boleh
    // meminta seq 0 atau seq basi lain untuk membayar provider lebih sedikit dari yang terutang
    // sebenarnya (eksploit: 10 unit terkirim+acked lalu minta Close(0,0) → refund penuh).
    const n = s.tree.size;
    let hi: number | undefined;
    if (n === 0) hi = 0; // channel belum pernah dipakai: Close(0,0) sah
    else if (s.checkpoints.get(n)?.sigClient) hi = n;
    else if (s.checkpoints.get(n - 1)?.sigClient) hi = n - 1;
    if (hi === undefined || seq !== hi) return c.json({ error: "checkpoint-not-acked", seq }, 409);
    const toProvider = hi === 0 ? 0n : s.checkpoints.get(hi)!.cp.cumulativeAmount;
    const sigProvider = await signClose(o.account, s.channel, chainId, { seq: hi, toProvider });
    return c.json({ seq: hi, toProvider: toProvider.toString(), sigProvider });
  });

  app.get("/state", async (c) => {
    const client = clientOf(c); const s = client && sessions.get(client.toLowerCase());
    if (!s) return c.json({ error: "no session" }, 404);
    return c.json(j({ channel: s.channel, predicted: s.predicted, seq: s.tree.size, cumulativeAmount: s.cumulativeAmount }));
  });

  return { app, sessions };
}
