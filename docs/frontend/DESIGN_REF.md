---
brand: ibm
source_url: https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/ibm
fetched: 2026-09-23
selection_reason: DESIGN_BRIEF rec
why_this_brand: >-
  DESIGN_BRIEF.md §9 ranks ibm #1 explicitly for this console: Carbon-grade craft for
  dense, keyboard-first data tables, layered surface tokens that hold in light and dark,
  status as icon + colour + text, and a productive type scale (§2 reference vibe 3) — the
  registry table, channel detail trail and step log (§5) need exactly that craft. No
  docs/HACKATHON_BRIEF.md exists in this repo, so there is no sponsor-benchmark angle to
  weigh; SUBMISSION.md §7 gives judging no design/UX criterion at all, so the pick rests
  solely on DESIGN_BRIEF's own stated technique need. DESIGN_BRIEF.md §2 already argues
  against a default-herd pick on its own terms (median-submission divergence gate: "the
  primary reference is not Linear, Vercel or Stripe — rank 1 is IBM"), so ibm is not a
  herd pick here; it was chosen over the brief's own rank-2 (stripe) and rank-3 (coinbase)
  candidates for table/state density, not popularity.
brief_tone: Security-print clearing instrument ("intaglio") — DESIGN_BRIEF.md §2
root_copy_pending: false
root_copy_note: >-
  Deliberately false, not an oversight. ROOT/package.json exists, but it is the pnpm
  monorepo root, not the frontend package. A root DESIGN.md here would be picked up by
  Cursor/Stitch-convention tooling as THIS project's design system and would silently
  contradict the brief above it — no root copy is made, on purpose.
fetch_note: >-
  WebFetch's AI summarizer paraphrased/condensed this file on three separate raw-URL
  fetch attempts (a plain URL and a cache-busted retry), each returning only 4-5 "##"
  headings, 3-4 unique hex codes and roughly 20-28 lines of self-titled "IBM Design
  Analysis" prose — all below the Step 2.5 completeness thresholds (>=8 headings, >=10
  hex codes, >50 lines). The GitHub API fallback (base64 content endpoint, then the live
  directory listing) then returned HTTP 403 at the WebFetch-tool level on every attempt
  (four total, two per endpoint), which this agent has no Bash/gh/curl access to work
  around. Per escalation, the coordinator fetched the file directly with `curl -4`
  following ~/.claude/hackathon-intel/FETCH_PLAYBOOK.md rung 2 (HTTP 200, 26,481 bytes,
  https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/ibm/DESIGN.md,
  23 Sep 2026) and handed the raw file to this agent, which independently re-ran the
  Step 2.5 count against it before saving anything below: 11 "##" headings (Overview,
  Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts,
  Responsive Behavior, Iteration Guide, Known Gaps), 15 unique hex codes, 551 lines,
  Colors and Typography sections both present. Gate passed on the curl'd copy; the
  content quoted below is unmodified from that fetch.
---
<!-- trace: idea="Privacy-preserving escrow for agent-to-agent USDG payments on Robinhood Chain — SLA disputes settled by a Groth16 proof, not a judge." | track="Overall Prize (also fits Promising Products Track)" | weights="JUDGING WEIGHTS NOT PUBLISHED" | source=design-ref-fetcher -->

# DESIGN_REF — IBM (Carbon marketing extraction), craft reference for AegisClear

> **CRAFT REFERENCE ONLY.** Take from this file: table/register density, data-table row
> and interactive-component states, layered neutral-surface tokens (canvas → surface-1 →
> surface-2), status conveyed as icon/glyph + colour + word rather than colour alone,
> documented focus/interaction states, and the *logic* of a productive type scale (a
> small, named token set doing all the hierarchy work). **DO NOT copy IBM Plex Sans,
> Carbon blue `#0f62fe`, zero-radius corners, or any other IBM brand-palette value into
> AegisClear.** The brief's security-print "intaglio" system — Archivo with a width axis,
> `engrave`/`proof` inks, 4px sheet/control radius, 2px glyph radius, no pills — is what
> ships.
>
> **Precedence: `DESIGN_BRIEF.md` > `LAYOUT_SPEC.md` > `DESIGN_REF.md` (this file).**
> Wherever the IBM excerpt below disagrees with the brief on a concrete value, the brief
> wins, every time — see "Conflict reconciliation" below for the specific list.
>
> **No root copy, on purpose.** `root_copy_pending: false` above is deliberate: this repo's
> root `package.json` is the pnpm monorepo root, not the frontend package, so a root
> `DESIGN.md` here would be silently adopted by Cursor/Stitch-convention tooling as this
> project's actual design system and contradict the brief. See `root_copy_note` in the
> frontmatter.

## Verbatim source

