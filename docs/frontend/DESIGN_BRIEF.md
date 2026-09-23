<!-- trace: idea="Privacy-preserving escrow for agent-to-agent USDG payments on Robinhood Chain — SLA disputes settled by a Groth16 proof, not a judge." | track="Overall Prize (also fits Promising Products Track)" | weights="JUDGING WEIGHTS NOT PUBLISHED — criteria: Smart contract quality; Product-Market Fit; Innovation and Creativity; Real Problem Solving (+ extra consideration for USDG; ≥1 of 3 prizes reserved for Robinhood Chain)" | source=uiux-matcher -->
# Design Brief — AegisClear operator console

**Scope.** Tone, type, colour, motion and the single differentiator for the new console, which is built in `aegisclear-console/`. Its first prototype (Manus, 23 Sep 2026) did **not** apply this brief; see `REVIEW_aegisclear-console.md` §C. It replaces the current `web/` UI, a generic dark console: `#0b0f14` background, `#4cc2ff` accent, `system-ui`, rounded pills, two equal panels (`web/src/styles.css`, `web/src/App.tsx`). Structure lives in `LAYOUT_SPEC.md` and data in `API_CONTRACT.md`. Both sit in this folder, are being written in parallel and were not read for this brief.

**Sources read:**
- `prd-arsitektur.md` ("spec"): §0, §2, §4, §6.2–§6.7, §14, §17.
- `docs/SUBMISSION.md`: §1, §2, §3, §4.4, §7.
- `README.md`: §Lihat di browser.
- `web/shared/types.ts`.

**Not present in the repo:** `docs/HACKATHON_BRIEF.md`, `docs/THEME_OPTIONS.md` and `docs/USER_CONTEXT.md`. Judging therefore comes from SUBMISSION §7, and the differentiating angle from SUBMISSION §4.4 ("What is novel").

## 0. Judge lens

- **Design/UX judging weight: JUDGING WEIGHTS NOT PUBLISHED, and there is no design or UX criterion at all.** The criteria, verbatim from the HackQuest page (SUBMISSION §7):
  - "Smart contract quality - code following best practices, structured logically and efficiently, with minimal security vulnerabilities"
  - "Product-Market Fit - projects with clear potential to attract and retain users"
  - "Innovation and Creativity - original approaches that push boundaries"
  - "Real Problem Solving - applications that address genuine market needs."
  - "Extra consideration is given to projects integrating Paxos' USDG stablecoin."
  - "At minimum, 1 of 3 prizes is reserved for a project building on Robinhood Chain."
- **What judges explicitly reward:** only the criteria above. No past-winner visual patterns were captured, because there is no scout file.
  - SUBMISSION §7 names the risk the UI can actually fix. At first glance this reads as "escrow again", and without the video the novelty is not visible in 30 seconds.
  - The cheapest +1 it lists is to open the video on the result table and `0 leaks` (0:00–0:10).
- **How judges see it:** the repo, the write-up, a demo video of 3 minutes or less (1920×1080 screen recording), and possibly a live laptop run (SUBMISSION §2, §3). SUBMISSION §7 defines three judge personas:
  - **J1** reads contracts and Blockscout.
  - **J2** reads the write-up and video for product fit.
  - **J3** is the Robinhood/USDG sponsor, looking for real USDG and a justified use of Stylus.
- **Sponsor/track brands judges will benchmark against:**
  - **Robinhood** (sponsor chain). Its consumer brand leans on neon yellow-green over black, which is AI-default cluster 2, so we must not echo it.
  - **Arbitrum** (host).
  - **Paxos USDG** (the money).
  - **Blockscout** (the explorer every link opens).

  Judges from a brokerage and a stablecoin issuer expect money handled with fintech precision: exact decimals, aligned figures and honest token labelling. They do not expect a crypto dashboard.
- **How the chosen tone maximizes this:** there is no design criterion to win. The security-print direction spends its whole boldness budget on one printed instrument that makes the two claims judges must believe, proportional and private, readable in five seconds. That feeds "Innovation and Creativity" and "Real Problem Solving" directly. Everything else is a standard, dense, accessible professional console.
- **What will lose us points:** no criterion scores design, so any polish beyond making `0.07 / 1.93` and `Leaks 0` legible in the first frame is low-ROI. The weakest criterion is Product-Market Fit, and this brief cannot move it: zero users, the facilitator path (V8) untested, MockUSDG on testnet (SUBMISSION §7). The UI must never paper over it by implying mainnet, real USDG or adoption.

## 1. Purpose & Audience

- **Product purpose:** AegisClear puts a micro-escrow state channel at the x402 `payTo` address.
  - Agents exchange co-signed receipts off-chain.
  - An SLA dispute is settled by a Groth16 proof that splits funds **proportionally**.
  - The chain never sees price, thresholds or metrics (spec §0).

  The console is where one operator runs that protocol live and shows the evidence (spec §14; README §Lihat di browser):
  - deployment;
  - the channel registry;
  - scenario runs and result rows;
  - private terms versus what the chain sees;
  - the leak check;
  - the raw 402 offer.
