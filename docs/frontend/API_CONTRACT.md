# AegisClear Console: API and Data Contract (frontend)

This is the binding contract between the new frontend and the existing console server. Everything here was read from the code (file:line references are given) and checked against real responses recorded on 23 Sep 2026 (see [`fixtures/`](./fixtures/README.md)). If this document and the code ever disagree, the code wins. Report the mismatch instead of guessing.

**The backend is frozen.** Do not modify `web/server/**`, `web/shared/types.ts`, `sdk/**`, `demo/**`, `contracts/**`, `circuits/**` or `stylus/**`. The frontend adapts to the server, never the other way round. The new frontend lives in `aegisclear-console/` (README §2). References below to `web/src/*` point at the **old** console, as prior art for the data flow.

---

## 1. Runtime topology

```
Browser (SPA, no keys, no wallet)
   │  fetch /api/*  +  EventSource /api/demo/runs/:id/events      (always same-origin)
   │
   │  dev:  Vite (aegisclear-console) on 127.0.0.1:4047 ──proxy /api, /provider──┐
   ▼                                                                             ▼
Node process (Hono)  http://127.0.0.1:4040   ← `pnpm --filter @aegisclear/web serve`   [WEB_PORT]
   ├── /api/*                 console API (this document)
   ├── /provider/*            x402 provider (co-signed)   ─┐ used by the server's own client agents;
   ├── /provider-anchored/*   x402 provider (anchored)    ─┘ the UI never calls these directly
   └── /*                     static files from web/dist + SPA fallback
                              (web/dist = the new console after `pnpm build:web` in aegisclear-console,
                               or the old console after `pnpm web`)
          │ viem over HTTP
          ▼
   RPC: local private chain (chainId 31337)  or  Robinhood Chain testnet (chainId 46630)
```

- **One process does everything.** It runs the provider, the two demo client agents (A and B), the Groth16 prover (snarkjs, about 3.2–4.7 s per proof), a channel indexer and the provider's watcher. The browser only observes and triggers scenarios.
- **Loopback only, no auth.** The server listens on `127.0.0.1` (`web/server/app.ts:178`), every endpoint is unauthenticated, and the demo private keys live in the server process. **Never add wallet-connect, key input, or any browser-side signing.**
- **Two networks.** `local` (private chain 31337, no block explorer, time-travel instead of real waits) and `testnet` (Robinhood Chain testnet 46630, Blockscout explorer `https://explorer.testnet.chain.robinhood.com`, real waits). The live demo and the video use `testnet`.
- **No CORS.** The server sends no CORS headers, so a page served from any other origin cannot call it. The new console (`aegisclear-console/`) therefore always goes through a same-origin path (README §2.3):
  - **dev:** Vite on `127.0.0.1:4047` proxies `/api` and `/provider` to `:4040`;
  - **demo:** `pnpm build:web` writes into `web/dist`, which the server itself serves.

  The old console's dev mode (`pnpm web:dev`, Vite on `:4043`, `web/vite.config.ts`) works the same way. In both cases the API server runs separately (`pnpm --filter @aegisclear/web serve`).
- **Static serving rules** (`web/server/app.ts:147-158`):
  - Any request path **without a file extension** returns `index.html`, so clean client-side routes such as `/channels/0xAbC…` work.
  - A path **with** a dot is treated as a file. Never put dots in route params.
  - `/api/*`, `/provider/*` and `/provider-anchored/*` are **reserved** and return JSON 404s. Client routes must not start with these prefixes.
  - MIME types exist only for `.html .js .css .svg .json .ico .map .woff2 .png` (`web/server/app.ts:20-23`). Anything else is served as `application/octet-stream`. **Ship only `.woff2` fonts and `.svg`/`.png` images.**
- **Build output** is served from `web/dist`. `pnpm build:web` (in `aegisclear-console/`) writes the new console there. `pnpm web` (repo root) rebuilds the **old** console into the same folder and serves it. Whichever build ran last is what :4040 shows.

---

## 2. Conventions (apply everywhere)

| Kind | Wire format | Display rule |
|---|---|---|
| Token amounts (USDG) | decimal **string** of base units, **6 decimals** (`"70000"` = 0.07 USDG) | Parse with `BigInt`, never `Number` for arithmetic. Show 2 decimals by default (`0.07`) and full precision (`0.070000`) on hover or copy. The token on testnet is **MockUSDG**, and the UI must say so wherever the symbol appears prominently. |
| Basis points | decimal string (`"5000"` = 50 %) | Show as a percentage. |
| Gas | decimal string (`"575544"`) | Thousands separators in `en-US` (`575,544`), tabular numerals. |
| Addresses | EIP-55 checksummed `0x…` (42 chars) | Middle-truncate (`0x4B6F…bBd1`). The full value is in a tooltip and a copy button. Link to the explorer when `explorerBase` exists. |
| Hashes (tx, T, R, leaf) | `0x` + 64 hex | Middle-truncate. Copyable. Tx hashes link to `${explorerBase}/tx/${hash}`. |
| Block numbers | decimal string | Thousands separators. |
| `deadline` | unix **seconds**, chain time | Countdown only when `state === "CLOSING"`. Chain time can drift from the browser clock, so allow for it. |
| `startedAt` / `endedAt` | unix **milliseconds**, server clock | Relative time (“2 min ago”) plus an absolute tooltip. |
| `Step.t` | ms since the run started | `mm:ss.s` elapsed. |
| Explorer links | only if `config.explorerBase` is defined | `${explorerBase}/address/${a}` and `${explorerBase}/tx/${h}`. On `local` render plain copyable text, not a dead link. |

