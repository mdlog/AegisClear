<!-- trace: idea="Privacy-preserving escrow for agent-to-agent USDG payments on Robinhood Chain — SLA disputes settled by a Groth16 proof, not a judge." | track="Overall Prize (also fits Promising Products Track)" | weights="JUDGING WEIGHTS NOT PUBLISHED — criteria: Smart contract quality; Product-Market Fit; Innovation and Creativity; Real Problem Solving (+ extra consideration for USDG; ≥1 of 3 prizes reserved for Robinhood Chain)" | source=ui-architect -->
# Layout Specification: AegisClear operator console (new console in `aegisclear-console/`)

> Derived from: `prd-arsitektur.md` (§4 personas/user stories, §5 FR-1…FR-28, §6.5–6.7, §14 demo harness), `docs/SUBMISSION.md` (§2.2 runbook steps 1–10, §3 video script 0:00–2:55, §7 rubric), `docs/frontend/PRODUCT_CONTEXT.md` (§8 feature inventory F1–F11 + 5 improvements = the MUST-HAVE list), `docs/frontend/API_CONTRACT.md` (E1–E9, §5 SSE lifecycle, §7 label adapter, §9 error matrix, §10 freshness, §11 fixture mode), `docs/frontend/fixtures/README.md`.
> Sister docs: `docs/frontend/DESIGN_BRIEF.md` (tone; written in parallel and not read for this spec), `web/shared/types.ts` (types, frozen), `docs/frontend/fixtures/` (real recorded data).
> **Reconciled with DESIGN_BRIEF.md after both were written (23 Sep 2026):** where the two overlap, `README.md` §1.1 is binding. Topics:
> - the verdict band and privacy mirror render as the brief's settlement slip;
> - the unit grid is 16 × 8 per epoch;
> - breaches are marked in every Market-B run;
> - the channel record is a page, not a drawer;
> - dotted example strings are separate fields;
> - single-key shortcuts can be turned off.
> Generated: 2026-09-23. Scope: **structure only** (pages, sections, hierarchy, navigation, states, responsive behaviour). No colours, fonts or visual styling.
> Stack: Vite + React SPA, React Router v7 data router (`createBrowserRouter`) with a root error element. The Hono server already returns `index.html` for any extension-less path, so every URL below survives a reload. Backend is frozen: no new endpoints.

---

## 0. Working notes

### 0.1 Judging criteria (verbatim, SUBMISSION.md §7, HackQuest page read 20 Sep 2026)

- "Smart contract quality - code following best practices, structured logically and efficiently, with minimal security vulnerabilities"
- "Product-Market Fit - projects with clear potential to attract and retain users"
- "Innovation and Creativity - original approaches that push boundaries"
- "Real Problem Solving - applications that address genuine market needs."
- "Extra consideration is given to projects integrating Paxos' USDG stablecoin."
- "At minimum, 1 of 3 prizes is reserved for a project building on Robinhood Chain."

**JUDGING WEIGHTS NOT PUBLISHED.** No percentages are used anywhere in this spec. There is no design criterion: the UI earns points only by making innovation and real problem-solving *visible* (PRODUCT_CONTEXT §2). Judges mostly see the **video** and screenshots (the console is local-only, keys are server-side), so the video timeline drives spec depth.

### 0.2 Route priority (organizer's criterion order + demo-script emphasis)

Ranking rule: first by share of the demo script (video seconds and runbook steps), then by which criterion the screen makes legible, keeping the organizer's listing order (Smart contract quality, Product-Market Fit, Innovation and Creativity, Real Problem Solving) as the tie-breaker.

| Rank | Route | Demo share | Criteria it makes visible | Spec depth |
|---|---|---|---|---|
| 1 | `/runs/:runId` (WOW) | video 0:00–0:10, 0:55–1:35, 1:50–2:30 (≈ 100 of 175 s); runbook 3–6, 8–10 | Innovation and Creativity (proof-decided proportional split, private terms, leak check); Real Problem Solving (the buyer gets 0.07 back instead of nothing); Smart contract quality (real txs with gas, permissionless settle) | Deepest, bespoke |
| 2 | `/channels/:address` | video 1:35–1:50; runbook 7, 9 | Smart contract quality (on-chain lifecycle and event trail with gas, explorer-verifiable) | Deep |
| 3 | `/` Desk | video 0:10–0:40 (may replace slides 1–2); runbook 1, 3, 8–10 | Real Problem Solving and Product-Market Fit (problem line, market evidence, three-rail comparison); Innovation | Medium |
| 4 | `/offer` | video 0:40–0:55; runbook 2 | Product-Market Fit (drop-in distribution: one `payTo`, facilitators unchanged); Innovation (escrow at the x402 `payTo`) | Medium |
| 5 | `/deployment` | video 2:30–2:55 (may replace slides 3–4); runbook 1, 8, 10 | Smart contract quality (7/7 verified, measured gas); Robinhood Chain + USDG consideration (network, MockUSDG honesty) | Light |
| 6 | `/channels` | video 2:15–2:30 (table row `epoch 1 · seq 5 · SETTLED`); runbook 1, 7, 9 | Smart contract quality (liveness: real channels on testnet) | Medium (dense data) |

### 0.3 Generic-skeleton smell test: PASS

The sitemap is not "landing → login → dashboard → list → detail → settings". There is no login, no settings and no marketing. The core screen is a **run tape** that exists only for this product (fund → 100 units with zero transactions → dispute → Groth16 proof → challenge window → proportional verdict → private-vs-chain mirror stamped by a leak check). The Desk is a **three-rail scoreboard** bound to live results, not a KPI dashboard. `/offer` and `/deployment` are protocol artefacts (an annotated x402 402 challenge; a contract registry with measured facts and known limits). Only the registry/record pair has a generic shape, and its content (lifecycle and settlement reconstructed from on-chain events, never from `cumulativeAmount`) is specific.

---

## Sitemap

```
/                        Desk: problem line + three-rail scoreboard + scenario launcher
│                        + live/latest run card + session runs (#session-runs)                 🟢
├── /runs                redirect to /#session-runs (no page of its own)
├── /runs/:runId         Run view, "the clearing tape" (WOW)          ?leak=1  ?ch=0x…         🟢
├── /channels            Channel registry   ?state= ?mode= ?factory= ?client= ?session=1 ?page= 🟢
├── /channels/:address   Channel record: lifecycle, settlement, event trail  #settlement #events 🟢
├── /offer               The x402 offer, annotated                    ?client=A|B (default B)  🟢
├── /deployment          Network, contracts, measured facts, known limits      #limits          🟢
└── *                    Not found                                                               🟡

Root-level states (not routes): ServerDown gate (F2) · Fixture-replay badge (?speed=N) · Root error element
```

- 6 pages + 1 not-found + 1 redirect (limit ≤ 10). Auth on every route: **none (loopback console)**.
- Params contain no dots: `:runId` matches `^[a-z0-9]+-[0-9a-f]{6}$` (e.g. `mudg1f4b-60a0fd`, API_CONTRACT §5.1); `:address` matches `^0x[0-9a-fA-F]{40}$` (any case, E3 accepts it). No client route starts with `/api`, `/provider` or `/provider-anchored`.

### Out of scope for the MVP (🔴, flagged, not built)

| Item | Why not |
|---|---|
| Wallet connect, key input, any browser-side signing | The server holds the demo keys; the browser never signs (API_CONTRACT §1) |
| Login, signup, pricing, about pages | Single-operator loopback console; no marketing pages |
| Mainnet 4663 network view or switcher | Not deployed (PRODUCT_CONTEXT §5) |
| Manual channel actions (settle, sweep, exit, rollover buttons) | No endpoint exists; the provider watcher settles (FR-16) |
| Treasury router management (`setTreasury`, `claim`, FR-26) | No endpoint; payouts are shown read-only in the channel record |
| ERC-8004 reputation (FR-28), Mesh facilitator flow (V8) | Roadmap / untested |
| A separate runs index page | Session runs live on `/` (`#session-runs`); `/runs` redirects there |
| Leak check for a channel without its run | E8 is keyed by `runId`, which is lost on server restart |
| Indonesian locale switcher | The label adapter keeps all English copy in one module so `id` can be added later |

### Honesty slots (fixed structural positions; content from PRODUCT_CONTEXT §4–§5)

| Slot | Where it sits | Content rule |
|---|---|---|
| H1 Token label | Next to every prominent amount: verdict band, settlement card, rails scoreboard, launcher expectations | "MockUSDG" on testnet, never a bare "USDG" beside testnet balances |
| H2 Anchored caveat | Inside the privacy mirror (run view) and the privacy panel (channel record) when `mode === "anchored"` | "anchored: leaf hashes and A per ack are visible on-chain (unit price implied); metrics and thresholds stay private." |
| H3 Inference line | Directly under every privacy mirror / panel | A/seq ≈ average price, payToClient/A = penalty share, timing; "AegisClear does not claim anonymity" |
| H4 Stylus claim | Anchored service act (testnet only) and `/deployment` facts | Only: "Stylus is used only for anchored-mode Poseidon hashing: 1.75× cheaper than Yul, measured on-chain" |
| H5 Offer caveats | `/offer` status line and footer of the annotation | "current session offer"; "x402-compatible offer: facilitators need no change (untested with Mesh)" |
| H6 Known limits | `/deployment#limits` (full) + global footer (one line + link) | The five limits of PRODUCT_CONTEXT §5 |
| H7 Fixture badge | Global header, persistent | Visible whenever `VITE_API_MODE=fixtures`; never absent in replay |
| H8 Settle outcomes | Run view, Settle station | Watcher-settled and race-lost are normal outcomes, never error styling (API_CONTRACT §5.4.7) |

---

## Route specifications

### `/runs/:runId`: the clearing tape (WOW-MOMENT HERO)

**Category**: 🟢 Demo-critical (the one hero screen)
**Scores criterion**: Innovation and Creativity (a proportional split decided by a Groth16 proof, terms kept private, proven by a leak check) + Real Problem Solving (the buyer gets 0.07 back where x402 `exact` gives nothing) + Smart contract quality (every tx real, with gas; permissionless settle; `payToClient ≤ A`). Weights not published; this route carries the wow beat of SUBMISSION §2.2 steps 5–6 and §3 0:00–0:10.
**PRD trace**: prd-arsitektur.md §14 (demo harness table: A vs B, "bocor: 0"), §6.5 EX1 (0.07 / 1.93), §6.7 (leakage table), FR-12…FR-18 (checkpoint, challenge window, proof claim, permissionless settle, `payToClient ≤ A`), FR-10 (rollover), FR-25 (anchored); PRODUCT_CONTEXT F5–F10, improvements I1 and I4; SUBMISSION §2.2 steps 3–6, 8–10 and §3 0:00–0:10, 0:55–1:35, 1:50–2:30.
**Auth**: none (loopback console)
**Layout type**: App-shell, bespoke full-width document (no sidebar, no widget grid)

**Purpose**: Watch one scenario run end to end and see its outcome proven: a proportional split, decided by a Groth16 proof, with the private terms provably absent from the chain.

#### What makes it unlike a stock dashboard (binding for frontend-design)

1. **A document that grows with the SSE stream**, not a grid of tiles. No KPI cards, no charts, no widget sidebar. The page reads top to bottom as acts of one story.
2. **Two modes on one URL.** *Live mode* (status `running`) is tape-first: the current act is the focus. *Verdict mode* (status `done`) is verdict-first: the split and the privacy proof move above the fold and the tape becomes the evidence trail below. The switch happens on the terminal SSE event.
3. **A lifecycle rail named after the protocol**, not after UI sections: `Fund → Open → Serve → Resolve → Settle`. Each station carries its on-chain transaction count, so "Serve: 100 units · 0 transactions" is visible *structurally*, not as a caption.
4. **One Resolution block** that groups dispute → proof → claim → challenge window → settle in *logical* order, whatever order the steps arrive in (API_CONTRACT §5.4.1).
5. **The verdict is a split**: the acked total A (2.00) cut once at 1.93 | 0.07, set directly against the binary escrow's only two possible cuts (all to the provider, all to the client).
6. **A privacy mirror**: two row-aligned columns, "Known to client and provider" and "Visible on Robinhood Chain". Each private value sits opposite its on-chain representation (the public value, or the commitment T or R that hides it). The leak check stamps the dividing line between the two columns.

#### Page skeleton (both modes)

