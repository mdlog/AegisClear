// Browser QA in fixture mode (docs/frontend/README.md §6.1 and §8): real Chrome through playwright-core, no chain.
// On every route: target size (WCAG 2.5.8 24 px with its spacing exception; 44 px on touch layouts), axe in both
// themes, no sideways scroll, and prefers-contrast: more (the high-contrast tokens are live and axe's AAA contrast rule
// passes). Also the open menu, the shortcut list and a live run.
// Usage: pnpm qa    Env: CHROME_PATH (default /usr/bin/google-chrome). Prints every failure and exits 1 if any.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { createServer } from "vite";

process.env.VITE_API_MODE = "fixtures";
process.env.VITE_FIXTURE_SET = "local";

// Recorded ids from docs/frontend/fixtures/local-31337: the B-dispute channel and one finished run of each shape.
const ROUTES = [
  ["desk", "/"],
  ["registry", "/channels"],
  ["channel", "/channels/0x1E12393dA190449B9CA32D1f280C4D45fB21C6C4"],
  ["run B-dispute", "/runs/mudg1f4b-60a0fd"],
  ["run anchored", "/runs/mudg1kzg-7066ea"],
  ["run rollover", "/runs/mudg2zjn-faee38"],
  ["run all", "/runs/mudg39dg-1815b0"],
  ["offer", "/offer"],
  ["deployment", "/deployment"],
  ["not found", "/no-such-page"],
];
const TOUCH = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const AA = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } };
const AAA_CONTRAST = { runOnly: { type: "rule", values: ["color-contrast-enhanced"] } };

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const failures = [];
const report = (check, problems) => {
  console.log(`${problems.length ? "FAIL" : "ok  "} ${check}`);
  for (const p of problems) {
    console.log(`       ${p}`);
    failures.push(`${check}: ${p}`);
  }
};

const configFile = new URL("../vite.config.ts", import.meta.url).pathname; // works from any cwd
const server = await createServer({ configFile, server: { port: 4049, strictPort: false }, logLevel: "error" });
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome" });

/** A page whose theme is stored the way the toggle stores it; "system" leaves it to the emulated OS scheme. */
async function open(device, { theme = "light", colorScheme = "light", contrast = "no-preference" } = {}) {
  const context = await browser.newContext({ ...device, colorScheme, contrast, reducedMotion: "reduce" });
  await context.addInitScript((t) => {
    try {
      if (t === "system") localStorage.removeItem("aegis-theme");
      else localStorage.setItem("aegis-theme", t);
    } catch {
      /* the app falls back to system */
    }
  }, theme);
  return { context, page: await context.newPage() };
}

async function visit(page, path) {
  await page.goto(origin + path, { waitUntil: "networkidle" });
  await page.locator("main h1").first().waitFor();
  await page.waitForTimeout(300); // lazy chunks and fixture reads settle
}

async function axe(page, options, scope = "document") {
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ content: axeSource });
  return page.evaluate(async ([opts, sel]) => {
    const root = sel === "document" ? document : document.querySelector(sel);
    const { violations } = await window.axe.run(root, opts);
    return violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
  }, [options, scope]);
}

/**
 * Targets under `min` px in `scope`. Inline links in running text are exempt (WCAG 2.5.8 "inline"). With `spacing`, an
 * undersized target also passes when a 24 px circle on its centre touches no other target (the 2.5.8 spacing exception).
 */
function targets(page, min, spacing, scope = "body") {
  return page.evaluate(([min, spacing, scope]) => {
    const SEL = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [tabindex]:not([tabindex="-1"])';
    // A label activates its input, so an input's target is the union of the two boxes.
    const box = (el) => {
      const rects = [el, ...(el.labels ?? [])].map((n) => n.getBoundingClientRect());
      const [left, top] = [Math.min(...rects.map((r) => r.left)), Math.min(...rects.map((r) => r.top))];
      const [right, bottom] = [Math.max(...rects.map((r) => r.right)), Math.max(...rects.map((r) => r.bottom))];
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    const all = [...document.querySelector(scope).querySelectorAll(SEL)]
      .filter((el) => !el.disabled && !el.closest('[inert], [aria-hidden="true"]'))
      .map((el) => ({ el, r: box(el), cs: getComputedStyle(el) }))
      .filter(({ r, cs }) => r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && r.right > 0 && r.bottom > 0);
    const inline = ({ el, cs }) => cs.display === "inline" && (el.parentElement?.textContent ?? "").trim().length > (el.textContent ?? "").trim().length;
    const small = all.filter((t) => (t.r.width < min - 0.5 || t.r.height < min - 0.5) && !inline(t));
    const centre = (r) => [r.left + r.width / 2, r.top + r.height / 2];
    const toRect = ([x, y], r) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    const spaced = (t) =>
      all.every((u) => {
        if (u === t || u.el.contains(t.el) || t.el.contains(u.el)) return true;
        const c = centre(t.r);
        if (!small.includes(u)) return toRect(c, u.r) >= 12;
        const d = centre(u.r);
        return Math.hypot(c[0] - d[0], c[1] - d[1]) >= 24;
      });
    const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.id || el.tagName).trim().replace(/\s+/g, " ").slice(0, 36);
    return small
      .filter((t) => !(spacing && spaced(t)))
      .map(({ el, r }) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} "${label(el)}" ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
  }, [min, spacing, scope]);
}