Formatting helpers exist in the old console at `web/src/format.ts` (`fmtUsdg`, `shortAddr`, `countdown`, `explorer`, `gasFmt`). Their output is Indonesian (`"lewat"`, `id-ID` separators). Port the logic into `aegisclear-console/client/src/lib/format/` in English, and leave the old file untouched.

---

## 3. Endpoint reference

Import every type from `web/shared/types.ts` (reproduced in §4). Do not redefine them.

| # | Method and path | Success | Errors | Notes |
|---|---|---|---|---|
| E1 | `GET /api/config` | `200 ConfigResponse` | (none) | Static for the server's lifetime. Fetch once and cache forever. A network error here means the server is down (§9). |
| E2 | `GET /api/channels` | `200 { scannedAt: number; channels: ChannelSummary[] }` | `502 { error }` (RPC hiccup) | Every `ChannelOpened` from all factories in the deployment, **newest first** (by `openedBlock`). The server caches for 3 s (`channels.ts:23`). Poll every 3–5 s and pause when the tab is hidden. `scannedAt` is ms. Testnet has 16 channels today. Local can have hundreds (the fixture has 129). |
| E3 | `GET /api/channels/:addr` | `200 ChannelDetail` | `404 {"error":"unknown channel"}`, `502 { error }` | The address can be in any case. It must be in the E2 list. It includes `cfg` and **all on-chain events with gas**. Slower (one receipt per event), so treat it as moderately expensive. |
| E4 | `POST /api/demo/run` body `{ "scenario": ScenarioId }` | `202 { runId: string }` | `400 {"error":"unknown-scenario"}` · `409 {"error":"busy"}` · `409 {"error":"client-has-open-channel","channel":"0x…"}` · `502 {"error":"preflight-failed","message":"…"}` | **Only one run at a time, server-wide.** `client-has-open-channel` means the demo client still has an OPEN/CLOSING channel from an earlier run. Show it with a link to that channel. `preflight-failed.message` is Indonesian free text, so show it verbatim in a details block. |
| E5 | `GET /api/demo/runs` | `200 RunSnapshot[]` | (none) | Newest first. **`steps` is always `[]` here** (stripped). At most 50 runs are kept. **In memory only: empty after every server restart.** Use it on page load to find a `running` run and re-attach to it. |
| E6 | `GET /api/demo/runs/:id` | `200 RunSnapshot` (with steps) | `404 {"error":"unknown run"}` | Full snapshot. Use it as the initial state before subscribing to E7. |
| E7 | `GET /api/demo/runs/:id/events` | `200 text/event-stream` | `404 {"error":"unknown run"}` | Replays all past steps, then streams live steps, then one `done` or `error` event, then closes (§5). |
| E8 | `GET /api/demo/leak-check/:runId` | `200 LeakResponse[]` (one per Market-B channel of the run) | `404 {"error":"run tidak dikenal atau tidak punya channel Pasar B"}` · `502 { error }` | Only meaningful for runs that produced a channel (every `B-*` scenario and `all`). For `A-complete`/`A-reject` it **always 404s**, so hide the action for those. Scans every tx of the channel over RPC (2 RPC calls per tx; anchored runs have 25 txs), so it takes noticeably longer on testnet than locally. Needs a pending state. |
| E9 | `GET /api/offer?client=A\|B` | `200 { status: number; body: unknown }` | `400 {"error":"client must be A or B"}` | Proxies the provider's `GET /provider/job` for that demo client. `status` is normally **402** and `body` is the x402 challenge (§8). It creates a provider session for that client if none exists (no on-chain effect). |
| n/a | any other `/api/*` | n/a | `404 {"error":"not found"}` | |

**Unhandled server errors** become `502 { error: string }` (`app.ts:42`). Every non-2xx body is JSON with an `error` field. `web/src/api.ts:3-8` already folds `error` and `channel` into the thrown message.

---

## 4. Types (verbatim from `web/shared/types.ts`, with an English glossary)

```ts
import type { Address, Hex } from "viem";

export type Network = "local" | "testnet";
export type ScenarioId = "B-cooperative" | "B-dispute" | "B-anchored-dispute" | "B-rollover" | "A-complete" | "A-reject" | "all";
export const SCENARIOS: ScenarioId[] = ["B-cooperative", "B-dispute", "B-anchored-dispute", "B-rollover", "A-complete", "A-reject", "all"];
export type ChannelState = "UNINIT" | "OPEN" | "CLOSING" | "SETTLED";

export interface ConfigResponse {
  network: Network; chainId: number; rpcUrl: string; explorerBase?: string; deployBlock: string;
  addresses: Record<string, Address>;
  provider: Address; clients: { label: "A" | "B"; address: Address }[];
  windows: { challenge: number; response: number };
  /** private off-chain values (shown as "known only to the two parties"); the session nonce is never sent */
  terms: { unitPrice: string; maxM1: string; minM2: string; penaltyBps: string; capBps: string };
  breaches: number[]; deposit: string;
}
export interface Step {
  i: number; t: number; phase: string; label: string; detail?: string; txHash?: Hex; gasUsed?: string; channel?: Address;
  progress?: { done: number; total: number };
}
export interface Row { pasar: string; klien_provider: string; penentu: string; terlihat: string; gas: string; proving_ms: string; txs: { label: string; hash: Hex }[] }
export type RunStatus = "running" | "done" | "error";
export interface RunSnapshot {
  id: string; scenario: ScenarioId; status: RunStatus; startedAt: number; endedAt?: number;
  steps: Step[]; result?: Row[]; error?: string; channels: Address[];
}
export interface ChannelSummary {
  channel: Address; factory: Address; factoryName: string; client: Address; provider: Address; termsCommitment: Hex;
  state: ChannelState; seq: number; epoch: number; cumulativeAmount: string; receiptsRoot: Hex; budget: string; deadline: number; hasProof: boolean; payToClient: string;
  openedTx: Hex; openedBlock: string; runId?: string;
  /** "anchored" iff factoryName === "factoryAnchored" (acks on-chain, no co-signed checkpoints), otherwise "co-signed". */
  mode: "co-signed" | "anchored";
}
export interface ChannelEvent { name: string; args: Record<string, string>; txHash: Hex; blockNumber: string; gasUsed: string }
export interface ChannelDetail extends ChannelSummary {
  cfg: { client: Address; provider: Address; token: Address; termsCommitment: Hex; challengeWindow: number; responseWindow: number; payoutClient: Address; payoutProvider: Address; salt: Hex };
  events: ChannelEvent[];
}
export interface LeakResponse { channel: Address; txs: Hex[]; leaks: number; ambiguous: number; details: { txHash: Hex; word: string; kind: "leak" | "ambiguous" }[] }
export type SseEvent = { type: "step"; data: Step } | { type: "done"; data: RunSnapshot } | { type: "error"; data: RunSnapshot };
```