```
[global header: nav · live-run chip · network badge · fixture badge]
[run header: scenario title · client A|B · status + elapsed · run id (copy) · next-action menu]
[lifecycle rail: stations (sticky under the global header while scrolling)]
LIVE MODE                                     VERDICT MODE
[tape column ~2/3 | context rail ~1/3]        [verdict band: split + binary comparison + why]
  current act expanded                        [privacy mirror + leak stamp]
  finished acts collapsed to one line         [result table (F8)]
  [raw step log disclosure (F6)]              [evidence tape: acts, Resolution block expanded]
                                              [raw step log disclosure] [next actions]
```

At ≥ 1280 px the context rail is a right column. At 1024–1279 px it becomes an inline panel directly under the current act.

#### Above-the-fold sections, LIVE mode (priority order; target 1536×864 CSS px = 1920×1080 at the 125 % zoom of runbook §2.1)

1. **Run header**: scenario title in English from `scenarioInfo(id)` (e.g. "Dispute settled by proof"), client label (A or B), status "Live" + elapsed `mm:ss` (from `startedAt`, re-synced by the latest `Step.t`), run id with copy, and the **Next action** menu (run another scenario, open channel record, copy recovery link). The menu's run items are disabled while this run is live, with the reason "one run at a time, server-wide".
2. **Lifecycle rail**: stations per scenario (table below). Station states: pending / current / done / not-applicable. Each done station shows its client tx count and summed gas; the Serve station shows `units · tx` (co-signed: "100 units · 0 tx"; anchored: "20 units · 20 tx"). Every station is a link to its act anchor (`#act-fund`, `#act-serve`, `#act-resolve`, `#act-settle`).
3. **Current act, expanded** (tape column), see "Acts" below.
4. **Context rail** (content follows the current act):
   - during Fund: the offer summary (`payTo` = predicted channel address, "not deployed until the provider's first ack"; deposit 5.00 MockUSDG) + link `/offer?client=A|B`;
   - during Serve: "What the chain has seen so far": client transactions so far (1: `fund`) and the provider's `open` (visible as `Opened` in the channel record), set against "units served: N";
   - during Resolve: **Chain sees now**, polled from `getChannel(addr)` every 5 s: state (`CLOSING`), deadline countdown, T, R, seq, A, `payToClient`; then the `Settled` figures when they land.

**Below the fold (live)**: finished acts collapse to one-line summaries (expandable); a disclosure "All N steps (server log)" holds the raw step log (F6 parity: elapsed `mm:ss.s`, phase, adapted label, detail, tx link + gas, progress).

**Follow-live behaviour**: the view keeps the current act in view as steps arrive, unless the operator scrolls up; then a keyboard-reachable "Jump to live" control appears. Steps that arrive in one burst (same `t`) render together in one update.

#### Lifecycle rail, per scenario

| Scenario | Stations |
|---|---|
| `B-dispute` | Fund · Open · Serve (100 units, 0 tx) · Resolve (checkpoint → proof → claim → window) · Settle |
| `B-anchored-dispute` | Fund · Open · Serve (20 units, 20 on-chain acks) · Resolve (startClose → proof → claim → window) · Settle |
| `B-rollover` | Fund · Serve epoch 0 (128) · Rollover · Serve epoch 1 (5) · Cooperative close. No Open station (the rollover stream has no `open` step, §5.4.2) |
| `B-cooperative` | Fund · Open · Serve (100 units, 0 tx) · Cooperative close (no window) |
| `A-complete` / `A-reject` | Approve · Create job (terms in plain calldata) · Fund escrow · Provider submits · Evaluator completes / rejects |
| `all` | Four leg segments in server order `B-cooperative`, `B-dispute`, `A-complete`, `A-reject` (§5.4.5); the current leg expands into its own stations |
| unknown phase | Rendered as a neutral "Other" station; never a crash (§5.3) |

#### Acts (tape column), built by `groupRun(run)`

- **Leg divider** (every L1 marker `▶ {scenario} — klien {A|B} {address}`): "Leg 2 of 4 · Dispute settled by proof · client B (0x90F7…b906)". Single-scenario runs render the marker as the tape's opening line.
- **Fund act** (`#act-fund`): 402 received (L3: `payTo` = predicted channel, "not yet deployed", deposit) → `fund` tx (gas, explorer link) → optional faucet mint (L2) → "Provider opens the channel on the first ack (provider-side transaction)" (L4) with a link to `/channels/:address`, where `Opened` appears. Rollover emits `fund` *before* the 402 line (§5.4.2): the act orders by `i` but labels both lines, so nothing reads as out of place.
- **Serve act** (`#act-serve`), three variants from `ServiceAct`:
  - *Unit grid* (co-signed, 100 units): a 10 × 10 grid of receipts filled from `progress.done / progress.total` (never parsed from the label), titled "Private receipts, co-signed off-chain". Next to it, the counter **"On-chain transactions during service: 0"**. Breach cells are marked from `breachesFor(cfg, …)` (`config.breaches`, seq 3, 17, 29, 44, 58, 71, 90) only in dispute scenarios, labelled as the parties' private knowledge. Closes with L7 "Final ack delivered to the provider".
  - *Ack strip* (anchored, 20 units): 20 tx chips in arrival order, each with gas and explorer link (testnet: first ≈ 350k, then ≈ 201–210k; local Yul ≈ 300–309k) + the two `serve` progress lines (10/20, 20/20). Slot H4 (Stylus wording) shows only when `config.network === "testnet"`, because locally `addresses.poseidon` is the Yul twin.
  - *Epoch bar* (rollover, 133 units): epoch 0 (128 = `MAX_SEQ`) | epoch 1 (5), filled from `progress` (`total` 133), with the rollover station between the two segments (L15 "Epoch 0 is full (128 units). Rollover pays 2.56 USDG and carries the rest into epoch 1", `rollover` tx + gas, L16 "Epoch 1 started", L17).
- **Resolve act** (`#act-resolve`): the Resolution block (next section). Dispute scenarios only.
- **Close act** (cooperative, rollover): `closeCooperative` tx + gas, "Both parties signed the close: settled at once, no challenge window" (FR-11).
- **Escrow act** (Market A legs): the five control txs, with `createJob (terms in plain calldata)` flagged as "the leak being contrasted" and linked to the explorer.
- **Other**: steps with an unknown phase or an unmatched label show the raw server text (adapter fallback), never hidden.

#### The Resolution block (`ResolutionBlock`, dispute scenarios; one per dispute leg in `all`)

Stations in **logical** order (never arrival order):

| # | Station | Source step(s) | Content |
|---|---|---|---|
| R1 | Dispute opened | L8 narrative (phase `dispute`) | Rendered **mode-aware** by `presentStep(step, ctx)`: co-signed → "Dispute opened: submit the highest co-signed checkpoint, then the penalty proof"; anchored → "Dispute opened: start the close over the on-chain acked state, then the penalty proof". The server emits the co-signed wording for anchored runs too (fixture `local-31337/runs/B-anchored-dispute.snapshot.json`, step `i: 27`). |
| R2 | State submitted on-chain | `submitCheckpoint` tx (co-signed) or `startClose` tx (anchored) | tx + gas + explorer link; "starts the challenge window" |
| R3 | Groth16 proof | `prove` step (L9 + detail `{ms} ms proving`) | "Groth16 proof accepted: 0.07 USDG back to the client", "proved in 4.7 s", the statement "under the committed terms T and the co-signed receipts R, the lawful refund is 0.07", and "verified on-chain inside claimPenalty (verifier 229,241 gas)" |
| R4 | Penalty claimed | `claimPenalty` tx | tx + gas + explorer link |
| R5 | Challenge window | `wait` steps (L10 testnet, L11 local) | countdown and the window explainer (below) |
| R6 | Settled | `settle` tx, or L12, or L13 | tx + gas, or "Settled by the provider's watcher (settle is permissionless), so the client sent no tx", or "The provider's watcher settled first, so the channel is already settled". All three are normal outcomes (slot H8). |

**Pending interval (R1 → burst).** After R1 arrives, the stream goes quiet while the SDK submits the state, proves and claims (local ≈ 4.8 s; testnet longer: two confirmations plus proving). R2–R4 show **one combined in-progress state**: "Submitting the state, generating the Groth16 proof (typically 3–5 s) and claiming the penalty", with an elapsed timer counted from R1. There is no per-station fake progress.

**Burst arrival.** `submitCheckpoint`/`startClose`, `claimPenalty` and `prove` arrive together with the same `t` (fixture `B-dispute.snapshot.json`, steps `i` 16–18, all `t: 7229`). R2, R3 and R4 fill **in one update**. The proof is never animated as the last event.

**R5, the challenge window (the longest quiet moment of the demo; it must never look frozen).**
- Testnet: a `wait` step arrives every 10 s with `progress {done, total: 60}`. `waitClock` takes the latest step, counts down locally once per second between steps, re-syncs on each new step and clamps at 0. If it reaches 0 before R6: "Deadline passed: settle() is now permissionless. Waiting for the settle transaction."
- The **window explainer** stays expanded for the whole wait, with three facts:
  1. "Anyone may answer with a higher co-signed checkpoint during the window. It replaces this state and cancels the pending proof." (FR-13, FR-15)
  2. "After the deadline, settle() is permissionless: the provider's watcher, or anyone, can call it." (FR-16)
  3. "This demo factory enforces a 60 s window; the production factory uses 6 h." (`config.windows.challenge`; `factoryProd`)
- Meanwhile the context rail shows **Chain sees now** (T, R, seq 100, A 2.00, `payToClient` 0.07, deadline), which is what the presenter narrates in runbook step 4.
- Local network: R5 is a single station, "Local chain: fast-forwarded 118 s to the end of the challenge window" (L11). No countdown.

**Block summary line** (after R6): "Resolved by proof: 0.07 back to the client · 1 proof (4.7 s) · 60 s window · settled".

#### Above-the-fold sections, VERDICT mode (status `done`; this is the screenshot and video 0:00–0:10 state)

1. **Verdict band** (`#verdict`), the first thing in view when the run finishes:
   - **Headline split** from `presentRow(row)`: "0.07 back to the client · 1.93 to the provider", with the token label (slot H1).
   - **Split bar** (`SplitBar`): the acked total A (2.00) cut at the proven refund. Directly beneath it, two bars of the same length for the binary control, "complete: 0 / 2.00" and "reject: 2.00 / 0", captioned "Binary escrow (control): the only two possible outcomes". If `getRuns()` holds a done `A-complete`, `A-reject` or `all` run, each bar links to that run. Otherwise the bars are captioned as deterministic outcomes (API_CONTRACT §6) and offer "Run the control" (starts `A-reject`).
   - **Decided by** and **Readable on the explorer** (from `presentRow`), **Proving** (s), **Full-cycle gas**, and the client tx chips from `Row.txs` (explorer links).
   - **Why 0.07** (dispute rows only), from `penaltyMath`: "7 breaching units × 50 % of 0.02 = 0.07 · cap 30 % of 2.00 = 0.60, not binding", captioned "computed privately inside the circuit; the chain only verified the proof". If the result disagrees with the on-chain `payToClient`, the line is hidden (the chain is authoritative).
   - **Deposit reconciliation**, from `settlementOf(detail)`: "Deposit 5.00 = 1.93 to the provider + 3.07 to the client (0.07 proven refund + 3.00 unused)" (FR-17 conservation). This line never reads money from `cumulativeAmount`.
2. **Privacy mirror + leak stamp** (`#privacy`). At ≥ 1280 px it sits beside the verdict band. Below that width it goes under the band. Both must fit the 1536×864 target together.

**Mirror rows** (`privacyMirror(cfg, detail)`; B-dispute shown):

| Fact | Known to client and provider | Visible on Robinhood Chain |
|---|---|---|
| Unit price | 0.02 | hidden inside T |
| Latency ceiling / quality floor | ≤ 800 ms / ≥ 90 | hidden inside T |
| Penalty per breaching unit / cap | 50 % of unit price / 30 % of A | hidden inside T |
| Session nonce | known to both parties (never sent to the console) | hidden inside T |
| Per-unit latency, quality, amount due | 100 co-signed receipts | hidden inside R |
| Breaching units | seq 3, 17, 29, 44, 58, 71, 90 (1,200 ms) | hidden inside R |
| Units served | 100 | seq 100 |
| Acked total | 2.00 | A 2.00 |
| Proven refund | 0.07 | payToClient 0.07 |
| Final split | 1.93 / 3.07 | `Settled`: toProvider 1.93, toClient 3.07 |
| Commitments | (their contents) | T `0x2ba5…bde0`, R `0x19f5…4055` (copyable) |