- **Primary user:** a single operator at `http://127.0.0.1:4040`, meaning the presenter or protocol engineer. There is no wallet and no login, and the server holds the demo keys (spec §14). The operator drives the roles of the product personas (spec §4):
  - U2 buyer agent: clients A and B;
  - U3 machine provider: the provider;
  - U1 fleet operator and U4 treasury curator: payout destinations;
  - U5 rail integrator: the 402 offer.

  Judges J1–J3 watch over the operator's shoulder.
- **The user's requirement**, verbatim: "agar frontendnya sesuai dengan aplikasi ini ... lebih profesional dan sesuai standar industri dan anti mainstream". This brief answers each part:
  - **Fits this app:** every ornament is a protocol object. Seals are `T` and `R`, the slip is the settlement, the grid is the receipt tree.
  - **Professional and industry standard:** dense, keyboard-first, WCAG 2.2 AA, tokenised light and dark themes, tabular numerals.
  - **Anti-mainstream:** a light security-print instrument instead of the dark crypto console.
- **Emotional reaction wanted in 5 seconds:** "This is a clearing instrument, not a crypto dashboard. The chain was handed a seal instead of the terms, the proof moved 0.07, and nothing private leaked." The target feelings are rigorous, verifiable and calm.

## 2. Tone direction

**Primary: Security-print clearing instrument ("intaglio").** It combines two things:
- **Rigour:** a corporate-enterprise console that is dense, keyboard-first and accessible.
- **Visual language:** money and cheque security printing (guilloche seals, two-ink engraving, serial numerals, perforated counterfoils) as the dominant touchstone.

**Why this fits:** AegisClear is a clearing house whose whole claim is what a security document does: prove an instrument is genuine without anyone reading more than they are owed.
- Security printing already means "verifiable, tamper-evident, not forgeable".
- It lets the team's real edge print as one instrument: a to-scale split plus a stub of secrets the scan could not find on chain. That edge (SUBMISSION §4.4) is an evaluator that is a circuit, proportional instead of binary, and private, with a published leakage table and an on-chain leak check.
- "Aegis" becomes the seal; "Clear" becomes the clearing slip.

**Reference vibes:**
1. **Banknote and cheque security printing:** guilloche rosettes, two-ink intaglio, serial numerals, perforated counterfoils. This is the non-SaaS touchstone and it dominates the look.
2. **OpenSSH's VisualHostKey "randomart":** a picture drawn from a key so humans can recognise it. This is the precedent for the seals drawn from the `T` and `R` hashes.
3. **IBM Carbon's data-table craft**, the §9 rank-1 reference: density, states and theming. Take the technique only; the look stays security print.

**Alternates considered (with rejection reason):**
- **Redaction / declassified dossier (editorial):** rejected.
  - Black bars say "the data is here but hidden". AegisClear's claim is that the terms are **absent** from the chain, and the leak check proves that absence (spec §6.7; SUBMISSION §2.2 step 6).
  - It also lands in AI-default clusters 1 and 3 (paper, typewriter serif, dense columns).
  - It reads as secrecy theatre rather than commercial confidentiality.
- **Machine-telemetry cockpit (technical-mono / industrial):** rejected.
  - It makes latency and quality gauges the hero, and those metrics are exactly what never reaches the chain (spec §6.7).
  - It pulls toward cluster 2: a dark field, a glowing accent, monospace everywhere.
  - The console's job is settlement, not fleet monitoring (spec §14).

**Median-submission divergence gate (step 2c).** *The median AI-generated submission in this track will look like a near-black crypto dashboard set in Inter or Space Grotesk: glassy rounded cards over a purple-to-blue gradient, a "Connect wallet" button, a neon "Live" pill, three KPI cards above a line chart and, for ZK entries, a green-on-black monospace terminal log.*

This direction differs on all four axes:

| Axis | Median submission | This brief |
|---|---|---|
| Typography | Inter or Space Grotesk; mono for data | Archivo; its width axis does the hierarchy and numerals are the display type; mono only for hex |
| Layout | Hero, KPI cards, charts, wallet button | Registers plus one full-width settlement slip; no KPI row, no hero, no wallet button |
| Colour | Dark field, purple-to-blue gradient, neon accents | Light security paper, two inks plus one magenta proof ink; no blue, no gradient, no glow |
| Motion | Pulses, glows, skeleton shimmer | One leak scan driven by real data |

It also differs from the current `web/` console on all four axes. The primary reference is not Linear, Vercel or Stripe (rank 1 is IBM), and security printing dominates regardless.

**AI-default cluster check:**
1. **Cream + serif + terracotta:** avoided. The paper is a cool green-grey, there is no serif, and the accent is magenta.
2. **Near-black + acid green or vermilion:** avoided.
   - The dark theme is a visibly green slate at about 2.5× the luminance of `#1A1A1A`.
   - The accent is magenta.
   - Green is a desaturated structural sage.
   - There is no terminal look.
