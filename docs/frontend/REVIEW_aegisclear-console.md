# Review: `aegisclear-console/` against `docs/frontend/` (23 Sep 2026)

`aegisclear-console/` is the folder chosen to become the new AegisClear frontend. This review compares its current state (a Manus-generated prototype, "Web App (static only)" template) with this handoff folder. It is a **fix list for the next build session**. On any conflict, `README.md`, `PRODUCT_CONTEXT.md`, `API_CONTRACT.md`, `LAYOUT_SPEC.md` and `DESIGN_BRIEF.md` win. Line numbers refer to the files as found on 23 Sep 2026.

## Status (updated 23 Sep 2026, after steps 1–4 of §G)

**Done:** §G steps 1–4.
- **Step 1, strip and integrate:**
  - B3 removed: Manus plugins, `__manus__/` debug collector, storage proxy, `Map.tsx`, OAuth helpers, `ManusDialog`, template pages and hooks, 50+ unused shadcn components, Tailwind, the wouter patch.
  - F: dependencies cut to 6 runtime + 8 dev packages.
  - B4 (integration part): dev server on `127.0.0.1:4047` with a proxy for `/api` and `/provider` to `:4040` (verified against the live testnet server); `build:web` resolves to `<repo>/web/dist`; Express removed; standalone install via `pnpm install --ignore-workspace`.
- **Step 2, visual system:**
  - C1: brief tokens for both themes in `client/src/styles/tokens.css` (all text pairs re-measured ≥ 4.5:1).
  - C2: Archivo Variable with `wdth` plus Atkinson Hyperlegible Mono, bundled `.woff2`, with the §3 type scale (no text under 12 px).
  - C3: no uppercase, no eyebrows, no middle-dot strings, no arrow icons in link text, no numbered non-sequence cards; glyph + word state tags; sentence case.
  - C4: no shadows, hover lifts, noise, blur or gradients; the Market A hatch is an SVG mask.
  - C6: engrave for structure and primary actions; proof ink only for proof-derived values.
  - Also: Light / Dark / System theme toggle; 16 × 8 receipt grid; static guilloche seal mark and favicon; loopback-only; off-canvas nav hidden when closed.