### 4.1 Field glossary

**`ConfigResponse`**
- `addresses` keys (whitelisted in `web/server/config.ts:33`):
  - `usdg`: MockUSDG token.
  - `factory`: co-signed channel factory with the demo window (60 s testnet, 120 s local).
  - `factoryProd`: co-signed factory with the production 6 h window. Testnet only; **missing on local**.
  - `factoryAnchored`: anchored-mode factory, whose Poseidon hashing runs in the Stylus program.
  - `escrow`: `SimpleJobEscrow`, the Market A control.
  - `verifier`: Groth16 `SLASettlementVerifier`.
  - `router`: `AegisTreasuryRouter`.
  - `poseidon`: the Stylus `AegisPoseidon` program on testnet, or the Yul twin locally.
  - Treat every key as optional.
- `windows`: challenge and response windows in **seconds**. Testnet `{challenge: 60, response: 30}`, local `{challenge: 120, response: 60}`.
- `terms`: the private SLA terms both parties signed. They **never** reach the chain (only their Poseidon commitment `T` does). Values:
  - `unitPrice` `20000` (0.02 USDG per unit).
  - `maxM1` `800`: latency ceiling in ms. A unit breaches if its latency is above this.
  - `minM2` `90`: quality floor.
  - `penaltyBps` `5000`: 50 % of the unit price is refunded per breaching unit.
  - `capBps` `3000`: the total penalty is capped at 30 % of `A`.
- `breaches`: sequence numbers of the units that breach the SLA in the demo: `[3,17,29,44,58,71,90]` (latency 1200 ms instead of 300 ms). The provider applies this schedule to **every Market-B session, per epoch, by in-epoch seq**. `metricsFor(n)` uses `n = tree.size`, and the tree resets on rollover (`sdk/src/provider/server.ts:161,192,301`). So:
  - `B-dispute` and `B-cooperative` (100 units) both contain all 7 breaches. In the cooperative close they are simply **not penalised**, because the client signed the close.
  - `B-anchored-dispute` (20 units) contains seq 3 and 17.
  - `B-rollover` has all 7 in epoch 0 (128 units) **and** seq 3 again in epoch 1 (5 units). Neither is penalised (cooperative).

  Market A has no units.
- `deposit`: what a Market-B client deposits: `"5000000"` (5 USDG).

**`ChannelSummary` / `ChannelDetail`**
- `state`:
  - `UNINIT`: not opened.
  - `OPEN`: live, and units are being served and acked.
  - `CLOSING`: a checkpoint or close was submitted and the challenge window is running. `deadline` is meaningful only here.
  - `SETTLED`: terminal. Funds are paid out.
- `mode`:
  - `co-signed`: every unit is acked off-chain by a checkpoint signed by both parties. There are zero transactions per unit.
  - `anchored`: every unit is an on-chain `ack` transaction. The contract inserts the leaf hash into a Poseidon Merkle tree using the Stylus program.
- `factoryName`: one of `factory`, `factoryProd`, `factoryAnchored` (see above).
- `seq`: units acked in the **current epoch**.
- `epoch`: incremented by each rollover. One epoch holds at most 128 units (`MAX_SEQ`).
- `cumulativeAmount` (**A**): the amount owed to the provider for the current epoch, as last recorded on-chain.
- `budget`: the channel's **live token balance**. It becomes 0 after settle and sweep.
- `hasProof` / `payToClient`: whether a Groth16 penalty proof was accepted, and the proven refund to the client.
- `termsCommitment` (**T**): the Poseidon commitment of the private terms.
- `receiptsRoot` (**R**): the Poseidon Merkle root of the co-signed receipts.
- `runId`: set only for channels created by a run **in this server session**. It is lost on restart.
- `openedTx` / `openedBlock`: the provider's `factory.open` transaction.
- `cfg.payoutClient` / `cfg.payoutProvider`: where funds actually go. They may differ from the parties, for example a treasury router or a Safe.