3. **Broadsheet:** avoided. Radius is 4 px, rules are 1 px on tinted sheets, and there is no multi-column prose.
4. **SaaS card kit:** avoided. Sheets are unequal, with no shadows and no gradient washes.
5. **Template chrome:** banned outright in §5 (labelling rules).

## 3. Typography

All faces are SIL OFL 1.1, self-hosted as `.woff2` from the app bundle. There is no CDN and no italics are shipped.

- **Headline, UI and display numerals: Archivo** (Omnibus-Type).
  - Variable, with `wght` 100–900 and `wdth` 62–125. Verified in `Omnibus-Type/Archivo` `sources/Archivo.glyphs`, which defines the features `tnum`, `lnum`, `case`, `zero` and `frac` with `.tf` tabular glyphs.
  - One family, with **width as the hierarchy tool**:

| Width | Name | Use |
|---|---|---|
| `wdth 125` | Expanded | Display numerals and the wordmark, echoing the wide denomination numerals of banknotes |
| `wdth 112.5` | Semi Expanded | Route titles and the 402 status line |
| `wdth 100` | Normal | Body text and headings |
| `wdth 87.5` | Semi Condensed | Dense tables, so ten-column channel rows fit at 1536 CSS px (1920 at 125 % zoom, SUBMISSION §2.1) |

  - Ship one variable woff2 carrying **both** axes. If a package ships `wght` only, build the woff2 from the upstream OFL variable TTF with fonttools.
- **Body:** also Archivo. The pairing is by width, not by a second family.
- **Accent/Mono: Atkinson Hyperlegible Mono** (Braille Institute, OFL 1.1, weights 200–800, woff2 via Fontsource, checked 23 Sep 2026).
  - Use it **only** for hex (addresses, hashes, tx), raw JSON and code identifiers such as `claimPenalty`.
  - Its glyphs are built to be unambiguous (0/O, 1/l/I), which is exactly what 42-char addresses and 32-byte hashes need on a projector.
  - Gas, amounts, milliseconds and seconds are **not** set in mono; they use Archivo with `tnum`.
- **Numerals:** every element that shows a number gets `font-variant-numeric: tabular-nums lining-nums`.
  - USDG shows 2 decimals, with the full 6-decimal value on hover and on copy.
  - Gas uses thousands separators (`575,544`) and is right-aligned.
  - Percentages show basis points as secondary text (`50 %`, `5,000 bps`).
- **Scale at 100 % zoom:**

| Role | Setting | Size / line (px) |
|---|---|---|
| Slip numerals (`0.07`, `1.93`) | wdth 125, wght 700, letter-spacing −0.01em | 88 / 88 (clamp 64–96) |
| Verdict figure ("Leaks 0") | wdth 125, wght 700 | 64 / 64 |
| Wordmark | wdth 125, wght 750 | 24 / 28 |
| Route title | wdth 112.5, wght 700 | 26 / 32 |
| Section heading | wdth 100, wght 650 | 19 / 26 |
| Subheading | wdth 100, wght 600 | 15 / 22 |
| Body | wdth 100, wght 400 | 15 / 22 |
| Table cell | wdth 87.5, wght 420 | 14 / 20 |
| Table header (sentence case, `ink-2`) | wdth 87.5, wght 600 | 13 / 18 |
| Meta text (`ink-2`) | wdth 100, wght 450 | 13 / 18; 12 px is the minimum anywhere |
| Mono (hex, JSON) | Atkinson Hyperlegible Mono 400 | 13.5 / 20 |

- **Letter-spacing:** 0 everywhere except the display numerals. There is never positive tracking and never all-caps.
- **Fallback stacks:** only the generic `system-ui, sans-serif` and `ui-monospace, monospace`. Never name a banned or commercial font, not even as a fallback.
- **Banned in this project**, explicitly (the first prototype used the first three): Manrope, Space Grotesk, DM Mono, DM Sans, Inter, Roboto, Poppins, Plus Jakarta Sans, Arial. The same applies to any monospace other than Atkinson Hyperlegible Mono, and to any face that is named in CSS but not bundled as `.woff2`.

## 4. Color

A **two-ink print on security paper, plus one proof ink**. Each colour carries one meaning:
- `engrave`, a security green, means cleared, paid to the provider, or structure.
- `proof`, a security-ink magenta chosen as the complement of the engraving green, means private, or derived from private data by the proof.
- An `ink-2` hatch means decided by a trusted evaluator (Market A).
- **There is no blue anywhere.** Links are `ink` with an underline, which keeps the old `#4cc2ff` look out and makes an indigo-to-pink drift impossible.
- **NO purple gradient. NO indigo-to-pink.** No gradients, glows, glassmorphism or gradient text of any kind.
- **Rejected palette (never use):**
  - the warm-cream plus coral/terracotta family: the prototype's `#F3F0E8` paper and `#D55D4A` coral, AI-default cluster 1 (near `#F4F1EA` / `#D97757`);
  - a near-black field with one acid accent;
  - any blue accent.

  If a screen looks warm and beige, it is wrong. The paper here is a **cool green-grey** (`#E6ECE8`).