- **Step 3, data layer (B1, not yet wired into pages):**
  - `lib/api`: the nine-method `ApiClient` with `ApiError` (live client over fetch and EventSource, with the SSE `error`-name gotcha handled), and a fixture replay client. The replay streams the recorded runs on their own clock (`?speed=N`), keeps the server's single-run rule and answers errors with the recorded bodies. It is lazy-loaded, and a live build contains no fixture data (checked by building both modes).
  - Also in `lib/api`: TanStack Query hooks and loader-shared query options, the refetch and retry policy of API_CONTRACT §10, and the run-tape reducer with the 2 s polling fallback behind `useRunStream`.
  - `lib/present` and `lib/format`: the English label adapter for every recorded step, row and tx label; `settlementOf` (cross-checked against the SDK's own result row on all 6 local channels and verified on the 5 testnet ones); `lifecycleOf`, `groupRun`, `waitClock`, the privacy mirror and penalty math, registry filters, offer anatomy, scenario metadata, and money, hash and time formatting.
  - Tests: 13 files and 163 tests. Expected values were derived by hand from the fixtures, and the key guards were mutation-checked. `pnpm check` is clean.
- **Step 4, pages wired to data (B1, B2, C5, E1–E7):**
  - React Router v7 data router: a root loader for the config, the ServerDown gate with a 3 s auto-retry, a root error element, and one lazy chunk per page. `/runs` redirects to `/#session-runs`, and `/privacy` and the scenario-card board are gone (E1).
  - Every LAYOUT_SPEC route is built from `lib/api` (live or fixture replay) and `lib/present`, with no literal data left. The prototype `App.tsx` and `console.css` are deleted.
  - Run view, live mode:
    - acts that grow with the stream;
    - the 16 × 8 receipt grid, 20 ack slots or two epoch grids;
    - the Resolution block in logical order, with the proving interval and the window countdown;
    - "Chain sees now" in the context rail.
  - Run view, verdict mode: the settlement slip per §1.1 C1 and C5.
    - The stub holds the private terms and the why-0.07 math; the perforation carries the leak marks.
    - The chain half has the display numerals, the to-scale bar, the binary hatch bars and the deposit reconciliation.
    - T and R guilloche seals are drawn from the real hashes, and the leak verdict comes with the scan motion.
  - Run view, also: error, gone and invalid-id states; the `?leak=1` and `?ch=` recovery links; the anchored, rollover, `all` (channel tabs) and Market A (calldata panel) variants.
  - Desk: the scoreboard is bound to the latest dispute run, the launcher shows start errors inline, and session runs are listed.
  - Registry: URL filters with counts, 50 rows per page, the A-column rule, CLOSING countdowns, run tags, rows that block a demo client, and cards below 768 px.
  - Channel record: the T seal, the lifecycle rail, a per-epoch settlement card, the on-chain state, the privacy panel and the event trail.
  - Offer: annotated in two columns, with a `payTo` registry check.
  - Deployment: the testnet-v2 guard and the five known limits.
- **Evidence:**
  - Tests: 21 files and 284 tests, with a component test file per route in jsdom against the recorded fixtures, plus axe on 10 routes.
  - axe in Chrome: 0 violations at any impact level, in light and dark.
  - Layout: no page scrolls sideways at 390, 768, 1024 or 1280 px, and the B-dispute slip fits 1536 × 864 unscrolled.
  - Build: initial JS is 136.5 KB gzip (the budget is 180), and the live build carries no fixture data.
  - Conformance gate: 0 failures.
- **Found and fixed along the way:**
  - The dev port 4045 is on Chrome's and Firefox's unsafe-port list (`ERR_UNSAFE_PORT`), so the dev server moved to 4047.
  - Channels closed by signatures have a zero receipts root, so they now read "never sent" instead of "hidden inside R".
  - The rollover's breaches are now listed per epoch (7 + 1).

**Still open, in order:**
- **Step 5:**
  - keyboard shortcuts `n`, `r` and `l`, plus the `?` dialog with its switch to turn single-key shortcuts off (§1.1 C8);
  - follow-live scrolling with "Jump to live" on the run tape;
  - `prefers-contrast`;
  - a 44 px touch-target review.

  Live regions and working buttons are already in place.
- **Step 6:** integration run on testnet.

**Line numbers below refer to the original prototype.** A backup of it is at `arbitrum-sg/.backup/aegisclear-console-manus-original-2026-09-23.tgz`.

## Verdict

**A good structural sketch, not yet a frontend.**

What already matches: the prototype adopted the handoff's vocabulary and page structure (clearing tape, settlement slip with perforation, privacy mirror, lifecycle rail, resolution block, "On-chain transactions during service: 0", known limits, MockUSDG labelling). Keep that.

What fails is every non-negotiable:
- **No data layer.** Every figure is hard-coded, several are wrong, and progress is faked.
- **The design brief is not applied.** It uses the exact AI-default palette the brief rejects, and fonts that are banned and never even loaded.
- **Manus platform coupling ships with it,** including a session-replay collector.
- **Text contrast fails WCAG AA almost everywhere.**
- **It is not connected to the backend at all.**

The order of work is at the end.

| Area | Doc | Status |
|---|---|---|
| Product facts, forbidden claims | PRODUCT_CONTEXT §5–§6 | ⚠️ Mostly honest wording, but many wrong numbers (B2) |
| Real API, SSE, types, fixture mode | API_CONTRACT, README §2.2 #2 and #10, §5 | ❌ Not implemented (B1) |
| Routes and sections | LAYOUT_SPEC | ⚠️ Close, with deviations (E) |
| Visual direction (tokens, type, motion) | DESIGN_BRIEF §3–§6 | ❌ Not applied (C) |
| Accessibility | README §6.1 | ❌ Contrast, type size, dialog, shortcuts (D) |
| Offline-safe, no telemetry, loopback | README §2.2 #4, #9 | ❌ Manus plugins, debug collector, `host: true` (B3) |
| Integration with the console server | README §2.1 | ❌ Not wired, never built (B4) |

---

## A. Keep (matches the handoff)

- **Route map.** `/`, `/runs/:runId`, `/channels`, `/channels/:address`, `/offer`, `/deployment` and a 404 (`client/src/App.tsx:339`). It adds `/runs` and `/privacy`; see E1.
- **Settlement slip anatomy.** Stub, perforation, chain half, split bar at 3.5 % / 96.5 %, Market A hatch and a leak stamp (`App.tsx:233-252`). This is the brief's §7 differentiator in embryo. Fix it per C5.
- **Privacy mirror.** Fact / "Known to client + provider" / "Visible on Robinhood Chain" (`App.tsx:280`). This is the LAYOUT_SPEC mirror.
- **Run view acts.** Fund, Serve, Resolve, Verdict. The resolution block is explained as "logical order preserved even when proof, claim and transaction steps arrive in one burst". The lifecycle rail is Fund → Open → Serve → Resolve → Settle. It keeps the counter "On-chain transactions during service: 0" and a "Chain sees now" context rail (`App.tsx:291-300`).
- **Honesty copy** worth keeping:
  - "Terms and metrics stay private; amounts and timing are public. AegisClear does not claim anonymity."
  - "A / seq ≈ average price; payToClient / A = penalty share"
  - the Known limits wording
  - "Server-held keys"
  - "No wallet connection or browser signing is required"
- **Accessibility and theming basics:** skip link, `prefers-reduced-motion` guard, theme persistence in `try/catch`.
- **Headline copy** that could survive (reworded to the brief's rules): "The price stayed private. The split did not."

---

## B. Blockers (P0: fix first)

### B1. There is no data layer
- Channels, runs, steps, offer, contracts and scan results are literal arrays and strings (`App.tsx:53-128` and every page component).
- **"Run dispute" fakes a live stream** with `window.setInterval` (`App.tsx:263-272`). That is simulated progress, which the brief and API_CONTRACT §5.4.8 forbid.
- Nothing calls E1–E9. Nothing imports `web/shared/types.ts`. There is no fixture mode.
- 7 of the 8 "full" channel addresses are not even valid. For example, `0x01dB4A0f8Be1B76d7E4A3B47c1e340a1` (`App.tsx:112`) has 32 hex digits instead of 40.
- **Fix:** the `ApiClient`, TanStack Query hooks, `useRunStream` and the fixture replay of README §5 and API_CONTRACT §11. Every value on screen then comes from the API or `fixtures/`.

### B2. Wrong facts currently on screen

Each must come from data, never be retyped:

| Where | Shown | Correct | Source |
|---|---|---|---|
| `App.tsx:122` run stream | "x402 quote matched · 2.00 MockUSDG" | Deposit is **5.00** MockUSDG (`maxAmountRequired 5000000`). 2.00 is A, the acked total. | `fixtures/*/offer-B.json`, `config.deposit` |
| `App.tsx:238` slip stub | "100 units × 0.02 − 7 breaches = 0.07" | 7 breaching units × 50 % × 0.02 = **0.07**. The cap is 30 % of 2.00 = 0.60, which does not bind. | API_CONTRACT §6 |
| `App.tsx:280` mirror detail | "Calldata scan 14 / 14 clean"; verifier `0xA1f0…09b2`; commitment `0x8d21…c441` | The B-dispute leak check scans **5** txs (4 if the watcher settled). The verifier is **`0x2729…a405`**. T and R are that channel's real hashes. | `fixtures/local-31337/leak-check/B-dispute.json`, `config.addresses` |
| `App.tsx:299` run view | "304,118 gas combined"; "All 18 steps" | Testnet: `submitCheckpoint` **114,159**, `claimPenalty` **304,432**. Recorded run: **21** steps. | `fixtures/testnet-46630/channels/B-dispute.*`, `fixtures/local-31337/runs/B-dispute.snapshot.json` |
| `App.tsx:305` result card | "Proving time 4,182 ms"; "14 transactions linked" | Proving comes from `Row.proving_ms` (testnet 4,165 ms). The dispute row has **4** client txs. | run `result` |
| `App.tsx:317` channel record | "Acked × 100", "Close started" for a co-signed dispute | A co-signed dispute emits `Opened → CheckpointSubmitted → PenaltyClaimed → Settled`. `Acked` and `CloseStarted` exist **only in anchored mode**. | `fixtures/testnet-46630/channels/B-dispute.*` |
| `App.tsx:317` | "budget B 5.00" on a settled channel | `budget` is the live balance: **0** after settle. | channel fixture |
| `App.tsx:317, 324` | "Settlement gas 1,842 gas · 0.000018 ETH" | `settle` = **100,077** gas (testnet). No ETH cost is measured anywhere. Don't invent one. | channel fixture |
| `App.tsx:317` | blocks "#8,119,240" | Testnet v2 blocks are ≈ **122,0xx,xxx** (deploy block 122,028,843). | `config.deployBlock`, events |
| `App.tsx:324` privacy page | "Latency threshold · 250 ms" | **≤ 800 ms** (`maxM1`) | `config.terms` |
| `App.tsx:324` | "Penalty cap · 0.07 MockUSDG" | Penalty **50 %** of the unit price per breaching unit. Cap **30 %** of A. | `config.terms` |
| `App.tsx:324` | "Receipt nonce · 100" | The session nonce is a 253-bit random value and is **never sent to the console**. Show "known to both parties", not a value. | API_CONTRACT §4; LAYOUT_SPEC mirror |
| `App.tsx:324` | "Deposit · 2.00 MockUSDG" | Deposit **5.00**; A 2.00 | `config.deposit` |
| `App.tsx:329` offer | `POST /provider/market-b/receipt`; `extra.aegis {"mode":"market-b","maxSeq":128}`; "Offer digest"; network "46630"; a "Use this offer" button | The endpoint is `GET /provider/job` → **402**. `accepts[0]` = `{scheme "exact", network "eip155:46630", asset, payTo, maxAmountRequired "5000000", extra.aegis {config, sigProvider, terms, unitQty, exitSig, anchored}}`. There is no "use offer" action (the server's agents fund). | `fixtures/*/offer-B.json`; API_CONTRACT §8 |
| `App.tsx:333` deployment | 3 invented addresses. "Private channel factory … verifies the final settlement proof". "Runtime register: All healthy / last block #8,119,240 / fixture replay enabled". | **8** addresses from `/api/config`. The verifier contract verifies proofs; factories open channels. **No health endpoint exists**, so show only what E1 and E2 prove (config loaded, last scan age). | `fixtures/testnet-46630/config.json` |
| `App.tsx:110-119` registry | 8 invented channels | 16 real testnet channels | `fixtures/testnet-46630/channels.json` |
| `App.tsx:199, 209` | "Fixture replay" and "Server ready" always shown | The badge appears only when `VITE_API_MODE=fixtures`. Server status comes from the E1 probe (ServerDown gate). | README §2.2 #10; LAYOUT_SPEC root states |
| `App.tsx:255` Desk hero | Presented as a real "Proof outcome · B-dispute" | Bind it to a real finished run, or label it "worked example (spec §6.5)" | LAYOUT_SPEC `/` |
| `App.tsx:333` known limits | 4 items | **5** items. Missing: the Stylus program keepalive (365-day expiry; funds recoverable through the EVM close paths). | PRODUCT_CONTEXT §5 |

### B3. Manus platform coupling and telemetry (remove all)
- **`vite.config.ts:206` plugins.** Remove:
  - `vitePluginManusRuntime()`;
  - `vitePluginManusDebugCollector()`, which injects `/__manus__/debug-collector.js` in dev;
  - `vitePluginStorageProxy()`, a proxy to Manus Forge (`BUILT_IN_FORGE_API_URL`);
  - `jsxLocPlugin()`.

  Also remove `allowedHosts` with the `*.manus*.computer` domains (`vite.config.ts:227`).
- **`client/public/__manus__/debug-collector.js`** (25 KB) monkey-patches `fetch` and XHR, records rrweb session replay and `sendBeacon`s it. That is telemetry, and README §2.2 #4 forbids it. It is also copied into every build. Delete the folder.
- **`client/src/components/Map.tsx`** loads Google Maps through `https://forge.butterfly-effect.dev` (lines 92-98): an external host plus an API key. Delete it and drop `@types/google.maps`.
- **`client/src/const.ts`** and `shared/const.ts` hold an OAuth login-URL helper and a session cookie constant. The console has no login (LAYOUT_SPEC). Delete both.
- **Template leftovers.** Delete `client/src/components/ManusDialog.tsx`, `client/src/pages/Home.tsx` (the template's example page, never routed) and `template.json`.
- **Security: the dev server listens on all interfaces** (`server.host: true`). Once it proxies the unauthenticated console API (which runs scenarios with the server-held demo keys), anyone on the LAN could drive it. Use `host: "127.0.0.1"`, `strictPort: true`.

### B4. Not integrated with the backend
- **No `/api` proxy, no build target the console server serves, and never built.** `dist/` contains only the Express bundle `dist/index.js`, with no `dist/public/`.
- **`server/index.ts` (Express) is redundant.** The Hono console server (`web/server`, :4040) is the only origin that has the API and SSE. Remove Express and the `esbuild` step.
- **Not in `pnpm-workspace.yaml`**, and it has its own lockfile plus `packageManager: pnpm@10.4.1`, while the root uses pnpm 9.15.
- **Fix:** follow README §2.1 and §10:
  - dev: Vite on 127.0.0.1:4047 with a proxy for `/api` and `/provider` to :4040;
  - demo: `pnpm build:web` writes into `web/dist`, and `AEGIS_NETWORK=testnet pnpm --filter @aegisclear/web serve` serves everything on :4040 (one origin, SSE safe);
  - install standalone: `pnpm install --ignore-workspace` inside the folder.

---

## C. Design direction not followed (P1)

The prototype already routes every colour through CSS variables (`index.css:4-48`), so C1 and C2 are mostly a **token swap**.

- **C1. Palette.** `--paper: #f3f0e8` and `--coral: #d55d4a` (`index.css:5, 13`, and `theme-color` in `client/index.html:6`) are **AI-default cluster 1**: a warm cream near #F4F1EA with a terracotta near #D97757. DESIGN_BRIEF §2 explicitly rejects this look.
  - Use the brief's §4 tokens for both themes: `paper #E6ECE8`, `sheet #F6F8F6`, `sheet-2 #EEF2EF`, `stub #F4E9EE`, `rule #C5D0CA`, `rule-strong #7B8A83`, `ink #15201B`, `ink-2 #4A5852`, `engrave #1D5A45`, `on-engrave #F6F8F6`, `proof #A3126B`, `caution #8A5A00`, `danger #B42D0E`, plus the "Plate" dark values.
  - There is **no blue** (`--blue`) in the brief, and no coral.
- **C2. Typography.** Manrope (`index.css:52`), Space Grotesk (`:68`) and DM Mono (`:59`) are banned (DESIGN_BRIEF §3). **None of them is loaded** (no `@font-face`, no package), so on a judge's laptop the UI falls back to system fonts.
  - Use Archivo (variable, with the `wdth` axis doing the hierarchy) and Atkinson Hyperlegible Mono **for hex, JSON and code identifiers only**, as bundled `.woff2`.
  - Amounts, gas and times use Archivo with `tnum`, not mono.
- **C3. Template chrome everywhere.**
  - 10 `text-transform: uppercase` rules, including the tracked `.eyebrow` above every heading (`index.css:118`).
  - Middle-dot meta strings ("100 units · 7 SLA breaches · Groth16 proof").
  - A monospace face on small labels, arrow icons after link text, and numbered `01/02/03` scenario cards.

  DESIGN_BRIEF §5 labelling bans all of these. Use sentence case, separate fields and no eyebrow.
- **C4. Surfaces.** Drop shadows (`--shadow*`), hover lifts (`translateY(-1px/-3px)`), a noise overlay (`body::before`, `index.css:53`) and `backdrop-filter: blur`. The brief has no shadows, no hover lifts and no glow. The drawer or overlay edge is a 1 px `rule-strong` plus a scrim.
- **C5. Hero and slip.** The Desk opens with a dark "big number" block (`.hero-metric`) whose headline accents one phrase in colour. That is the generic hero the frontend-design guidance calls out. The **slip is the single bold element** (brief §7). Make it:
  - **Seals:** the `T` and `R` guilloche seals drawn from the real hashes.
  - **Split bar:** to scale, with a 2 px gap between segments, each segment labelled.
  - **Market A comparison:** "0 or 2.00" outcome bars (an SVG hatch), not "price visible / terms withheld" bars.
  - **Leak verdict:** "Leaks 0", "Ambiguous 0" and "Transactions scanned 5" as separate figures.
  - **Proof ink:** magenta in exactly the 4 places the brief lists.
- **C6. Accent semantics.** Coral currently does everything: primary buttons, links, focus ring, eyebrows, active nav, the client share. Per the brief:
  - **`engrave` green:** primary buttons, focus ring, structure and the provider share.
  - **`proof` magenta:** only the stub, the client share moved by a proof, the Groth16 step and breach cells.
  - **Links:** `ink` with an underline.

---

## D. Accessibility (P1)

- **Contrast fails WCAG AA** (4.5:1 for text). Measured on the prototype palette:

| Pair | Ratio |
|---|---|
| `--ink-faint` text on paper / paper-2 / paper-3 | 2.83 / 2.56 / 3.08:1 |
| coral eyebrows and link text | 3.36–3.66:1 |
| primary button label (white on coral) | 3.68:1 |
| sage status tag | 3.47:1 |
| amber status tag | 3.28:1 |
| dark theme `--ink-faint` | 4.43:1 |

  The brief's tokens were computed to pass (§4 table).
- **Type size.** 147 declarations under 12 px (9–11 px labels). The brief's minimum is **12 px anywhere**: body 15 px, table cells 14 px, meta 13 px.
- **Shortcuts dialog** (`App.tsx:221-223`): a custom modal with no focus trap and no focus return. It lists N/R/L shortcuts that are **not implemented**, and has no toggle to turn single-key shortcuts off (WCAG 2.1.4; README §1.1 C8). Use a Radix Dialog.
- **Tables.** `td:first-child { display: flex }` removes table-cell semantics in some browsers. Put the flex layout inside the cell.
- **Live regions.** There is no `aria-live` for run phases or leak results (README §6.1).
- **Buttons that do nothing:** "Run scenario", "Use this offer", "Scan again", "Refresh registry", "Filters", "View raw events". Every control must perform its named action or not exist.

---

## E. Structure vs LAYOUT_SPEC (P2)

- **E1. Extra pages.**
  - `/privacy` is a standalone page. The leak check is per run (E8 is keyed by `runId`). Make it redirect to the latest run's `#privacy`, or show "run a scenario first".
  - `/runs` is a scenario-card board. LAYOUT_SPEC's Desk holds the launcher and session runs, and `/runs` redirects to `/#session-runs`. Keep the launcher on the Desk.
- **E2. Run view.** Missing:
  - live vs verdict modes, and the SSE states (reconnecting, run error, run gone, invalid id);
  - the testnet `wait` countdown narration;
  - `?leak=1&ch=` recovery, and the per-scenario variants (anchored ack slots, rollover epoch grids, `all` legs).
- **E3. Registry.** Missing:
  - URL filters (`state`, `mode`, `factory`, `client`, `session`, `page`) and pagination of 50;
  - the CLOSING countdown and the `run` tag;
  - the A-column rule (SETTLED rows link to the split in the record).

  Replace the free-text search with the LAYOUT_SPEC filters.
- **E4. Channel record.** The lifecycle, settlement card and event trail must come from `lifecycleOf` and `settlementOf`. Rollover needs the Σ `RolledOver` + `Settled` sum (API_CONTRACT §4.1).
- **E5. Offer.** Render the real 402 JSON with the two annotation columns: facilitator view vs `extra.aegis`.
- **E6. Root states.** Missing: the ServerDown gate, the local-chain badge and the root error element.
- **E7. Routing library.** The prototype uses `wouter` (patched: `patches/wouter@3.7.1.patch`). LAYOUT_SPEC's routing relies on a data router (loaders returning discriminated results, `errorElement`, `ScrollRestoration`), so switch to **React Router v7** (README §4). There are 21 call sites in `App.tsx`.

## F. Housekeeping (P2)

- **Unused shadcn components.** 50+ files in `client/src/components/ui/`, none imported by `App.tsx`. They carry the shadcn default theme (the mainstream look). Delete everything unused. Keep only Radix primitives you actually use, restyled with tokens.
- **Tailwind v4.** It is imported (`index.css:1`) but the app uses hand-written classes. Remove it, or keep it only with an `@theme` mapped 1:1 to the brief's tokens (README §4).
- **Unused dependencies:** `recharts`, `axios`, `streamdown`, `embla-carousel-react`, `react-day-picker`, `input-otp`, `vaul`, `cmdk`, `framer-motion`, `next-themes`, `react-hook-form`, `@hookform/resolvers`, `zod`, `express`, `@types/express`, `esbuild`, `add`, `pnpm`, `@builder.io/vite-plugin-jsx-loc`, `vite-plugin-manus-runtime`. Remove whatever the final code does not import.
- **One big CSS file.** `index.css` is 240 lines of minified-style rules. Split it per README §5: tokens, themes and fonts files plus co-located component styles.

---

## G. Order of work for the next session

1. **Strip** the Manus coupling and the template leftovers (B3, F). Set the dev server to loopback.
2. **Swap tokens and fonts** to DESIGN_BRIEF §3–§4 (C1, C2), then remove shadows, uppercase and dot strings (C3, C4). The look changes in one pass, because everything is already CSS variables.
3. **Build the data layer:** `ApiClient` (live + fixtures), Query hooks, `useRunStream`, the label adapter (API_CONTRACT §7), `settlementOf` and `lifecycleOf`, with the unit tests of README §6.7 (B1).
4. **Wire every page to data.** Delete every hard-coded value (B2) and align routes with LAYOUT_SPEC (E). Replace wouter with React Router v7.
5. **Integrate** (B4): proxy, `build:web`, then a testnet run from click to `0.07 / 1.93` and `0 leaks`.
6. **Accessibility pass** (D), the **conformance gate** (README §12), then video QA at 1920×1080.
