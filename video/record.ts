/**
 * Drives the live console through the nine beats and records one clip per beat.
 * Waits are driven by the narration: an action with `at` does not start until the TTS reaches that
 * phrase, and every beat is held to its segment length so build.py never has to freeze a frame.
 * Beat 3 clicks Run dispute on camera; beats 4–6 film that same testnet run later, after off-camera
 * waits for its proof and its settlement (honest jump-cuts: nothing is replayed or staged).
 *
 *   --probe          run every action with no waits, no video and no run; list selectors that fail
 *   --only=<ids>     record only these beats (comma-separated) and merge them into clips/index.json
 *   --live=<runId>   use an existing run as the live run (with --only for beats 04–06)
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { beats, readTake, LIVE, LIVE_CHANNEL, OUT_DIR, VIDEO_DIR, type Beat, type LivePhase, type Shot, type Take } from "./script.ts";

const PROBE = process.argv.includes("--probe");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const LIVE_ARG = process.argv.find((a) => a.startsWith("--live="))?.slice(7);
const CLIPS = path.join(OUT_DIR, "clips");
const RAW = path.join(OUT_DIR, "raw");
const NAV_TIMEOUT = 20_000;
// recordVideo films the viewport at CSS size and never scales up, so the viewport is the full frame
// (1920 × 1080 at scale 1) and the runbook's 125 % zoom is CSS zoom on the console's <body>: the layout is
// 1536 px wide, like the brief's 1536 × 864 check, and text stays sharp. Overlays sit outside <body>.
const VIEWPORT = { width: 1920, height: 1080 };
const VIDEO_SIZE = VIEWPORT;
const ZOOM = 1.25;
// Explorer pages are screenshots, which do honour the device scale: 1536 × 864 at 1.25 = 1920 × 1080.
const SHOT_VIEWPORT = { width: 1536, height: 864 };
const SHOT_SCALE = 1.25;

type AudioRow = { id: string; words: string; delayMs: number; segmentS: number };
type Word = { start: number; end: number; text: string };
type RouteMark = { atS: number; route: string };
type LiveRun = { id?: string; channel?: string; claimPenalty?: string };
type Snapshot = { status: string; steps: { phase: string; label?: string }[]; channels: string[]; result?: { klien_provider: string; txs: { label: string; hash: string }[] }[]; error?: string };

// A visible pointer: headless Chromium draws none, and a hover nobody can see is not a demonstration.
// The console (and only the console) also gets the light theme and the 125 % zoom.
const cursorScript = (consolePort: string) => `
  (() => {
    if (location.port === ${JSON.stringify(consolePort)}) {
      try { localStorage.setItem("aegis-theme", "light"); } catch {}
      const zoom = () => { const s = document.createElement("style"); s.textContent = "body { zoom: ${ZOOM}; }"; document.head.appendChild(s); };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", zoom); else zoom();
    }
    const make = () => {
      if (document.getElementById("__cursor")) return;
      const c = document.createElement("div");
      c.id = "__cursor";
      c.style.cssText = "position:fixed;left:-100px;top:-100px;width:22px;height:22px;border:3px solid #A3126B;border-radius:50%;box-shadow:0 0 0 2px rgba(246,248,246,.9);pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);transition:transform .12s ease;";
      document.documentElement.appendChild(c);
      document.addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
      document.addEventListener("mousedown", () => { c.style.transform = "translate(-50%,-50%) scale(.6)"; }, true);
      document.addEventListener("mouseup", () => { c.style.transform = "translate(-50%,-50%)"; }, true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", make); else make();
  })();`;

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Seconds from narration start at which `phrase` begins, per the TTS word boundaries. */
export function phraseStart(words: Word[], phrase: string): number {
  const target = norm(phrase).split(" ");
  const toks = words.flatMap((w) => norm(w.text).split(" ").map((t) => ({ t, start: w.start })));
  for (let i = 0; i + target.length <= toks.length; i++) {
    if (target.every((t, k) => toks[i + k].t === t)) return toks[i].start;
  }
  throw new Error(`phrase not found in narration: "${phrase}"`);
}

const CARDS_HTML = fs.readFileSync(path.join(VIDEO_DIR, "cards.html"), "utf8");