**Primary theme for the recorded demo: Light ("Paper").**
- Projectors wash out dark fields.
- 1080p YouTube encoding bands dark surfaces.
- The security-paper metaphor is inherently light.
- Light separates us from the median dark crypto console.

Dark ("Plate") exists for long sessions. Both follow `prefers-color-scheme`, with a manual Light / Dark / System toggle persisted locally. **Note for the owner:** SUBMISSION §2.1 pre-flight still says "tema gelap"; switch to Light when recording.

| Token | Light "Paper" | Dark "Plate" | Role |
|---|---|---|---|
| `paper` | `#E6ECE8` | `#1E302A` | page background: cool security-paper grey-green / green-slate plate, not near-black |
| `sheet` | `#F6F8F6` | `#253A33` | data surfaces: tables, log, slip body |
| `sheet-2` | `#EEF2EF` | `#2C433B` | row hover, selected row, raised strip |
| `stub` | `#F4E9EE` | `#33272C` | the slip's private stub only |
| `rule` | `#C5D0CA` | `#344A43` | decorative dividers |
| `rule-strong` | `#7B8A83` | `#6F857B` | control borders, drawer edge |
| `ink` | `#15201B` | `#E3ECE7` | body text |
| `ink-2` | `#4A5852` | `#A9B9B1` | secondary text, Market A hatch |
| `engrave` (**dominant**) | `#1D5A45` | `#7CC4A4` | seals, provider share, primary button fill, focus ring, selected marker, cleared states in the run and slip (the registry keeps Settled quiet in `ink-2`) |
| `on-engrave` | `#F6F8F6` | `#1E302A` | primary button label |
| `proof` (**accent, sparse**) | `#A3126B` | `#F58DBF` | private stub values, the client share moved by a proof, the Groth16 step, breach cells |
| `caution` | `#8A5A00` | `#E8B64A` | challenge window, running, ambiguous, the local-Anvil plate |
| `danger` | `#B42D0E` | `#FF8A70` | leak found, error |

**Contrast** (WCAG relative luminance, computed per pair; AA text needs 4.5:1, non-text needs 3:1):

| Pair | Light | Dark |
|---|---|---|
| **Body text: `ink` on `sheet`** | **15.7:1** | **10.1:1** |
| `ink` on `paper` / on `stub` | 14.0:1 / 14.1:1 | 11.5:1 / 11.9:1 |
| `ink-2` on `sheet` | 7.0:1 | 5.9:1 |
| **Accent: `proof` on `sheet`** | **6.9:1** | **5.5:1** |
| `proof` on `paper` / `stub` / `sheet-2` | 6.1:1 / 6.2:1 / 6.5:1 | 6.2:1 / 6.4:1 / 4.8:1 |
| `engrave` on `sheet` | 7.6:1 | 5.9:1 |
| `on-engrave` on `engrave` (button label) | 7.6:1 | 6.8:1 |
| `caution` on `sheet` | 5.6:1 | 6.5:1 |
| `danger` on `sheet` | 5.9:1 | 5.3:1 |
| `rule-strong` on `sheet` (non-text) | 3.4:1 | 3.1:1 |

Rules for using these colours:
- **Split-bar segments never touch.** A 2 px `sheet` gap separates them, so each segment meets WCAG 1.4.11 against its neighbour.
- **Every bar segment also carries a direct text label.** `engrave` and `proof` have similar luminance, so colour alone is never the only encoding and there are no legend-only charts.
- **Status is never colour alone.** Each state has a glyph shape plus a word (§5).
- **`proof` magenta appears only in:**
  1. the slip's stub and client share;
  2. the Groth16 proof row of the step log;
  3. breach cells of the unit grid;
  4. the proof field of the channel detail.

  It never appears on buttons, links, focus rings or navigation.

## 5. Layout principles

**§5 styles the routes in `LAYOUT_SPEC.md`, does not re-plan them.** Where this section says something must be visible, that is a demo condition (§6.5) passed to `LAYOUT_SPEC.md`, not a structural choice.

**Page-level treatment**
- **Instrument, not dashboard.**
  - Surfaces are registers (tables) and instruments (runner, log, slip), set on full-width `sheet`s of unequal height sized by their content.
  - No rows of identical cards, no KPI tiles, no charts.
  - Radius is 4 px on sheets and controls and 2 px on state glyphs. There are no pills (`999px`) anywhere.
  - There are no drop shadows. The detail drawer is set off by a 1 px `rule-strong` edge and a scrim (`ink` at 40 % in light, black at 50 % in dark).