Fetched via `curl -4` after WebFetch's summarizer paraphrased this file on three
consecutive raw-URL attempts (full detail in the `fetch_note` frontmatter field above).
Re-verified against the Step 2.5 completeness gate before being pasted below: **11** `##`
headings, **15** unique hex codes, **551** lines total, `## Colors` and `## Typography`
both present as dedicated sections. Everything inside the fence is unmodified from
`https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/ibm/DESIGN.md`
(HTTP 200, 26,481 bytes, 23 Sep 2026) — not summarized, not renamed, not reordered.

```markdown
---
version: alpha
name: IBM-design-analysis
description: "An enterprise-marketing canvas faithful to Carbon Design System: white surfaces, charcoal type, IBM Blue (#0f62fe) as the single confident accent, and a deliberately flat-square aesthetic where corners stay at 0–4px. Type runs IBM Plex Sans at light weight 300 for display sizes (a brand signature) and 400/600 for body and emphasis. Cards live as thin-bordered tiles with no shadow; sections separate via subtle gray rows. The chrome is square, the typography is light, and the only color in the system is one assertive blue — the result reads as old-world enterprise gravitas reframed for the cloud era."

colors:
  primary: "#0f62fe"
  on-primary: "#ffffff"
  ink: "#161616"
  ink-muted: "#525252"
  ink-subtle: "#8c8c8c"
  canvas: "#ffffff"
  surface-1: "#f4f4f4"
  surface-2: "#e0e0e0"
  inverse-canvas: "#161616"
  inverse-surface-1: "#262626"
  inverse-ink: "#ffffff"
  inverse-ink-muted: "#c6c6c6"
  hairline: "#e0e0e0"
  hairline-strong: "#161616"
  blue-60: "#0043ce"
  blue-80: "#002d9c"
  blue-hover: "#0050e6"
  semantic-success: "#24a148"
  semantic-warning: "#f1c21b"
  semantic-error: "#da1e28"
  semantic-info: "#0f62fe"

typography:
  display-xl:
    fontFamily: IBM Plex Sans
    fontSize: 76px
    fontWeight: 300
    lineHeight: 1.17
    letterSpacing: -0.5px
  display-lg:
    fontFamily: IBM Plex Sans
    fontSize: 60px
    fontWeight: 300
    lineHeight: 1.17
    letterSpacing: -0.4px
  display-md:
    fontFamily: IBM Plex Sans
    fontSize: 42px
    fontWeight: 300
    lineHeight: 1.20
    letterSpacing: 0
  headline:
    fontFamily: IBM Plex Sans
    fontSize: 32px
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: 0
  card-title:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: 0
  subhead:
    fontFamily: IBM Plex Sans
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: 0
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  body:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0.16px
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.29
    letterSpacing: 0.16px
  body-emphasis:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.29
    letterSpacing: 0.16px
  caption:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: 0.32px
  button:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.29
    letterSpacing: 0.16px
  eyebrow:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.29
    letterSpacing: 0.16px

rounded:
  none: 0px
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 96px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: 12px 16px
  button-primary-pressed:
    backgroundColor: "{colors.blue-80}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
  button-secondary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: 12px 16px
  button-tertiary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: 12px 16px
  button-ghost:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: 12px 16px
  button-danger:
    backgroundColor: "{colors.semantic-error}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: 12px 16px
  feature-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: 24px
  feature-card-elevated:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: 24px
  product-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: 32px
  hero-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-md}"
    rounded: "{rounded.none}"
    padding: 48px
  cta-banner:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.headline}"
    rounded: "{rounded.none}"
    padding: 48px
  text-input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: 11px 16px
  text-input-focused:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: 11px 16px
  text-input-error:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: 11px 16px
  newsletter-input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: 11px 16px
  product-tab:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: 16px 20px
  product-tab-selected:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-emphasis}"
    rounded: "{rounded.none}"
    padding: 16px 20px
  resource-tile:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: 16px
  customer-logo-tile:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: 24px
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    height: 48px
  utility-bar:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    height: 32px
  footer:
    backgroundColor: "{colors.inverse-canvas}"
    textColor: "{colors.inverse-ink-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: 64px 32px
---

## Overview

IBM's marketing system is a faithful application of **Carbon Design System** — IBM's open-source enterprise design system. The dominant surface is `{colors.canvas}` pure white with `{colors.surface-1}` light gray for elevation, charcoal `{colors.ink}` (#161616) for text, and IBM Blue `{colors.primary}` (#0f62fe) as the single brand accent.

The defining choice is **flat geometry**: every CTA, every card, every input, every container uses square corners (`{rounded.none}` 0px) with thin 1px borders. There are no rounded pills, no soft shadows, no atmospheric gradients. The system is engineered, not stylized.

**IBM Plex Sans** carries the entire type hierarchy. Display sizes (76 / 60 / 42px) run at weight **300** — IBM's signature light display treatment that makes 76px feel calmer than competing brands' 700-weight display. Body type sits at weight 400 with `letter-spacing: 0.16px` (a Carbon precision detail) and line-height 1.50. The voice reads as careful, technical, and trustworthy.

The system reaches for color rarely — IBM Blue marks links, primary CTAs, and the rare full-bleed CTA banner. Charcoal carries every other surface that isn't white. The result is enterprise gravitas without the enterprise stiffness: rigorous, light-weighted, and intentionally restrained.

**Key Characteristics:**
- **Carbon Design System** — IBM's marketing chrome IS Carbon. Buttons are square, inputs are square-with-bottom-rule, corners stay at 0px.
- **Light-weight display type**: Plex Sans at weight 300 for 42–76px headlines is the brand's typographic signature.
- **One accent color**: `{colors.primary}` IBM Blue carries every link, primary CTA, and CTA banner. There is no second brand color.
- White canvas + light gray (`{colors.surface-1}`) + charcoal (`{colors.ink}`) cover 95% of surfaces.
- Footer inverts to charcoal (`{colors.inverse-canvas}` #161616) — the only dark surface above the page break.
- Card hierarchy is carried by 1px hairlines and surface change, never by drop shadow.
- `letter-spacing: 0.16px` on body is a Carbon precision detail — the small positive tracking is part of the brand voice.
- Page rhythm: utility bar → top nav → hero with light-weight headline → feature card grid → customer logo marquee → enterprise feature row → training section → newsletter / sign-in CTA → dark footer.

## Colors

> Source pages: ibm.com (home), /software/ai-productivity, /consulting, /products/cloud-pak-for-aiops, /products/bare-metal-servers, community.ibm.com.

### Brand & Accent
- **IBM Blue** ({colors.primary}): The single brand accent. Links, primary CTAs, CTA banner backgrounds, focus rings.
- **Blue 60** ({colors.blue-60}): Hovered link state.
- **Blue 80** ({colors.blue-80}): Pressed primary button.
- **Blue Hover** ({colors.blue-hover}): Hover state for primary buttons.

### Surface
- **Canvas** ({colors.canvas}): Default page background.
- **Surface 1** ({colors.surface-1}): Light gray (#f4f4f4) — input fields, alternate-row stripes, subtle section bands.
- **Surface 2** ({colors.surface-2}): Slightly darker gray (#e0e0e0) — disabled fields, hairline-as-fill for separators.
- **Hairline** ({colors.hairline}): 1px borders on cards, inputs, dividers.
- **Hairline Strong** ({colors.hairline-strong}): 1px charcoal underline on focused inputs (Carbon's signature focus treatment).
- **Inverse Canvas** ({colors.inverse-canvas}): Charcoal #161616 — footer surface.
- **Inverse Surface 1** ({colors.inverse-surface-1}): One step lighter than inverse canvas — footer column dividers, hovered footer items.

### Text
- **Ink** ({colors.ink}): All headlines and emphasized body type — charcoal #161616.
- **Ink Muted** ({colors.ink-muted}): Secondary type at #525252 — meta, sub-headlines, footer body.
- **Ink Subtle** ({colors.ink-subtle}): Tertiary type at #8c8c8c — disabled, helper text, captions.
- **Inverse Ink** ({colors.inverse-ink}): White on charcoal — footer headings.
- **Inverse Ink Muted** ({colors.inverse-ink-muted}): Light gray on charcoal — footer body.

### Semantic
- **Success Green** ({colors.semantic-success}): Carbon green-50 — success states.
- **Warning Yellow** ({colors.semantic-warning}): Carbon yellow-30 — warning states.
- **Error Red** ({colors.semantic-error}): Carbon red-60 — error states; danger button background.
- **Info Blue** ({colors.semantic-info}): Identical to primary — informational badges.

## Typography

### Font Family

- **IBM Plex Sans** — IBM's open-source proprietary typeface (free for any use). Geometric, slightly humanist, designed specifically for enterprise UI. Fallback: `Helvetica Neue, Arial, sans-serif`.

The same family carries display, body, and caption — there is no display + body pairing. Hierarchy is carried by **size + weight** rather than by family change. Plex Sans is also free / open-source under the SIL Open Font License — making it the easiest custom face on this list to substitute for in implementation.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 76px | 300 | 1.17 | -0.5px | Largest hero headline |
| `{typography.display-lg}` | 60px | 300 | 1.17 | -0.4px | Section opener headlines |
| `{typography.display-md}` | 42px | 300 | 1.20 | 0 | Sub-section headlines, hero card title |
| `{typography.headline}` | 32px | 400 | 1.25 | 0 | Card collection heading, FAQ category |
| `{typography.card-title}` | 24px | 400 | 1.33 | 0 | Feature card title |
| `{typography.subhead}` | 20px | 400 | 1.40 | 0 | Lead body next to display headlines |
| `{typography.body-lg}` | 18px | 400 | 1.50 | 0 | Hero subhead, lead paragraphs |
| `{typography.body}` | 16px | 400 | 1.50 | 0.16px | Default body |
| `{typography.body-sm}` | 14px | 400 | 1.29 | 0.16px | Card body, footer columns |
| `{typography.body-emphasis}` | 14px | 600 | 1.29 | 0.16px | Selected tab label, emphasized body line |
| `{typography.caption}` | 12px | 400 | 1.33 | 0.32px | Captions, meta, utility bar |
| `{typography.button}` | 14px | 400 | 1.29 | 0.16px | All button labels |
| `{typography.eyebrow}` | 14px | 400 | 1.29 | 0.16px | Section eyebrows (Carbon avoids strong eyebrows; uses sentence case 14px) |

### Principles

- **Light-weight display is the brand voice.** Plex Sans at weight 300 for 76px headlines reads as quietly authoritative — switching to 700 would make it look like every other enterprise site.
- **Carbon's `letter-spacing: 0.16px`** on body sizes is a precision detail. Don't remove it.
- **No mono** on marketing surfaces (Plex Mono exists but lives in product surfaces only).
- **Eyebrow typography uses sentence case 14px** — Carbon resists the all-caps tracked eyebrow common to other enterprise brands.
- **Line-heights tighten on display, relax on body**: 1.17 at display-xl, 1.50 at body — proportional to size.

### Note on Font Substitutes

IBM Plex Sans is **free and open-source** (SIL OFL license) and available on Google Fonts. It is the recommended implementation. The Plex family also includes Plex Mono and Plex Serif if expanded typographic needs arise.

## Layout

### Spacing System

- **Base unit**: 4px (Carbon's signature 4-pixel grid).
- **Tokens (front matter)**: `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 96px.
- Card interior padding: `{spacing.lg}` 24px on feature cards; `{spacing.xl}` 32px on product cards; `{spacing.xxl}` 48px on hero cards and CTA banners.
- Button padding: 12px vertical · 16px horizontal — Carbon spec.
- Form input padding: 11px vertical · 16px horizontal.

