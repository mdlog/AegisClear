import { describe, expect, it } from "vitest";
import css from "./tokens.css?raw";

// Contrast of the brief's tokens (DESIGN_BRIEF §4; README §6.1), read from the stylesheet itself so a token edit cannot
// silently break a pair. Every colour on screen is a token or a color-mix of tokens, so these pairs are the palette.

type Rule = { prelude: string; body: string; children: Rule[] };

/** Splits a stylesheet into rules; @media bodies are parsed again (tokens.css nests one level). */
function parse(src: string): Rule[] {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  let i = 0;
  for (let open = text.indexOf("{", i); open >= 0; open = text.indexOf("{", i)) {
    let depth = 1;
    let j = open + 1;
    for (; depth > 0 && j < text.length; j++) depth += text[j] === "{" ? 1 : text[j] === "}" ? -1 : 0;
    const prelude = text.slice(i, open).trim().replace(/\s+/g, " ");
    const body = text.slice(open + 1, j - 1);
    rules.push({ prelude, body, children: prelude.startsWith("@") ? parse(body) : [] });
    i = j;
  }
  return rules;
}

const sheet = parse(css);

/** The custom properties declared by `selector`, at the top level (media null) or inside every `@media` with that query. */
function tokens(media: string | null, selector: string): Record<string, string> {
  const scope = media === null ? sheet : sheet.filter((r) => r.prelude === media).flatMap((r) => r.children);
  const bodies = scope.filter((r) => r.prelude === selector).map((r) => r.body);
  return Object.fromEntries(bodies.flatMap((b) => [...b.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])));
}

/** WCAG 2.2 relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((k) => parseInt(hex.slice(k, k + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["paper", "sheet", "sheet-2", "stub"];
const TEXT = ["ink", "ink-2", "engrave", "proof", "caution", "danger"];

/** Every foreground/surface pair under `min`, as readable strings (empty when the palette passes). */
function below(palette: Record<string, string>, fgs: string[], min: number): string[] {
  return fgs.flatMap((fg) =>
    SURFACES.map((s) => ({ s, r: ratio(palette[fg], palette[s]) }))
      .filter(({ r }) => r < min)
      .map(({ s, r }) => `${fg} on ${s} ${r.toFixed(2)}:1`),
  );
}

const MORE = "@media (prefers-contrast: more)";
const DARK_OS = ':root:not([data-theme="light"])';
const DARK_TOGGLE = ':root[data-theme="dark"]';

const base = tokens(null, ":root");
const darkOs = tokens("@media (prefers-color-scheme: dark)", DARK_OS);
const darkToggle = tokens(null, DARK_TOGGLE);
const moreLight = tokens(MORE, ":root");
const moreDarkOs = tokens(`${MORE} and (prefers-color-scheme: dark)`, DARK_OS);
const moreDarkToggle = tokens(MORE, DARK_TOGGLE);

// The cascade as the browser resolves it: `:root` (0,1,0) first, the dark selectors (0,2,0) over it.
const normal = { light: base, dark: { ...base, ...darkToggle } };
const more = { light: { ...base, ...moreLight }, dark: { ...base, ...moreLight, ...darkToggle, ...moreDarkToggle } };

describe("design tokens, normal contrast (DESIGN_BRIEF §4)", () => {
  it("reads every colour of both themes from the stylesheet, so the checks below are not vacuous", () => {
    for (const palette of Object.values(normal)) {
      for (const t of [...SURFACES, ...TEXT, "on-engrave", "rule", "rule-strong"]) expect(palette[t]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("defines the dark theme once: the OS preference and the manual toggle carry the same tokens", () => {
    expect(darkOs).toEqual(darkToggle);
  });

  it("keeps every text colour at 4.5:1 or more on every surface, in both themes (WCAG 1.4.3)", () => {
    for (const [theme, palette] of Object.entries(normal)) {
      expect({ theme, below: below(palette, TEXT, 4.5) }).toEqual({ theme, below: [] });
      expect(ratio(palette["on-engrave"], palette.engrave)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("design tokens under prefers-contrast: more (README §6.1)", () => {
  it("raises every text colour to 7:1 or more on every surface, in both themes", () => {
    for (const [theme, palette] of Object.entries(more)) {
      expect({ theme, below: below(palette, TEXT, 7) }).toEqual({ theme, below: [] });
    }
  });

  it("keeps the label on an engraved fill (primary actions) at 7:1 or more", () => {
    for (const palette of Object.values(more)) expect(ratio(palette["on-engrave"], palette.engrave)).toBeGreaterThanOrEqual(7);
  });

  it("draws hairline rules at 3:1 and strong rules at 4.5:1, so row and section boundaries stay visible (WCAG 1.4.11)", () => {
    for (const [theme, palette] of Object.entries(more)) {
      expect({ theme, below: [...below(palette, ["rule"], 3), ...below(palette, ["rule-strong"], 4.5)] }).toEqual({ theme, below: [] });
    }
  });

  it("gives the dark theme the same overrides for the OS preference and the manual toggle", () => {
    expect(Object.keys(moreDarkToggle).length).toBeGreaterThan(0);
    expect(moreDarkOs).toEqual(moreDarkToggle);
  });
});
