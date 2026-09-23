# AegisClear Frontend: Build Handoff (start here)

This folder is a complete brief for rebuilding the AegisClear web console as a professional, production-grade frontend. It is written for an AI coding model (or a human frontend engineer) who has never seen the project. Read the documents in the order below. Everything you need is here or in a file this folder points to.

> **For the human handing this over:** give the model the whole `docs/frontend/` folder (or the repository) and paste the prompt in [§11](#11-prompt-to-paste-into-the-ai-model).

> **Where the new frontend lives (decided 23 Sep 2026): `aegisclear-console/`** at the repo root.
> - It is a separate Vite app that reaches the existing console server (`web/server`, :4040) same-origin (§2.3).
> - It currently holds a Manus-generated prototype. [`REVIEW_aegisclear-console.md`](./REVIEW_aegisclear-console.md) lists what to keep and what to fix first.
> - The old console in `web/src` stays untouched as the fallback UI.

---

## 0. Mission

Build the new AegisClear console in **`aegisclear-console/`**, starting from the prototype that is already there, so that:

1. it **fits this application exactly**: every number, state, term and flow comes from the real API and the real product (no invented features);
2. it looks and behaves like **professional, industry-standard software**: accessible, fast, resilient, tested, consistent;
3. it is **distinctive (anti-mainstream)**: it must not look like a generic crypto dashboard or a templated SaaS admin. The identity comes from the product's own world (see `DESIGN_BRIEF.md`).

**Success test:** a judge watching a 3-minute video understands within the first 10 seconds that *a zero-knowledge proof just split a payment proportionally (0.07 back to the client, 1.93 to the provider) without the chain ever seeing the price, the thresholds or the metrics*, and the operator can drive the full demo on Robinhood Chain testnet without a single dead end.

---

## 1. Reading order and precedence

| # | Document | What it gives you | Authority |
|---|---|---|---|
| 1 | `README.md` (this) | Hard constraints, stack, architecture, engineering standards, Definition of Done | **Non-negotiable.** Overrides everything below. |
| 1a | [`REVIEW_aegisclear-console.md`](./REVIEW_aegisclear-console.md) | Gap analysis of the current prototype: what to keep, the P0/P1/P2 fix list with file:line evidence, the order of work | A to-do list derived from the documents below. If it ever disagrees with them, they win. |
| 2 | [`PRODUCT_CONTEXT.md`](./PRODUCT_CONTEXT.md) | What the product is, the audiences, the privacy model, **forbidden claims**, glossary, parity list F1–F11 | Source of truth for facts and wording |
| 3 | [`API_CONTRACT.md`](./API_CONTRACT.md) | Endpoints, types, the SSE lifecycle, ordering facts, the label adapter (server strings are Indonesian), the error matrix | Source of truth for data. The code wins over this doc if they ever differ. |
| 4 | [`LAYOUT_SPEC.md`](./LAYOUT_SPEC.md) | Routes, sections per route, navigation, components, responsive behaviour, the demo-path table, the DATA CONTRACT | Structure |
| 5 | [`DESIGN_BRIEF.md`](./DESIGN_BRIEF.md) | Tone, typography, colour tokens, layout principles, motion, the one differentiator | Visual direction |
| 6 | [`DESIGN_REF.md`](./DESIGN_REF.md) | A production brand's design system, used as a **craft reference** (spacing rhythm, states, component finish) | Reference only. **Never copy its palette, typography or brand.** |
| 7 | [`fixtures/`](./fixtures/README.md) | Real recorded API responses and SSE streams (testnet + local) | Test and demo data |

**Authority is by domain:**
- **Facts and data:** `PRODUCT_CONTEXT.md` and `API_CONTRACT.md` win over everything below them.
- **What exists and where:** `LAYOUT_SPEC.md` decides pages, sections, states, data sources and interactions.
- **How it looks and moves:** `DESIGN_BRIEF.md` decides tokens, type, colour, component form, motion and copy style.
- **Reference only:** `DESIGN_REF.md` is below all of these.

The known overlaps between the structure and design documents are already resolved in §1.1 (binding). For anything else that is genuinely ambiguous, choose the option that keeps the demo path working and the facts correct, then leave a `// DECISION:` comment explaining it.

### 1.1 Resolved conflicts between LAYOUT_SPEC and DESIGN_BRIEF (binding)

The two documents were written in parallel. Where they overlap, build exactly this:

| # | Topic | LAYOUT_SPEC says | DESIGN_BRIEF says | **Build** |
|---|---|---|---|---|
| C1 | Verdict screen | Verdict band (split + binary bars + "why 0.07" + deposit reconciliation) and privacy mirror (fact / private / chain rows) with a leak stamp | Perforated **settlement slip**: stub (private) · perforation · chain half (T/R seals, A, split numerals, to-scale bar, Market A hatch bar, leak verdict, inference footnote) | **One component: the slip IS the verdict band + mirror.** The stub is the mirror's "Known to client and provider" column (plus the "why 0.07" math, in proof ink, captioned as computed privately). The chain half is the mirror's "Visible on Robinhood Chain" column plus the seals, the split, the binary hatch bars and the deposit reconciliation. Keep the rows aligned across the perforation. The leak stamp is the verdict group, and the brief's leak-scan motion plays on it. The whole slip fits 1536×864 unscrolled. |
| C2 | Unit visual | 10 × 10 grid (co-signed); ack strip (anchored); epoch bar (rollover) | 16 × 8 grid = one 128-receipt epoch; 20 slots (anchored); two epoch grids (rollover) | **Brief's geometry, LAYOUT's data rules.** A 16 × 8 grid per epoch (100 of 128 filled for co-signed runs). Anchored: 20 slots, each gaining its `ack` tx and gas. Rollover: epoch-0 grid (128/128), then the rollover row, then the epoch-1 grid (5). Fill from `progress`, never from label text. Keep the counter "On-chain transactions during service: 0". |
| C3 | Breach marks | Only in dispute scenarios | From `config.breaches`, filtered to the run's seq range | **Mark breaches in every Market-B run.** The schedule really applies per epoch (API_CONTRACT §4.1): 7 in dispute/cooperative, seq 3 and 17 in anchored, 7 + 1 in rollover. In cooperative and rollover runs, caption them "Breached, not disputed: the client signed the close." In dispute runs they are the proof's input. |
| C4 | Channel detail | Full page `/channels/:address` (no drawer) | Mentions a detail "drawer" (scrim, T seal at 64 px heading it) | **Full page** (reload-safe URL). The T seal (64 px) heads the record's identity bar. Scrim rules apply only to real overlays (mobile nav, shortcut dialog). |
| C5 | Deployment register | Its own route `/deployment` + a header network badge | A deployment register beneath the wordmark in the global chrome | **LAYOUT's structure.** The register is the `/deployment` page. The header shows the brief's network plate (engrave for testnet, caution for local, with "explorer links disabled"). The brief's no-centred-hero rule applies to the Desk. |
| C6 | Copy formatting | Examples use `A · B · C` strings, "→" in the footer link, "state pill" | Bans middle-dot meta strings, "→" in link or button text, and pills | **Brief's style.** LAYOUT's dotted strings are shorthand for *separate fields*. Render them as separate labelled values or as a sentence. `StatePill` renders as the brief's state glyph + word. There are no arrows in link text. |
| C7 | Breakpoints | Named after Tailwind defaults | (none) | Use the pixel **values** only (640/768/1024/1280/1536) as CSS custom media or constants. Tailwind is removed, or restricted to the brief's tokens (§4). |
| C8 | Single-key shortcuts (`n`, `r`, `l`, `?`) | Global, inactive in text fields | (none) | Keep them, **plus a toggle to turn off single-key shortcuts** in the `?` dialog (persisted), as WCAG 2.1.4 requires. Every shortcut has a visible, clickable equivalent. |

---

## 2. Hard constraints (non-negotiable)

### 2.1 Scope: what you may and may not touch

| Path | Rule |
|---|---|
| `aegisclear-console/client/**` | **Yours.** Rewrite freely (`client/src`, `client/index.html`, `client/public`). |
| `aegisclear-console/vite.config.ts`, `package.json`, `tsconfig*.json`, `components.json`, `.gitignore` | Yours. They must end in the shape of §2.3: loopback dev server, proxy to :4040, a `build:web` target, no Manus plugins. |
| `aegisclear-console/server/`, `shared/const.ts`, `patches/`, `template.json`, `client/public/__manus__/`, `client/src/components/ManusDialog.tsx`, `Map.tsx`, `client/src/const.ts`, `client/src/pages/Home.tsx` | **Delete** (Manus template and platform coupling; REVIEW B3, B4, E7, F). |
| `web/src/**`, `web/index.html`, `web/vite.config.ts` (the old console) | **Keep untouched as the fallback UI.** `pnpm web` still builds and serves it. |
| `web/server/**`, `web/shared/types.ts`, the rest of `web/`, `sdk/**`, `demo/**`, `contracts/**`, `circuits/**`, `stylus/**`, root `package.json`, `pnpm-workspace.yaml` | **Frozen. Do not edit.** The backend was audited and verified on testnet. Read the types from `web/shared/types.ts` through an alias (§2.3); never redefine them. |

The commands that must keep working unchanged: `pnpm web` (old console on :4040), `pnpm web:dev`, `pnpm --filter @aegisclear/web typecheck`, `pnpm --filter @aegisclear/web test`.

### 2.2 Product and safety rules

1. **No keys, no wallet, no signing in the browser.** No "connect wallet", no private-key fields, no MetaMask. The server holds the demo keys.
2. **No invented data.** Every number, address, hash and state comes from the API (or from `fixtures/` in fixture mode). No placeholder statistics, no fake testimonials, no "trusted by" logos, no made-up TVL or user counts.
3. **No forbidden claims.** Nothing in `PRODUCT_CONTEXT.md` §5 may appear: not "anonymous", not "audited", not "mainnet", not "real USDG", not "cheaper ZK on Stylus", not "2.33×". The testnet token is **MockUSDG**, and the UI says so.
4. **Offline-safe at runtime.** No CDN, remote font, remote image, analytics, telemetry or error-reporting SaaS. Fonts are bundled `.woff2` (e.g. `@fontsource/*` packages, or files in `aegisclear-console/client/public/fonts`). The only outbound URLs are explorer links the user clicks (`target="_blank" rel="noopener noreferrer"`).
5. **Asset types:** the server only sends correct MIME types for `.html .js .css .svg .json .ico .map .woff2 .png`. Use only these. **No `.webp`, `.avif`, `.woff`, `.mp4`, `.gif`.**
6. **Routes:** client routes must not start with `/api`, `/provider` or `/provider-anchored`, and route params must not contain a dot. The server's SPA fallback serves `index.html` for any extension-less path.
7. **Server strings are Indonesian; the UI is English.** Implement the label adapter from `API_CONTRACT.md` §7 (pure functions, fully unit-tested, raw-text fallback). Keep all UI copy in one module (`src/copy/en.ts`) so an Indonesian locale can be added later.
8. **Money math is BigInt.** Amounts are 6-decimal base-unit strings. Never use floating point for arithmetic. Format with `en-US` separators and tabular numerals. Always label units (USDG / MockUSDG, gas, ms, s).
9. **Treat every server string as text.** No `dangerouslySetInnerHTML`, no `eval`, no inline scripts (keep CSP-friendly).
10. **Fixture mode** (`VITE_API_MODE=fixtures`) must exist so the UI runs with no backend. It must **never** be the default for `pnpm build:web` (the demo build), and it must show a visible "Fixture replay" badge. Load the fixture JSON **lazily** (`import.meta.glob` or a dynamic `import()` inside an `if (import.meta.env.VITE_API_MODE === "fixtures")` branch) so the ~500 KB of recordings is **not** in the live bundle. Replay runs from `runs/*.snapshot.json` (steps carry `t`). The `.sse.txt` files are only there to document the wire format.
11. **No platform coupling.** Nothing from the tool that generated the prototype may ship or run:
    - Manus runtime, debug collector, storage proxy, JSX-loc plugins, `/__manus__/*` files;
    - `allowedHosts` for external domains;
    - Forge or Google Maps proxies, OAuth/login helpers.

    The console must build and run on a laptop with the network cable pulled (apart from the chain RPC behind the server).
12. **Loopback only.** Every dev or preview server binds `127.0.0.1`. The API it proxies is unauthenticated and drives server-held keys, so it must never be reachable from the LAN.

### 2.3 Integration with the console server (binding)

The Hono server in `web/server` (:4040) is the **only** process with the API, SSE and keys, and it sends no CORS headers. The browser must therefore always reach it **same-origin**.

| Concern | How |
|---|---|
| Install | `aegisclear-console` is **not** a workspace package. Install the repo root first (`pnpm install`), then `cd aegisclear-console && pnpm install --ignore-workspace`. |
| Types | Alias `@aegis/types` → `../web/shared/types.ts` in `vite.config.ts` (`resolve.alias`) and `tsconfig.json` (`paths`). Use type-only imports. If TypeScript cannot resolve `viem` from there, add `viem` as a devDependency (types only). |
| Fixtures | Alias `@fixtures` → `../docs/frontend/fixtures`, loaded lazily in fixture mode only (§2.2 #10). Allow it in dev with `server.fs.allow: [<repo root>]`. |
| Dev server | Vite on **`127.0.0.1:4047`** (`host: "127.0.0.1"`, `strictPort: true`; never `host: true`), with `server.proxy` for `/api` and `/provider` → `http://127.0.0.1:4040`. SSE passes through the Vite proxy. Port 4047 is unused by the rest of the repo. (Not 4045: Chrome and Firefox refuse it as an unsafe port.) |
| Dev workflow | Terminal 1: `AEGIS_NETWORK=testnet pnpm --filter @aegisclear/web serve` (API only, no build). Terminal 2: `cd aegisclear-console && pnpm dev` → http://127.0.0.1:4047. |
| Demo / video build | `cd aegisclear-console && pnpm build:web` writes the production build into **`<repo>/web/dist`** (absolute path in `vite.config.ts`, `emptyOutDir: true`). Then `AEGIS_NETWORK=testnet pnpm --filter @aegisclear/web serve` → **http://localhost:4040** serves the new console and the API from one origin. Do **not** run `pnpm web` afterwards: it rebuilds the old console into the same `web/dist` (that is the fallback path). |
| Fixture mode | `cd aegisclear-console && VITE_API_MODE=fixtures pnpm dev` (no server needed). Add `VITE_FIXTURE_SET=testnet` for the read-only testnet capture (no runs), and `?speed=N` to the URL to replay runs N× faster. |
| Scripts | `dev`, `build` (to `dist/public`, for inspection), `build:web`, `check` (`tsc --noEmit`), `test`, `gate` (§12). Remove `start` and the esbuild/Express step. |

---

## 3. What exists today, and what is wrong with it

Two UIs exist.

**1. The new prototype, `aegisclear-console/`** (Manus, 23 Sep 2026). It is a static visual sketch: good structure and vocabulary, but no API, hard-coded and partly wrong data, the rejected cream-and-coral palette, banned fonts that are never loaded, failing contrast, and Manus telemetry. Start from [`REVIEW_aegisclear-console.md`](./REVIEW_aegisclear-console.md). Keep what it lists under "Keep"; fix the rest in its order.

**2. The old console, `web/src`** (~550 lines, Indonesian). It stays as the fallback. Its data flow is correct, so port the logic, not the look:

- It is **Indonesian**, while the judges are international.
- It is **one long page** with two equal panels. The wow-moment (the `0.07 / 1.93` row and `0 leaks`) is buried under a step log and only appears after scrolling.
- It uses a **generic GitHub-dark look** (`#0b0f14`, `#4cc2ff`, system-ui, rounded pills): indistinguishable from any dev tool.
- The **60-second challenge window looks like a hang.** Nothing explains that it is the safety mechanism.
- **Money on settled channels is misleading.** Cooperative and rolled-over channels show `A = 0.00` even though 2.00 USDG was paid, because the real split lives in the `Settled` event (`API_CONTRACT.md` §4.1).
- Raw hashes and args are dumped without hierarchy. There are no filters, no deep links, no copy buttons, no light theme, and a11y is minimal.

Parity list F1–F11 in `PRODUCT_CONTEXT.md` §8 is the minimum. Nothing that exists today may be lost.

---

## 4. Tech stack (decided; do not re-litigate)

These choices apply to `aegisclear-console/`, a separate package, so its majors do not affect the backend.

| Concern | Choice | Notes |
|---|---|---|
| Framework | **React 19 + Vite 7 + TypeScript (strict)** | Already in `aegisclear-console/package.json`. It is a static SPA, served by the Hono server from `web/dist` for the demo (§2.3). **No Next.js, no SSR, no Express.** |
| Routing | **React Router v7**, data router (`createBrowserRouter`) | **Replaces `wouter`**: delete `patches/wouter@3.7.1.patch` and the `pnpm.patchedDependencies` entry. Root layout + `errorElement` per route. Use route-level `lazy` for code-splitting. LAYOUT_SPEC's loaders, error elements and scroll restoration assume this router. |
| Server state | **TanStack Query v5** | Polling (`refetchInterval`, paused in background tabs), caching, retries with backoff, `placeholderData: keepPreviousData` so values never flash to zero. |
| Live runs (SSE) | A small `useRunStream(snapshot)` hook over `subscribeRun` | Not TanStack Query. It starts from the loader's `getRun` snapshot, dedupes by `i`, closes on `done`/`error`, and polls `getRun` every 2 s while the stream is down (`API_CONTRACT.md` §5.2). |
| Styling | **CSS Modules + design tokens as CSS custom properties** (`client/src/styles/tokens.css`, themes via `[data-theme]` on `<html>`) | Zero runtime. Every colour, space, radius, shadow and duration comes from the tokens in `DESIGN_BRIEF.md` §4. **Preferred: remove Tailwind** together with the unused shadcn components. If Tailwind stays, its `@theme` holds only the brief's tokens, and its default palette, shadows and radii are never used. **Never ship the shadcn default theme.** No CSS-in-JS runtime. |
| Accessible primitives | **Native elements first**: `<details>` disclosures, native radio groups and selects, a `tablist` with roving focus, `<dialog>` for the shortcut dialog. Radix was removed with the unused template components (REVIEW step 1). | Add a Radix primitive only where a native element cannot meet WCAG 2.2 AA. Style everything only with our tokens. |
| Icons | `lucide-react` (installed) at a 1.5 px stroke, or inline SVG, one consistent style as set by the design brief | No icon fonts, no emoji as icons. |
| Fonts | `@fontsource-variable/archivo` (use the stylesheet that includes the **`wdth`** axis; if the package ships `wght` only, build the woff2 per DESIGN_BRIEF §3) + `@fontsource/atkinson-hyperlegible-mono` | Open licence (OFL) only. Latin subset, `font-display: swap`, preload the display face. **Manrope, Space Grotesk and DM Mono (the prototype's fonts) are out.** |
| Motion | CSS transitions + Web Animations API | Remove `framer-motion` unless the brief's single leak-scan moment truly needs it. Always honour `prefers-reduced-motion`. |
| Charts | None required. Hand-built SVG (e.g. a gas bar, a lifecycle timeline) if the layout calls for it. | Remove `recharts`. |
| Tests | **Vitest** (installed) + **@testing-library/react** + **jsdom** + **vitest-axe** (or jest-axe) | See §6.7. Playwright against fixture mode is optional and nice to have. |
| Lint | `tsc --noEmit` strict is the gate. ESLint (typescript-eslint, react-hooks, jsx-a11y) is recommended. | |

---

## 5. Architecture

### 5.1 Folder layout (target)

```
aegisclear-console/client/src/
  main.tsx                    # providers: QueryClient, Router, Theme
  app/
    router.tsx                # routes from LAYOUT_SPEC.md (lazy)
    AppShell.tsx              # global chrome: network status, nav, theme toggle, fixture badge
    RouteError.tsx            # errorElement
  routes/                     # one folder per route in LAYOUT_SPEC.md
  features/
    runs/                     # scenario picker, run stream, resolution block, result table
    channels/                 # registry, detail, lifecycle timeline, events
    privacy/                  # private-vs-chain comparison, leak check
    offer/                    # x402 offer inspector
    network/                  # deployment/contract registry, server-down state
  lib/
    api/
      client.ts               # ApiClient interface + createApi(): live | fixtures (DATA CONTRACT names)
      live.ts                 # fetch + EventSource against /api
      fixtures.ts             # replays docs/frontend/fixtures (lazy import, fixture mode only), SSE by recorded t
      queries.ts              # TanStack Query keys, loader-shared query options + hooks (useConfig, useChannels, useChannel, useRuns, useRun, useLeakCheck, useOffer, useStartRun)
      policy.ts               # PURE: refetch intervals (API_CONTRACT §10) and the retry rule
      runStream.ts            # PURE: run-tape reducer (dedupe by i, terminal events) + SSE/polling controller
      useRunStream.ts         # the React hook over runStream.ts
    present/                  # PURE: presentStep(), presentRow(), settlementOf(), lifecycleOf(), scenarioMeta
    format/                   # PURE: money (BigInt), address/hash truncation, gas, time, countdown
  ui/                         # design-system primitives: Button, Badge/StateTag, Address, Hash, Amount, Table, Drawer, Tooltip, CopyButton, Toast, EmptyState, Skeleton, Kbd…
  copy/en.ts                  # every user-facing string
  styles/tokens.css, themes.css, fonts.css, global.css
```

Aliases (§2.3): `@` → `client/src`, `@aegis/types` → `../web/shared/types.ts`, `@fixtures` → `../docs/frontend/fixtures`. Port the logic of the old `web/src/format.ts` and `web/src/api.ts` into `lib/format` and `lib/api` (English output). Do not edit the old files.

### 5.2 The API client (binding)

```ts
// aegisclear-console/client/src/lib/api/client.ts. Names are binding (LAYOUT_SPEC DATA CONTRACT).
import type { ConfigResponse, ChannelSummary, ChannelDetail, ScenarioId, RunSnapshot, SseEvent, LeakResponse } from "@aegis/types";

export interface ApiClient {
  getConfig(): Promise<ConfigResponse>;
  getChannels(): Promise<{ scannedAt: number; channels: ChannelSummary[] }>;
  getChannel(addr: string): Promise<ChannelDetail>;
  startRun(scenario: ScenarioId): Promise<{ runId: string }>;
  getRuns(): Promise<RunSnapshot[]>;
  getRun(id: string): Promise<RunSnapshot>;
  subscribeRun(id: string, onEvent: (ev: SseEvent) => void, onTransportError?: () => void): () => void;
  leakCheck(runId: string): Promise<LeakResponse[]>;
  getOffer(client: "A" | "B"): Promise<{ status: number; body: unknown }>;
}
export class ApiError extends Error { constructor(public status: number, public code: string, public body: unknown) { super(code); } }
export function createApi(): ApiClient { /* VITE_API_MODE=fixtures → lazy createFixtureApi({ set: VITE_FIXTURE_SET, speed: ?speed }), else createLiveApi() */ }
```

- Non-2xx responses throw an `ApiError` carrying `status`, `code` (the `error` field) and `body`. The UI branches on these (`busy`, `client-has-open-channel` + `body.channel`, `unknown run`, and so on), never on message text.
- A network failure (`TypeError`) means the server is down (`API_CONTRACT.md` §9): it becomes `ApiError(0, "server-unreachable")`. A non-JSON error body becomes the code `http-<status>`.
- `onTransportError` fires on EventSource's own `error` event (no `data`), which is not the run failing. The server's terminal `error` event carries a snapshot and arrives through `onEvent`.

### 5.3 Derived presenters (pure, unit-tested)

- `presentStep(step, ctx)` → `{ title, meta, tone, kind: "leg" | "tx" | "narrative" | "wait" | "proof" }` (API_CONTRACT §7.1/§7.2).
- `presentRow(row)` → English market / decided-by / readable-on-explorer, plus parsed `toClient` and `toProvider` amounts (§7.3).
- `settlementOf(detail)` → `{ toProvider, toClient, penalty, cooperative, epochs: [...] } | null`, from the `Settled` event **plus every `RolledOver` event**. The provider total is Σ `RolledOver.toProvider` + `Settled.toProvider` (rollover: 2.56 + 0.10 = 2.66; API_CONTRACT §4.1).
- `lifecycleOf(detail)` → ordered lifecycle stages from events (`Opened`, `Acked`×n, `CheckpointSubmitted` | `CloseStarted`, `PenaltyClaimed`, `RolledOver`, `Settled`); unknown events are kept generically.
- `groupRun(run)` → legs (split on `▶` markers) and a resolution group (dispute → proof → wait → settle), per API_CONTRACT §5.4.

---

## 6. Engineering standards

### 6.1 Accessibility (WCAG 2.2 AA; both themes)
- Semantic landmarks (`header`, `nav`, `main`), a skip link, one `h1` per route, and a logical heading order.
- Everything is operable by keyboard, with a visible custom `:focus-visible` ring (≥ 3:1 against adjacent colours). Drawers and dialogs trap focus and return it on close (Radix).
- Text contrast ≥ 4.5:1 (≥ 3:1 for large text); UI component and state contrast ≥ 3:1.
- **Colour is never the only signal.** Channel state, mode and leak result each carry text plus a shape or icon.
- Live runs: announce **phase changes and completion** through an `aria-live="polite"` region, not every step. Use `role="status"` for the leak-check result.
- Data tables use real `<table>` with `<th scope>` and a caption. Sortable headers use `aria-sort`.
- Truncated hashes and addresses expose the full value (accessible name or tooltip) **and** a copy button. Tooltips are never the only way to reach information.
- Target size ≥ 24×24 CSS px (WCAG 2.5.8), and ≥ 44×44 on touch layouts. Usable at 200 % zoom. Respects `prefers-reduced-motion` and `prefers-contrast`.

### 6.2 Performance
- Initial JS ≤ 180 KB gzip. Route-level code-splitting. Self-hosted fonts, subset to Latin, at most 2 families and 4 files on first paint.
- On `localhost`: LCP ≤ 1.0 s, CLS ≤ 0.05 (reserve space for the streaming log and the result area), INP ≤ 200 ms.
- The step log is append-only. Don't re-render every row per SSE event (memoise rows by `i`). Virtualise any list over ~200 rows (the local registry fixture has 129 channels and grows).
- Poll channels every 4 s (2 s while a run is live, API_CONTRACT §10), paused in hidden tabs.

### 6.3 Resilience and states
Every data view designs **all** of these states: loading (skeleton sized like the content), empty (an invitation to act), error (what happened plus how to fix it), stale (last good data plus "updated N s ago"), and live. Use the error matrix in `API_CONTRACT.md` §9. Each route has an error boundary. **Never show zeros while loading**; keep the previous data.

### 6.4 Security and privacy
No secrets in `import.meta.env`. No third-party requests. Explorer links use `rel="noopener noreferrer"`. No user tracking. `localStorage` holds only UI preferences (theme, dismissed hints), wrapped in `try/catch`.

### 6.5 Numbers and data display
- Tabular numerals everywhere numbers align.
- Amounts: 2 decimals by default, full 6 on hover or copy, always with a unit.
- Gas: `en-US` separators.
- Time: relative, with an absolute tooltip.
- Countdowns tick every second from the chain `deadline`.
- Addresses and hashes: middle ellipsis, copy button, explorer link when `explorerBase` exists (not on `local`).

### 6.6 Data-table craft (the registry, result rows, event trail)
`DESIGN_REF.md` (IBM) is a marketing-site extraction and **contains no data-table guidance** (see its "Known Gaps"). This checklist is the reference for tables:
- **Semantics first.** Use a real `<table>`. **Do not put `role="button"` on `<tr>`** (the current `ChannelsTable.tsx` does, and it breaks table semantics for screen readers). Make the primary cell a real link (`<a href="/channels/0x…">`). Whole-row click can be a mouse convenience on top of that. Copy buttons and explorer links inside a row must not trigger the row action.
- **Stable geometry.** Fix column widths (`<colgroup>`) so 3-second polling never shifts columns (CLS). Row height is fixed at the brief's value (36 px). Hex never wraps; it is middle-ellipsised.
- **Alignment.** Numbers are right-aligned with tabular numerals, and text and hex are left-aligned. A header aligns with its column's content.
- **Sticky context.** The header row stays sticky while scrolling vertically. The channel column stays sticky while scrolling horizontally on narrow viewports.
- **Sorting.** The registry keeps the server order (newest first) and has **no column sorting** (LAYOUT_SPEC). If a later table adds sorting, sortable headers are `<button>`s inside `<th aria-sort>` with a visible direction glyph, and the sort state lives in the URL query.
- **Filtering.** A toolbar filters by state, mode, factory and "this session" (`runId` present), with counts. Filter state lives in the URL (deep-linkable). There is a "Clear filters" action. A filtered-empty state ("No channels match these filters") is distinct from truly empty.
- **Loading and refresh.** Skeleton rows at the real row height on first load only. Background refetches keep the current rows (no flashing). A new row appears without animation, with at most a one-time subtle highlight (none under reduced motion).
- **Volume.** Paginate at 50 rows per page, with the `page` URL param (LAYOUT_SPEC). The local fixture has 129 channels, i.e. 3 pages. Keep it keyboard-navigable.
- **Row states.** Tokenised hover, selected (the channel open in the drawer), focus-visible and "blocking" (an OPEN/CLOSING channel of client A or B, which would trigger `409 client-has-open-channel`). Each state is visually distinct and never colour-only.

### 6.7 Tests (must exist and pass)
- **Unit:** `lib/format/*` (money BigInt edge cases, truncation, countdown), `lib/present/*` (**every** regex in API_CONTRACT §7 against the recorded labels in `fixtures/local-31337/runs/*.snapshot.json`, plus the raw fallback), `useRunStream` reducer (dedupe by `i`, out-of-order bursts, terminal `done`/`error`, transport error vs run error), `settlementOf` on every fixture channel.
- **Component** (jsdom, fixture mode): the run view in running, done, error and unknown-run states; the registry with 129 channels; channel detail for dispute, anchored, rollover, cooperative and open-unfunded channels.
- **Accessibility:** axe with **0 serious/critical** violations on every route, in both themes.
- **New console:** `cd aegisclear-console && pnpm check && pnpm test && pnpm gate` (§12).
- **Existing suites stay green and untouched:** `pnpm --filter @aegisclear/web typecheck` and `pnpm --filter @aegisclear/web test`. `test/server.test.ts` needs a local chain plus deployment (`RPC_URL=http://127.0.0.1:<port>`, see the root README). If no chain is available, run `test/format.test.ts` and say so.

---

## 7. Voice and copy

- English, sentence case, plain verbs, no hype, no exclamation marks, no emoji. Name things the way a payments engineer would (see the glossary in `PRODUCT_CONTEXT.md` §7).
- Buttons say exactly what happens: "Run dispute", "Check for leaks", "Copy address", "View on Blockscout". An action keeps its name through the flow ("Run dispute" → "Dispute running" → "Dispute settled").
- Errors say what happened and what to do, in the interface's voice. They never apologise and are never vague.

### Baseline copy for states (refine wording, never facts)

| State | Copy |
|---|---|
| Server down | **Console server is not running.** Start it with `AEGIS_NETWORK=testnet pnpm --filter @aegisclear/web serve` (Robinhood Chain testnet) or `pnpm --filter @aegisclear/web serve` (local chain), then retry. |
| 409 busy | **Another run is in progress.** One scenario runs at a time. [Open the running scenario] |
| 409 client-has-open-channel | **Client {A\|B} still has an open channel** ({short address}). It must settle before this client can start a new run. [Open channel] |
| 502 preflight-failed | **The scenario could not start.** The server reported: {message} |
| 502 on reads | **The chain RPC didn't answer.** Showing data from {N} s ago; retrying. |
| Unknown run | **This run is no longer in the console's memory.** The server was restarted. Channels it created are still on-chain. [Browse channels] [Run a scenario] |
| Unknown channel | **No channel at this address** in this deployment's factories. Check the address or browse the registry. |
| Empty registry | **No channels yet.** Run a scenario to open the first one. |
| Challenge window (testnet) | **Challenge window: {s} s left.** Until it closes, either party can answer with a higher co-signed checkpoint. After that, anyone can settle. |
| Leak check running | Scanning calldata and logs of {n} transactions for the private terms… |
| Leak check result | **0 leaks** in {n} transactions. Price, thresholds, penalty, cap, nonce and metrics appear nowhere on-chain. |
| Leak check, Market A | Not applicable: the binary escrow writes its terms into calldata in plain text (`createJob`). |
| Anchored caveat | Anchored mode puts each ack on-chain, so leaf hashes and the running total are public and the unit price can be inferred. Metrics and thresholds stay private. |
| Fixture mode badge | Fixture replay: recorded data, no chain |

### Scenario names (UI labels for `ScenarioId`; titles as fixed in `DESIGN_BRIEF.md` §5)

| id | Title | One-line description | Testnet duration (announce before starting) |
|---|---|---|---|
| `B-dispute` | Dispute settled by proof (client B) | 100 units; 7 breach the latency SLA; a Groth16 proof returns 0.07 USDG to the client. | ≈ 158 s |
| `B-anchored-dispute` | Anchored mode with 20 on-chain acks and a dispute (client A) | Each ack is a transaction hashed by the Stylus Poseidon program; 2 breaches; the proof is checked against the on-chain root. | ≈ 140 s |
| `B-rollover` | Rollover of 128 + 5 units on one deposit (client B) | Epoch 0 fills (128 units), a cooperative rollover pays 2.56 USDG, and epoch 1 serves 5 more units. | ≈ 135 s |
| `B-cooperative` | Cooperative close (client A) | 100 units and both parties sign the close. The breaches occur but are not penalised. | ≈ 96 s |
| `A-complete` | Binary escrow, complete | Control. An ERC-8183-style evaluator releases everything to the provider. | ≈ 13 s |
| `A-reject` | Binary escrow, reject | Control. The evaluator refunds everything to the client. | ≈ 13 s |
| `all` | Run the four comparison rows | Cooperative, dispute and both binary outcomes, back to back. | ≈ 5 min |

---

## 8. Definition of Done

- [ ] **Parity:** F1–F11 (`PRODUCT_CONTEXT.md` §8) all present, plus the listed improvements.
- [ ] **Layout:** every route and section in `LAYOUT_SPEC.md` is built, and its demo-path table works end-to-end with the recovery URLs.
- [ ] **Design:** the tokens, type and colour from `DESIGN_BRIEF.md` are applied through CSS variables; both themes pass contrast; the one differentiator (§7 of the brief) is implemented; none of the brief's anti-patterns appear.
- [ ] **Truth:** no invented data; no forbidden claim; MockUSDG labelled; every number on screen traces to the API or fixtures.
- [ ] **Label adapter:** English everywhere; unmatched server text falls back to raw; tests cover all catalogued labels.
- [ ] **States:** loading, empty, error, stale, running, done and unknown are designed for every data view (§6.3).
- [ ] **Fixture mode:** `cd aegisclear-console && VITE_API_MODE=fixtures pnpm dev` renders every route with no backend and replays each scenario's SSE.
- [ ] **Live:** after `pnpm build:web`, with `AEGIS_NETWORK=testnet pnpm --filter @aegisclear/web serve` running, http://localhost:4040 runs `B-dispute` from click to `0.07 / 1.93` and `0 leaks` without a reload, and the 60 s window is narrated.
- [ ] **Quality gates:** typecheck and tests green; axe 0 serious/critical; Lighthouse accessibility ≥ 95 and best practices ≥ 95 (localhost); the performance budgets in §6.2 are met.
- [ ] **Conformance gate:** `pnpm gate` (§12) passes, and every item in `REVIEW_aegisclear-console.md` is either fixed or deliberately waived with a reason.
- [ ] **Video QA:** checked at 1920×1080 (the recording size), 1440, 1280, 1024 and 390 px, in both themes, and at 50 % zoom for the headline figures.
- [ ] **Network hygiene:** the DevTools network tab shows only same-origin requests during a full run.

---

## 9. Suggested build order

0. **Clean the prototype** (REVIEW §G steps 1–2):
   - strip the Manus coupling and template leftovers;
   - set the dev server to loopback and add the proxy and `build:web`;
   - swap to the brief's tokens and fonts;
   - remove shadows, uppercase eyebrows and dotted meta strings.
1. **Foundation:** tokens, themes and fonts from the brief; `lib/format`; `lib/present` (label adapter) with tests; `ApiClient` live + fixtures; `useRunStream` with tests.
2. **Shell:** app chrome with network status, server-down state, theme toggle, fixture badge and routing skeleton.
3. **Channels:** registry (filters, deep links), then channel detail (lifecycle timeline, settlement from `Settled`, events with gas).
4. **Run view (the hero):** scenario picker, stream, resolution block, result vs Market A, private-vs-chain comparison, leak check.
5. **Remaining routes** per `LAYOUT_SPEC.md` (offer inspector, contracts/network, overview).
6. **Polish:** every state, a11y pass, responsive pass, the single motion moment, then a video QA pass at 1920×1080.

---

## 10. Useful facts at a glance

- **New console, demo:** `cd aegisclear-console && pnpm build:web`, then from the repo root `AEGIS_NETWORK=testnet pnpm --filter @aegisclear/web serve` → http://localhost:4040 (needs the `.env` keys).
- **New console, dev:** API as above in terminal 1, then `cd aegisclear-console && pnpm dev` → http://127.0.0.1:4047 (proxy to :4040).
- **Old console (fallback):** `AEGIS_NETWORK=testnet pnpm web` → http://localhost:4040. Local chain: `pnpm web` with a private chain + `DeployLocal` (root `README.md`, "Menjalankan secara lokal").
- Chain: Robinhood Chain testnet, id 46630. Explorer: https://explorer.testnet.chain.robinhood.com.
- Hero numbers: `0.07 / 1.93` (dispute), `0.02 / 0.38` (anchored), `0.00 / 2.66` (rollover), `0.00 / 2.00` (cooperative), `0 / 2.00` and `2.00 / 0` (binary escrow).
- Deadline context: the buildathon submission closes **4 Oct 2026, 15:59 UTC**, and the video is recorded from this UI. Prefer finishing the hero path perfectly over breadth.

---

## 11. Prompt to paste into the AI model

```text
You are a senior product designer and frontend engineer. Turn the prototype in
aegisclear-console/ into the new AegisClear console: a professional, distinctive,
production-grade frontend wired to the real console API.

Before writing any code, read the handoff in docs/frontend/ in this order: README.md,
REVIEW_aegisclear-console.md, PRODUCT_CONTEXT.md, API_CONTRACT.md, LAYOUT_SPEC.md,
DESIGN_BRIEF.md, DESIGN_REF.md, fixtures/README.md. README.md is binding: backend frozen
(web/, sdk/, demo/ untouched), same-origin integration through the Vite proxy and build:web
(§2.3), no Manus or other platform coupling, no wallet or keys in the browser, offline-safe
assets, the English label adapter, BigInt money, WCAG 2.2 AA, the tests, the conformance gate
and the Definition of Done. Fix the review's P0 items first. PRODUCT_CONTEXT.md and API_CONTRACT.md are the source of truth for facts
and data. Never invent numbers, features or endpoints, and never use the forbidden claims.
DESIGN_BRIEF.md sets the visual identity: follow it exactly and do not fall back to generic
dashboard or SaaS defaults. DESIGN_REF.md is a craft reference only.

Work in the build order of README.md §9. Start by restating, in 10 lines or fewer, the product,
the hero moment, and the routes you will build, then build. Use fixture mode
(VITE_API_MODE=fixtures) to develop without a chain. At the end, run typecheck and tests,
walk through the Definition of Done checklist item by item, and report what is done and what
is not, with evidence.
```

---

## 12. Conformance gate (`pnpm gate`)

Add this as `aegisclear-console/scripts/gate.sh` and wire it to `"gate": "bash scripts/gate.sh"`. Every check targets a failure that the first prototype actually shipped (see `REVIEW_aegisclear-console.md`). The gate must print nothing and exit 0.

```bash
#!/usr/bin/env bash
# Conformance gate for aegisclear-console. Run from the aegisclear-console/ folder.
set -u; fail=0
flag() { echo "GATE FAIL: $1"; fail=1; }
SRC="client/src client/index.html"

# 1. Fonts: only Archivo + Atkinson Hyperlegible Mono (DESIGN_BRIEF §3)
grep -rniE "manrope|space grotesk|dm (sans|mono)|\binter\b|roboto|poppins|plus jakarta|\barial\b" $SRC >/dev/null && flag "banned font named"
grep -rqiE "archivo" $SRC package.json || flag "Archivo not wired"
grep -rqiE "atkinson" $SRC package.json || flag "Atkinson Hyperlegible Mono not wired"

# 2. Palette: the brief's tokens exist, the prototype's rejected cream/coral does not (DESIGN_BRIEF §4)
for t in E6ECE8 F6F8F6 1D5A45 A3126B 15201B; do grep -rqi "#$t" client/src || flag "token #$t missing"; done
grep -rniE "#(f3f0e8|f4f1ea|d55d4a|d97757)\b" client >/dev/null && flag "rejected cream/coral palette present"

# 3. Template chrome and surfaces (DESIGN_BRIEF §5-§6)
grep -rn "text-transform: *uppercase" client/src >/dev/null && flag "uppercase labels"
grep -rnE "box-shadow: *[^n;]*(rgba|px [0-9])" client/src | grep -vi focus >/dev/null && flag "drop shadows"
grep -rnE "translateY\(-[0-9]" client/src >/dev/null && flag "hover lift"

# 4. Platform coupling, telemetry, external hosts, login (README §2.2 #4, #11, #12)
grep -rniE "manus|butterfly-effect|forge|googleapis|google\.maps|oauth|getLoginUrl|rrweb|sendBeacon" client vite.config.ts package.json >/dev/null && flag "platform coupling or telemetry"
grep -nE "host: *true|allowedHosts" vite.config.ts >/dev/null && flag "dev server not loopback-only"
[ -d server ] && flag "Express server still present (use web/server)"

# 5. No invented data: no literal addresses/hashes and no fake progress in UI code (README §2.2 #2)
grep -rnoE "0x[0-9a-fA-F]{8,}" client/src --include=*.tsx --exclude=*.test.tsx >/dev/null && flag "literal hex in UI code (must come from API/fixtures)"
grep -rnE "setInterval" client/src --include=*.tsx | grep -viE "clock|countdown|tick" >/dev/null && flag "setInterval outside a clock (fake progress?)"

# 6. Real API wired (API_CONTRACT E1-E9) and the proxy present (README §2.3)
for f in getConfig getChannels getChannel startRun getRuns getRun subscribeRun leakCheck getOffer; do grep -rq "$f" client/src/lib/api 2>/dev/null || flag "ApiClient.$f missing"; done
grep -q "4040" vite.config.ts || flag "no /api proxy to :4040"
grep -q "build:web" package.json || flag "no build:web script"

exit $fail
```

The gate is necessary, not sufficient. It does not replace the Definition of Done, axe, or the video QA.