### Grid & Container

- Carbon's 16-column grid at desktop, scaling to 8 / 4 columns at tablet / mobile.
- Max content width sits around 1584px (Carbon's max-grid breakpoint).
- Card grids are 4-up at desktop, 2-up at tablet, 1-up at mobile.
- The customer logo marquee uses fixed-width tiles in a flex row, scrolling horizontally on smaller viewports.

### Whitespace Philosophy

Carbon uses precise alignment to a 4-pixel grid as its whitespace system. Sections separate via thin gray rows (`{colors.surface-1}`) rather than via large vertical gaps. Content is dense by design — IBM's customers expect to see a lot on a page, not a lot of air.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No shadow, no border | Default for body type, hero text, footer body |
| 1 (hairline) | 1px `{colors.hairline}` border on canvas | Feature cards, inputs, list items |
| 2 (surface lift) | `{colors.surface-1}` background on canvas | Alternate-row banners, hovered cards |
| 3 (focus ring) | 2px `{colors.primary}` outline + 1px `{colors.hairline-strong}` underline | Focused input, focused button |

Carbon resists drop shadows on marketing — depth is carried by surface change and 1px hairlines. The exception is product / app surfaces (Carbon documents shadow tokens for elevated panels), but the marketing site barely uses them.

### Decorative Depth

- **Soft blue gradient backdrops** appear behind some hero illustrations — a faint blue-to-white wash that warms the canvas without competing with the headline.
- **No atmospheric depth.** No spotlight cards, no pastel section blocks, no gradient panels.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Default — every button, card, input, container |
| `{rounded.xs}` | 2px | Small badges (rare exception) |
| `{rounded.sm}` | 4px | Avatar circles squared, dropdown menus |
| `{rounded.md}` | 6px | (Used rarely; documented for completeness) |
| `{rounded.lg}` | 8px | (Used rarely; documented for completeness) |
| `{rounded.pill}` | 9999px | Status pills, badges in product UI (rare on marketing) |

The brand commits to flat 0px corners. The other tokens exist for product / mobile surfaces but rarely surface on marketing.

### Photography & Illustration Geometry

- IBM uses photography (people, hardware, sports cars) and abstract illustration (geometric mesh, dotted patterns) interchangeably.
- Image frames are flat — no rounded corners.
- Customer logo tiles sit on `{rounded.none}` 0px tiles with thin 1px borders.

## Components

### Buttons

**`button-primary`** — Blue solid CTA. The default primary across all pages.
- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button}`, padding 12px 16px, rounded `{rounded.none}`.
- Pressed state lives in `button-primary-pressed` (background shifts to `{colors.blue-80}`).

**`button-secondary`** — Charcoal solid button — Carbon's "secondary" treatment.
- Background `{colors.ink}`, text `{colors.inverse-ink}`, type `{typography.button}`, padding 12px 16px, rounded `{rounded.none}`.

**`button-tertiary`** — White button with blue 1px border + blue text. Used for tertiary CTAs.
- Background `{colors.canvas}`, text `{colors.primary}`, type `{typography.button}`, rounded `{rounded.none}`, padding 12px 16px. (Border in implementation: 1px `{colors.primary}`.)

**`button-ghost`** — Plain text + chevron, no background until hover.
- Background `{colors.canvas}`, text `{colors.primary}`, type `{typography.button}`, rounded `{rounded.none}`, padding 12px 16px.

**`button-danger`** — Carbon's destructive variant.
- Background `{colors.semantic-error}`, text `{colors.on-primary}`, type `{typography.button}`, rounded `{rounded.none}`, padding 12px 16px.

### Cards & Containers

**`feature-card`** — Default feature highlight tile on the home and product pages.
- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.none}`, padding 24px. Stroked with 1px `{colors.hairline}`.