- **Spacing:** 4 px base (4, 8, 12, 16, 24, 32, 48). Table rows are 36 px. Numbers are right-aligned, so fixed 2-decimal USDG values line up; hex is left-aligned.
- **Hero treatment: the top of the console is not a centred headline plus CTA.**
  - A left-aligned wordmark reads "AegisClear" (Archivo wdth 125) next to a fixed seal mark, pre-rendered as SVG, which is also the favicon.
  - Beside it sits one plain sentence: "Escrow for agent-to-agent USDG payments. Disputes are settled by a Groth16 proof; the terms never reach the chain." (spec §0)
  - Beneath the wordmark sits a **deployment register**, which replaces the old row of pills:
    - A network plate reads `Robinhood Chain testnet 46630` in `engrave`, or `Local Anvil 31337` in `caution` with "explorer links disabled". That way the presenter can never pass local off as testnet (SUBMISSION §2.3).
    - Each contract row shows a label, a middle-ellipsised address, a copy button and a Blockscout link.
    - The token row reads "MockUSDG, 6 decimals (USDG is not deployed on testnet 46630)" (SUBMISSION §1, honest point 2).
  - There is no wallet button (spec §14).

**Registers and data primitives**
- **State glyphs instead of pills.** Each state is a glyph plus a word, with no container:

| State | Glyph | Colour |
|---|---|---|
| Open | hollow square | `ink` |
| Closing | half-filled square, with a live "42 s" countdown | `caution` |
| Settled | filled square | `ink-2` |
| Uninitialised | dotted square | `ink-2` |

  - Settled is deliberately quiet so that attention goes to channels that would block a run with `409 client-has-open-channel` (SUBMISSION §2.1).
  - Mode is plain text in `ink-2`: "Co-signed" or "Anchored".
- **Hex handling.**
  - The registry shows `0x4B6F…bBd1` (4 + 4 characters); detail views show 8 + 8.
  - The full value is in the accessible name and the tooltip.
  - A 24 × 24 px copy button announces "Copied" through a polite live region.
  - Explorer links carry an inline SVG external-link icon labelled "opens Blockscout in a new tab".
- **Step log: a timeline, not a terminal.**
  - Each row shows elapsed seconds (tabular) and a phase glyph, which is the row's only coloured element. Then comes the step as a sentence in Archivo, with the tx hash (mono) and gas (tabular) on the right.
  - The Groth16 row is marked in `proof`.
  - Rows append without animation. The log stays pinned to the latest row unless the operator scrolls up, which reveals a "Jump to latest" button.
  - There is no black box and no monospace for the whole log.

**Wait instruments (making the long waits purposeful)**
- **Unit grid.**
  - A 16 × 8 grid is the 128-leaf receipt tree of one epoch (`MAX_SEQ` 128, spec §6.6).
  - It fills in the batches the step stream reports (`10/100` …).
  - Breach cells take `proof`. They come from `config.breaches`, the demo's private schedule 3, 17, 29, 44, 58, 71 and 90, filtered to the run's seq range the way the current `PrivacyCards` does for anchored runs. If `API_CONTRACT.md` says the schedule does not apply to a scenario, mark nothing.
  - Caption: "100 receipts co-signed off-chain. On-chain transactions for these units: 0" (SUBMISSION §2.2 step 3).
  - **Anchored runs** use 20 slots. Each slot receives its ack tx and gas: first 349,751, then 201,020–210,087, from the Stylus `AegisPoseidon` program (step 8).
  - **Rollover:** the epoch 0 grid fills to 128/128, a rollover row shows the tx and "2.56 USDG paid", then a fresh epoch 1 grid fills to 5 (step 9).
- **Time-lock band (the 60 s challenge window).** It shows:
  - the deadline clock time and the seconds remaining, in tabular figures;
  - a draining `caution` rule;
  - what is already fixed on chain: the proof verified in `claimPenalty` (304,432 gas) and `payToClient` 0.07;
  - what happens at zero: "settle() becomes callable by anyone; the provider's watcher may settle first" (SUBMISSION §2.2 step 4).

**Detail views**
- **Channel detail trail.**
  - The channel's events run as a vertical trail joined by a drawn connector line, never text arrows: Opened, Funded, CheckpointSubmitted, PenaltyClaimed and Settled, plus Acked, CloseStarted, RolledOver and Swept.
  - Each event shows its block, tx and gas.
  - For anchored channels, the 20 Acked events collapse to one row ("Acked, 20 transactions") with the gas range and an expander.
  - The `T` seal, at 64 px, heads the drawer (SUBMISSION §2.2 step 7).
- **402 document.**
  - The status line `402 Payment Required` is set as a heading (Archivo wdth 112.5, wght 700), with the JSON in mono beneath it.
  - The `payTo` line gets an `engrave` left bar and this annotation: "Predicted CREATE2 channel address. No contract exists here until the provider opens it." (spec §8.5, T19; SUBMISSION §2.2 step 2)
  - If `payTo` matches a SETTLED channel, add this note: "This offer belongs to the previous session; the next run issues a new one." This is the documented SDK limitation (SUBMISSION §2.2 step 2).
