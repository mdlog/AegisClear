/**
 * Fund safety for the provider REQUIRES running the challenge responder (Task 15 Watcher): a client
 * can submit a stale co-signed checkpoint (incl. the seq-0 exit ticket) and the provider must
 * counter-submit `latestCoSigned` within `challengeWindow`.
 */
import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { zeroAddress, type Address, type Hex, type PrivateKeyAccount } from "viem";
import { type Terms, type Receipt, ReceiptTree, commitTerms, makeReceipt, MAX_SEQ, merkleRoot, randomNonce, settle } from "../core/index.js";
import {
  type ChannelConfig, type Checkpoint, type LeafMsg, signCheckpoint, signChannelTerms, signClose, signRollover, signLeaf, rootHex, makeTypedDataVerifier,
} from "../core/typedData.js";
import { type ChainCtx, predictChannel, openChannel, erc20Balance, readChannel } from "../chain/channel.js";
import { factoryAbi } from "../chain/abi.js";
import { Watcher } from "../watcher/watcher.js";

export interface ProviderOptions {
  ctx: ChainCtx; account: PrivateKeyAccount; usdg: Address;
  /** alamat penerima payout provider — treasury/router/Safe; default account.address (FR-26/D8). */
  payoutProvider?: Address;
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
  /** mode anchored (FR-25): factory di `ctx.factory` harus factory anchored; ack klien = tx on-chain, tidak ada checkpoint co-signed. */
  anchored?: boolean;
}
export interface CoSigned { cp: Checkpoint; sigProvider: Hex; sigClient?: Hex }
export interface Session {
  cfg: ChannelConfig; predicted: Address; channel?: Address; termsSigProvider: Hex;
  /** terms sesi ini (nonce per sesi) — dasar `cfg.termsCommitment`, harga receipt, dan `terms` di 402. */
  terms: Terms;
  /** tiket keluar unilateral: Checkpoint(0,0,merkleRoot([])) ditandatangani provider di muka (T-exit0) */
  exitSigProvider: Hex;
  tree: ReceiptTree; cumulativeAmount: bigint; checkpoints: Map<number, CoSigned>;
  epoch: number;
  /** Close/Rollover sudah ditandatangani provider: tidak ada unit baru sampai rollover terkonfirmasi (F-close-continue) */
  closing: boolean;
}
const j = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