**`feature-card-elevated`** — Same shape on `{colors.surface-1}` ground — used for "Recommended" cards in the latest-content carousel.
- Background `{colors.surface-1}`, otherwise identical structure.

**`product-card`** — Larger product showcase tile.
- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.none}`, padding 32px.

**`hero-card`** — Hero composition card with light-weight title, body, and CTA.
- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.display-md}`, rounded `{rounded.none}`, padding 48px.

**`cta-banner`** — Full-width blue CTA panel near the bottom of the page.
- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.headline}`, rounded `{rounded.none}`, padding 48px.

**`resource-tile`** — Smaller article / case-study tile.
- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body-sm}`, rounded `{rounded.none}`, padding 16px.

**`customer-logo-tile`** — Single tile in the customer marquee on the home page (Ferrari, Pfizer, etc.).
- Background `{colors.canvas}`, text `{colors.ink-muted}`, type `{typography.caption}`, rounded `{rounded.none}`, padding 24px. 1px hairline border.

### Inputs & Forms

**`text-input`** + **`text-input-focused`** + **`text-input-error`** — Carbon's input chrome.
- Background `{colors.surface-1}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.none}`, padding 11px 16px.
- Focus state replaces the bottom 1px hairline with a 2px `{colors.primary}` underline (Carbon's signature focus treatment).
- Error state adds 2px `{colors.semantic-error}` bottom underline.

**`newsletter-input`** — The "Stay connected" newsletter capture on the home page.
- Background `{colors.surface-1}`, text `{colors.ink}`, type `{typography.body}`, rounded `{rounded.none}`, padding 11px 16px. Adjacent submit is `button-primary`.

### Tabs

**`product-tab`** + **`product-tab-selected`** — The horizontal tab strip on product pages and the home "Recommended" carousel.
- Default: `{colors.canvas}` background, `{colors.ink-muted}` text, rounded `{rounded.none}`, padding 16px 20px. Bottom 1px hairline.
- Selected: `{colors.canvas}` background, `{colors.ink}` text, `{typography.body-emphasis}` weight, bottom 2px `{colors.primary}` underline. Same padding / rounding.

### Navigation

**`top-nav`** — Sticky white bar with the IBM logomark left, nav categories center, and search / sign-in icons right.
- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body-sm}`, height 48px. 1px bottom hairline.

**`utility-bar`** — Slim gray ribbon above the top nav with location switch, contact, search shortcuts.
- Background `{colors.surface-1}`, text `{colors.ink-muted}`, type `{typography.caption}`, height 32px.

### Footer

**`footer`** — Charcoal footer (`{colors.inverse-canvas}`) with the IBM wordmark left and 5–6 columns of caption-sized links. The only inverted surface above the page break.
- Background `{colors.inverse-canvas}`, text `{colors.inverse-ink-muted}`, type `{typography.body-sm}`, padding 64px 32px.

## Do's and Don'ts

### Do

- Use `{rounded.none}` 0px on every CTA, card, input, and container. The flat-square aesthetic is the brand.
- Pair Plex Sans weight 300 for display sizes (42px+) with weight 400 for body. Resist the urge to bold the headline.
- Reserve `{colors.primary}` IBM Blue for primary CTAs, links, focused-input underlines, and CTA banner. Do not use it as a card background or eyebrow color.
- Apply `letter-spacing: 0.16px` to body sizes. It's a Carbon precision detail and part of the typographic voice.
- Use surface change (`canvas` → `surface-1`) and 1px hairlines for card hierarchy. Skip drop shadows.
- Stick to sentence case for eyebrows and section labels — Carbon resists all-caps tracking.
- Invert to `{colors.inverse-canvas}` only at the footer; the rest of the page stays light.

### Don't

- Don't round corners on buttons, cards, or inputs. Even 4px rounded corners break the Carbon look.
- Don't bold display headlines. Plex Sans at weight 300 is the brand voice; weight 700 makes it look generic.
- Don't add atmospheric depth (gradient backdrops, drop shadows, atmospheric overlays) outside the documented soft-blue hero gradient.
- Don't introduce a second brand color. IBM Blue is the only chromatic accent; status semantics use the documented green / yellow / red.
- Don't replace IBM Plex Sans with Inter or Helvetica without preserving the `letter-spacing: 0.16px` and weight-300 display treatment.
- Don't use pill-shaped buttons. Carbon uses square corners; pills read as a different brand.
- Don't write all-caps tracked eyebrows. Carbon's eyebrows are sentence case at 14px.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Max | 1584px | Carbon max grid; gutters expand |
| Desktop-XL | 1312px | Default desktop layout |
| Desktop | 1056px | Card grid 4-up maintained |
| Tablet | 672px | Card grid 4-up → 2-up; nav becomes hamburger |
| Mobile | 320px | Single-column; display-xl scales 76px → ~32px |

### Touch Targets

- Carbon spec: 48px minimum tap target. Buttons and inputs hold 48px on touch viewports.
- Top-nav links grow from 36px to 48px tap height on touch.
- Tab strip rows hold 48px tap height.

### Collapsing Strategy

- **Top nav**: links collapse to a hamburger overlay below 672px. Logomark and search icon stay on the bar.
- **Utility bar**: hides below 672px to reclaim vertical space.
- **Card grid**: 4-up → 2-up at 1056px → 1-up below 672px.
- **Display type**: `{typography.display-xl}` 76px scales toward 42px on mobile while preserving the weight-300 treatment.
- **Footer**: 6-column link grid → 3-column at tablet → 1-column at mobile.

### Image Behavior

- Customer logos in the marquee maintain aspect ratio and may collapse to 2-row scroll below 672px.
- Hero illustrations scale proportionally; below 672px they may stack above the headline rather than sit beside it.

## Iteration Guide

1. Focus on ONE component at a time and reference it by its `components:` token name.
2. Default body to `{typography.body}` at weight 400 with `letter-spacing: 0.16px`. Don't remove the tracking.
3. When introducing a new section, decide whether it sits on `{colors.canvas}` (default) or on `{colors.surface-1}` (alternate band). The two-surface rhythm is the rhythm.
4. Run `npx @google/design.md lint DESIGN.md` after edits.
5. Add new variants as separate component entries (`button-primary-pressed`, `text-input-error`, `text-input-focused`).
6. Treat IBM Blue as scarce: links, primary CTA, CTA banner, focus underline. Anything beyond that is drift.
7. Resist rounded corners. If a designer pushes for 4px rounding, the brand is shifting away from Carbon.

## Known Gaps

- IBM's product surfaces (cloud-pak, watson, datacap) have richer Carbon component usage (data tables, graph cells, breadcrumbs, contextual menus) that aren't present on the marketing pages inspected — those components live in Carbon's documentation rather than in the marketing extraction.
- Form-field error and validation styling is documented in Carbon docs; the inspected pages didn't render error states.
- Dark mode is documented in Carbon as Gray-100 theme but isn't exposed on these marketing pages — only the footer inverts. The full dark theme is a separate Carbon palette not extracted here.
- The community.ibm.com sub-domain uses a different chrome (community-platform white-label) that approximates Carbon but isn't strict — the documented system applies to ibm.com proper.
```

