/**
 * Fund safety for the provider REQUIRES running the challenge responder (Task 15 Watcher): a client
 * can submit a stale co-signed checkpoint (incl. the seq-0 exit ticket) and the provider must
 * counter-submit `latestCoSigned` within `challengeWindow`.
 */
import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import type { Address, Hex, PrivateKeyAccount } from "viem";
import { type Terms, type Receipt, ReceiptTree, commitTerms, makeReceipt, MAX_SEQ, merkleRoot, randomNonce } from "../core/index.js";
import {
  type ChannelConfig, type Checkpoint, signCheckpoint, signChannelTerms, signClose, rootHex, makeTypedDataVerifier,
} from "../core/typedData.js";
import { type ChainCtx, predictChannel, openChannel, erc20Balance } from "../chain/channel.js";
import { Watcher } from "../watcher/watcher.js";

export interface ProviderOptions {
  ctx: ChainCtx; account: PrivateKeyAccount; usdg: Address;
  /**
   * Syarat komersial (harga, ambang, penalti, cap). `nonce` DIABAIKAN: setiap sesi memakai nonce
   * CSPRNG baru (`randomNonce()`), sehingga `termsCommitment` berbeda per channel — satu nonce untuk
   * semua sesi membuat setiap klien (yang memang menerima `terms` lengkap di 402) bisa mengenali
   * channel klien lain dengan `termsCommitment` identik on-chain dan membaca harga/ambangnya (§6.7).
   */
  terms: Omit<Terms, "nonce"> & { nonce?: bigint };
  unitQty: bigint; deposit: bigint; challengeWindow: number; responseWindow: number;
  /** metrik per unit (demo: injeksi pelanggaran) */
  metrics: (seq: number) => { m1: bigint; m2: bigint };
}
export interface CoSigned { cp: Checkpoint; sigProvider: Hex; sigClient?: Hex }
export interface Session {
  cfg: ChannelConfig; predicted: Address; channel?: Address; termsSigProvider: Hex;
  /** terms sesi ini (nonce per sesi) — dasar `cfg.termsCommitment`, harga receipt, dan `terms` di 402. */
  terms: Terms;
  /** tiket keluar unilateral: Checkpoint(0,0,merkleRoot([])) ditandatangani provider di muka (T-exit0) */
  exitSigProvider: Hex;
  tree: ReceiptTree; cumulativeAmount: bigint; checkpoints: Map<number, CoSigned>;
}
const j = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