> ⚠️ **Do not read the settlement split from `cumulativeAmount`.** Channels closed cooperatively, or after a rollover, often show `cumulativeAmount = "0"` on-chain even though 2.00 USDG was paid (testnet `0x66C4…05dC`: A = 0, but the `Settled` event says `toProvider 2000000`). The authoritative split of a settled channel is the **`Settled` event** (`toProvider`, `toClient`, `penalty`, `cooperative`). A list view that has no events should show state, seq and proof, and defer the money figures to the detail view.
>
> ⚠️ **Rolled-over channels pay the provider in more than one event.** `Settled` covers only the **last** epoch. Each earlier epoch was paid by its `RolledOver` event. Recorded on testnet `0xD1F6…2b1D` and locally:
> - `RolledOver{newEpoch 1, closedSeq 128, toProvider 2560000, remaining 2440000}`
> - then `Settled{seq 5, toProvider 100000, toClient 2340000, cooperative true}`
>
> So the provider's total is Σ `RolledOver.toProvider` + `Settled.toProvider` = 2.56 + 0.10 = **2.66** (matching the run's `0.00 / 2.66` row). The client got back `Settled.toClient` = 2.34, and 2.56 + 0.10 + 2.34 = the 5.00 deposit. `settlementOf()` must sum across epochs and show the per-epoch breakdown.

**`Row`** (result table). The keys are Indonesian and fixed by the backend. Map them for display:

| key | Meaning | Display header (EN) |
|---|---|---|
| `pasar` | market and scenario label (Indonesian, see §7) | Market |
| `klien_provider` | `"<to client> / <to provider>"` in USDG, e.g. `"0.07 / 1.93"`. Market A uses `"0 / 2.00"` and `"2.00 / 0"`. | Client / Provider (USDG) |
| `penentu` | who decides the outcome | Decided by |
| `terlihat` | what the explorer can read | Readable on the explorer |
| `gas` | full-cycle gas of the client's txs (decimal string) | Full-cycle gas |
| `proving_ms` | Groth16 proving time in ms, or `"-"` | Proving |
| `txs` | `{label, hash}` for every client tx | Transactions |

**`LeakResponse`**
- `txs`: every scanned transaction, **including the provider's `factory.open` tx** (found via `ChannelOpened`) plus the client's txs.
- `leaks`: 32-byte calldata or log words **equal to** a private value.
- `ambiguous`: equal values that are also small multiples of 32 (< 4096), so they could be ABI offsets.
- `details`: one entry per hit.

The scanned set is `unitPrice` (omitted for anchored channels, where the price is implied on-chain by `A` per ack), `maxM1`, `minM2`, `penaltyBps`, `capBps`, the session `nonce`, and the metric values `1200`, `300` and `95` (`demo/src/scenarios.ts:20-22`, `demo/src/leak.ts`). Every recorded run returns `leaks: 0, ambiguous: 0`.

---

## 5. Run lifecycle and the SSE stream

### 5.1 State machine

```
idle ──POST /api/demo/run──▶ starting ──202 {runId}──▶ running ──SSE step…step──▶ done   (result: Row[], channels)
  ▲                              │                                  └──────────▶ error  (error: string)
  └──── 400/409/502 ─────────────┘   (show the reason; nothing started)
```

- **Only one run at a time, server-wide** (`web/server/runs.ts`). Disable every "run" action while any run is `running`, and say why.
- **Resume on load.** Call `GET /api/demo/runs`. If `[0].status === "running"`, call `GET /api/demo/runs/:id` and attach to E7. The current console already does this (`web/src/components/DemoPanel.tsx:31-37`).
- Run ids look like `mudg1f4b-60a0fd` (base-36 time, a dash, 6 hex digits). They contain no dot, so they are safe in routes.
- Snapshots disappear when the server restarts. A deep link to an unknown run must show a friendly "this run is no longer in server memory" state, with a link to the channel if you know it, and a button to start a new run.

### 5.2 Wire format (recorded, `fixtures/local-31337/sse/*.sse.txt`)

```
event: step
data: {"phase":"fund","label":"▶ B-dispute — klien B 0x90F79bf6EB2c4f870365E785982E1f101E93b906","i":0,"t":4}
id: 0

event: step
data: {"phase":"fund","label":"fund","txHash":"0x0e1d…0495","gasUsed":"51577","channel":"0x1E12…C6C4","i":2,"t":60}
id: 2

…

event: done
data: { …full RunSnapshot incl. steps and result… }
id: end
```

- `step` events carry one `Step`, and `id` is `String(i)`. The terminal event is `done` or `error`, with `id: end` and a full `RunSnapshot` as data. The server then closes the stream.
- **Gotcha: the event name `error` collides with `EventSource`'s native `error` event** (connection failure). Tell them apart by the presence of `data`. The existing client does it this way (`web/src/api.ts:25`):
  ```ts
  es.addEventListener("error", (e) => { if ((e as MessageEvent).data) { /* run failed: parse RunSnapshot */ es.close(); } /* else: transport error */ });
  ```
- **Reconnects replay everything.** The server ignores `Last-Event-ID` and replays all steps from index 0 on every connection, so **dedupe by `i`** and keep steps sorted by `i`. Close the `EventSource` yourself after `done`/`error`, otherwise it reconnects. On a transport error with no terminal event, fall back to polling E6 every 2 s.
- The stream is flushed every ~200 ms. Several steps can arrive in one burst (all tx steps of a phase are flushed together, sharing the same `t`).

### 5.3 Phases (`demo/src/scenarios.ts:25`)

`Step.phase` is one of:

| phase | Meaning (EN) | Typical steps |
|---|---|---|
| `fund` | client receives the 402 and funds the predicted channel address | leg marker, `402 diterima…`, `fund` tx, optional faucet mint |
| `open` | the provider opens the channel (CREATE2) on the first ack. The tx is the provider's and **is not in the step log**, but it appears as the `Opened` event in the channel detail. | narrative only |
| `serve` | units served and acked. Carries `progress`. | `k/n unit dilayani…` |
| `ack` | anchored: one on-chain `ack` tx per unit. Co-signed: the final ack message. | `ack` tx ×N, `ack terakhir dikirim` |
| `close` | cooperative close or rollover | `closeCooperative`, `rollover` txs + narrative |
| `dispute` | client submits the highest co-signed checkpoint (co-signed) or `startClose` (anchored), then `claimPenalty` with the proof | narrative, `submitCheckpoint`/`startClose` tx, `claimPenalty` tx |
| `prove` | Groth16 proof result: `payToClient` + `detail: "<ms> ms proving"` | one step |
| `wait` | challenge window. Local: one time-travel step. Testnet: a step every 10 s with `progress` (§5.5). | |
| `settle` | final settle (client tx) **or** a note that the provider's watcher already settled | `settle` tx or narrative |
| `escrow` | Market A (binary escrow control) steps | `approve`, `createJob…`, `fund`, `submit…`, `complete…`/`reject…` txs |

Unknown phases must render with a neutral style. Never crash on them.

### 5.4 Ordering facts the UI must respect (recorded)