## Conflict reconciliation with DESIGN_BRIEF

The fetched reference is a **marketing-site** extraction of Carbon, not Carbon's product/
data-table system — see the flag at the end of this section before trusting §9's stated
rationale for this pick. Concrete conflicts between the excerpt above and
`DESIGN_BRIEF.md`, and what to take instead:

- **Palette / accent philosophy — CONFLICT.** IBM: white `canvas` #ffffff, charcoal `ink`
  #161616, ONE chromatic accent (`primary` IBM Blue #0f62fe) used for links/primary-CTA/
  focus-ring/CTA-banner, plus a standard semantic green/yellow/red. Brief (§4): **no blue
  anywhere** ("Links are `ink` with an underline, which keeps the old `#4cc2ff` look out");
  paper is a cool security green-grey `#E6ECE8`, not pure white; the two dominant inks are
  `engrave` (security green) and `proof` (security magenta), not one blue.
  **Take:** the *discipline* of "exactly one chromatic accent, confined to a short, named
  role list, everything else neutral ink/surface" — apply that restraint to `engrave`
  (already the brief's dominant colour) instead of IBM Blue. Also take the 3-tier neutral
  layering logic (`canvas`→`surface-1`→`surface-2`) and map it onto the brief's own
  `paper`→`sheet`→`sheet-2` tiers — IBM's tiering technique, brief's actual hex values.

- **Typography — CONFLICT on tracking, ALIGNED on single-family discipline.** IBM: one
  family (IBM Plex Sans) for display/body/caption, hierarchy by **size + weight** (300 for
  display, 400/600 for body/emphasis), **positive** tracking (`+0.16px` body, `+0.32px`
  caption) called out as a "precision detail... don't remove it." Brief (§3): one family
  (Archivo) too, but hierarchy is by **width axis** (`wdth` 62–125), and tracking is
  explicitly the opposite rule — "0 everywhere except the display numerals... never
  positive tracking." **Take:** the "one family, no second face, hierarchy carried by a
  disciplined token table" logic (brief already does this via width, not weight — this
  confirms the direction, it doesn't need IBM's mechanism) and the idea of documenting
  every role in one scale table. **Do not** carry IBM's positive letter-spacing into
  Archivo.