/** The end card sits in a full-screen iframe over the page that is already loaded. */
async function overlay(page: Page, html: string, render: unknown) {
  await page.evaluate(
    async ({ html, render }) => {
      document.getElementById("__overlay")?.remove();
      const cursor = document.getElementById("__cursor");
      if (cursor) cursor.style.display = "none";
      const f = document.createElement("iframe");
      f.id = "__overlay";
      f.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483646;background:#E6ECE8;";
      f.srcdoc = html;
      document.documentElement.appendChild(f);
      await new Promise((r) => (f.onload = r));
      await (f.contentWindow as unknown as { render: (o: unknown) => Promise<void> }).render(render);
    },
    { html, render },
  );
}

async function clearOverlay(page: Page) {
  await page.evaluate(() => {
    document.getElementById("__overlay")?.remove();
    const cursor = document.getElementById("__cursor");
    if (cursor) cursor.style.display = "";
  });
}

async function api<T>(take: Take, p: string): Promise<T> {
  const r = await fetch(take.base + p, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`GET ${p} → HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Units served so far, from the server's "30/100 unit dilayani" labels. */
function unitsServed(steps: { label?: string }[]): number {
  return Math.max(0, ...steps.map((s) => Number(/^(\d+)\/\d+ unit/.exec(s.label ?? "")?.[1] ?? 0)));
}

/**
 * Off-camera: poll the live run until it reaches `until`. On "done", check the split the narration says
 * and wait until the console has indexed the new channel, so its record page renders at once on camera.
 */
async function waitLive(take: Take, live: LiveRun, until: LivePhase) {
  if (!live.id) throw new Error(`beat needs the live run, but no run was started (record beat 03 first, or pass --live=<runId>)`);
  const t0 = Date.now();
  for (;;) {
    const run = await api<Snapshot>(take, `/api/demo/runs/${live.id}`);
    if (run.status === "error") throw new Error(`live run ${live.id} failed: ${run.error}`);
    const reached =
      run.status === "done" ||
      (until === "serve" && unitsServed(run.steps) >= 30) ||
      (until === "prove" && run.steps.some((s) => s.phase === "prove"));
    if (reached && until !== "done" && run.status === "done") throw new Error(`live run finished before "${until}" could be filmed`);
    if (reached) {
      if (until === "done") {
        const row = run.result?.[0];
        if (!row || row.klien_provider !== take.dispute.split) throw new Error(`live run split is ${row?.klien_provider}, the narration says ${take.dispute.split}`);
        live.channel = run.channels[0];
        live.claimPenalty = row.txs.find((t) => t.label === "claimPenalty")?.hash;
        for (let i = 0; ; i++) {
          const r = await fetch(`${take.base}/api/channels/${live.channel}`, { signal: AbortSignal.timeout(30_000) });
          if (r.ok) break;
          if (i > 60) throw new Error(`channel ${live.channel} not indexed by the console after 60 s`);
          await new Promise((res) => setTimeout(res, 1000));
        }
      }
      console.log(`  live run reached "${until}" after ${((Date.now() - t0) / 1000).toFixed(0)} s off-camera`);
      return;
    }
    if (Date.now() - t0 > 5 * 60_000) throw new Error(`live run ${live.id} did not reach "${until}" in 5 min`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * Blockscout takes a few seconds to render, longer than a beat can wait, so the shot is a screenshot of the
 * real explorer page, captured off-camera at the start of the beat and shown as an overlay when the
 * narration reaches it. Never faked: if the page does not render, the take stops.
 */
async function captureExplorer(browser: Browser, take: Take, live: LiveRun, shot: Shot) {
  const [url, needle] =
    shot === "claimPenalty"
      ? (() => {
          if (!live.claimPenalty) throw new Error("no claimPenalty hash on the live run");
          return [`${take.explorer}/tx/${live.claimPenalty}`, live.claimPenalty.slice(0, 12)];
        })()
      : [`${take.explorer}/address/${take.poseidon}`, take.poseidon.slice(0, 10)];
  const ctx = await browser.newContext({ viewport: SHOT_VIEWPORT, deviceScaleFactor: SHOT_SCALE, colorScheme: "light" });
  const page = await ctx.newPage();
  const file = path.join(OUT_DIR, `explorer-${shot}.png`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByText(needle, { exact: false }).first().waitFor({ timeout: 40_000 });
    if (shot === "claimPenalty") await page.getByText(/Success/).first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: file });
    const u = new URL(url);
    return { file, route: u.host + u.pathname };
  } finally {
    await ctx.close();
  }
}

/** Wait for the page to settle, then refuse the states the runbook says never to film. */
async function settled(page: Page) {
  // "load" plus a short settle: these pages poll, so networkidle would wait its whole timeout.
  await page.waitForLoadState("load", { timeout: NAV_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(800);
  const bad = await page.evaluate(() => {
    const t = document.body.innerText;
    if (t.includes("Fixture replay")) return "Fixture replay (not the live console)";
    if (/No page at this address|Console server is not running/.test(document.title)) return document.title;
    if (t.includes("could not load") || t.includes("Could not read the chain")) return "could not load";
    return null;
  });
  if (bad) throw new Error(`not filmable: page shows "${bad}" at ${page.url()}`);
}

async function main() {
  const take = readTake();
  const audio: AudioRow[] = PROBE ? [] : JSON.parse(fs.readFileSync(path.join(OUT_DIR, "audio", "index.json"), "utf8"));
  const wordsOf = (id: string): Word[] => {
    const row = audio.find((a) => a.id === id);
    if (!row) throw new Error(`no audio for ${id}; run tts.py first`);
    return JSON.parse(fs.readFileSync(path.join(OUT_DIR, "audio", row.words), "utf8"));
  };
  fs.mkdirSync(CLIPS, { recursive: true });
  fs.mkdirSync(RAW, { recursive: true });

  // --probe never starts a run: the live run is stood in by select.ts's finished dispute.
  const live: LiveRun = PROBE ? { id: take.dispute.id, channel: take.dispute.channel } : { id: LIVE_ARG };
  if (!PROBE && LIVE_ARG) await waitLive(take, live, "done").catch(() => {}); // fills channel/claimPenalty when that run is finished
  const cardData = (card: string) => ({ card, factory: take.factory, poseidon: take.poseidon });
  const resolve = (p: string) => {
    if (p.includes(LIVE_CHANNEL)) {
      if (!live.channel) throw new Error("the live run has no channel yet");
      return p.replace(LIVE_CHANNEL, live.channel);
    }
    if (p.includes(LIVE)) {
      if (!live.id) throw new Error("no live run yet");
      return p.replace(LIVE, live.id);
    }
    return p;
  };

  const browser = await chromium.launch();
  const index: { id: string; clip: string; recordedS: number; routes: RouteMark[] }[] = [];
  const missing: string[] = [];

  for (const beat of beats(take) as Beat[]) {
    if (ONLY && !ONLY.includes(beat.id)) continue;
    const row = PROBE ? { segmentS: 0, delayMs: 0 } : audio.find((a) => a.id === beat.id)!;
    const words = PROBE ? [] : wordsOf(beat.id);
    const delayS = row.delayMs / 1000;

    // Off-camera preparation first: wait for the live run and capture the explorer before the
    // recording context exists, so none of it lands in the clip.
    if (!PROBE && beat.before?.live) await waitLive(take, live, beat.before.live);
    const shots = new Map<Shot, { file: string; route: string }>();
    if (!PROBE) for (const s of beat.before?.shots ?? []) shots.set(s, await captureExplorer(browser, take, live, s));

    const context: BrowserContext = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: "light",
      reducedMotion: "no-preference",
      ...(PROBE ? {} : { recordVideo: { dir: RAW, size: VIDEO_SIZE } }),
    });
    await context.addInitScript(cursorScript(new URL(take.base).port));
    const page = await context.newPage();
    const t0 = Date.now();
    const elapsedS = () => (Date.now() - t0) / 1000;
    const routes: RouteMark[] = [];
    let currentRoute = "";
    const setRoute = (route: string) => routes.push({ atS: Number(elapsedS().toFixed(2)), route });
    const wait = (ms: number) => (PROBE ? Promise.resolve() : page.waitForTimeout(ms));
    const loc = (sel: string) => page.locator(sel).first();
    // A client-rendered page whose API call failed once shows nothing until its next poll; a reload is
    // what a person would do, so do it once, on camera.
    const ready = async (sel: string) => {
      try {
        await loc(sel).waitFor({ timeout: 15000 });
      } catch {
        console.warn(`  ${sel} not visible after 15s — reloading once`);
        await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
        await settled(page);
        await loc(sel).waitFor({ timeout: 20000 });
      }
    };

    console.log(`\n▶ ${beat.id} (${PROBE ? "probe" : `hold ${row.segmentS}s`})`);
    for (const a of beat.actions) {
      if (a.at && !PROBE) {
        const startS = delayS + phraseStart(words, a.at);
        const dt = startS - elapsedS();
        if (dt > 0) await page.waitForTimeout(dt * 1000);
        else console.warn(`  ${a.kind}: "${a.at}" already passed by ${(-dt).toFixed(1)}s — earlier actions ran long`);
      }
      if (PROBE && a.liveOnly) {
        console.log(`  (live-only, not probed) ${a.kind} ${"selector" in a ? a.selector : ""}`);
        continue;
      }
      try {
        switch (a.kind) {
          case "card":
            setRoute("");
            if (page.url() === "about:blank") {
              await page.setContent(CARDS_HTML);
              await page.evaluate((o) => (window as unknown as { render: (o: unknown) => Promise<void> }).render(o), cardData(a.name));
            } else {
              await overlay(page, CARDS_HTML, cardData(a.name));
            }
            await wait(a.ms);
            break;
          case "goto": {
            const p = resolve(a.path);
            await page.goto(take.base + p, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
            await settled(page);
            currentRoute = p;
            setRoute(p);
            await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
            break;
          }
          case "wait":
            await wait(a.ms);
            break;
          case "hover":
            await ready(a.selector);
            await loc(a.selector).scrollIntoViewIfNeeded();
            await loc(a.selector).hover({ steps: PROBE ? 1 : 25 });
            await wait(a.ms ?? 1500);
            break;
          case "click":
            await ready(a.selector);
            if (PROBE && a.startsRun) {
              // never start a testnet run from a probe: open the stand-in run instead
              await page.goto(take.base + resolve(a.route), { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
              await settled(page);
              break;
            }
            await loc(a.selector).hover({ steps: PROBE ? 1 : 20 });
            await wait(400);
            await loc(a.selector).click();
            if (a.startsRun) {
              await page.waitForURL(/\/runs\/[\w-]+/, { timeout: NAV_TIMEOUT });
              live.id = /\/runs\/([\w-]+)/.exec(page.url())![1];
              console.log(`  live run started on camera: ${live.id}`);
            }
            await settled(page);
            currentRoute = resolve(a.route);
            setRoute(currentRoute);
            await wait(a.ms ?? 1200);
            break;
          case "scrollTo":
            await ready(a.selector);
            await loc(a.selector).evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
            await wait(a.ms ?? 1500);
            break;
          case "waitFor":
            if (!PROBE) await loc(a.selector).waitFor({ timeout: a.timeoutMs });
            break;
          case "explorer": {
            const shot = shots.get(a.shot);
            if (PROBE || !shot) break;
            const png = fs.readFileSync(shot.file).toString("base64");
            await page.evaluate((src) => {
              document.getElementById("__overlay")?.remove();
              const cursor = document.getElementById("__cursor");
              if (cursor) cursor.style.display = "none";
              const img = document.createElement("img");
              img.id = "__overlay";
              img.src = src;
              img.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483646;object-fit:cover;";
              document.documentElement.appendChild(img);
            }, `data:image/png;base64,${png}`);
            setRoute(shot.route.replace(/(0x[0-9a-fA-F]{4})[0-9a-fA-F]{24,}([0-9a-fA-F]{4})/, "$1…$2"));
            await wait(a.ms);
            await clearOverlay(page);
            setRoute(currentRoute);
            break;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (PROBE && "selector" in a) {
          missing.push(`${beat.id}: ${a.kind} ${a.selector} — ${msg.split("\n")[0]}`);
          continue;
        }
        await context.close();
        await browser.close();
        throw new Error(`${beat.id} / ${a.kind}: ${msg}`);
      }
    }

    if (PROBE) {
      await context.close();
      continue;
    }
    const holdS = row.segmentS + 0.3 - elapsedS();
    if (holdS > 0) await page.waitForTimeout(holdS * 1000);
    else console.warn(`  actions overran the segment by ${(-holdS).toFixed(1)}s; build.py will trim the tail`);
    const recordedS = elapsedS();
    const video = page.video();
    await context.close();
    const raw = await video!.path();
    const clip = `${beat.id}.webm`;
    fs.renameSync(raw, path.join(CLIPS, clip));
    index.push({ id: beat.id, clip, recordedS: Number(recordedS.toFixed(2)), routes });
    console.log(`  recorded ${recordedS.toFixed(1)}s → ${clip}`);
  }
  await browser.close();

  if (PROBE) {
    if (missing.length) {
      console.error("\nunresolved selectors:\n  " + missing.join("\n  "));
      process.exit(1);
    }
    console.log("\nprobe ok: every selector resolved");
    return;
  }
  const indexPath = path.join(CLIPS, "index.json");
  const prev: typeof index = ONLY && fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf8")) : [];
  const merged = [...prev.filter((p) => !index.some((n) => n.id === p.id)), ...index].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(indexPath, JSON.stringify(merged, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, "live.json"), JSON.stringify(live, null, 1));
  console.log("\nwrote", indexPath);
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