- **Anchored**: the unit-price row's chain cell reads "implied by A per ack (public)", breaching units are filtered to seq < channel `seq` (3, 17), the per-unit row's chain cell reads "leaf hash and A per ack public; metrics stay inside the leaf", slot H2 appears, and the stamp adds "unit price is not in the scanned set for anchored channels: A per ack already implies it".
- **Rollover**: the acked-total chain cell uses `settlementOf` ("2.56 paid at rollover + 0.10 at close"), because A on-chain can read 0 after settle (API_CONTRACT §4.1). An extra row shows "Epoch: 1 (public), with `RolledOver` amounts public".
- **Leak stamp** on the divider (`LeakStamp`):
  - idle: "Scan every transaction of this channel for these private values" + **Run leak check** (key `l`);
  - pending: "Scanning calldata and logs of every transaction of this channel…" (several seconds on testnet);
  - done: per channel "0 leaks · 0 ambiguous · 5 transactions scanned" plus the tx list with explorer links (it includes the provider's `factory.open` tx). If `leaks` or `ambiguous` is ever > 0, list every `details` entry (tx, word, kind) as it is;
  - 502: "Could not read the chain" + retry.
  - The result is cached per run id. `?leak=1` runs it automatically on load (recovery for video 0:00–0:10 and runbook step 6).
- Slot H3 (the inference line) closes the mirror.

**Per-scenario verdict content**

| Scenario | Headline | Decided by | Privacy section | Leak check |
|---|---|---|---|---|
| `B-dispute` | 0.07 / 1.93 | a Groth16 proof | mirror | yes: 5 tx (4 if the watcher settled) |
| `B-anchored-dispute` | 0.02 / 0.38 | a Groth16 proof over the on-chain R | mirror + H2 | yes: 25 tx |
| `B-rollover` | 0.00 / 2.66 | two signatures, twice (rollover + close) | mirror with epoch rows | yes: 4 tx |
| `B-cooperative` | 0.00 / 2.00 | two signatures ("the client chose not to dispute") | mirror | yes: 3 tx |
| `A-complete` / `A-reject` | 0 / 2.00 or 2.00 / 0 | an evaluator address | **Calldata exposure** panel instead of the mirror: "Market A put the terms in plain calldata", the `createJob (terms in plain calldata)` tx link, and the description quoted from API_CONTRACT §6, captioned "as sent by the control scenario". Action: "Compare with AegisClear: run B-dispute" | **hidden** (E8 always 404s) |
| `all` | the B-dispute row's split; the comparison bars are this run's own A rows (in-page links) | per row | mirror with one tab per channel (dispute tab first, then cooperative) | yes: 2 channels (3 + 5 tx), summary line across both |

**Below the fold (verdict mode)**
3. **Result table** (F8 parity): Market · Client / Provider (MockUSDG) · Decided by · Readable on the explorer · Full-cycle gas · Proving · Transactions. For `all`, 4 rows in `toRows` order (A-complete, A-reject, B-cooperative, B-dispute), grouped "Binary escrow (control)" / "AegisClear", with the dispute row marked as the verdict row. A `proving_ms` of `"-"` renders "n/a".
4. **Evidence tape**: the acts from live mode. The Resolution block is expanded; other acts are collapsed to summaries.
5. **Raw step log** disclosure (F6).
6. **Next actions**: open the channel record (`/channels/:address`, one per channel), run another scenario (launcher menu), copy the recovery link (`/runs/:runId?leak=1&ch=0x…`).

#### States (API_CONTRACT §5.1, §5.2, §9)

| State | Detect | Structure |
|---|---|---|
| Loading | loader awaiting `getRun` (loopback, fast) | Run header + rail placeholders only; no page-wide spinner |
| Live | `status === "running"` | Live mode. Steps from `subscribeRun`, **deduped by `i` and sorted by `i`** (reconnects replay everything) |
| SSE dropped | native `error` event without `data`, no terminal event | "Reconnecting…" marker in the run header; poll `getRun` every 2 s until `done`/`error`; the tape keeps what it has |
| Done | SSE `done` or `status === "done"` | Verdict mode. Close the stream. Focus moves to the verdict heading and a polite live region announces "Run finished: 0.07 back to the client, 1.93 to the provider" |
| Run error | SSE `error` with `data`, or `status === "error"` | Banner at the top of the tape: "The run stopped with an error", followed by `run.error` verbatim in a details block (free text, may be Indonesian). Partial tape kept; a marker at the act where the last step arrived; channel links kept, with the note "this client may still hold an OPEN channel; new runs for this client are refused until it settles"; actions: open channel record, start another run |
| Gone | `getRun` → `404 unknown run` | Full-width notice: "This run is no longer in the console's memory. The server restarted, or the run is older than the last 50." If `?ch=` is present: "Its channel is on-chain and permanent", with links to `/channels/:ch#settlement` (the split and the proof survive; the leak check does not, because it needs the run). Actions: "Start a new run" (→ `/`, launcher focused), "Browse channels" (→ `/channels`) |
| Invalid id | param fails `^[a-z0-9]+-[0-9a-f]{6}$` | No request. "That is not a run id", with the same actions |
| Local network | `config.network === "local"` | No explorer links (copyable hashes only); R5 is the fast-forward station; slot H4 hidden |

`?ch=` is written by the app (history *replace*) as soon as the first step carrying `channel` arrives, so the address bar is always a complete recovery link. The route's `shouldRevalidate` ignores search-param-only changes (`ch`, `leak`).

**Key interactions**:
- Arrive from any "Run" action → the loader fetches the snapshot → subscribe → live mode.
- Click / Enter on a rail station → scroll to that act (focus the act heading).
- Tx and address links → explorer in a new tab, only when `explorerBase` exists; otherwise copyable text.
- **Run leak check** (button or `l`) → `leakCheck(runId)` → stamp.
- Next-action menu → "Run another scenario" → `startRun(s)` → navigate to `/runs/:newRunId`. Disabled while any run is live. E4 errors render inline under the menu using the Desk's error patterns.
- "Open channel record" → `/channels/:address`; "Copy recovery link" → `/runs/:runId?leak=1&ch=0x…`.
- Focus order: run header → next-action menu → rail stations → (live) "Jump to live" → current act → context rail; (verdict) verdict band → mirror → leak action → result table → evidence tape → step log.

**Key data sources** (all from `aegisclear-console/client/src/lib/api/client.ts` via the `ApiClient` interface; types from `web/shared/types.ts`):
- `getRun(id: string): Promise<RunSnapshot>`: CONTRACT. Route loader (initial state); 2 s polling fallback when SSE drops.
- `subscribeRun(id: string, onEvent: (ev: SseEvent) => void, onTransportError?: () => void): () => void`: CONTRACT. Live steps, then the terminal `done`/`error` → verdict or error mode.
- `getConfig(): Promise<ConfigResponse>`: CONTRACT (root loader, cached). Private terms, breaches, deposit, windows, network, explorer base, addresses (slot H4).
- `getChannel(addr: string): Promise<ChannelDetail>`: CONTRACT. "Chain sees now" (every 5 s from the first step carrying `channel` until `SETTLED`), mirror chain side, settlement figures.
- `leakCheck(runId: string): Promise<LeakResponse[]>`: CONTRACT. Leak stamp (on demand or `?leak=1`; cached per run id; never called for A-only runs).
- `getRuns(): Promise<RunSnapshot[]>`: CONTRACT. Links from the binary comparison bars to a session control run.
- `startRun(scenario: ScenarioId): Promise<{ runId: string }>`: CONTRACT. Next-action menu, "Run the control", "Compare with AegisClear".
- DERIVED (`aegisclear-console/client/src/lib/present/*.ts`): `groupRun`, `presentStep`, `presentRow`, `waitClock`, `settlementOf`, `privacyMirror`, `breachesFor`, `penaltyMath`, `scenarioInfo`.

**Empty state strategy**: a `running` snapshot with zero steps shows "Starting: waiting for the first step" (the leg marker arrives within milliseconds). The page is never blank.

**Loading state**: none page-wide. Mirror chain cells show "Reading the chain…" until `getChannel` resolves; refetches keep the previous values (no zero flashes on stale testnet reads, §9). The leak stamp has its own pending state.

**Mobile collapse strategy** (390 px, read-only goal):
- Run header wraps; the rail collapses to one "current station" line with a disclosure listing all stations.
- Verdict band first: headline split, then the three bars stacked.
- The mirror becomes stacked fact cards (fact → private → chain); the leak stamp follows the cards.
- The unit grid becomes a counter plus a progress bar; tx chips wrap; the result table becomes one card per row.

**Screenshot state** (🟢): `B-dispute`, verdict mode, leak check done, at 1536×864 with nothing scrolled: headline "0.07 back to the client · 1.93 to the provider", split bar against the two binary bars, "Decided by: a Groth16 proof", proving ≈ 4.2 s, full-cycle gas 575,544 (testnet), and the full mirror stamped "0 leaks · 0 ambiguous · 5 transactions scanned".
- Build and review in fixture mode at `/runs/mudg1f4b-60a0fd?leak=1`: `fixtures/local-31337/runs/B-dispute.snapshot.json` + `fixtures/local-31337/leak-check/B-dispute.json` + `fixtures/local-31337/channels/B-dispute.0x1E12393dA190449B9CA32D1f280C4D45fB21C6C4.json` + `fixtures/local-31337/config.json` (local: no explorer links, gas 545,726, proving 4,682 ms).
- The gallery image comes from the **testnet** rehearsal run (explorer links live). Its chain side matches `fixtures/testnet-46630/channels/B-dispute.0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1.json` (`payToClient` 70000; `Settled` toProvider 1930000, toClient 3070000). Fixture-mode captures always carry the "Fixture replay" badge (H7), so they are for development review only.
- Live-mode variant (video 0:55–1:35): R1–R4 done, R5 counting down, context rail on "Chain sees now". For development, reproduce it in fixture mode by synthesizing the 10-second `wait` steps (API_CONTRACT §11). The simulation is labelled only in developer tooling, never in the product UI.

**Demo pre-seed** (🟢):
1. The new console is built into `web/dist` (`pnpm build:web` in `aegisclear-console/`) and `AEGIS_NETWORK=testnet pnpm --filter @aegisclear/web serve` is running; the header reads `testnet · 46630`.
2. Demo clients hold no OPEN/CLOSING channel: `/channels?client=B&state=OPEN,CLOSING` and `/channels?client=A&state=OPEN,CLOSING` are both empty. Otherwise E4 answers `409 client-has-open-channel`. The two OPEN leftovers on testnet (`0x9AA0…5e69`, `0xD9c2…9ebA`) belong to other clients and do not block.
3. One warm-up `B-dispute` run before going on stage (proving warm-up, SUBMISSION §2.3), then restart the server so the offer is fresh (see `/offer` pre-seed). The restart clears run memory, which is fine because the live run comes next.
4. Explorer tab pre-opened (runbook §2.1).
5. Video: record rehearsal 3 and keep the server running until `/runs/:runId?leak=1` has been captured for 0:00–0:10 (runs vanish on restart). Note the run id from the address bar.
6. Last resort: local Anvil (runbook §2.4), same routes with the "local chain" badge; or fixture mode `/runs/mudg1f4b-60a0fd?leak=1` with the badge visible, said out loud on stage.

---

### `/`: Desk (problem line, three-rail scoreboard, scenario launcher)

**Category**: 🟢 Demo-critical
**Scores criterion**: Real Problem Solving and Product-Market Fit (problem line with primary market evidence; the three-rail comparison), plus Innovation and Creativity (the AegisClear row, bound to a real run). Weights not published.
**PRD trace**: prd-arsitektur.md §0 (the three-rail table) and §2.3 (MeshGateway numbers); PRODUCT_CONTEXT §3.1 ("within 5 seconds of landing"), F3 (summary line), F5 (launcher), F7 (resume); SUBMISSION §2.2 steps 1, 3, 8, 9, 10 and §3 0:10–0:40 (this screen may replace slides 1–2).
**Auth**: none (loopback console)
**Layout type**: App-shell, two columns at ≥ 1280 px (framing ≈ 7/12, controls ≈ 5/12)

**Purpose**: In five seconds, say what AegisClear does and show it beside the other two rails; then start a scenario.

**Above-the-fold sections** (priority order; 1536×864 target):
1. **Problem line** (left, one sentence + one evidence row): "Agents on Robinhood Chain already pay each other in USDG over x402 `exact`: pay first, receive later, no recourse. AegisClear puts an escrow at the x402 `payTo` address and settles SLA disputes with a Groth16 proof, not a judge." Evidence row: "MeshGateway: 1,030 storefronts · 15,718 on-chain settlements · 512.48 USDG lifetime · average 0.033 USDG", with the source "spec §2.3, read 19 Sep 2026".
2. **Three-rail scoreboard** (`#rails`, left). Caption: "Same job on three rails: 100 requests at 0.02 USDG, 7 breach the 800 ms latency SLA". Columns: Rail · What the client gets back · Who decides · What the public chain sees.
   - x402 `exact` (today): "nothing: 2.00 is gone" · nobody · every transfer. Static (spec §0).
   - ERC-8183-style binary escrow: "0 or 2.00" · a trusted evaluator · the terms and the reason, in plain text. If the session holds a done `A-complete`, `A-reject` or `all` run, the row links to it ("seen live"). Otherwise it stays static.
   - **AegisClear**: "0.07 back, 1.93 to the provider" · a Groth16 proof · two commitments + the final split. Bound to the latest done `B-dispute` or `all` run from `getRuns()`: "live" marker, link to `/runs/:runId`, proving time. With no such run, the row is captioned "worked example (spec §6.5)" and offers **Prove it live** (starts `B-dispute`).
3. **On-chain now** line (left, under the scoreboard): "Robinhood Chain testnet 46630 · 16 channels (14 settled, 2 open) · scanned 3 s ago". Each count links to the registry pre-filtered (`/channels?state=SETTLED`, `/channels?state=OPEN`).
4. **Live / latest run card** (right, top; F7):
   - a run is live (`getRuns()[0].status === "running"`): "Live: Dispute settled by proof · client B · 01:12" + **Open run** (primary);
   - the latest run is done: "Latest: B-dispute · 0.07 / 1.93 · 2 min ago" + **Open run**;
   - the latest run failed: "Latest run stopped with an error: B-anchored-dispute" + **Open run**;
   - no runs yet: the card is omitted and the launcher moves up.
5. **Scenario launcher** (right; F5). A featured entry for `B-dispute`: title, one-line description (API_CONTRACT §6), client B, expected result `0.07 / 1.93`, duration "≈ 2.6 min on testnet, including the 60 s challenge window" (§5.5: 158 s), mode co-signed, **Run** (primary). The other six follow as compact rows in demo order, in three groups:
   - AegisClear: `B-anchored-dispute` (client A · 0.02 / 0.38 · ≈ 2.3 min · anchored), `B-rollover` (client B · 0.00 / 2.66 · ≈ 2.3 min), `B-cooperative` (client A · 0.00 / 2.00 · ≈ 1.6 min);
   - Binary escrow (control): `A-complete` (client A · 0 / 2.00 · ≈ 13 s), `A-reject` (client B · 2.00 / 0 · ≈ 13 s);
   - Full comparison: `all` (clients A + B · 4 rows · ≈ 5 min).
   Durations come from `scenarioInfo(id)` for the current `config.network` (local: seconds, from the §5.5 local column).

**Below-the-fold sections**:
- **Session runs** (`#session-runs`; target of the `/runs` redirect). From `getRuns()`, newest first: scenario title · client · status · started (relative, absolute on hover) · duration · result summary (the scenario's client/provider pair; `all` → "4 rows") · channel count. Each row links to `/runs/:runId`. Caption: "Kept in server memory only: cleared on every restart (max 50)."

**Key data sources**:
- `getConfig(): Promise<ConfigResponse>`: CONTRACT (root loader). Network, client labels, duration column.
- `getRuns(): Promise<RunSnapshot[]>`: CONTRACT. Live/latest card, scoreboard binding (E5 keeps `result` and strips only `steps`, fixture `local-31337/runs-list.json`), session runs. Refetch on load, after a start, after a run ends; every 5 s only while a run is live.
- `getChannels(): Promise<{ scannedAt: number; channels: ChannelSummary[] }>`: CONTRACT. On-chain now line (every 5 s, paused in hidden tabs).
- `startRun(scenario: ScenarioId): Promise<{ runId: string }>`: CONTRACT. Launcher, "Prove it live".
- DERIVED: `scenarioInfo`, `presentRow`.

**Key interactions**:
- **Run** (click, Enter, or `n` to focus the featured Run) → `startRun(s)` → on `202` navigate to `/runs/:runId`.
- While any run is live, every Run action is disabled with the reason "One run at a time, server-wide" and a link to the live run.
- Start errors render inline under the launcher (API_CONTRACT §9):
  - `409 busy` → "A run is already in progress" + **Open it**;
  - `409 client-has-open-channel` → "Client B still holds an open channel from an earlier run; new runs for this client are refused until it settles" + link `/channels/:channel` + "On testnet an OPEN, unfunded channel can remain after a failed run. Scenarios for client A are still available.";
  - `502 preflight-failed` → "Preflight failed: the server could not prepare the run" + the raw `message` (Indonesian free text) in a details block;
  - `400 unknown-scenario` → the raw error (should never happen).
- **Open run** on the card (or global `r`) → `/runs/:runId`. Scoreboard row links → their runs. On-chain counts → filtered registry.

**Empty state strategy**: on a fresh server (`runs-list.empty.json`) the scoreboard shows the worked example with **Prove it live**, session runs read "No runs in this server session yet", and the launcher is enabled.

**Loading state**: config is already resolved by the root loader. Runs and channels load into small inline placeholders; the launcher never waits for the channel scan. E2 `502` → the on-chain line keeps its last numbers with "stale, last updated 12 s ago".

**Mobile collapse strategy**: one column: problem line → scoreboard as three stacked rail cards → live/latest card → launcher (present, but starting scenarios on a phone is not a goal) → session runs.

**Screenshot state** (🟢): the scoreboard with the AegisClear row "live", bound to a finished `B-dispute`. Fixture mode: `fixtures/local-31337/runs-list.json` (7 runs with results) + `fixtures/local-31337/config.json` + `fixtures/local-31337/channels.json` (129 channels). Testnet framing with no runs yet: `fixtures/testnet-46630/config.json` + `fixtures/testnet-46630/channels.json` (16 channels: 14 SETTLED, 2 OPEN) + `fixtures/local-31337/runs-list.empty.json` → worked-example state.

**Demo pre-seed** (🟢): for video 0:10–0:40, capture this screen *after* the rehearsal `B-dispute` run, so the AegisClear row is live and links to it. On stage (runbook step 1) it is the landing screen and needs nothing else.

---

### `/channels/:address`: Channel record

**Category**: 🟢 Demo-critical
**Scores criterion**: Smart contract quality (the full on-chain lifecycle with gas per transaction, verifiable on Blockscout; conservation of funds; `payToClient ≤ A`). Also the permanent fallback for the verdict: it survives server restarts because it reads only the chain. Weights not published.
**PRD trace**: FR-1…FR-6 (lifecycle), FR-11…FR-18 (close, window, proof, settle, conservation), FR-10 (rollover), FR-25 (anchored acks), FR-26 (payout addresses), §6.7 (what leaks); PRODUCT_CONTEXT F4, F10 (per channel), improvements I1 (settlement from `Settled`) and I2 (lifecycle timeline); SUBMISSION §2.2 step 7 (and 9: `epoch 1 · seq 5`), §3 1:35–1:50.
**Auth**: none (loopback console)
**Layout type**: App-shell, single main column with a two-part top (identity + lifecycle, then settlement)

**Purpose**: Show everything the chain knows about one channel (lifecycle, settlement split, commitments, parties, every event with gas) and name what it does not know.

**Above-the-fold sections** (priority order):
1. **Identity bar**: full channel address (copy, explorer link), state pill, mode (co-signed / anchored), factory tag with its meaning ("demo factory, 60 s window" · "production factory, 6 h window" · "anchored factory, Stylus Poseidon acks"), epoch, client label (A / B when it is a demo client, from `clientLabel`), and a **run link** when `runId` is set ("created by run mudg1f4b-60a0fd in this server session").
2. **Lifecycle rail** (`LifecycleRail`, fed by `lifecycleOf(detail)`), one station per event group:
   - `Opened` → "Opened by the provider (factory.open)";
   - `Acked` × N → one grouped station "20 on-chain acks" with the gas range, expandable into each ack (seq, leaf, A, root, gas);
   - `CheckpointSubmitted` → "Highest co-signed checkpoint submitted: challenge window started";
   - `CloseStarted` → "Close started over the on-chain state: challenge window started";
   - `PenaltyClaimed` → "Penalty claimed with a Groth16 proof: 0.07 back to the client";
   - `RolledOver` → "Rolled over to epoch 1: 2.56 to the provider, 2.44 carried";
   - `Settled` → "Settled" (figures in the card below);
   - `Funded`, `Swept` and unknown events → generic stations (name + args).
   Every station shows its block, gas and tx link. The rail ends according to state:
   - `CLOSING` → a current station "Challenge window ends in mm:ss". The countdown uses chain `deadline` (unix seconds) against the browser clock, prefixed "≈". At 0: "Deadline passed (chain time can differ slightly): settle() is now permissionless".
   - `OPEN` with only `Opened` → "Open. Co-signed service leaves no on-chain trace until a checkpoint or close." (fixture `open-unfunded`).
3. **Settlement card** (`#settlement`, I1), from `settlementOf(detail)`, never from `cumulativeAmount`:
   - dispute: "To the provider 1.93 · to the client 3.07 (0.07 proven refund + 3.00 unused deposit) · penalty 0.07 · decided by a Groth16 proof" + link to the `PenaltyClaimed` tx;
   - cooperative: "To the provider 2.00 · to the client 3.00 · two signatures", plus the note "A reads 0 on-chain for this channel; the split comes from the `Settled` event" (fixture `B-cooperative.0x66C4…`);
   - rollover: one row per epoch (epoch 0: rollover, 2.56 to the provider, 2.44 carried; epoch 1: cooperative close, 0.10 to the provider, 2.34 to the client), then totals "provider 2.66 · client 2.34 · deposit 5.00";
   - not settled: "In escrow: budget (live token balance) · A as last recorded on-chain · not settled yet".
   All amounts carry slot H1.

**Below-the-fold sections**:
- **On-chain state** (F4 key-value block): seq; epoch; A ("as last recorded on-chain"; the settled-channel caveat applies); budget (live token balance, 0 after settle); T and R in full with copy; proof (`hasProof`, `payToClient`); windows (challenge / response in seconds); client → payoutClient and provider → payoutProvider (when a payout differs from its party: "paid to a different address"; when it equals `addresses.router`: "AegisTreasuryRouter"); token (`cfg.token`, named MockUSDG when it equals `addresses.usdg`); opened tx / block / factory; salt.
- **Event trail** (`#events`, F4, `EventTrail`): one row per event: # · event name · humanized args · block · gas · tx link. Arg rendering by key: amounts (`cumulativeAmount`, `payToClient`, `toProvider`, `toClient`, `penalty`, `remaining`) in MockUSDG; hashes (`termsCommitment`, `receiptsRoot`, `leaf`, `root`) truncated with copy; addresses (`client`, `provider`, `by`) with A/B/provider labels; `deadline` as absolute chain time; `cooperative` as yes/no; any other key raw. `Acked` rows are grouped (collapsed by default) and carry slot H2, because A per ack is public.
- **Privacy panel** (F10 per channel, `PrivacyMirror` in its panel variant): "Visible on-chain for this channel" (this channel's values) against "Kept private" (the hidden field names of PRODUCT_CONTEXT §4). Private *values* are shown only when the client is demo client A or B, captioned "demo session terms, known to both parties". H2 when anchored; H3 always. Leak-check pointer: with `runId` → "Run the leak check from its run" (`/runs/:runId?leak=1`); without → "A leak check needs the run that created this channel, and runs live only in this server session."

**Key data sources**:
- `getChannel(addr: string): Promise<ChannelDetail>`: CONTRACT. The whole page. Fetched on open; refetched every 5 s while `state !== "SETTLED"`; stopped once settled (terminal).
- `getConfig(): Promise<ConfigResponse>`: CONTRACT (root loader). Explorer base, `addresses` (token and router naming, "is this a contract?" check), clients (A/B labels), demo terms for the privacy panel.
- DERIVED: `lifecycleOf`, `settlementOf`, `privacyMirror`, `clientLabel`.

**Key interactions**:
- Copy any hash or address; explorer links open in a new tab (plain copyable text on `local`).
- Rail station (click / Enter) → scroll to that event row in the trail.
- Run link → `/runs/:runId`. Breadcrumb "Channels › 0x4B6F…bBd1" returns to the *last registry URL*, filters included.
- Anchors `#settlement` and `#events` are deep-linkable (recovery for runbook step 7 and video 1:35–1:50).

**Empty state strategy**: an OPEN channel with no events beyond `Opened` shows the "no on-chain trace yet" station and the "In escrow" card. There is no generic empty state.

**Loading state**: E3 is moderately expensive (one receipt per event). Show placeholders for the rail, the card and the trail until it resolves. Refetches keep the current data on screen.

**Errors (API_CONTRACT §9)**:
- `404 unknown channel` → "This address is not a channel of this deployment's factories. Check the address." + link to `/channels`. If the address equals one of `config.addresses`, add "This is the {role} contract, not a channel" + link `/deployment`.
- Invalid param → no request; "That is not an address".
- `502` → keep the last good data, mark it stale ("last updated 12 s ago"), retry with backoff.

**Mobile collapse strategy**: identity bar wraps; the rail turns vertical; the settlement card comes straight after the identity bar; key-value rows and event rows stack, with args wrapping.

**Screenshot state** (🟢): the hero channel `fixtures/testnet-46630/channels/B-dispute.0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1.json`. Rail: `Opened` (310,235 gas) → `CheckpointSubmitted` (114,159) → `PenaltyClaimed` (304,432; payToClient 0.07) → `Settled` (100,077). Card: 1.93 to the provider, 3.07 to the client. Variants to design against: `…/B-anchored-dispute.0xAD30BC162CCd7cB7680760b4a6181186A28d879c.json` (20 `Acked`, first 349,751 gas), `…/B-rollover.0xD1F69213799aDbc595ff8Eae6B8C20f917a22b1D.json` (`RolledOver` → `Settled`), `…/B-cooperative.0x66C493f712648419C11Ab8f21f8C6b0A21ff05dC.json` (A = 0 caveat), `…/open-unfunded.0x9AA0C0c281338295505003B6D80017B56e335e69.json` (OPEN), and `fixtures/local-31337/errors/channel-unknown.404.json` (404).

**Demo pre-seed** (🟢): none. Testnet channels are permanent, so `/channels/0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1` works after any restart while the server points at testnet v2. On stage, open the channel of the run just made (from the run view or `/channels?session=1`); the permanent hero URL is the fallback.

---

### `/channels`: Channel registry

**Category**: 🟢 Demo-critical
**Scores criterion**: Smart contract quality (liveness: real channels from all three factories on Robinhood Chain testnet, with proofs and rollovers). Weights not published.
**PRD trace**: prd-arsitektur.md §14 ("dashboard channel dari event `ChannelOpened` ketiga factory"); PRODUCT_CONTEXT F3 and improvement I3 (filters); SUBMISSION §2.2 steps 1, 7, 9 and §3 2:15–2:30 (row `epoch 1 · seq 5 · SETTLED`).
**Auth**: none (loopback console)
**Layout type**: App-shell, full-width table

**Purpose**: Find any channel across the deployment's factories, see its live state, and narrow to "this session" or to one demo client.

**Above-the-fold sections** (priority order):
1. **Header line**: "16 channels" (or "5 of 16" when filtered) · "scanned 3 s ago" (from `scannedAt`) · stale marker after a `502`.
2. **Filter bar**, every filter a URL search param (I3): `state` (OPEN / CLOSING / SETTLED, multi-select, comma-separated), `mode` (co-signed / anchored), `factory` (factory / factoryProd / factoryAnchored; only keys present in `config.addresses`), `client` (A / B / other), `session=1` (channels with a `runId`, i.e. from this server session). Plus **Clear filters**.
3. **Table** (F3 columns): channel (truncated, copy, explorer; `run` tag when `runId` is set, a "this run" marker when it matches the live or latest run; factory tag when not the default factory) · client (A/B label or address) · mode · state · seq · epoch · A · budget · deadline (countdown for `CLOSING` rows only, ticking every second) · proof (`payToClient` when `hasProof`) · opened block. **A column rule** (API_CONTRACT §4.1): OPEN and CLOSING rows show A; SETTLED rows show "split in record", linking to `/channels/:address#settlement`, because settled cooperative or rollover channels can read 0.

**Below-the-fold sections**:
- Pagination, 50 rows per page (`page` param), for local density (129 channels in the fixture). Server order is kept (newest first by `openedBlock`); no column sorting.

**Key data sources**:
- `getChannels(): Promise<{ scannedAt: number; channels: ChannelSummary[] }>`: CONTRACT. Polled every 3–5 s (every 2 s while a run is live), paused in hidden tabs, refetched when a run ends.
- `getConfig(): Promise<ConfigResponse>`: CONTRACT (root loader). Client labels, factory keys and meanings, explorer base.
- `getRuns(): Promise<RunSnapshot[]>`: CONTRACT (shared app-shell state). The live/latest run id for the "this run" marker.
- DERIVED: `filterChannels`, `clientLabel`.

**Key interactions**:
- Changing a filter updates the URL with history *replace* (shareable, reload-safe).
- Each row is a real link: click or Enter → `/channels/:address`. Arrow keys are not required; Tab moves row by row.
- Pre-filtered entry points: from the Desk counts, and from the 409 message (`/channels?client=B&state=OPEN,CLOSING`).

**Empty state strategy**: with no channels at all → "No channels in this deployment's factories yet" + a link to the launcher on `/`. With filters matching nothing → "No channels match these filters" + **Clear filters**.

**Loading state**: placeholder rows on the first load only; later polls update in place and never flash zeros. `502` → keep the last list, mark it stale, back off.

**Mobile collapse strategy**: 768–1023 px drops the budget, epoch and opened-block columns (they remain in the record). Below 768 px each row becomes a card: channel, state, mode, seq, proof, client.

**Screenshot state** (🟢): `fixtures/testnet-46630/channels.json` (16 channels: 14 SETTLED, 2 OPEN; 10 from `factory`, 6 from `factoryAnchored`). The rollover row `0xD1F6…2b1D` reads `epoch 1 · seq 5 · SETTLED` (runbook step 9); the hero row `0x4B6F…bBd1` reads `seq 100 · proof 0.07`. For density, `fixtures/local-31337/channels.json` (129).

**Demo pre-seed** (🟢): none. The testnet list is live. After a session run, `/channels?session=1` shows exactly that run's channel(s) with the `run` tag.

---

### `/offer`: the x402 offer, annotated

**Category**: 🟢 Demo-critical
**Scores criterion**: Product-Market Fit (distribution is one `payTo` address inside a standard x402 offer, so facilitators need no change) + Innovation and Creativity (the escrow lives at the x402 `payTo`, as a CREATE2 address that does not exist yet). Weights not published.
**PRD trace**: FR-1 (deterministic CREATE2 address), FR-23 (402 with `payTo` = channel address, facilitator unmodified), US-6 (a facilitator need not know AegisClear exists), US-7 (seq-0 exit ticket); PRODUCT_CONTEXT F11; API_CONTRACT §8; SUBMISSION §2.2 step 2 and §3 0:40–0:55.
**Auth**: none (loopback console)
**Layout type**: App-shell, two annotation columns over a raw-JSON panel

**Purpose**: Show the real 402 challenge a demo client receives, and why any x402 facilitator can settle into it unchanged.

**Above-the-fold sections** (priority order):
1. **Client switch** A | B, bound to `?client=`. It defaults to **B** (the dispute client of runbook step 2); a missing param is normalized to `?client=B` with history *replace*.
2. **Status line**: "HTTP 402 Payment Required" (from `status`) · "current session offer" · the limitation note (slot H5): "After a run finishes this endpoint keeps returning that session's offer, whose `payTo` may already be SETTLED, until the next run resets it."
3. **Two annotation columns** (`offerAnatomy(body)`):
   - **"What any x402 facilitator sees"**: `x402Version`; `scheme: exact`; `network eip155:46630` → "Robinhood Chain testnet"; `asset` → "MockUSDG" (matched against `addresses.usdg`); **`payTo`** → "a CREATE2-predicted channel address. It is not deployed yet and can only ever become a channel with exactly these signed terms", plus a deployment check against the registry (not yet a channel / already a channel: state, link `/channels/:payTo`); `maxAmountRequired` → "5.00 deposit".
   - **"What only the AegisClear client reads (`extra.aegis`)"**: `config` (client, provider, token, T, windows, payouts, salt); `sigProvider` ("the provider's EIP-712 signature over this config"); `terms` ("sent to the client only: private from the chain, not from the counterparty", nonce included); `unitQty`; `exitSig` ("a pre-signed seq-0 exit ticket: the client can always leave"); `anchored`.
4. **Caveat** (slot H5): "x402-compatible offer: facilitators need no change (untested with Mesh)."

**Below-the-fold sections**:
- **Raw JSON** (collapsible, copy button) with `payTo` and `extra.aegis` marked. Focusing an annotation marks its JSON path, and the reverse.

**Key data sources**:
- `getOffer(client: "A" | "B"): Promise<{ status: number; body: unknown }>`: CONTRACT. Fetched on demand per client. It creates a provider session if none exists (no on-chain effect).
- `getChannels(): Promise<{ scannedAt: number; channels: ChannelSummary[] }>`: CONTRACT. "Is `payTo` already a channel?" check (one fetch, no polling here).
- `getConfig(): Promise<ConfigResponse>`: CONTRACT (root loader). Asset naming, chain-id-to-network name, factory addresses.
- DERIVED: `offerAnatomy` (safe narrowing of `body`; `null` → raw JSON only).

**Key interactions**:
- Switch A/B (a radio group: Tab to enter, arrow keys to move) → the URL param changes → refetch.
- Copy the JSON or any single address. The explorer link for `payTo` appears only once it is deployed (an undeployed address has nothing to show).
- "Open channel" when `payTo` is already a channel → `/channels/:payTo`.

**Empty state strategy**: n/a (the offer always exists for A and B). If `body` is not x402-shaped → "Unexpected offer shape, showing the raw response" + raw JSON.

**Loading state**: a short inline placeholder in the annotation columns; the client switch stays usable.

**Errors**: `?client=` other than A/B → no request; "Client must be A or B" + both links. `400` from the server (should not happen) → the same message.

**Mobile collapse strategy**: annotation columns stack (facilitator view first); the raw JSON scrolls horizontally inside its own panel.

**Screenshot state** (🟢): `fixtures/testnet-46630/offer-B.json`: `eip155:46630`, MockUSDG `0x5A9B…2382`, `payTo` `0x506c…7B2a` (not yet a channel), `maxAmountRequired` 5000000. Local variant: `fixtures/local-31337/offer-B.json`.

**Demo pre-seed** (🟢): the offer must be **fresh** on stage and on video, so that `payTo` reads "not yet a channel". After the warm-up run, restart the server, then open `/offer?client=B` *before* starting the live `B-dispute` (runbook step 2 precedes step 3). Otherwise it honestly shows the previous session's SETTLED channel.

---

### `/deployment`: network, contracts, measured facts, known limits

**Category**: 🟢 Demo-critical
**Scores criterion**: Smart contract quality (every contract with its explorer link, the verified v2 deployment, measured gas) + the Robinhood Chain / USDG extra consideration (network and token stated honestly: MockUSDG on testnet, USDG-native design) + credibility across all four criteria (known limits stated before anyone asks). Weights not published.
**PRD trace**: prd-arsitektur.md status line (testnet v2, 7/7 verified, block 122.028.843), §6.6 (parameters), §6.7; PRODUCT_CONTEXT F1 (full list), §5 (known limits → improvement I5), §6 (measured numbers); SUBMISSION §2.2 steps 1, 8 (Blockscout `AegisPoseidon`) and 10 (back to the contract addresses), §3 1:50–2:15 and 2:30–2:55 (this screen may replace slides 3–4), §4.9.
**Auth**: none (loopback console)
**Layout type**: App-shell, single-column sectioned document

**Purpose**: Show where AegisClear runs and on what: the network, every contract, the parties, the measured facts, and the honest limits.

**Above-the-fold sections** (priority order):
1. **Network**: "Robinhood Chain testnet · chain 46630" · RPC URL · explorer base · deploy block 122,028,843 · challenge / response windows 60 s / 30 s · Market-B deposit 5.00 MockUSDG. The static line "Deploy v2: 7/7 contracts verified on Blockscout" appears only when `chainId === 46630` and `deployBlock === "122028843"`, so it can never describe a different deployment. On `local`: "Local private chain 31337 · no block explorer · challenge windows fast-forwarded".
2. **Contracts** (F1, grouped; each row: role · full address with copy · explorer link):
   - Channel factories: `factory` (co-signed, demo 60 s window), `factoryProd` (co-signed, production 6 h window; testnet only), `factoryAnchored` (anchored mode, acks hashed by the Poseidon program);
   - Settlement: `verifier` (Groth16 `SLASettlementVerifier`), `router` (`AegisTreasuryRouter`, payouts to treasuries);
   - Hashing: `poseidon` (testnet: the Stylus `AegisPoseidon` program; local: the Yul twin);
   - Token: `usdg` (MockUSDG, a 6-decimal test stand-in; USDG-native design; mainnet 4663 not deployed);
   - Control: `escrow` (`SimpleJobEscrow`, the Market A binary escrow);
   - any other key → a generic row named by its key. Every key is optional.
3. **Parties**: provider · client A · client B, with "Keys are held by the console server. The browser holds none and never signs."

**Below-the-fold sections**:
- **Measured facts** (static, each with its source file from PRODUCT_CONTEXT §6): verifier 229,241 gas; circuit 115,066 constraints, proving ≈ 3.2–4.7 s; anchored `insertPath` 144,076 gas (Stylus) vs 252,271 (Yul) = 1.75× (≈ 1.9× execution-only), in slot H4 wording; testnet full-cycle gas (dispute 575,544 · anchored 4,799,914 · rollover 298,821 · cooperative 182,452); epoch = 128 units. The deployment-specific rows follow the same testnet-v2 guard as the network line.
- **Known limits** (`#limits`, slot H6): trusted setup has a single contributor (loss bounded on-chain by `payToClient ≤ A`); MockUSDG on testnet, mainnet 4663 not deployed; self-audit only (Slither triage, 0 true High/Medium); the Mesh facilitator path is untested; the Stylus program needs a keepalive (365-day expiry; funds stay recoverable through the pure-EVM close paths). Closed by slot H3.
- **Sources** (static outbound links, SUBMISSION §4.8): repository, proving-key release `v0.1.0-zkey`, Stylus vs Yul benchmarks, Slither self-audit.

**Key data sources**:
- `getConfig(): Promise<ConfigResponse>`: CONTRACT (root loader). The only live data on this page. Static facts and limits live in the English copy module.

**Key interactions**: copy any address; explorer links in a new tab ("Open AegisPoseidon on Blockscout" serves runbook step 8 and video 1:50–2:15); `#limits` is deep-linkable.

**Empty state strategy**: n/a. Missing keys are simply omitted (local has no `factoryProd`).

**Loading state**: none; config is resolved by the root loader.

**Mobile collapse strategy**: each contract row stacks role above address; facts become a two-column list.

**Screenshot state** (🟢): `fixtures/testnet-46630/config.json` (8 addresses, windows 60/30 s, deploy block 122028843). Local variant: `fixtures/local-31337/config.json` (no `factoryProd`, windows 120/60 s).

**Demo pre-seed** (🟢): none.

---

### `/runs` (redirect, no page)

**Category**: 🟡 Demo-supporting · **Scores criterion**: none, so it is demoted to a redirect · **PRD trace**: improvement I4 (deep links; a presenter may type `/runs`) · **Auth**: none (loopback console) · **Layout type**: none.
**Purpose / behaviour**: a loader redirect to `/#session-runs`. **Key data sources**: none (the Desk loads its own). **Key interactions / states**: none.

---

### `*`: Not found

**Category**: 🟡 Demo-supporting
**Scores criterion**: none, so it is demoted (it protects the live demo from a mistyped URL)
**PRD trace**: API_CONTRACT §1 (every extension-less path returns `index.html`, so the SPA must own its 404); improvement I4.
**Auth**: none (loopback console) · **Layout type**: App-shell, a single notice
**Purpose**: Recover from a mistyped URL in one click.
**Above-the-fold sections**: 1. "No page at this address" + the path. 2. Near-miss suggestions parsed from the path: `/channel/0x…` → "Did you mean /channels/0x…?"; `/run/…` → `/runs/…`; a bare `0x…` address → `/channels/0x…`. 3. Links: Desk, Channels, x402 offer, Deployment.
**Key data sources**: none (static).
**Key interactions**: suggestion and link buttons (keyboard reachable). **Empty / loading states**: n/a. **Mobile**: same single notice.

---

### Root-level states (not routes; rendered by the root route)

| State | Detect | Structure | Trace |
|---|---|---|---|
| **ServerDown gate** (F2) | The root loader's `getConfig()` rejects (TypeError) or returns 5xx | Full-page blocking notice under a wordmark-only header: "The AegisClear console server is not running." Two copyable commands: `AEGIS_NETWORK=testnet pnpm --filter @aegisclear/web serve` (testnet, the demo) and `pnpm --filter @aegisclear/web serve` (local chain). **Retry now** + automatic retry every 3 s ("last attempt 2 s ago"). When the config arrives, the originally requested URL renders, so deep links survive. | F2 (`Header.tsx:19`); API_CONTRACT §9 row 1 |
| **Fixture-replay badge** (H7) | `VITE_API_MODE=fixtures` | Persistent, non-dismissable header badge "Fixture replay (recorded 23 Sep 2026)" with the replay speed from `?speed=N` | API_CONTRACT §11 |
| **Local-chain badge** | `config.network === "local"` | Header badge "Local chain · 31337 · no explorer" (replaces the testnet badge) | API_CONTRACT §9 last row |
| **Root error element** | Unexpected render or loader error | "Something broke in the console UI" + **Reload** + the raw error in a details block + a link to `/`. Never a blank page. Expected API errors (404/409/502) never reach it: loaders return discriminated results instead (see Routing patterns). | Stack requirement (data router) |

---

## Navigation

### Header (global, every route)
- Wordmark "AegisClear console" → `/`.
- Nav items: **Desk** (`/`) · **Channels** (`/channels`) · **x402 offer** (`/offer`) · **Deployment** (`/deployment`), with the active item marked (`aria-current`). There are no marketing items.
- Right cluster, in order:
  - **Live-run chip**, only while a run is live: "Live · B-dispute · 01:12" → `/runs/:runId`. State comes from `getRuns()`, polled every 5 s while a run is live and re-checked on window focus. This is the F7 resume entry point from any route.
  - **Network badge**: "Robinhood Chain testnet · 46630 · MockUSDG" → `/deployment` (or the local-chain badge).
  - **Fixture-replay badge** when applicable (H7).
  - **Shortcuts** (`?`).
- No header CTA button. The primary action lives on the Desk, one click away or `n`.
- Below 768 px the nav collapses into a disclosure menu button; the chips stay visible.

### Sidebar
None. There are only four destinations, and the run view needs the full width for its tape plus context rail at 1280 px.

### Breadcrumbs
- `/channels/:address`: "Channels › 0x4B6F…bBd1" (returns to the last registry URL, filters included).
- `/runs/:runId`: "Desk › Run mudg1f4b-60a0fd · Dispute settled by proof".

### Footer (global)
One line: "Robinhood Chain testnet · MockUSDG (USDG-native design) · Self-audited, not independently audited · Known limits →" (`/deployment#limits`) · "Source: github.com/mdlog/AegisClear" (static outbound link). On `local` the first item reads "Local private chain 31337".

### Keyboard
Every primary action is a native button or link in a logical Tab order, with a "Skip to content" link first. Global shortcuts (inactive while focus is in a text field; listed by `?`):

| Key | Action | Scope |
|---|---|---|
| `n` | Go to the Desk and focus the featured **Run** action | global |
| `r` | Open the live run, else the latest run (announces "No run yet" when there is none) | global |
| `l` | Run the leak check | run view, verdict mode, runs with channels |
| `?` | Show the shortcut list | global |
| `Esc` | Close the open menu, disclosure or popover | global |

---

## Reusable components

| Component | Used in | Notes |
|---|---|---|
| `AppShell` | every route | Header (nav, live-run chip, badges, `?`), footer, skip link; hosts the ServerDown gate |
| `LiveRunChip` | header | From `getRuns()`; hidden when no run is live |
| `NetworkBadge` | header, `/deployment` | Testnet and local variants |
| `Addr` / `TxLink` / `Hash` | everywhere | Middle-truncated, full value on hover plus copy; explorer link only when `explorerBase` exists; A/B/provider labels via `clientLabel` |
| `Amount` | Desk, run, record, registry | BigInt from 6-decimal base units, 2 decimals shown, full precision on hover/copy; carries slot H1 |
| `GasFigure` | run, record | `en-US` thousands separators |
| `StatePill` / `ModeTag` / `FactoryTag` | registry, record, run | Unknown values render neutrally |
| `LifecycleRail` | run (stations from steps), record (stations from events) | One component with two feeds: `groupRun` and `lifecycleOf` |
| `SplitBar` | run verdict band, Desk scoreboard | One proportional cut against the two binary cuts |
| `PrivacyMirror` + `LeakStamp` | run (full mirror with stamp), record (panel variant, no stamp) | Row-aligned private vs chain; slots H2 and H3 built in |
| `ApiNotice` | every data route | The API_CONTRACT §9 patterns: stale, unknown (404), busy (409), open channel (409), preflight (502), run error, run gone |
| `ScenarioLauncher` | Desk (full), run view (next-action menu), calldata panel (single action) | Disabled-while-live state and inline E4 errors |
| `CopyButton` | everywhere | |

Route-bespoke (not reused, listed so nothing is invented twice): `ResolutionBlock`, `ServiceAct` (unit grid / ack strip / epoch bar), `ContextRail` and `StepLog` (run view); `EventTrail` and `SettlementCard` (record); `OfferAnnotation` (offer).

---

## Routing patterns (React Router v7, data router; replaces the Next.js defaults)

> `aegisclear-console/` currently routes with `wouter`. Replace it with React Router v7 (README §4, REVIEW E7), because the loaders, error elements and scroll restoration below assume a data router.

### Route table

```
createBrowserRouter([
  { id: "root", path: "/", Component: AppShell, loader: rootLoader /* getConfig */, ErrorBoundary: RootError,
    children: [
      { index: true,               Component: Desk },
      { path: "runs",              loader: () => redirect("/#session-runs") },
      { path: "runs/:runId",       Component: RunView,       loader: runLoader /* getRun */,
                                   shouldRevalidate: searchParamOnlyChange ? false : default },
      { path: "channels",          Component: Registry },
      { path: "channels/:address", Component: ChannelRecord, loader: channelLoader /* getChannel */ },
      { path: "offer",             Component: OfferView },
      { path: "deployment",        Component: Deployment },
      { path: "*",                 Component: NotFound },
    ] },
])
```

### Rules
- **Root loader**: `getConfig()` once, cached for the session (static for the server's lifetime). On failure it *returns* `{ kind: "server-down" }`, and the shell renders the ServerDown gate and revalidates every 3 s. The root error element is kept for truly unexpected failures.
- **Loaders return discriminated results** for expected API errors (`ok` / `gone` / `unknown` / `stale`). They never throw for 404, 409 or 502.
- **Live data lives in components, not loaders**: registry polling, record refetch, the run's SSE subscription and the live-run chip polling. All polling pauses while `document.hidden`.
- **Search params are state**: registry filters (`state`, `mode`, `factory`, `client`, `session`, `page`); `/offer?client=A|B`; `/runs/:runId?leak=1&ch=0x…`; global `?speed=N` (fixture mode only). Filter and `ch` updates use history *replace*.
- **Hash anchors**: `/#rails`, `/#session-runs`, `/runs/:runId#verdict`, `#privacy`, `#act-resolve`, `/channels/:address#settlement`, `#events`, `/deployment#limits`. Scroll to the hash once the data has rendered.
- **No parallel, intercepting or modal routes.** The current console's channel drawer becomes the full page `/channels/:address`, so every entity has a reload-safe URL (I4).
- **Scroll**: `ScrollRestoration` at the root; the run view manages its own follow-live scrolling.
- **Pending UI**: a thin top progress indicator from `useNavigation()`; no route-level skeleton pages except the noted E3 and E8 placeholders.
- **Server constraints** (API_CONTRACT §1): no dots in params; no client routes under `/api`, `/provider`, `/provider-anchored`; ship only `.woff2` fonts and `.svg`/`.png` images; `pnpm build:web` (in `aegisclear-console/`) → `web/dist`, served by the console server; `pnpm web` still builds and serves the old console (fallback).
- **API mode**: `VITE_API_MODE=live|fixtures` chooses `createLiveApi()` or `createFixtureApi()` behind the `ApiClient` interface in `aegisclear-console/client/src/lib/api/client.ts`. Routes never call `fetch` or `EventSource` directly.

---

## Responsive strategy

**Breakpoints** (Tailwind defaults): `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536.

**Mobile-first?** No, desktop-first. The deliverables are a live laptop demo and a 1920×1080 recording at the runbook's 110–125 % zoom, i.e. roughly 1536–1745 CSS px wide and 864–982 px tall. **Design target: 1536×864 CSS px.** It must also work at 1920, 1440, 1280 and 1024. Phones (390 px) must be readable for the registry, the channel record and the run result; running scenarios on a phone is not a goal.

| Width | Behaviour |
|---|---|
| ≥ 1536 (target) | Every "above the fold" list in this spec is visible without scrolling at 864 px tall: the run verdict band plus the top of the mirror; the Desk scoreboard plus the featured launcher entry; the record's identity bar, rail and settlement card |
| 1280–1535 | Same two-column layouts; the context rail narrows |
| 1024–1279 | Run view goes single-column (context rail inline under the current act); the Desk stacks the controls under the scoreboard (`n` still reaches Run) |
| 768–1023 | Registry drops the budget, epoch and opened-block columns; record rails stay horizontal |
| < 768 | Nav in a disclosure menu; registry cards; vertical rails; the mirror as stacked fact cards; touch targets ≥ 44×44 px |

**Never truncated at ≥ 1024 px**: the split pair (0.07 / 1.93), the leak verdict ("0 leaks"), gas figures and proving time. Addresses and hashes are the only values that middle-truncate.

---

## Demo path verification

"Built?" ✅ means the route and the exact state are specified in this sitemap (the new frontend is not implemented yet). There are no ❌ cells. `:runId` is known only after a start (the `202` response, the address bar, the live-run chip, `r`). In fixture mode the recorded ids are fixed, e.g. `mudg1f4b-60a0fd` (B-dispute) and `mudg39dg-1815b0` (all).

### Video script (SUBMISSION §3, target 2:55)

| Time | Demo moment | Route used | Scores criterion | Recovery URL | Built? |
|---|---|---|---|---|---|
| 0:00–0:10 | **WOW**: `0.07 / 1.93` + leak check `0 leaks` (finished run) | `/runs/:runId`, verdict mode | Innovation and Creativity + Real Problem Solving | `/runs/:runId?leak=1` · fixture `/runs/mudg1f4b-60a0fd?leak=1` · after a restart `/channels/0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1#settlement` | ✅ |
| 0:10–0:25 | Problem: x402 `exact` pays first, no recourse; MeshGateway numbers | `/` problem line (may replace slide 1) | Real Problem Solving + Product-Market Fit | `/` | ✅ |
| 0:25–0:40 | Three rails: 2.00 lost · 0 or 2.00 · 1.93 / 0.07 | `/#rails` (may replace slide 2) | Real Problem Solving + Innovation and Creativity | `/#rails` | ✅ |
| 0:40–0:55 | Header `testnet · 46630`; 402 JSON for client B, `payTo` and `extra.aegis` | header badge + `/offer?client=B` | Product-Market Fit + Innovation and Creativity | `/offer?client=B` | ✅ |
| 0:55–1:20 | `fund` → 100 units with 0 tx → dispute → Groth16 proof ≈ 4 s | `/runs/:runId`, live mode (Fund, Serve, Resolve R1–R4) | Innovation and Creativity + Smart contract quality | `/runs/:runId` (re-attaching replays every step) | ✅ |
| 1:20–1:35 | Window (jump-cut) → settle → leak check → private vs chain side by side | `/runs/:runId` R5–R6 → verdict → `#privacy` | Innovation and Creativity + Real Problem Solving | `/runs/:runId?leak=1#privacy` | ✅ |
| 1:35–1:50 | Channel events `CheckpointSubmitted → PenaltyClaimed → Settled` with gas → Blockscout `claimPenalty` | `/channels/:address#events` → explorer (outbound) | Smart contract quality | `/channels/0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1#events` (permanent) | ✅ |
| 1:50–2:15 | Anchored: 20 `ack` txs with gas → `0.02 / 0.38` → Blockscout `AegisPoseidon` | `/runs/:runId` (anchored) → `/deployment` | Innovation and Creativity (measured Stylus use) + Smart contract quality | `/runs/:runId` · after a restart `/channels/0xAD30BC162CCd7cB7680760b4a6181186A28d879c#events` + `/deployment` | ✅ |
| 2:15–2:30 | Rollover `epoch 0 full → 2.56` → `0.00 / 2.66`; table row `epoch 1 · seq 5 · SETTLED` | `/runs/:runId` (rollover) + `/channels?session=1` | Real Problem Solving + Smart contract quality | `/runs/:runId` · after a restart `/channels/0xD1F69213799aDbc595ff8Eae6B8C20f917a22b1D` | ✅ |
| 2:30–2:47 | Honest limits | `/deployment#limits` (may replace slide 3) | All four (credibility) | `/deployment#limits` | ✅ |
| 2:47–2:55 | Repo, zkey release, factory, `AegisPoseidon` | `/deployment` (contracts + sources; may replace slide 4) | Smart contract quality | `/deployment` | ✅ |

### Runbook (SUBMISSION §2.2, steps 1–10, live on testnet)

| # | Demo moment | Route used | Scores criterion | Recovery URL | Built? |
|---|---|---|---|---|---|
| 1 | Open the console: network, contracts, provider, clients, channels | `/` (header badge, on-chain line) + `/deployment` (every address) + `/channels` | Smart contract quality | `/` · `/deployment` · `/channels` | ✅ |
| 2 | The 402 seen by client B | `/offer?client=B` | Product-Market Fit + Innovation and Creativity | `/offer?client=B` | ✅ |
| 3 | Run `B-dispute`: fund, provider opens, 100 units, 0 tx | `/` launcher → `/runs/:runId` (live) | Innovation and Creativity + Smart contract quality | `/runs/:runId` (chip, or `r`) | ✅ |
| 4 | Dispute → state on-chain → proof → claim → 60 s window → settle | `/runs/:runId#act-resolve` | Innovation and Creativity + Smart contract quality | `/runs/:runId#act-resolve` | ✅ |
| 5 | Read the result row `0.07 / 1.93` | `/runs/:runId#verdict` | Innovation and Creativity + Real Problem Solving | `/runs/:runId#verdict` | ✅ |
| 6 | Leak check `0 leaks`; private vs chain | `/runs/:runId?leak=1#privacy` | Innovation and Creativity + Real Problem Solving | `/runs/:runId?leak=1#privacy` | ✅ |
| 7 | The run's channel row (`run` tag) → record with events and gas → Blockscout | `/channels?session=1` → `/channels/:address#events` | Smart contract quality | `/channels/:address#events` · hero fallback `/channels/0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1#events` | ✅ |
| 8 | `B-anchored-dispute`: 20 on-chain acks, `0.02 / 0.38`, `AegisPoseidon` on Blockscout | `/` launcher or run-view menu → `/runs/:runId` → `/deployment` | Innovation and Creativity + Smart contract quality | `/runs/:runId` · `/channels/0xAD30BC162CCd7cB7680760b4a6181186A28d879c` | ✅ |
| 9 | `B-rollover`: 128 + 5 units, one deposit, `0.00 / 2.66`; table `epoch 1 · seq 5` | `/runs/:runId` → `/channels?session=1` | Real Problem Solving + Smart contract quality | `/runs/:runId` · `/channels/0xD1F69213799aDbc595ff8Eae6B8C20f917a22b1D` | ✅ |
| 10 | Optional `all` (4-row A vs B table), or back to the contract addresses | `/runs/:runId` (4 legs) or `/deployment` | Innovation and Creativity + Real Problem Solving; Smart contract quality | `/runs/:runId` · `/deployment` | ✅ |

### Recovery rules
- **Run URLs die with the server process** (runs live in memory, max 50). **Channel URLs are permanent**, because they read the chain. After a restart, the channel record reproduces the split, the proof and the full event trail. The step tape and the leak check are lost (E8 needs the run); get them back by re-running (`B-dispute` ≈ 158 s on testnet) or by fixture replay (badge visible).
- Permanent testnet fallbacks: `/channels/0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1` (dispute, proof 0.07, split 1.93 / 3.07) · `/channels/0xAD30BC162CCd7cB7680760b4a6181186A28d879c` (anchored, 20 Stylus acks) · `/channels/0xD1F69213799aDbc595ff8Eae6B8C20f917a22b1D` (rollover, epoch 1 · seq 5) · `/channels/0x66C493f712648419C11Ab8f21f8C6b0A21ff05dC` (cooperative).
- Keyboard-only recovery from any broken click flow: go to `/`, press `r` (live or latest run), `n` (start), `l` (leak check).

### Offline-safety check
- All assets are local and committed to the build (`.woff2` fonts, `.svg`/`.png` images). No CDN, no remote images or avatars, no third-party runtime fetch on any route.
- Blockscout and GitHub appear only as plain outbound links, never embedded or fetched at render. Every page works when they are unreachable.
- **Flagged, inherent to the product**: the testnet demo depends on the public RPC (through the server), and runbook step 7 / video 1:35–2:15 open Blockscout pages. Fallbacks: pre-opened explorer tabs (runbook §2.1); the channel record's event trail shows the same tx hashes and gas locally; local Anvil mode (runbook §2.4, same routes, "local chain" badge, no internet needed); fixture mode (`VITE_API_MODE=fixtures`, badge H7). No route adds an external dependency of its own.

---

## DATA CONTRACT

There is no mock-data phase. These nine functions already exist in the old console's `web/src/api.ts`. They move to **`aegisclear-console/client/src/lib/api/client.ts`**, which exports `interface ApiClient` with exactly these members, `ApiError` and `createApi()`. `createApi()` picks `createLiveApi()` (`live.ts`) or, lazily, `createFixtureApi()` (`fixtures.ts`, API_CONTRACT §11) by `VITE_API_MODE`. Types come from `web/shared/types.ts` (frozen). The names are binding.

| function | signature | file | consuming route/section |
|---|---|---|---|
| `getConfig` | `getConfig(): Promise<ConfigResponse>` (E1) | `aegisclear-console/client/src/lib/api/client.ts` | Root loader (ServerDown gate, header badges); `/deployment` (whole page); `/runs/:runId` (mirror private side, `penaltyMath`, windows, H4); `/channels/:address` (labels, privacy panel); `/channels` (labels, factory keys); `/offer` (asset naming); `/` (network-specific durations) |
| `getChannels` | `getChannels(): Promise<{ scannedAt: number; channels: ChannelSummary[] }>` (E2) | `aegisclear-console/client/src/lib/api/client.ts` | `/channels` (table, filters, scan age); `/` (on-chain now line); `/offer` (is `payTo` already a channel?) |
| `getChannel` | `getChannel(addr: string): Promise<ChannelDetail>` (E3) | `aegisclear-console/client/src/lib/api/client.ts` | `/channels/:address` (loader + 5 s refetch until settled); `/runs/:runId` ("Chain sees now", privacy mirror, deposit reconciliation) |
| `startRun` | `startRun(scenario: ScenarioId): Promise<{ runId: string }>` (E4) | `aegisclear-console/client/src/lib/api/client.ts` | `/` launcher and "Prove it live"; `/runs/:runId` next-action menu, "Run the control", calldata panel |
| `getRuns` | `getRuns(): Promise<RunSnapshot[]>` (E5) | `aegisclear-console/client/src/lib/api/client.ts` | Header live-run chip (F7); `/` live/latest card, scoreboard binding, session runs; `/runs/:runId` control-run links; `/channels` "this run" marker |
| `getRun` | `getRun(id: string): Promise<RunSnapshot>` (E6) | `aegisclear-console/client/src/lib/api/client.ts` | `/runs/:runId` loader and the 2 s polling fallback |
| `subscribeRun` | `subscribeRun(id: string, onEvent: (ev: SseEvent) => void, onTransportError?: () => void): () => void` (E7) | `aegisclear-console/client/src/lib/api/client.ts` | `/runs/:runId` live stream (dedupe by `i`, close after terminal) |
| `leakCheck` | `leakCheck(runId: string): Promise<LeakResponse[]>` (E8) | `aegisclear-console/client/src/lib/api/client.ts` | `/runs/:runId` leak stamp (on demand, `?leak=1`; never for A-only runs) |
| `getOffer` | `getOffer(client: "A" \| "B"): Promise<{ status: number; body: unknown }>` (E9) | `aegisclear-console/client/src/lib/api/client.ts` | `/offer` |

Exact signatures (unescaped, for grep):

```ts
getConfig(): Promise<ConfigResponse>
getChannels(): Promise<{ scannedAt: number; channels: ChannelSummary[] }>
getChannel(addr: string): Promise<ChannelDetail>
startRun(scenario: ScenarioId): Promise<{ runId: string }>
getRuns(): Promise<RunSnapshot[]>
getRun(id: string): Promise<RunSnapshot>
subscribeRun(id: string, onEvent: (ev: SseEvent) => void, onTransportError?: () => void): () => void
leakCheck(runId: string): Promise<LeakResponse[]>
getOffer(client: "A" | "B"): Promise<{ status: number; body: unknown }>
```

### DERIVED selectors (pure, unit-tested, no I/O; not CONTRACT)

| selector | signature | file | consuming route/section |
|---|---|---|---|
| `presentStep` | `presentStep(step: Step, ctx?: { scenario: ScenarioId; mode?: "co-signed" \| "anchored" }): { title: string; meta?: string; tone: string }` | `aegisclear-console/client/src/lib/present/labels.ts` | Run tape, rail, step log. `ctx` is required for L8 on anchored runs |
| `presentRow` | `presentRow(row: Row): { market: string; decidedBy: string; visible: string; clientShare: string; providerShare: string }` | `aegisclear-console/client/src/lib/present/labels.ts` | Run verdict band and result table; Desk scoreboard and session runs. Splits the fixed `klien_provider` format "a / b" |
| `groupRun` | `groupRun(run: RunSnapshot): { legs: Leg[] }` (leg = scenario, client, acts; act kind = fund, service, resolution, close, escrow, other) | `aegisclear-console/client/src/lib/present/run.ts` | Run rail, acts, Resolution block logical ordering (§5.4.1–5), unknown phases |
| `waitClock` | `waitClock(lastWait: { step: Step; receivedAt: number } \| undefined, now: number): { left: number; total: number; overdue: boolean } \| null` | `aegisclear-console/client/src/lib/present/run.ts` | Resolution R5 countdown |
| `scenarioInfo` | `scenarioInfo(id: ScenarioId, network: Network): ScenarioInfo` (title, client, market, expected row, duration, mode, description) | `aegisclear-console/client/src/lib/present/scenarios.ts` | Desk launcher; run header |
| `settlementOf` | `settlementOf(detail: ChannelDetail): Settlement \| null` (per-epoch `RolledOver` rows + the final `Settled`; totals; never `cumulativeAmount`) | `aegisclear-console/client/src/lib/present/channel.ts` | Record settlement card; run deposit reconciliation; mirror rollover row |
| `lifecycleOf` | `lifecycleOf(detail: ChannelDetail): Station[]` | `aegisclear-console/client/src/lib/present/channel.ts` | Record lifecycle rail |
| `privacyMirror` | `privacyMirror(cfg: ConfigResponse, detail: ChannelDetail): MirrorRow[]` | `aegisclear-console/client/src/lib/present/privacy.ts` | Run mirror; record privacy panel |
| `breachesFor` | `breachesFor(cfg: ConfigResponse, detail?: ChannelDetail): number[]` (anchored: seq below the channel's `seq`) | `aegisclear-console/client/src/lib/present/privacy.ts` | Unit grid, mirror, `penaltyMath` |
| `penaltyMath` | `penaltyMath(cfg: ConfigResponse, breachCount: number, ackedTotal: bigint): { perUnit: bigint; raw: bigint; cap: bigint; payToClient: bigint }` | `aegisclear-console/client/src/lib/present/privacy.ts` | Verdict "Why 0.07" line |
| `filterChannels` | `filterChannels(list: ChannelSummary[], f: RegistryFilters, cfg: ConfigResponse): ChannelSummary[]` | `aegisclear-console/client/src/lib/present/registry.ts` | Registry |
| `clientLabel` | `clientLabel(addr: string, cfg: ConfigResponse): "A" \| "B" \| undefined` | `aegisclear-console/client/src/lib/present/registry.ts` | Registry, record, `Addr` labels |
| `offerAnatomy` | `offerAnatomy(body: unknown): OfferAnatomy \| null` | `aegisclear-console/client/src/lib/present/offer.ts` | `/offer` annotations |

Formatting helpers live in `aegisclear-console/client/src/lib/format/`: a port of the old console's `web/src/format.ts` (`fmtUsdg`, `shortAddr`, `countdown`, `explorer`, `gasFmt`), rewritten in English per API_CONTRACT §2. The old file stays untouched.

---

## Screenshot heroes

These three get extra polish budget; they are the submission gallery (SUBMISSION §6 screenshot list):
- **`/runs/:runId`, verdict mode, `B-dispute` with the leak check done**: the wow (0.07 / 1.93, the split against the binary outcomes, the privacy mirror stamped "0 leaks"). It covers screenshot-list items 3–5. The anchored run's Serve act (20 acks with gas, `0.02 / 0.38`) is the same component and covers item 8.
- **`/channels/0x4B6F3c6d3b6BD02FEa8155a74AfaA04D0f03bBd1`**: the on-chain lifecycle `Opened → CheckpointSubmitted → PenaltyClaimed → Settled` with gas, plus the settlement card. It covers item 6 and is the strongest Smart contract quality image.
- **`/offer?client=B`**: the annotated 402 (`payTo` = a CREATE2 channel that does not exist yet). It covers item 2 and is the only Product-Market Fit image (drop-in distribution).

The Desk scoreboard (`/#rails`) is the video's framing screen; it is an optional fourth image if the form allows it.

---

## Reverse coverage (MUST-HAVE → layout)

| Must-have | Where | Status |
|---|---|---|
| F1 network and deployment header | Header `NetworkBadge` + `/deployment` (network, contracts, parties) | covered |
| F2 server-not-running state | Root ServerDown gate | covered |
| F3 channel registry, auto-refresh | `/channels` (+ `/` on-chain line) | covered; the A column follows the §4.1 rule |
| F4 channel detail + event trail with gas and args | `/channels/:address` | covered |
| F5 scenario runner, disabled while live, start errors | `/` launcher (+ run-view menu) | covered |
| F6 live step log over SSE | `/runs/:runId` acts + raw `StepLog` | covered |
| F7 resume the latest run on load | Header chip + Desk card + run-view re-attach | covered. Change: the app *offers* the live run (chip, card, `r`) instead of hijacking navigation |
| F8 result table | `/runs/:runId` verdict band + result table | covered |
| F9 leak check | `/runs/:runId` `LeakStamp` | covered |
| F10 private vs chain | `/runs/:runId` `PrivacyMirror` (+ record panel), slot H2 | covered |
| F11 raw x402 offer explained | `/offer` | covered |
| I1 settlement from `Settled` | Record settlement card; run deposit reconciliation | covered (rollover sums `RolledOver` + `Settled`) |
| I2 lifecycle timeline | Record `LifecycleRail` | covered |
| I3 registry filters | `/channels` URL filters | covered |
| I4 deep links surviving reload | Every entity route, `?leak`, `?ch`, anchors; run-gone state | covered |
| I5 known limits | `/deployment#limits` + footer | covered |
| PRD US-1, US-2, US-6, US-7 | Fund/Serve acts; Resolution R3–R4 + mirror; `/offer`; R5 facts + `exitSig` | covered |
| PRD US-3 (provider closes unilaterally), US-4 (client cannot invent breaches), US-5 (treasury payouts) | Watcher settle (R6) and window facts; "co-signed receipts" copy; payout rows + router naming | partial: the frozen backend has no scenario for them. These are not layout gaps |

**Uncovered must-haves: none.**

---

## Contract observations for implementers (checked against the fixtures)

1. **L8 wording on anchored runs.** The server emits "sengketa: submit checkpoint co-signed tertinggi…" before `startClose` too (`local-31337/runs/B-anchored-dispute.snapshot.json`, step `i: 27`). API_CONTRACT §7.1 gives only the co-signed English copy, so `presentStep` takes a `ctx` with the scenario/mode.
2. **Rollover money.** `Settled` covers only the final epoch (`B-rollover.0xD1F6…`: toProvider 100000, toClient 2340000). The provider's 2.66 is `RolledOver.toProvider` 2560000 + 100000. "The `Settled` event is authoritative" (§4.1) holds per epoch only, so `settlementOf` must sum.
3. **The leak check is keyed by `runId`.** It is unavailable after a restart and for channels from other sessions; the record only points to the run.
4. **The offer is sticky.** E9 keeps the last session's (SETTLED) `payTo` until the next run, hence the restart in the `/offer` pre-seed.
5. **Live-run chip polling.** API_CONTRACT §10 lists runs-list refreshes only on load, after a start and after an end. The chip adds a 5 s E5 poll while a run is live (in memory, cheap, no new endpoint).

---

## Verification gate

- [x] **Reverse coverage**: F1–F11 and I1–I5 all map to routes/sections (table above). No uncovered must-have. PRD US-3, US-4 and US-5 are partial because the frozen backend has no scenario for them.
- [x] **Every 🟢 route** (`/`, `/runs/:runId`, `/channels`, `/channels/:address`, `/offer`, `/deployment`) has a purpose, sections, data sources, interactions, PRD trace, screenshot state and pre-seed, and appears in the demo tables.
- [x] **Every demo moment** (video 0:00–2:55 and runbook steps 1–10) maps to a specified route. No ❌ cells, and every moment has a Recovery URL.
- [x] **Route priority**: `JUDGING WEIGHTS NOT PUBLISHED` is stated. Each 🟢 route names the criteria it serves, and the ranking follows the organizer's order plus the demo script.
- [x] **Wow-moment route**: `/runs/:runId` has the deepest, bespoke spec (two modes, a protocol-named rail, the logically ordered Resolution block, the split against binary outcomes, the privacy mirror with its leak stamp). The sitemap passes the generic-skeleton test.
- [x] **Screenshot heroes named**: 3.
- [x] **DATA CONTRACT**: all 9 functions used in "Key data sources", each listed exactly once with file and signature. Derived selectors are listed separately as DERIVED.
- [x] **Trace header** present and filled. No template placeholders remain.
- [x] **What will lose us points** (below).

**What will lose us points: Product-Market Fit.** This layout makes PMF visible only through the Desk's problem line (MeshGateway numbers) and `/offer` (distribution via a single `payTo`). Every other screen is an operator console driving two server-held demo agents, so a judge sees a convincing protocol demo but no user, merchant or facilitator. SUBMISSION §7 already scores PMF lowest (3/5). Only off-screen evidence can fix it (the V8 Mesh facilitator test, a merchant pilot), and the UI can at most show that evidence once it exists.

---

## Handoff

Invoke the `frontend-design` skill with these context files:
1. `docs/frontend/DESIGN_BRIEF.md`: tone direction (being written in parallel; styling decisions belong there, not here).
2. The brand technique reference, if one exists (`DESIGN_REF.md` / `DESIGN.md`).
3. `docs/frontend/LAYOUT_SPEC.md`: this file (what to build: pages, sections, states, navigation, responsive rules, the binding data contract).
4. Data: `web/shared/types.ts` + `docs/frontend/API_CONTRACT.md` + `docs/frontend/fixtures/`. The `ApiClient` fixture implementation replays these; there is no mock-data phase. `docs/frontend/PRODUCT_CONTEXT.md` governs copy and forbidden claims.

With these, the skill knows which pages to build, what each page contains, which `ApiClient` call feeds each section, how the pages connect and how they collapse, and can style them per DESIGN_BRIEF.

**Once the build is demo-ready, run `/ship`** to refresh the submission package (runbook, portal write-up, video script, judge Q&A, rubric scorecard) against the new screens.
