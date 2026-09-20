// Logika demo §14 (Pasar A: SimpleJobEscrow biner vs Pasar B: AegisClear) sebagai library.
// Dipakai oleh demo/run.ts (CLI, cetak tabel) dan web/server (console browser, stream langkah).
import { parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AegisClient, erc20Balance, readChannel, settle, type Artifacts, type ChainCtx, type Settlement, type Terms, type TxLog } from "@aegisclear/sdk";

export const BREACHES = new Set([3, 17, 29, 44, 58, 71, 90]);           // EX1
export const TERMS_BASE: Omit<Terms, "nonce"> = { unitPrice: 20_000n, maxM1: 800n, minM2: 90n, penaltyBps: 5000n, capBps: 3000n };
export const METRICS = { breachM1: 1200n, okM1: 300n, m2: 95n } as const;
export const metricsFor = (seq: number) => ({ m1: BREACHES.has(seq) ? METRICS.breachM1 : METRICS.okM1, m2: METRICS.m2 });
export const DEPOSIT_B = 5_000_000n;        // 5 USDG (ProviderOptions.deposit)
export const ESCROW_AMOUNT_A = 2_000_000n;  // 2 USDG (SimpleJobEscrow.fund)
export const ANCHORED_UNITS = 20;           // unit dilayani skenario anchored (mencakup breach EX1 seq 3 & 17)
/**
 * Nilai privat sesi Pasar B yang TIDAK boleh muncul di calldata/log mana pun (leak-check).
 * anchored: A per unit (unitPrice) sudah ter-commit on-chain lewat leaf per ack, jadi bukan lagi nilai
 * privat — dikeluarkan dari himpunan yang diperiksa leak-check.
 */
export const privateValues = (t: Terms, opts: { anchored?: boolean } = {}): bigint[] => [
  ...(opts.anchored ? [] : [t.unitPrice]), t.maxM1, t.minM2, t.penaltyBps, t.capBps, t.nonce, METRICS.breachM1, METRICS.okM1, METRICS.m2,
];

export interface Deployment { usdg: Address; factory: Address; escrow: Address }
export type Phase = "fund" | "open" | "serve" | "ack" | "close" | "dispute" | "prove" | "wait" | "settle" | "escrow";
export interface StepInput { phase: Phase; label: string; detail?: string; txHash?: Hex; gasUsed?: string; channel?: Address; progress?: { done: number; total: number } }
export type Emit = (s: StepInput) => void;
export interface ScenarioEnv {
  ctx: (pk: Hex) => ChainCtx; publicClient: PublicClient; d: Deployment; art: Artifacts;
  providerUrl: string; providerAddress: Address; providerPk: Hex; challengeWindow: number;
  /** local: evm_increaseTime + evm_mine; testnet: tunggu nyata sambil memancarkan step "wait". */
  timeTravel: (seconds: number, emit: Emit) => Promise<void>;
}
export interface MarketBResult { channel: Address; txs: TxLog[]; gasTotal: bigint; provingMs: number; clientDelta: bigint; providerDelta: bigint; local: Settlement; terms: Terms }
/** runRollover: MarketBResult + epoch on-chain akhir dan total unit terlayani lintas epoch (FR-10). */
export interface RolloverResult extends MarketBResult { epoch: number; units: number }
export interface MarketAResult { gasTotal: bigint; result: string; txs: TxLog[] }
export interface Row { pasar: string; klien_provider: string; penentu: string; terlihat: string; gas: string; proving_ms: string; txs: { label: string; hash: Hex }[] }

export const escrowAbi = parseAbi([
  "function nextId() view returns (uint256)",
  "function createJob(address provider, address evaluator, string description) returns (uint256)",
  "function fund(uint256 id, uint256 amount)",
  "function submit(uint256 id, bytes32 d)",
  "function complete(uint256 id, bytes32 r)",
  "function reject(uint256 id, bytes32 r)",
  "function approve(address,uint256) returns (bool)",
]);
export const fmtUsdg = (x: bigint) => (Number(x) / 1e6).toFixed(2);
const B32 = (d: string) => ("0x" + d.padStart(64, "0")) as Hex;