- **Radius — CONFLICT, direct opposite.** IBM: `{rounded.none}` = 0px on *every* button,
  card, input, container, stated flatly as "even 4px rounded corners break the Carbon
  look." Brief (§5): 4px on sheets/controls, 2px on state glyphs, no pills. **Take:** only
  the meta-discipline of "commit to one radius system and never drift from it" — apply
  that discipline to the brief's 4px/2px pair, not to IBM's 0px.

- **Shadows — NO CONFLICT, direct technique reuse.** IBM marketing surfaces also use zero
  drop shadows; elevation comes entirely from surface-color shift + 1px hairline border,
  documented as a 4-level ladder (flat / hairline / surface-lift / focus-ring). The brief
  (§5) independently arrives at the same rule ("There are no drop shadows. The detail
  drawer is set off by a 1 px `rule-strong` edge and a scrim"). **Take this ladder as-is,
  technique-for-technique:** map "flat" to default table rows, "hairline" to `rule` borders
  on sheets, "surface-lift" to `sheet-2` row-hover/selected, and "focus-ring" to the
  brief's own 2px `engrave` ring. This is the cleanest, most directly reusable borrow in
  the whole file.

- **Focus ring colour — CONFLICT on hue, ALIGNED on technique.** IBM ties the focus ring
  to the same token as its primary accent (`{colors.primary}` blue) — a 2px outline plus a
  1px hairline-strong underline. Brief (§5 Controls and accessibility) does the identical
  thing with a different hue: 2px `engrave` with a 2px offset (`engrave` is also the
  primary-button fill colour). **Take:** the "focus ring always equals the dominant/primary
  accent token, never a separate colour" pattern — the brief already follows it; this is
  confirmation, not new information, so implement it exactly as brief §5 already specifies.

- **Layout philosophy — CONFLICT.** IBM's system is fundamentally a marketing **card grid**
  (16-column grid, 4-up/2-up/1-up feature/product/hero cards, a customer-logo marquee).
  Brief (§5) explicitly rejects this shape for the console: "Instrument, not dashboard...
  No rows of identical cards, no KPI tiles, no charts." **Take:** nothing structural here —
  do not let IBM's card-grid rhythm leak into the registers/instruments layout. The only
  transferable piece is the *spacing discipline* underneath it (next point).

- **Ghost-button "chevron" — CONFLICT.** IBM's `button-ghost` is documented as "Plain text
  + chevron." Brief (§5 Labelling) bans this outright: "No '→' in link or button text."
  **Take:** the ghost-button's *visual weight* (text-only until hover, no background) —
  drop the chevron.

- **Spacing scale numbers — NO CONFLICT, values coincide.** IBM's 4px-grid tokens (4, 8,
  12, 16, 24, 32, 48, plus a 96px section-break) and the brief's "4 px base (4, 8, 12, 16,
  24, 32, 48)" (§5) are numerically the same scale. **Take:** IBM's per-component padding
  assignment pattern (24px feature-card interior / 32px product-card / 48px hero-card) as
  a model for assigning the brief's own scale consistently across the deployment register,
  registry table, and slip anatomy — the numbers already agree, only the assignment
  discipline needs borrowing.