- **Market comparison bars.** Each result row carries a thin, to-scale bar using the §4 fill semantics (spec §14):
  - **Market A:** an `ink-2` diagonal hatch labelled "0 or 2.00, decided by the evaluator address". Draw the hatch as an SVG pattern (45°, 1.5 px lines at a 5 px pitch), not a CSS colour gradient.
  - **Market B, provider share:** `engrave`.
  - **Market B, client share moved by a proof:** `proof`.

  The "who decides" and "visible on the explorer" columns stay as text.

**The settlement slip (the one exception to restraint)**

This is the only component with display-size type and ornament. Its anatomy, left to right:

1. **Stub** on the `stub` tint, headed "Held by provider and client".
   - It lists the private terms from config in `proof`: unit price 0.02 USDG, latency ≤ 800 ms, quality ≥ 90, penalty 50 %, cap 30 %, and breaching units 3, 17, 29, 44, 58, 71 and 90 (latency 1200 ms).
   - A last line says the nonce never leaves the server.
   - For anchored runs, the unit-price row reads "implied on-chain by A per ack; excluded from the scan" (spec §6.7).
2. **Perforation:** a vertical row of 6 px holes at a 12 px pitch, drawn in SVG.
3. **Chain half**, headed "Visible on Robinhood Chain". It contains:
   - the `T` and `R` seals at 112 px, each with its middle-ellipsised hash;
   - the line "A = 2.00 USDG";
   - the display numerals "Client 0.07" in `proof` and "Provider 1.93" in `engrave`;
   - the 2.00 bar, split to exact scale at 96.5 % / 3.5 %;
   - the line "Unspent deposit 3.00 USDG returned to the client" (spec §6.4, §6.5 EX1);
   - Market A's hatched all-or-nothing bar;
   - the verdict group, shown as three separate figures and never as a dotted string: "Leaks 0", "Ambiguous 0", "Transactions scanned 5";
   - an `ink-2` footnote: "Still inferable on chain: A ÷ seq (average price), payToClient ÷ A (penalty share), transaction timing." (spec §6.7; SUBMISSION §3 forbids claiming anonymity)

Other slip rules:
- Runs without a proof (cooperative, rollover) print the same slip with no magenta on the chain half, and read "Decided by two signatures".
- Market A runs get no slip.
- Below 960 px, the stub stacks above the chain half and the perforation turns horizontal.

**Seals (a guilloche drawn from a hash)**
- **Input:** the 32 bytes of `termsCommitment` or `receiptsRoot`. The seal is built as pure client-side SVG and memoised.
- **Geometry:**
  - Three concentric bands.
  - Each band holds 6–12 copies of the rosette `r(θ) = Rb × (1 + a × sin(nθ + φ + 2πk/m))`.
  - The hash bytes set the lobe count n (9–23), the amplitude a (0.06–0.14) and the phase φ.
  - A centred "T" or "R" is set in Archivo wdth 125.
- **Rendering:**
  - The stroke is `engrave`, at least 1.25 px, with `vector-effect: non-scaling-stroke` and no fill.
  - Keep to at most 24 lobes per band so the seal survives 1080p encoding without moiré.
  - Seals never animate.
- **Registry size:** a single band at 20 px, so the operator can match a registry row to its slip at a glance.
- **Caption:** "Drawn from the public hash. The same hash always draws the same seal; it cannot be read back into the terms." The seal is a recognition aid, not a verification.

**Labelling (no template chrome)**
- Sentence case everywhere: no ALL-CAPS and no tracked-out eyebrow labels.
- No "A · B · C" middle-dot strings and no "WORD — fragment" labels. Write a sentence or use separate fields instead.
- No "→" in link or button text.
- Mono only for hex, JSON and code identifiers.
- All UI text is English: "Check for leaks", not "Periksa kebocoran".
- Scenario names:
  - "Cooperative close (client A)"
  - "Dispute settled by proof (client B)"
  - "Anchored mode with 20 on-chain acks and a dispute (client A)"
  - "Rollover of 128 + 5 units on one deposit (client B)"
  - "Binary escrow, complete"
  - "Binary escrow, reject"
  - "Run the four comparison rows"

  If `LAYOUT_SPEC.md` lists the scenarios, show each one's measured testnet duration (96–158 s; 13 s for Market A; README table) so the wait is announced before it starts.

**Controls and accessibility**
- **Buttons:**
  - Primary: an `engrave` fill with an `on-engrave` label.
  - Secondary: `ink` on `sheet` with a `rule-strong` border.
- **Targets and focus:**
  - Every target is at least 24 × 24 px (WCAG 2.2, 2.5.8).
  - The focus ring is 2 px `engrave` with a 2 px offset, and the drawer never obscures it (2.4.11).
- **Keyboard:**
  - Registry rows are focusable; Enter or Space opens the detail and Esc closes the drawer.
  - Tables may scroll horizontally under the WCAG 1.4.10 exception for data tables.