/** Pasar B: 402 → dana → `units` unit di-ack → sengketa (bukti + settle) atau cooperative close. */
export async function runMarketB(env: ScenarioEnv, pk: Hex, dispute: boolean, emit: Emit, units = 100): Promise<MarketBResult> {
  const ctx = env.ctx(pk);
  const me = privateKeyToAccount(pk).address;
  const c = new AegisClient({ ctx, account: privateKeyToAccount(pk), providerUrl: env.providerUrl, usdg: env.d.usdg, artifacts: env.art });
  const c0 = await erc20Balance(ctx, env.d.usdg, me);
  const p0 = await erc20Balance(ctx, env.d.usdg, env.providerAddress);
  let seen = 0;
  const flush = (phase: Phase) => {
    for (const t of c.txs.slice(seen)) emit({ phase, label: t.label, txHash: t.hash, gasUsed: t.gasUsed.toString(), channel: c.channel });
    seen = c.txs.length;
  };
  await c.start();
  // T-mode (FR-25): c.anchored diturunkan dari factory on-chain milik klien sendiri di start() — baru
  // terisi setelah start() kembali, jadi label serve baru bisa dipilih di sini.
  const ackLabel = c.anchored ? "di-ack on-chain" : "di-ack (checkpoint co-signed)";
  emit({ phase: "fund", label: `402 diterima: payTo ${c.channel}, deposit ${fmtUsdg(c.deposit)} USDG`, channel: c.channel });
  flush("fund");
  emit({ phase: "open", label: "provider membuka channel saat ack pertama (tx provider, lihat kolom channel)", channel: c.channel });
  for (let i = 0; i < units; i++) {
    await c.requestUnit();
    if ((i + 1) % 10 === 0 || i + 1 === units)
      emit({ phase: "serve", label: `${i + 1}/${units} unit dilayani & ${ackLabel}`, progress: { done: i + 1, total: units }, channel: c.channel });
  }
  await c.finalAck();
  emit({ phase: "ack", label: "ack terakhir dikirim (POST /ack)", channel: c.channel });
  if (dispute) {
    emit({ phase: "dispute", label: "sengketa: submit checkpoint co-signed tertinggi, lalu bukti penalti", channel: c.channel });
    const { payToClient } = await c.dispute();
    flush("dispute");
    emit({ phase: "prove", label: `bukti Groth16: payToClient ${fmtUsdg(payToClient)} USDG`, detail: `${c.provingMs} ms proving`, channel: c.channel });
    // Tunggu dari deadline ON-CHAIN, bukan challengeWindow + 1: proving Groth16 di atas sudah memakan
    // waktu nyata, jadi deadline yang sebenarnya bisa sudah lebih dekat dari perkiraan challengeWindow.
    const v = await readChannel(ctx, c.channel);
    const now = Number((await env.publicClient.getBlock()).timestamp);
    await env.timeTravel(Math.max(0, v.deadline - now) + 2, emit);
    // web/server menjalankan startProviderWatcher in-process (permissionless settle() setelah deadline).
    // Klien di sini bisa kalah balapan dengannya — settle() lalu revert WrongState walau channel sudah
    // SETTLED dengan benar oleh watcher. Itu bukan kegagalan skenario, jadi jangan biarkan run berakhir
    // di "error": cek dulu, dan bila settle() sendiri gagal, cek ulang sebelum melempar.
    let s = await readChannel(ctx, c.channel);
    if (s.state === "SETTLED") {
      emit({ phase: "settle", label: "sudah di-settle oleh watcher provider (permissionless) — tanpa tx klien", channel: c.channel });
    } else {
      try {
        await c.settle();
        flush("settle");
      } catch (e) {
        s = await readChannel(ctx, c.channel);
        if (s.state !== "SETTLED") throw e;
        emit({ phase: "settle", label: "settle() klien kalah balapan dengan watcher provider — channel sudah SETTLED", channel: c.channel });
      }
    }
  } else {
    await c.closeCooperative();
    flush("close");
  }
  const gasTotal = c.txs.reduce((s, t) => s + t.gasUsed, 0n);
  // c.terms = terms sesi ini (nonce per sesi dari provider) — nilai privat yang benar-benar ter-commit on-chain.
  return {
    channel: c.channel, txs: c.txs, gasTotal, provingMs: c.provingMs,
    clientDelta: c0 - (await erc20Balance(ctx, env.d.usdg, me)),
    providerDelta: (await erc20Balance(ctx, env.d.usdg, env.providerAddress)) - p0,
    local: settle(c.tree.receipts, c.terms), terms: c.terms,
  };
}