- **Eyebrow / label casing — NO CONFLICT, values coincide.** IBM: "sentence case eyebrows...
  Carbon resists all-caps tracked eyebrows." Brief (§5 Labelling): "Sentence case
  everywhere: no ALL-CAPS and no tracked-out eyebrow labels." Independent agreement — no
  reconciliation needed, just confirmation that this IBM instinct is safe to keep.

- **Important gap, not just a conflict.** `DESIGN_BRIEF.md` §9 ranks `ibm` #1 for three
  named reasons: "dense, keyboard-first data tables," "layered surface tokens that hold in
  light and dark," and "status as icon + colour + text." This fetched file's own **Known
  Gaps** section states plainly that data-table components, a real dual-theme (dark-mode)
  palette, and per-status iconography are **not** present in this marketing-page
  extraction — "those components live in Carbon's documentation," which was not fetched
  here; only the footer inverts to a dark surface, and there is no documented light+dark
  token pair for any other surface. `frontend-design` must not assume this file supplies
  those three techniques — see "What will lose us points" below.

## Demo-critical techniques

Mapped against `SUBMISSION.md` §2.2 (runbook steps 1–10) and §3 (video script), and the
wow-moment in `DESIGN_BRIEF.md` §6.5/§7 (the settlement slip, `0.07 / 1.93`, "Leaks 0").