export function createProviderApp(o: ProviderOptions) {
  const app = new Hono();
  const sessions = new Map<string, Session>();
  const chainId = o.ctx.chainId;
  /**
   * M6 (final-fix brief): rantai promise per klien — request `POST /job` KONKUREN (atau di-spoof lewat
   * header `Aegis-Client` yang sama, yang memang tidak diautentikasi di file ini) untuk sesi yang SAMA
   * dulu bisa berdua membaca `n = s.tree.size` yang SAMA sebelum salah satu sempat `s.tree.append` (ada
   * celah `await` — `erc20Balance`/`leafHash` — di antara baca dan tulis), lalu berdua menulis: double-
   * append ke pohon, tabrakan pada `s.checkpoints.set(n+1, …)`. `serializeJob` memaksa body handler untuk
   * klien yang sama berjalan satu-per-satu (FIFO): request berikutnya menunggu `.then()` atas promise
   * request sebelumnya (berhasil ATAU gagal — `fn` dipanggil either way), sehingga `n` yang dibaca badan
   * handler berikutnya sudah mencerminkan tulisan sebelumnya. Klien BERBEDA tidak saling menunggu (key
   * per-alamat, bukan satu lock global).
   */
  const jobChain = new Map<string, Promise<unknown>>();
  function serializeJob<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = jobChain.get(key) ?? Promise.resolve();
    const run = prior.then(fn, fn);
    jobChain.set(key, run.then(() => undefined, () => undefined)); // lanjutan rantai: tunggu selesai, abaikan hasil/error
    return run;
  }
  // Verifikasi tanda tangan klien sadar ERC-1271/6492 (klien boleh smart account) — konsisten dengan
  // `SignatureChecker.isValidSignatureNow` yang dipakai AegisChannel; ecrecover murni menolak akun kontrak.
  const verify = makeTypedDataVerifier(o.ctx.publicClient);

  /**
   * Review round 1 (minor 3b): kesalahan konfigurasi jujur — `ProviderOptions.anchored` tidak cocok dengan
   * `POSEIDON()` factory di `o.ctx.factory` yang sesungguhnya — harus tersurat segera, bukan diam-diam
   * salah melayani (mis. anchored:false padahal factory anchored → tidak pernah membaca on-chain seq).
   * Di-cache lewat Promise (bukan boolean) sehingga hanya SATU pembacaan RPC pernah terjadi, tetapi setiap
   * sesi klien baru berikutnya tetap konsisten gagal (bukan cuma yang pertama) bila memang salah konfigurasi.
   */
  let modeCheck: Promise<void> | undefined;
  function ensureModeMatchesFactory(): Promise<void> {
    if (!modeCheck) {
      modeCheck = (async () => {
        const poseidon = await o.ctx.publicClient.readContract({ address: o.ctx.factory, abi: factoryAbi, functionName: "POSEIDON" });
        const anchoredOnChain = poseidon !== zeroAddress;
        if (anchoredOnChain !== !!o.anchored) {
          throw new Error(`provider misconfigured: ctx.factory POSEIDON=${poseidon} (anchored=${anchoredOnChain}) but ProviderOptions.anchored=${!!o.anchored}`);
        }
      })().catch((e) => {
        // Task 8 Step 4b: sebuah rejection (mis. RPC turun sesaat saat readContract) TIDAK BOLEH mengunci
        // provider selamanya di balik promise gagal yang di-cache permanen — bersihkan cache di sini supaya
        // panggilan BERIKUTNYA mencoba lagi (readContract) alih-alih mewarisi kegagalan lama yang sudah basi.
        // Rethrow: caller sesi INI tetap melihat error yang sama seperti sebelumnya.
        modeCheck = undefined;
        throw e;
      });
    }
    return modeCheck;
  }

  async function session(client: Address): Promise<Session> {
    const key = client.toLowerCase();
    const found = sessions.get(key);
    if (found) return found;
    await ensureModeMatchesFactory();   // hanya jalan (RPC) sekali; sesi baru berikutnya menunggu promise yang sama
    const terms: Terms = { ...o.terms, nonce: randomNonce() };   // nonce per sesi (lihat ProviderOptions.terms)
    const cfg: ChannelConfig = {
      client, provider: o.account.address, token: o.usdg, termsCommitment: rootHex(await commitTerms(terms)),
      challengeWindow: o.challengeWindow, responseWindow: o.responseWindow,
      payoutClient: client, payoutProvider: o.payoutProvider ?? o.account.address, salt: ("0x" + randomBytes(32).toString("hex")) as Hex,
    };
    const predicted = await predictChannel(o.ctx, cfg);
    const cp0: Checkpoint = { epoch: 0, seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
    const s: Session = {
      cfg, predicted, terms, termsSigProvider: await signChannelTerms(o.account, predicted, chainId, cfg),
      exitSigProvider: await signCheckpoint(o.account, predicted, chainId, cp0),
      tree: new ReceiptTree(), cumulativeAmount: 0n, checkpoints: new Map(),
      epoch: 0, closing: false,
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
      extra: { aegis: { config: j(s.cfg), sigProvider: s.termsSigProvider, terms: j(s.terms), unitQty: o.unitQty.toString(), exitSig: s.exitSigProvider, anchored: !!o.anchored } },
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
    // M6: badan handler asli dibungkus serializeJob — lihat komentar di deklarasi jobChain di atas.
    return serializeJob(client.toLowerCase(), async () => {
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
      // (2) ack unit sebelumnya (§6.2, FR-24)
      const n = s.tree.size;
      if (o.anchored) {
        // (2') anchored: baca state on-chain untuk SEMUA n (termasuk n===0, minor 3a) — channel yang sudah
        // CLOSING (mis. salah satu pihak memanggil startClose()) tidak boleh terus dilayani unit baru sama
        // sekali. Untuk n>0, unit n-1 juga harus sudah di-ack ON-CHAIN oleh klien (tidak ada header Aegis-Ack
        // di mode ini); epoch harus sama.
        const v = await readChannel(o.ctx, s.channel);
        if (v.state !== "OPEN") return c.json({ error: "channel-not-open", state: v.state }, 409);
        // M4: dua kegagalan BERBEDA dulu dilempar sebagai satu "ack-required" — epoch yang sudah maju
        // on-chain (mis. rollover sempat mined tapi sesi provider belum sempat /rollover/confirm) bukan
        // masalah "ack" sama sekali dan butuh remediasi berbeda (sinkronkan epoch, bukan kirim ack). Epoch
        // dicek LEBIH DULU: kalau epoch sudah mismatch, `v.seq` (biasanya 0 di epoch baru) akan selalu
        // "< n" dan salah dilaporkan sebagai ack-required kalau urutan dibalik.
        if (n > 0 && v.epoch !== s.epoch) return c.json({ error: "epoch-mismatch", epoch: v.epoch }, 409);
        if (n > 0 && v.seq < n) return c.json({ error: "ack-required", seq: n - 1 }, 409);
      } else if (n > 0) {
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
      if (s.closing) return c.json({ error: "session-closing" }, 409);
      // (3) tidak melayani melebihi deposit (FR-24)
      const due = o.unitQty * s.terms.unitPrice;
      if ((await erc20Balance(o.ctx, o.usdg, s.channel)) < s.cumulativeAmount + due) return c.json(challenge(s), 402);
      // (4) layani unit n
      const { m1, m2 } = o.metrics(n);
      const r: Receipt = makeReceipt(n, o.unitQty, m1, m2, s.terms.unitPrice);
      await s.tree.append(r);
      s.cumulativeAmount += due;
      if (o.anchored) {
        // Anchored (FR-25): daun Poseidon + kumulatif ditandatangani provider; klien mengirimnya ke `ack()` on-chain
        // sendiri. Tidak ada checkpoint co-signed di sini — privasi §6.7 (metrik/harga tidak pernah di calldata ack).
        const leaf: LeafMsg = { epoch: s.epoch, seq: n, leaf: rootHex(s.tree.leaves[n]), cumulativeAmount: s.cumulativeAmount };
        const sigProvider = await signLeaf(o.account, s.channel, chainId, leaf);
        return c.json({ result: `unit-${n}`, receipt: j(r), leaf: j(leaf), sigProvider, channel: s.channel });
      }
      // (co-signed) receipt + checkpoint n+1 ditandatangani provider
      const cp: Checkpoint = { epoch: s.epoch, seq: n + 1, cumulativeAmount: s.cumulativeAmount, receiptsRoot: await s.tree.root() };
      const sigProvider = await signCheckpoint(o.account, s.channel, chainId, cp);
      s.checkpoints.set(n + 1, { cp, sigProvider });
      return c.json({ result: `unit-${n}`, receipt: j(r), checkpoint: j(cp), sigProvider, channel: s.channel });
    });
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

  /**
   * Gating bersama /close & /rollover (T-close-hi + F-close-continue): hanya seq co-signed TERTINGGI, jumlah
   * harus persis kumulatif checkpoint itu, dan permintaan WAJIB membawa tanda tangan klien atas pesan yang sama
   * (bukti identitas + niat; header Aegis-Client sendiri tidak diautentikasi). Setelah provider ikut
   * menandatangani, sesi ditandai `closing`: tidak ada unit baru sampai rollover terkonfirmasi on-chain.
   */
  async function countersign(c: any, kind: "close" | "rollover") {
    const client = clientOf(c); const s = client && sessions.get(client.toLowerCase());
    if (!s?.channel) return c.json({ error: "no channel" }, 409);
    const { seq, toProvider, sigClient } = (await c.req.json()) as { seq: number; toProvider: string; sigClient: Hex };
    let hi: number | undefined; let owed = 0n;
    if (o.anchored) {
      // anchored: state on-chain adalah kebenaran — tutup di seq yang sudah di-ack (bisa tree.size − 1 bila unit terakhir belum di-ack).
      const v = await readChannel(o.ctx, s.channel);
      if (v.epoch !== s.epoch) return c.json({ error: "epoch-mismatch", epoch: v.epoch }, 409);
      hi = v.seq;
      owed = settle(s.tree.receipts.slice(0, hi), s.terms).cumulativeAmount;
    } else {
      const n = s.tree.size;
      if (n === 0) hi = 0;
      else if (s.checkpoints.get(n)?.sigClient) hi = n;
      else if (s.checkpoints.get(n - 1)?.sigClient) hi = n - 1;
      owed = hi === undefined ? 0n : hi === 0 ? 0n : s.checkpoints.get(hi)!.cp.cumulativeAmount;
    }
    if (hi === undefined || seq !== hi) return c.json({ error: "checkpoint-not-acked", seq }, 409);
    if (BigInt(toProvider) !== owed) return c.json({ error: "amount-mismatch", toProvider: owed.toString() }, 409);
    const msg = { epoch: s.epoch, seq: hi, toProvider: owed };
    const ok = kind === "close"
      ? await verify.verifyCloseSig(client!, s.channel, chainId, msg, sigClient)
      : await verify.verifyRolloverSig(client!, s.channel, chainId, msg, sigClient);
    if (!ok) return c.json({ error: "bad-client-signature" }, 400);
    const sigProvider = kind === "close" ? await signClose(o.account, s.channel, chainId, msg) : await signRollover(o.account, s.channel, chainId, msg);
    s.closing = true;
    if (kind === "rollover" && !o.anchored) {
      // I1 (final-fix brief): tiket keluar epoch BERIKUTNYA ditanda-tangani DI MUKA, bersamaan dengan
      // `sigProvider` di atas — sebelum klien mem-broadcast tx `rollover()` sama sekali. Dulu klien hanya
      // menerima tiket seq-0 epoch e+1 dari `/rollover/confirm`, YAITU SETELAH tx-nya sendiri ter-mined —
      // provider yang menahan balasan confirm bisa menyandera sisa budget epoch baru tanpa batas waktu.
      // Menanda-tangani di muka aman: tiket ini (`Checkpoint(epoch+1, 0, 0, emptyRoot)`) INERT sampai
      // epoch benar-benar naik on-chain, dan epoch hanya naik lewat tx `rollover()` yang membawa
      // `sigProvider` DI ATAS juga (tanda tangan provider ini sendiri) — begitu epoch naik, tiket ini
      // persis tiket keluar seq-0 yang sudah dinetralkan responder tantangan (Task 15 Watcher) seperti
      // tiket seq-0 epoch manapun. Anchored: tidak ada tiket co-signed sama sekali (lihat M5) — anchored
      // exit memakai `startClose()` langsung atas state on-chain.
      const exitSigNext = await signCheckpoint(o.account, s.channel, chainId, { epoch: s.epoch + 1, seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) });
      return c.json({ epoch: s.epoch, seq: hi, toProvider: owed.toString(), sigProvider, exitSigNext });
    }
    return c.json({ epoch: s.epoch, seq: hi, toProvider: owed.toString(), sigProvider });
  }
  app.post("/close", (c) => countersign(c, "close"));
  app.post("/rollover", (c) => countersign(c, "rollover"));

  /**
   * Idempoten dan murni turunan state on-chain (resiliency review, tidak ada di brief asli): efeknya
   * ditentukan HANYA oleh `readChannel` saat ini, bukan oleh siapa yang memanggil atau berapa kali —
   * jadi TIDAK butuh tanda tangan klien di sini. Retry setelah balasan pertama putus (klien tidak pernah
   * menerima 200-nya) aman, dan panggilan pihak ketiga yang menyamar lewat header Aegis-Client (yang
   * memang tidak diautentikasi, sama seperti route lain di file ini) tidak bisa mengubah apa pun selain
   * apa yang state on-chain sudah mengizinkan.
   *   - state bukan OPEN → rollover belum/tidak pernah masuk on-chain untuk sesi ini: 409.
   *   - epoch on-chain == epoch sesi DAN sesi tidak `closing` → epoch ini sudah pernah dikonfirmasi
   *     sebelumnya (ini panggilan kedua/retry): balas tiket keluar yang SAMA tanpa menyentuh
   *     tree/checkpoints lagi (mencegah reset ganda / kehilangan progres epoch baru).
   *   - epoch on-chain == epoch sesi + 1 DAN seq on-chain == 0 → rollover baru saja masuk on-chain:
   *     mulai epoch baru di sesi (sekali) dan terbitkan tiket keluar seq-0 yang baru.
   *   - selain itu (mis. sesi masih `closing` di epoch lama — tx belum/tidak masuk, atau epoch melompat
   *     lebih dari satu) → 409, sama seperti sebelumnya.
   *
   * M5 (final-fix brief): mode anchored TIDAK PERNAH membalas `exitSig` di sini — tidak ada tiket
   * Checkpoint co-signed yang berarti apa pun di anchored (exit unilateral memakai `startClose()`
   * langsung atas state on-chain, lihat `AegisClient.rollover()`/`exitUnilateral()`), jadi menandatangani
   * satu di sini hanya kerja sia-sia yang tidak pernah diverifikasi klien anchored.
   */
  app.post("/rollover/confirm", async (c) => {
    const client = clientOf(c); const s = client && sessions.get(client.toLowerCase());
    if (!s?.channel) return c.json({ error: "no channel" }, 409);
    const v = await readChannel(o.ctx, s.channel);
    if (v.state !== "OPEN") return c.json({ error: "rollover-not-onchain", epoch: v.epoch, seq: v.seq, state: v.state }, 409);
    if (v.epoch === s.epoch && !s.closing) return c.json(o.anchored ? { epoch: s.epoch } : { epoch: s.epoch, exitSig: s.exitSigProvider });
    if (v.epoch === s.epoch + 1 && v.seq === 0) {
      s.epoch = v.epoch; s.closing = false; s.tree.reset(); s.cumulativeAmount = 0n; s.checkpoints.clear();
      if (o.anchored) return c.json({ epoch: s.epoch });
      const cp0: Checkpoint = { epoch: s.epoch, seq: 0, cumulativeAmount: 0n, receiptsRoot: await merkleRoot([]) };
      s.exitSigProvider = await signCheckpoint(o.account, s.channel, chainId, cp0);
      return c.json({ epoch: s.epoch, exitSig: s.exitSigProvider });
    }
    return c.json({ error: "rollover-not-onchain", epoch: v.epoch, seq: v.seq, state: v.state }, 409);
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