/** Rollover (FR-10): 128 unit (epoch 0 penuh) → rollover() → 5 unit di epoch 1 → close; satu deposit untuk 133 unit. */
export async function runRollover(env: ScenarioEnv, pk: Hex, emit: Emit): Promise<RolloverResult> {
  const ctx = env.ctx(pk); const me = privateKeyToAccount(pk).address;
  const c = new AegisClient({ ctx, account: privateKeyToAccount(pk), providerUrl: env.providerUrl, usdg: env.d.usdg, artifacts: env.art });
  const c0 = await erc20Balance(ctx, env.d.usdg, me); const p0 = await erc20Balance(ctx, env.d.usdg, env.providerAddress);
  let seen = 0;
  const flush = (phase: Phase) => { for (const t of c.txs.slice(seen)) emit({ phase, label: t.label, txHash: t.hash, gasUsed: t.gasUsed.toString(), channel: c.channel }); seen = c.txs.length; };
  await c.start(); flush("fund");
  emit({ phase: "fund", label: `402 diterima: payTo ${c.channel}, deposit ${fmtUsdg(c.deposit)} USDG`, channel: c.channel });
  for (let i = 0; i < 128; i++) { await c.requestUnit(); if ((i + 1) % 16 === 0) emit({ phase: "serve", label: `${i + 1}/128 unit epoch 0`, progress: { done: i + 1, total: 133 }, channel: c.channel }); }
  await c.finalAck();
  emit({ phase: "close", label: "epoch 0 penuh (MAX_SEQ 128) → rollover: bayar 2,56 USDG, sisa jadi budget epoch 1", channel: c.channel });
  await c.rollover(); flush("close");
  emit({ phase: "serve", label: `epoch ${c.epoch} dimulai: seq kembali ke 0, deposit tidak diulang`, channel: c.channel });
  for (let i = 0; i < 5; i++) { await c.requestUnit(); }
  emit({ phase: "serve", label: "133/133 unit dilayani (5 di epoch 1)", progress: { done: 133, total: 133 }, channel: c.channel });
  await c.finalAck();
  await c.closeCooperative(); flush("close");
  return {
    channel: c.channel, txs: c.txs, gasTotal: c.txs.reduce((s, t) => s + t.gasUsed, 0n), provingMs: 0,
    clientDelta: c0 - (await erc20Balance(ctx, env.d.usdg, me)), providerDelta: (await erc20Balance(ctx, env.d.usdg, env.providerAddress)) - p0,
    local: settle(c.tree.receipts, c.terms), terms: c.terms, epoch: c.epoch, units: 133,
  };
}