- **Screen readers:** a polite live region announces phase changes only ("Proof verified on chain", "Settled", "Leak check: 0 leaks in 5 transactions"), never every log row.
- **Icons:** inline SVG with a 1.5 px stroke, bundled (hand-drawn or an ISC/MIT set such as Lucide). No icon fonts, no CDN. The favicon is `.svg` with an `.ico` fallback.

## 6. Motion

- **High-impact moment (exactly one): the leak scan on the slip** (SUBMISSION §2.2 step 6; §3 1:20–1:35).
  - It starts only after the real leak-check response arrives and never simulates work.
  - The whole sequence takes 1.1 s or less:
    1. A 2 px `engrave` scan rule descends the stub over 600 ms, ease-out.
    2. As the rule passes each private value, that value receives its "Not found in 5 transactions" mark, with a 60 ms stagger.
    3. The verdict group settles, using a 120 ms fade-in and a 4 px rise.
  - Figures never count up.
  - Per-row marks are drawn only when `leaks` and `ambiguous` are both 0. Otherwise the `details` list (word, tx, kind) replaces them, in `danger` or `caution`.
  - The transaction count always comes from the data: 4 when the watcher settled, 5 when the client did.
- **Everything else is a state transition, not choreography.** Each lasts 200 ms or less, with no bounce:
  - the split bar resolving to scale when the result row arrives;
  - unit-grid batches filling;
  - the time-lock rule draining linearly;
  - log rows gaining their tx and gas.
- **Purposeful waits, never a spinner.** Every wait shows three things: what is being awaited, the elapsed or remaining time in tabular figures, and what happens next.
  - 100 units: the receipt grid.
  - 20 acks: the ack slots, with gas.
  - The 60 s window: the time-lock band.
  - Proving: an elapsed timer shown against the measured 3.4–4.7 s (README table; SUBMISSION §1).
- **Restraint.** Tables, the registry, the header, seals, log rows and every number stay still. No hover lifts, parallax, glows, pulses or skeleton shimmer.
- **`prefers-reduced-motion`.** There is no scan rule: marks and the verdict appear at once, transitions are instant, and the countdown still updates as text.

## 6.5 Demo conditions (survives a live judged demo)

- **The #1 motion moment IS the PRD demo wow-moment:** the result row `0.07 / 1.93` plus the leak check `0 leaks`, after a real Groth16 proof (SUBMISSION §2.2 steps 5–6; §3 0:00–0:10). The slip renders it, and the leak scan in §6 is its only choreography.
- **Contrast:** WCAG 2.2 AA in both themes, using the ratios in §4. On the key screen (the slip, light `sheet`): ink 15.7:1, proof 6.9:1, engrave 7.6:1. On the stub: ink 14.1:1, proof 6.2:1.
- **Legibility.**
  - At 50 % zoom, the slip numerals (88 px) and "Leaks 0" (64 px) render at 44 px and 32 px and stay readable.
  - On a 4:3 projector the slip sits side by side at 1024 px wide and stacks below 960 px.
  - At the runbook's 110–125 % zoom on 1920 × 1080 (SUBMISSION §2.1), the whole slip must be visible without scrolling in a 1536 × 864 CSS-px viewport. This is a constraint passed to `LAYOUT_SPEC.md`, not a re-plan.
  - No seal stroke or rule is thinner than 1 px (seals 1.25 px), so YouTube encoding keeps them.
- **Timing: the wow is visible within the first 15 seconds.**
  - The video opens on the finished slip (0:00–0:10).
  - Live, the console restores the most recent run on load (current behaviour: the latest entry of `GET /api/demo/runs`), so the slip is on screen at second 0.
  - A fresh `B-dispute` run earns it again after about 158 s on testnet (README table).
- **Offline-safe.**
  - Fonts are bundled woff2, and seals are computed in the browser.
  - There are no remote images, no CDN and no external hosts. Assets are limited to `.svg .png .woff2 .ico .js .css .json`.
  - Blockscout links are outbound only. In local mode they render as copyable text.
  - The only network dependency is the chain RPC behind the server. Its fallback is local Anvil, which renders identically under the caution plate (SUBMISSION §2.3–2.4). The recorded backup run is the last resort (SUBMISSION §2.1).

## 7. Differentiation

**What makes this UNFORGETTABLE in 5 seconds?**
Every settled run prints as a perforated settlement slip: the agents' stub lists the private terms in magenta proof ink, the chain's half shows terms and receipts only as two guilloche seals drawn from the `T` and `R` hashes, and the one magenta mark that crosses the perforation is the proof's verdict, a 0.07 sliver beside 1.93 on a to-scale 2.00 USDG bar, which the leak scan then confirms with "Leaks 0".

**Where the judge sees it:**
- SUBMISSION §2.2 steps 5–6, about 158 s into the testnet `B-dispute` run. The slip is also restored at page load (§6.5).
- SUBMISSION §3 video: the opening frame (0:00–0:10) and the leak scan live (1:20–1:35).
- Again at step 8, where the anchored run prints `0.02 / 0.38`.