export function createProviderApp(o: ProviderOptions) {
  const app = new Hono();
  const sessions = new Map<string, Session>();
  const chainId = o.ctx.chainId;
  // Verifikasi tanda tangan klien sadar ERC-1271/6492 (klien boleh smart account) — konsisten dengan
  // `SignatureChecker.isValidSignatureNow` yang dipakai AegisChannel; ecrecover murni menolak akun kontrak.
  const verify = makeTypedDataVerifier(o.ctx.publicClient);

  async function session(client: Address): Promise<Session> {
    const key = client.toLowerCase();
    const found = sessions.get(key);
    if (found) return found;
    const terms: Terms = { ...o.terms, nonce: randomNonce() };   // nonce per sesi (lihat ProviderOptions.terms)
    const cfg: ChannelConfig = {
      client, provider: o.account.address, token: o.usdg, termsCommitment: rootHex(await commitTerms(terms)),
      challengeWindow: o.challengeWindow, responseWindow: o.responseWindow,
      payoutClient: client, payoutProvider: o.account.address, salt: ("0x" + randomBytes(32).toString("hex")) as Hex,
    };
    const predicted = await predictChannel(o.ctx, cfg);
    const cp0: Checkpoint = { seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
    const s: Session = {
      cfg, predicted, terms, termsSigProvider: await signChannelTerms(o.account, predicted, chainId, cfg),
      exitSigProvider: await signCheckpoint(o.account, predicted, chainId, cp0),
      tree: new ReceiptTree(), cumulativeAmount: 0n, checkpoints: new Map(),
    };
    sessions.set(key, s);
    return s;
  }

  // 402 x402-compatible: payTo = alamat channel (§10.2). Terms dikirim ke klien saja — privat dari chain, bukan dari lawan.
  // `unitQty` diiklankan agar klien bisa menolak receipt yang menagih qty lebih besar dari yang disepakati (ClientPolicy).
  const challenge = (s: Session) => ({
    x402Version: 1,
    accepts: [{
      scheme: "exact", network: `eip155:${chainId}`, asset: o.usdg, payTo: s.predicted, maxAmountRequired: o.deposit.toString(),
      extra: { aegis: { config: j(s.cfg), sigProvider: s.termsSigProvider, terms: j(s.terms), unitQty: o.unitQty.toString(), exitSig: s.exitSigProvider } },
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
      if (!sigClient || !(await verify.verifyChannelTermsSig(client, s.predicted, chainId, s.cfg, sigClient)))
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
        if (!ack || ack.seq !== n || !(await verify.verifyCheckpointSig(client, s.channel, chainId, pending.cp, ack.signature)))
          return c.json({ error: "ack-required", seq: n }, 409);
        pending.sigClient = ack.signature;
      }
    }
    if (n >= MAX_SEQ) return c.json({ error: "epoch-full" }, 409);
    // (3) tidak melayani melebihi deposit (FR-24)
    const due = o.unitQty * s.terms.unitPrice;
    if ((await erc20Balance(o.ctx, o.usdg, s.channel)) < s.cumulativeAmount + due) return c.json(challenge(s), 402);
    // (4) layani unit n; receipt + checkpoint n+1 ditandatangani provider
    const { m1, m2 } = o.metrics(n);
    const r: Receipt = makeReceipt(n, o.unitQty, m1, m2, s.terms.unitPrice);
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
    if (!pending || !(await verify.verifyCheckpointSig(client!, s.channel, chainId, pending.cp, signature))) return c.json({ error: "bad-ack" }, 400);
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

  /**
   * Untuk Task 15 (challenge responder): checkpoint co-signed TERTINGGI milik klien ini (bila ada),
   * plus alamat channel-nya — inilah yang harus di-counter-submit provider bila melihat seq on-chain
   * lebih rendah dari ini (termasuk saat klien mencoba tiket keluar seq-0 setelah unit terkonsumsi).
   */
  function latestCoSigned(client: Address): { cp: Checkpoint; sigClient: Hex; sigProvider: Hex; channel: Address } | undefined {
    const s = sessions.get(client.toLowerCase());
    if (!s?.channel) return undefined;
    let best: CoSigned | undefined;
    for (const cs of s.checkpoints.values()) {
      if (cs.sigClient && (!best || cs.cp.seq > best.cp.seq)) best = cs;
    }
    return best?.sigClient ? { cp: best.cp, sigClient: best.sigClient, sigProvider: best.sigProvider, channel: s.channel } : undefined;
  }

  /**
   * Sama seperti `latestCoSigned`, tapi diindeks per alamat channel (bukan per klien) — untuk Watcher
   * (Task 15): sebuah provider bisa memasang `coSigned: latestCoSignedByChannel` langsung sebagai
   * callback challenge responder.
   */
  function latestCoSignedByChannel(channel: Address): { cp: Checkpoint; sigClient: Hex; sigProvider: Hex; channel: Address } | undefined {
    const key = channel.toLowerCase();
    let best: CoSigned | undefined;
    for (const s of sessions.values()) {
      if (!s.channel || s.channel.toLowerCase() !== key) continue;
      for (const cs of s.checkpoints.values()) {
        if (cs.sigClient && (!best || cs.cp.seq > best.cp.seq)) best = cs;
      }
    }
    return best?.sigClient ? { cp: best.cp, sigClient: best.sigClient, sigProvider: best.sigProvider, channel } : undefined;
  }

  /**
   * Fix round 1 (Task 15 review): menjalankan challenge responder WAJIB dilakukan in-process oleh
   * provider itu sendiri — `sessions`/co-signed store hanya hidup di memori proses ini, jadi hanya
   * proses ini yang bisa mengisi `coSigned` untuk `Watcher`. `watcher/cli.ts` yang berjalan sebagai
   * proses terpisah TIDAK memiliki akses ke store ini: itu hanyalah bot settle/sweep permissionless
   * (siapa pun boleh menjalankannya) dan TIDAK BISA merespons tantangan (T1) atas nama provider.
   * Panggil ini di proses provider untuk mendapatkan perlindungan T1; pemanggil bertanggung jawab
   * memanggil `.stop()` pada `Watcher` yang dikembalikan saat proses berhenti.
   */
  function startProviderWatcher(opts?: { intervalMs?: number; fromBlock?: bigint; log?: (s: string) => void }): Watcher {
    const w = new Watcher({ ctx: o.ctx, coSigned: latestCoSignedByChannel, ...opts });
    w.start();
    return w;
  }

  return { app, sessions, latestCoSigned, latestCoSignedByChannel, startProviderWatcher };
}