1. **The `prove` step arrives after the `claimPenalty` tx step**, even though proving happens before the claim. The SDK flushes the dispute txs first and emits the proof summary afterwards (`scenarios.ts:100-102`). Recorded sequence: `dispute` narrative → `submitCheckpoint` tx → `claimPenalty` tx → `prove` (`4682 ms proving`) → `wait` → `settle`. **Group dispute, prove and settle into one "resolution" block** instead of rendering a strictly linear list, or at least do not animate the proof as if it came last.
2. **Rollover emits the `fund` tx before the `402 diterima` line**, and has **no `open` step** (`scenarios.ts:146-147`).
3. **Rollover progress:** the label says `128/128 unit epoch 0`, but `progress` is `{done:128,total:133}`. Bars use `progress` and text uses the label adapter. Never parse the label for numbers.
4. **Anchored** emits 20 `ack` tx steps (each with its own gas: first ~449k locally / ~350k testnet, then ~300k locally / ~201–210k testnet) and only two `serve` progress steps (10/20 and 20/20).
5. **`all`** runs four legs in this order: `B-cooperative`, `B-dispute`, `A-complete`, `A-reject` (`web/server/demo.ts:25`; it does **not** include anchored or rollover). Each leg starts with a `▶ <scenario> — klien <A|B> <address>` marker step. Render these markers as leg dividers. `result` then has 4 rows in the fixed order A-complete, A-reject, B-cooperative, B-dispute (`toRows`).
6. Steps without `txHash` are narrative. Steps with `txHash` always have `gasUsed` and usually `channel` (Market A steps have no `channel`).
7. The settle phase can end in any of three ways (all normal): a `settle` tx by the client; `sudah di-settle oleh watcher provider…` (the watcher settled first, no client tx); or `settle() klien kalah balapan…` (the client's tx lost the race). The last two are **not errors**.
8. **No "proving started" event exists.** After the `dispute` narrative step, the stream is silent until the burst `submitCheckpoint` → `claimPenalty` → `prove`. Recorded locally: 4.8 s (t 2433 → 7229). On testnet it is longer, because it adds two tx confirmations. That silence contains checkpoint confirmation, proof generation and claim confirmation. Show an **elapsed timer for the whole dispute phase**, with copy such as "Submitting the checkpoint and generating the Groth16 proof…". **Do not fake sub-step progress.** The real proving time arrives afterwards in the `prove` step's `detail`.
9. **Leak check exists only for runs of the current server session.** E8 needs the run's private records, which live in server memory. A channel from an earlier session (e.g. the testnet hero channel `0x4B6F…bBd1` from 20 Sep) can show its terms commitment, receipts root, `Settled` split and proof. It **cannot** show a fresh leak verdict. Say so ("Leak check is available for runs started in this console session") instead of showing an empty or fake result.

### 5.5 Real durations (plan the waiting UX around these)

| Scenario | Local (recorded 23 Sep 2026) | Testnet 46630 v2 (README, 20 Sep 2026) |
|---|---|---|
| `B-dispute` | 7.3 s | **158 s** (incl. 60 s challenge window) |
| `B-anchored-dispute` | 65 s | **140 s** (20 on-chain acks + 60 s window) |
| `B-rollover` | 3.3 s | **135 s** |
| `B-cooperative` | 2.4 s | **96 s** |
| `A-complete` / `A-reject` | 0.1–0.2 s | **13 s** each |
| `all` | 20.5 s | ≈ 5 min (sum of 4 legs) |

On testnet the challenge-window wait is streamed as `wait` steps every 10 s: `menunggu jendela tantangan: 60 s tersisa` with `progress {done: 0, total: 60}`, then `… 50 s tersisa` `{done: 10, total: 60}`, and so on (`web/server/chain.ts:41-45`). **This minute is the longest quiet moment of the demo.** The UI must explain it: anyone can challenge with a higher co-signed checkpoint, and after the deadline `settle()` is permissionless. It must not look frozen. Locally the whole wait is one step: `Anvil: evm_increaseTime(<s>) + evm_mine`.

---

## 6. Scenarios (what each button does)

| id | Client | Market | What happens | Expected result row `client / provider` | Client txs (labels) | Channel mode |
|---|---|---|---|---|---|---|
| `B-dispute` | B | AegisClear | 100 units, 7 SLA breaches, dispute settled by a Groth16 proof | **`0.07 / 1.93`** | `fund`, `submitCheckpoint`, `claimPenalty`, `settle` | co-signed |
| `B-anchored-dispute` | A | AegisClear | 20 units, each acked **on-chain** (Stylus Poseidon), 2 breaches (seq 3, 17), dispute with a proof over the on-chain root | **`0.02 / 0.38`** | `fund`, `ack`×20, `startClose`, `claimPenalty`, `settle` | anchored |
| `B-rollover` | B | AegisClear | 128 units fill epoch 0, then a cooperative rollover pays 2.56 USDG and carries the rest into epoch 1, 5 more units, then a cooperative close | **`0.00 / 2.66`** | `fund`, `rollover`, `closeCooperative` | co-signed (epoch 1 at the end) |
| `B-cooperative` | A | AegisClear | 100 units, both parties sign a close (breaches are not penalised: the client chose not to dispute) | **`0.00 / 2.00`** | `fund`, `closeCooperative` | co-signed |
| `A-complete` | A | binary escrow (control) | ERC-8183-style escrow, evaluator = client → complete | **`0 / 2.00`** | `approve`, `createJob (syarat di calldata)`, `fund`, `submit (provider)`, `complete (evaluator = klien)` | (none) |
| `A-reject` | B | binary escrow (control) | same, evaluator rejects | **`2.00 / 0`** | same, ending `reject (evaluator = klien)` | (none) |
| `all` | A+B | both | `B-cooperative`, `B-dispute`, `A-complete`, `A-reject` in sequence | 4 rows | union | two B channels |

- Result rows are **deterministic**: the same numbers appear on local and testnet. Only gas and time differ. Testnet full-cycle gas (console, 20 Sep 2026): B-dispute 575,544 · anchored 4,799,914 (Stylus; the same cycle on local/Yul: 6,766,593) · rollover 298,821 · cooperative 182,452 · A-complete 384,176 · A-reject 367,017.
- Worked example (spec §6.5): penalty per breaching unit = ⌊0.02 × 50 %⌋ = 0.01 USDG. Seven breaches give 0.07. The cap is 30 % of A (2.00) = 0.60, so it does not bind. The provider receives A − 0.07 = 1.93, and the client receives 0.07 plus the unused 3.00 deposit (the `Settled` event shows `toClient 3070000`).
- Market A puts the terms in plain calldata (`createJob` description `"100 units @ 0.02 USDG; maxLatency 800ms; minQuality 90; penalty 50%; cap 30%"`, `scenarios.ts:175`). That contrast is the point of the demo.

---

## 7. Server strings are Indonesian: the label adapter (required)

The UI is English, but the server emits Indonesian narrative text in `Step.label`, `Step.detail`, `Row.pasar`, `Row.penentu`, `Row.terlihat`, one leak-check 404 message and `preflight-failed.message`. The backend is frozen, so the frontend must own a **pure, unit-tested adapter**:

- `presentStep(step) → { title, meta?, tone }`
- `presentRow(row) → { market, decidedBy, visible }`

Rules:
- Match with the regexes below, anchored `^…$`.
- **Unmatched strings fall back to the raw server text**, rendered as-is. Never crash, never hide them.
- Tx steps (with `txHash`) use the tx-label table.
- Keep all English copy in one module so an Indonesian locale can be added later. For `id`, the adapter can return the raw label.

### 7.1 Narrative step labels (complete catalogue, from code and recordings)

| # | phase | Server label (regex) | English rendering (suggested copy) | Source |
|---|---|---|---|---|
| L1 | fund/escrow | `^▶ (?<scenario>[\w-]+) — klien (?<client>[AB]) (?<addr>0x[0-9a-fA-F]{40})$` | Leg divider. Title: “{scenario title}”. Meta: “client {A\|B} ({addr short})”. | `web/server/demo.ts:99` |
| L2 | fund/escrow | `^faucet: mint (?<n>[\d.]+) USDG ke klien (?<client>[AB])$` | “Faucet minted {n} MockUSDG to client {A\|B}” | `demo.ts:98` |
| L3 | fund | `^402 diterima: payTo (?<channel>0x[0-9a-fA-F]{40}), deposit (?<amt>[\d.]+) USDG$` | “402 Payment Required: pay {amt} USDG to {channel short}, the predicted channel address (not yet deployed)” | `scenarios.ts:85,147` |
| L4 | open | `^provider membuka channel saat ack pertama \(tx provider, lihat kolom channel\)$` | “Provider opens the channel on the first ack (provider-side transaction)” | `scenarios.ts:87` |
| L5 | serve | `^(?<k>\d+)/(?<n>\d+) unit dilayani & di-ack \(checkpoint co-signed\)$` | “{k} of {n} units served, each acked by a co-signed checkpoint (no transactions)” | `scenarios.ts:94` |
| L6 | serve | `^(?<k>\d+)/(?<n>\d+) unit dilayani & di-ack on-chain$` | “{k} of {n} units served, each acked on-chain” | `scenarios.ts:94` |
| L7 | ack | `^ack terakhir dikirim \(POST /ack\)$` | “Final ack delivered to the provider” | `scenarios.ts:97` |
| L8 | dispute | `^sengketa: submit checkpoint co-signed tertinggi, lalu bukti penalti$` | **Context-dependent**, because the server emits the same text in both modes (recorded). For a co-signed channel: “Dispute opened: submit the highest co-signed checkpoint, then the penalty proof”. For **anchored** (`B-anchored-dispute`, or the channel's `mode === "anchored"`), where the next tx is `startClose`, not `submitCheckpoint`: “Dispute opened: start the close at the last on-chain ack, then the penalty proof”. `presentStep` needs the scenario or the channel mode. | `scenarios.ts:99` |
| L9 | prove | `^bukti Groth16: payToClient (?<amt>[\d.]+) USDG$` (+ `detail` `^(?<ms>\d+) ms proving$`) | Title: “Groth16 proof accepted: {amt} USDG back to the client”. Meta: “proved in {ms/1000} s”. | `scenarios.ts:102` |
| L10 | wait | `^menunggu jendela tantangan: (?<left>\d+) s tersisa$` | “Challenge window: {left} s left (anyone may answer with a higher checkpoint)” | `web/server/chain.ts:43` |
| L11 | wait | `^Anvil: evm_increaseTime\((?<s>\d+)\) \+ evm_mine$` | “Local chain: fast-forwarded {s} s to the end of the challenge window” | `chain.ts:37` |
| L12 | settle | `^sudah di-settle oleh watcher provider \(permissionless\) — tanpa tx klien$` | “Settled by the provider's watcher (settle is permissionless), so the client sent no tx” | `scenarios.ts:114` |
| L13 | settle | `^settle\(\) klien kalah balapan dengan watcher provider — channel sudah SETTLED$` | “The provider's watcher settled first, so the channel is already settled” | `scenarios.ts:122` |
| L14 | serve | `^(?<k>\d+)/128 unit epoch 0$` | “{k} of 128 units served in epoch 0” | `scenarios.ts:148` |
| L15 | close | `^epoch 0 penuh \(MAX_SEQ 128\) → rollover: bayar 2,56 USDG, sisa jadi budget epoch 1$` | “Epoch 0 is full (128 units). Rollover pays 2.56 USDG and carries the rest into epoch 1.” | `scenarios.ts:150` |
| L16 | serve | `^epoch (?<e>\d+) dimulai: seq kembali ke 0, deposit tidak diulang$` | “Epoch {e} started: sequence reset to 0, no new deposit” | `scenarios.ts:152` |
| L17 | serve | `^133/133 unit dilayani \(5 di epoch 1\)$` | “133 of 133 units served (5 in epoch 1)” | `scenarios.ts:154` |

### 7.2 Transaction labels (`Step.label` when `txHash` is set; also `Row.txs[].label`)

| Label | Who sends it | English rendering | Notes |
|---|---|---|---|
| `fund` | client | Fund channel (USDG transfer) | In Market A: fund escrow |
| `ack` | client | Ack unit on-chain | anchored only; 20 per run |
| `submitCheckpoint` | client | Submit highest co-signed checkpoint | starts the challenge window |
| `startClose` | client | Start close (anchored) | starts the challenge window |
| `claimPenalty` | client | Claim penalty with the Groth16 proof | verifier ≈ 229k gas of ≈ 304k |
| `settle` | client (or watcher) | Settle | permissionless |
| `closeCooperative` | client | Cooperative close (both signatures) | |
| `rollover` | client | Rollover to next epoch | |
| `openViaExit`, `exitUnilateral` | client | Open via exit ticket · Unilateral exit | in the SDK (`sdk/src/client/agent.ts:373,396`), not used by the scenarios |
| `approve` | client (A) | Approve escrow | Market A |
| `createJob (syarat di calldata)` | client (A) | Create job (terms in plain calldata) | Market A: the leak being contrasted |
| `submit (provider)` | provider (A) | Provider submits the work | Market A |
| `complete (evaluator = klien)` / `reject (evaluator = klien)` | client (A) | Evaluator completes / rejects (evaluator = client) | Market A |

### 7.3 Result-row strings (`toRows`, `demo/src/scenarios.ts:187-196`)

| `pasar` (exact) | Market (EN) | `penentu` → Decided by | `terlihat` → Readable on the explorer |
|---|---|---|---|
| `A: evaluator biner (complete)` | Market A: binary evaluator (complete) | `alamat evaluator` → an evaluator address | `harga, ambang, penalti (string)` → price, thresholds, penalty (plain text) |
| `A: evaluator biner (reject)` | Market A: binary evaluator (reject) | same | same |
| `B: AegisClear kooperatif` | AegisClear: cooperative close | `dua tanda tangan` → two signatures | `T, R, jumlah` → T, R, amount |
| `B: AegisClear sengketa (bukti)` | AegisClear: dispute settled by proof | `bukti Groth16` → a Groth16 proof | `T, R, jumlah, payToClient` → T, R, amount, payToClient |
| `B: AegisClear anchored (ack on-chain, sengketa)` | AegisClear anchored: on-chain acks, dispute | `bukti Groth16 atas R on-chain` → a Groth16 proof over the on-chain R | `hash daun, A per ack, payToClient` → leaf hashes, A per ack, payToClient |
| `B: AegisClear rollover (128 + 5 unit, 1 deposit)` | AegisClear rollover: 128 + 5 units, one deposit | `dua tanda tangan ×2 (rollover + close)` → two signatures, twice (rollover + close) | `T, R, epoch, jumlah` → T, R, epoch, amount |

Other server texts: `run tidak dikenal atau tidak punya channel Pasar B` (E8 404) → “No leak check for this run: it has no AegisClear channel.”

---

## 8. The x402 offer (`GET /api/offer` → `body`)

Recorded in `fixtures/testnet-46630/offer-*.json` and `fixtures/local-31337/offer-*.json`. Shape (`sdk/src/provider/server.ts:125-133`):

```jsonc
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:46630",                 // eip155:<chainId>
    "asset": "0x5A9BC1441DE45D7a722339Bec093637bc5042382",   // MockUSDG
    "payTo": "0x506c9e93A11c5Be8e86A9c8A4DEC4dE8297C7B2a",   // CREATE2-predicted channel: not deployed yet
    "maxAmountRequired": "5000000",           // 5 USDG deposit
    "extra": { "aegis": {
      "config": { "client", "provider", "token", "termsCommitment", "challengeWindow", "responseWindow", "payoutClient", "payoutProvider", "salt" },
      "sigProvider": "0x…",                   // provider's EIP-712 signature over the channel config
      "terms": { "unitPrice": "20000", "maxM1": "800", "minM2": "90", "penaltyBps": "5000", "capBps": "3000", "nonce": "1151…4596" },
      "unitQty": "1",
      "exitSig": "0x…",                       // pre-signed seq-0 exit ticket (client can always leave)
      "anchored": false
    } }
  }]
}
```

Explain this JSON; do not just dump it. To a facilitator it is an ordinary x402 `exact` offer. The difference is that `payTo` is an escrow that does not exist yet and can only ever become a channel with exactly these signed terms. `terms` is sent **to the client only**. It is private from the chain, not from the counterparty. Known limitation (README “Keterbatasan SDK”): after a run finishes, this endpoint keeps returning the old session (with a `payTo` that is already SETTLED) until the next run resets it, so label it “current session offer”.

---

## 9. Error and edge-case matrix

| Situation | Detect | UI response (copy in `README.md` §7) |
|---|---|---|
| Server not running | `fetch('/api/config')` rejects (TypeError) or 5xx | Full-page blocking state with the exact command: `AEGIS_NETWORK=testnet pnpm --filter @aegisclear/web serve` (testnet) or `pnpm --filter @aegisclear/web serve` (local chain), plus a retry. Keep polling every 3 s. |
| RPC hiccup | `502 {error}` on E2/E3/E8 | Keep showing the last good data, mark it stale (“last updated 12 s ago”), retry with backoff. |
| Run already in progress | `409 busy` | Point to the running run and offer to open it. |
| Client still has an open channel | `409 client-has-open-channel` + `channel` | Explain it and link to `/channels/:channel`. On testnet an OPEN, unfunded channel can remain from a failed run. |
| Preflight failed | `502 preflight-failed` + `message` | Show a short English summary and the raw `message` in a details block. |
| Unknown run (restart or old link) | `404 unknown run` | “This run is no longer in the console's memory (the server restarted).” CTA: start a run, or open the channel list. |
| Unknown channel | `404 unknown channel` | Check the address. It must belong to this deployment's factories. |
| Leak check on a Market-A run | `404` (E8) | Don't offer it: Market A has no channel. Its terms are already in calldata, which is the point. |
| Run ended in `error` | SSE `error` event or `status: "error"` | Show `error` (free text), keep the partial step log and any channel links. |
| Stale reads on testnet | numbers lag right after a receipt (load-balanced RPC) | Show `scannedAt` as “scanned 3 s ago”. Never flash zeros; keep previous values until new ones arrive. |
| `local` network | `config.network === "local"` | No explorer links. The waits are instant. Show a “local chain” badge. |

---

## 10. Data freshness

| Data | Strategy |
|---|---|
| `config` | fetch once, cache for the session |
| channels list | poll 3–5 s (server TTL 3 s); pause in background tabs; faster (2 s) while a run is active; invalidate after a run ends |
| channel detail | fetch on open. Refetch every 5 s while `state !== "SETTLED"` and stop once settled (terminal). |
| runs list | on load; after starting a run; after `done`/`error` |
| run snapshot | E6 once, then E7 stream; poll E6 every 2 s only if SSE fails |
| leak-check | on demand (button); cache per run id |
| offer | on demand per client |

---

## 11. Fixture and replay mode (for building without a chain)

The backend needs a chain, a 100 MB proving key and funded keys, so **the frontend must also run fully from fixtures**:

- Put the fixture JSON behind the same typed client interface as the live API (`createLiveApi()` / `createFixtureApi()`), selected by `VITE_API_MODE=live|fixtures` (default `live`). `VITE_FIXTURE_SET=local|testnet` picks the recordings (default `local`; `testnet` has no runs, so its `startRun` answers `502 preflight-failed`).
- As implemented in `aegisclear-console/client/src/lib/api/fixtures.ts`: errors reuse the recorded bodies in `local-31337/errors/`. A listed channel with no recorded detail answers `404 {"error":"not-recorded"}`, never `unknown channel`. Channel details are the recorded final state, so a replayed run's channel already reads `SETTLED` while its tape is still playing.
- The fixture client must replay SSE runs from `fixtures/local-31337/runs/<scenario>.snapshot.json` with the **recorded `t` offsets**, scaled by a speed factor (`?speed=4`). For a testnet feel, it can synthesize the 10-second `wait` steps of §5.5 (**label them as simulated** in dev tooling, never in the product UI).
- Fixture mode must never be the default in the demo build (`pnpm build:web`), and must be impossible to confuse with a real run: show a persistent “Fixture replay” badge.

The fixture inventory is in [`fixtures/README.md`](./fixtures/README.md).