1. **Elevation ladder without shadow (flat → hairline → surface-lift → focus-ring).**
   Apply to the channel registry table (default row = flat, hover/selected row = `sheet-2`
   surface-lift, no shadow anywhere) and to the settlement slip's stub-vs-chain-half split
   (surface change, not a drop shadow, separates the two halves). Serves runbook **step 7**
   (registry + detail drawer) and **step 5** (result rows + slip) — video **0:00–0:10**
   (opening frame is the slip) and **1:35–1:50** (drawer).

2. **Productive type-scale discipline: one family, a small named token table (role → size
   / weight / line-height / use), hierarchy without a second face.** Apply directly to the
   brief's own Archivo width-based scale (§3) so the slip's 88px display numerals and the
   64px "Leaks 0" verdict sit in the same deliberate system as 14px table cells and 13px
   meta text, the way IBM's 76→12px ladder does. Serves runbook **step 5** and video
   **0:00–0:10** — the wow-moment numerals need to read as one system, not a one-off hero
   font size dropped onto an otherwise-plain console.

3. **One-accent restraint: a single chromatic accent confined to a short, named role list;
   everything else neutral.** Apply the identical discipline to `engrave` (never let it
   drift into decorative use) so `proof` magenta stays rare and load-bearing. This is what
   makes the one magenta figure crossing the perforation ("Client 0.07") read as
   significant rather than just another coloured number. Serves runbook **steps 5–6**
   (result row + leak scan) and video **0:00–0:10** plus **1:20–1:35** (leak scan, where
   magenta must stay confined to the stub/proof cells the brief names in §4).

4. **Named, tokenised interactive states for every component (default / hover / pressed /
   focused / error / selected — never implied).** Apply to registry rows (focusable,
   Enter/Space opens the detail drawer per brief §5 Controls and accessibility) and to the
   state glyphs (Open / Closing / Settled / Uninitialised). IBM's rigor of giving every
   state its own token prevents a "half-styled" interactive element from surviving into the
   demo. Serves runbook **step 7** and video **1:35–1:50**.

5. **Two-tier neutral-surface layering used for rhythm instead of large vertical gaps**
   ("sections separate via thin gray rows... dense by design, not a lot of air"). Apply
   directly to the brief's `paper`/`sheet`/`sheet-2` tiers to keep the deployment register,
   live run log, unit grid and time-lock band organized during a dense, continuously
   updating ~6–8 minute demo without needing card shadows or big gaps between registers.
   Serves runbook **steps 1, 3–4, 8–9** (deployment register through anchored/rollover
   grids) — the pacing of the entire testnet run, not one single screen.

## What will lose us points

JUDGING WEIGHTS NOT PUBLISHED and SUBMISSION §7 has no design/UX criterion at all, so this
anchor's ceiling is inherently low-ROI — but the concrete risk *inside this specific file*
is that `DESIGN_BRIEF.md` §9's stated reason for ranking `ibm` #1 (dense data tables, a
real dual-theme palette, status-as-icon+colour+text) is **not actually documented in this
fetch**: it is a marketing-site extraction whose own "Known Gaps" section explicitly
disclaims data-table components, a real dark-mode token pair, and per-status iconography as
absent from the pages it was built from. `frontend-design` must not assume those three
techniques are specified here — it should treat the elevation ladder, one-accent restraint,
and type-scale discipline actually present in this file as the load-bearing borrow, and
build the registry table's row/status states, and the light↔dark token pairing, from the
brief's own §4/§5 spec (state glyphs, `sheet-2` hover, the full light-"Paper"/dark-"Plate"
token table) rather than from an IBM data-table or dual-theme pattern this file never
shows.