/** Sideways overflow in px (0 when none), with the outermost elements that stick out past the viewport. */
const sideways = (page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    const over = root.scrollWidth - root.clientWidth;
    if (over <= 0) return [];
    const out = [...document.body.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > root.clientWidth + 0.5);
    const outer = out.filter((el) => !out.includes(el.parentElement)).slice(0, 3);
    const name = (el) => `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : ""}`;
    return [`scrollWidth exceeds the viewport by ${over}px: ${outer.map((el) => `${name(el)} right=${el.getBoundingClientRect().right.toFixed(0)}`).join(", ")}`];
  });

try {
  // 1. Touch layout (390 px, coarse pointer): 44 px targets, no sideways scroll, axe AA.
  {
    const { context, page } = await open(TOUCH);
    for (const [name, path] of ROUTES) {
      await visit(page, path);
      report(`touch 390 targets >= 44: ${name}`, await targets(page, 44, false));
      report(`touch 390 no sideways scroll: ${name}`, await sideways(page));
      report(`touch 390 axe AA: ${name}`, await axe(page, AA));
    }
    await visit(page, "/");
    await page.getByRole("button", { name: "Menu" }).click();
    report("touch 390 targets >= 44: open menu", await targets(page, 44, false, "nav"));
    await page.keyboard.press("?");
    await page.locator("dialog[open]").waitFor();
    report("touch 390 targets >= 44: shortcut list", await targets(page, 44, false, "dialog[open]"));
    await page.keyboard.press("Escape");
    await visit(page, "/");
    await page.locator("#featured-run").click();
    await page.waitForURL(/\/runs\//);
    await page.locator("main h1").first().waitFor();
    await page.waitForTimeout(1500);
    report("touch 390 targets >= 44: live run", await targets(page, 44, false));
    report("touch 390 axe AA: live run", await axe(page, AA));
    await context.close();
  }

  // 2. Desktop (1280 px, fine pointer): 24 px targets with the spacing exception, axe AA in light and dark.
  for (const theme of ["light", "dark"]) {
    const { context, page } = await open(DESKTOP, { theme, colorScheme: theme });
    for (const [name, path] of ROUTES) {
      await visit(page, path);
      if (theme === "light") report(`desktop 1280 targets >= 24: ${name}`, await targets(page, 24, true));
      report(`desktop 1280 ${theme} axe AA: ${name}`, await axe(page, AA));
    }
    await context.close();
  }

  // 3. No sideways scroll at the in-between widths.
  for (const width of [768, 1024]) {
    const { context, page } = await open({ viewport: { width, height: 900 } });
    const over = [];
    for (const [name, path] of ROUTES) {
      await visit(page, path);
      over.push(...(await sideways(page)).map((p) => `${name}: ${p}`));
    }
    report(`${width} no sideways scroll`, over);
    await context.close();
  }

  // 4. The run view's lifecycle rail sticks under the global header (LAYOUT_SPEC run view), never beneath it, at every
  //    width, including where the header wraps. Checked with the page scrolled to the bottom of a finished run.
  for (const [label, device] of [["touch 390", TOUCH], ["768", { viewport: { width: 768, height: 1024 } }], ["1024", { viewport: { width: 1024, height: 768 } }], ["1280", DESKTOP]]) {
    const { context, page } = await open(device);
    await visit(page, "/runs/mudg1f4b-60a0fd");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    const hidden = await page.evaluate(() => {
      const header = document.querySelector("header");
      const rail = document.querySelector('main nav[aria-label="Lifecycle"]');
      if (!header || !rail) return ["no header or rail found"];
      // Below 768 px the rail is vertical and static by design, so it scrolls away instead of sticking.
      if (getComputedStyle(rail).position !== "sticky" || getComputedStyle(header).position !== "sticky") return [];
      const [h, r] = [header.getBoundingClientRect(), rail.getBoundingClientRect()];
      return r.top < h.bottom - 1 ? [`rail top ${r.top.toFixed(0)} is under the header (bottom ${h.bottom.toFixed(0)})`] : [];
    });
    report(`${label} run rail stays below the header`, hidden);
    await context.close();
  }

  // 5. prefers-contrast: more — the tokens switch, and every text node reaches axe's enhanced (AAA) contrast.
  for (const [theme, colorScheme] of [["light", "light"], ["dark", "light"], ["system", "dark"]]) {
    const read = async (contrast) => {
      const { context, page } = await open(DESKTOP, { theme, colorScheme, contrast });
      await visit(page, "/");
      const v = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ink-2").trim());
      await context.close();
      return v;
    };
    const [normal, more] = [await read("no-preference"), await read("more")];
    report(`contrast more switches tokens: theme ${theme}, OS ${colorScheme}`, normal === more ? [`--ink-2 stays ${normal}`] : []);
    const { context, page } = await open(DESKTOP, { theme, colorScheme, contrast: "more" });
    for (const [name, path] of ROUTES) {
      await visit(page, path);
      report(`contrast more AAA (theme ${theme}, OS ${colorScheme}): ${name}`, await axe(page, AAA_CONTRAST));
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : "\nall browser checks passed");
process.exit(failures.length ? 1 : 0);