/** Pasar A (kontrol): escrow ERC-8183 biner, evaluator = klien, syarat bocor di calldata. */
export async function runMarketA(env: ScenarioEnv, pk: Hex, accept: boolean, emit: Emit): Promise<MarketAResult> {
  const ctx = env.ctx(pk); const w = ctx.walletClient; const me = privateKeyToAccount(pk).address;
  const txs: TxLog[] = [];
  const step = async (label: string, hash: Hex) => {
    const r = await env.publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`tx ${label} reverted`);
    txs.push({ label, hash, gasUsed: r.gasUsed });
    emit({ phase: "escrow", label, txHash: hash, gasUsed: r.gasUsed.toString() });
  };
  await step("approve", await w.writeContract({ address: env.d.usdg, abi: escrowAbi, functionName: "approve", args: [env.d.escrow, ESCROW_AMOUNT_A] }));
  const desc = "100 units @ 0.02 USDG; maxLatency 800ms; minQuality 90; penalty 50%; cap 30%";  // syarat bocor di calldata
  const id = await env.publicClient.readContract({ address: env.d.escrow, abi: escrowAbi, functionName: "nextId" });
  await step("createJob (syarat di calldata)", await w.writeContract({ address: env.d.escrow, abi: escrowAbi, functionName: "createJob", args: [env.providerAddress, me, desc] }));
  await step("fund", await w.writeContract({ address: env.d.escrow, abi: escrowAbi, functionName: "fund", args: [id, ESCROW_AMOUNT_A] }));
  const providerPk = env.providerPk;
  await step("submit (provider)", await env.ctx(providerPk).walletClient.writeContract({ address: env.d.escrow, abi: escrowAbi, functionName: "submit", args: [id, B32("1")] }));
  await step(accept ? "complete (evaluator = klien)" : "reject (evaluator = klien)",
    await w.writeContract({ address: env.d.escrow, abi: escrowAbi, functionName: accept ? "complete" : "reject", args: [id, B32("0")] }));
  return { gasTotal: txs.reduce((s, t) => s + t.gasUsed, 0n), result: accept ? "0 / 2.00" : "2.00 / 0", txs };
}

/** Tabel §14 dalam urutan tetap; baris yang hasilnya tidak diberikan dilewati. */
export function toRows(r: { aOk?: MarketAResult; aRej?: MarketAResult; bCoop?: MarketBResult; bDisp?: MarketBResult; bAnch?: MarketBResult; bRoll?: RolloverResult }): Row[] {
  const links = (txs: TxLog[]) => txs.map((t) => ({ label: t.label, hash: t.hash }));
  const rows: Row[] = [];
  if (r.aOk) rows.push({ pasar: "A: evaluator biner (complete)", klien_provider: r.aOk.result, penentu: "alamat evaluator", terlihat: "harga, ambang, penalti (string)", gas: r.aOk.gasTotal.toString(), proving_ms: "-", txs: links(r.aOk.txs) });
  if (r.aRej) rows.push({ pasar: "A: evaluator biner (reject)", klien_provider: r.aRej.result, penentu: "alamat evaluator", terlihat: "harga, ambang, penalti (string)", gas: r.aRej.gasTotal.toString(), proving_ms: "-", txs: links(r.aRej.txs) });
  if (r.bCoop) rows.push({ pasar: "B: AegisClear kooperatif", klien_provider: `${fmtUsdg(0n)} / ${fmtUsdg(r.bCoop.providerDelta)}`, penentu: "dua tanda tangan", terlihat: "T, R, jumlah", gas: r.bCoop.gasTotal.toString(), proving_ms: "-", txs: links(r.bCoop.txs) });
  if (r.bDisp) rows.push({ pasar: "B: AegisClear sengketa (bukti)", klien_provider: `${fmtUsdg(r.bDisp.local.payToClient)} / ${fmtUsdg(r.bDisp.providerDelta)}`, penentu: "bukti Groth16", terlihat: "T, R, jumlah, payToClient", gas: r.bDisp.gasTotal.toString(), proving_ms: String(r.bDisp.provingMs), txs: links(r.bDisp.txs) });
  if (r.bAnch) rows.push({ pasar: "B: AegisClear anchored (ack on-chain, sengketa)", klien_provider: `${fmtUsdg(r.bAnch.local.payToClient)} / ${fmtUsdg(r.bAnch.providerDelta)}`, penentu: "bukti Groth16 atas R on-chain", terlihat: "hash daun, A per ack, payToClient", gas: r.bAnch.gasTotal.toString(), proving_ms: String(r.bAnch.provingMs), txs: links(r.bAnch.txs) });
  if (r.bRoll) rows.push({ pasar: "B: AegisClear rollover (128 + 5 unit, 1 deposit)", klien_provider: `${fmtUsdg(0n)} / ${fmtUsdg(r.bRoll.providerDelta)}`, penentu: "dua tanda tangan ×2 (rollover + close)", terlihat: "T, R, epoch, jumlah", gas: r.bRoll.gasTotal.toString(), proving_ms: "-", txs: links(r.bRoll.txs) });
  return rows;
}