## 8. Data the UI displays

**Source.** The real HTTP API, documented in `docs/frontend/API_CONTRACT.md` (written in parallel; referenced, not read here), plus recorded real fixtures in `docs/frontend/fixtures/`. The fixtures are testnet-46630 read-only captures and local-31337 full scenario runs.

- **Contract.** There is no mock-data service layer. The UI consumes a typed client over that API. In development and tests it renders every view fully populated from the fixtures.
- **No fabricated values.** Every figure on the slip comes from the run's result rows, the channel detail or the leak report. The UI never fabricates or hard-codes a value.
- **Language.** If a fixture still carries Indonesian server strings, follow the API contract's mapping. The UI language is English.

**Key entities to render:**
- **Deployment config:** network, chain id, contract addresses, provider, clients A and B, windows, private terms, breach schedule, deposit.
- **Channel summary:** state, mode, seq, epoch, A, budget, deadline, proof flag, `payToClient`.
- **Channel detail:** `T`, `R`, payouts, windows, on-chain events with gas.
- **Run:** status; steps over SSE with phase, tx, gas and progress; result rows.
- **Leak report:** transactions scanned, leaks, ambiguous, details.
- **x402 offer:** the raw 402 JSON.

Shapes follow `web/shared/types.ts` until `API_CONTRACT.md` supersedes it.

**Key views in the demo** (SUBMISSION §2.2):

| Step | View |
|---|---|
| 1 | Deployment register |
| 2 | 402 document |
| 3–4 | Live run: log, unit grid and time-lock band |
| 5 | Result rows and the settlement slip |
| 6 | Leak scan |
| 7 | Channel registry and detail trail, with Blockscout links |
| 8 | Anchored run with its 20 ack slots |
| 9 | Rollover, with two epoch grids |
| 10 | Four-row market comparison |

## 9. Recommended brand references from VoltAgent collection

The index was verified live on 23 Sep 2026 against the VoltAgent/awesome-design-md README, and all three brands are present. They are craft references only; §10's precedence forbids copying their palettes or typefaces.

| Rank | Brand | Why it fits |
|------|-------|-------------|
| 1 | ibm | Carbon-grade craft for exactly this job: dense, keyboard-first data tables; layered surface tokens that hold in light and dark; status as icon + colour + text; a productive type scale. Take the technique only, not IBM Plex, Carbon blue or zero-radius corners. |
| 2 | stripe | Money-UI precision: amount formatting, decimal alignment, payment-state vocabulary, restrained status colour. Take none of its gradient meshes, its purple-blue accent or its typefaces; security printing stays the dominant touchstone (step 2c). |
| 3 | coinbase | Crypto-specific craft: truncated addresses and tx hashes with copy affordances, network labelling, confirmation states. Ignore its blue palette; this brief has no blue. |

Rank 1 is the default: fetch `ibm` into `docs/frontend/DESIGN_REF.md` next. Pick another brand from the collection only if it serves density and states better.

> **Note added after the fetch (23 Sep 2026):** the VoltAgent `ibm` file turned out to be a **marketing-site** extraction of Carbon. It carries the elevation ladder, one-accent restraint and type-scale discipline. It does **not** carry data-table components, a dark-theme token pair or status iconography (see `DESIGN_REF.md` "Known Gaps" and "What will lose us points").
> - Table craft: use `README.md` §6.6.
> - Themes and status glyphs: use §4 and §5 of this brief.

## 10. Handoff

This brief is the Design Thinking Phase input for the `frontend-design` skill. The consuming agent receives the whole `docs/frontend/` folder:

1. `README.md`: the entry point, the hard constraints (offline, allowed static MIME types, WCAG 2.2 AA, no wallet) and the engineering standards. **Its hard constraints bind every file below.**
2. `DESIGN_BRIEF.md` (this file): tone, type, colour tokens, motion and the differentiator.
3. `DESIGN_REF.md`: the brand technique reference, fetched from §9 rank 1 (`ibm`).
4. `LAYOUT_SPEC.md`: routes, sections, components and the demo path.
5. `API_CONTRACT.md`: the HTTP and SSE contract the UI consumes.
6. `PRODUCT_CONTEXT.md`: product facts that UI copy must stay consistent with.
7. `fixtures/`: real recorded data for development and tests.

**Precedence among design inputs: DESIGN_BRIEF (tone) > LAYOUT_SPEC (structure) > DESIGN_REF (craft reference only; never copy its brand palette or typography).** Authority is by domain: this brief governs look, motion and copy style; LAYOUT_SPEC governs which pages and sections exist. Where the two overlap (the slip vs the verdict band and mirror, the unit grid, breach marks, drawer vs page, the deployment register, copy formatting), follow the binding resolutions in `README.md` §1.1.

The skill builds a console that is production-quality (from the reference), specific to AegisClear (from this brief) and populated with real protocol data (from the API and fixtures).
