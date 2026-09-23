// Global chrome (LAYOUT_SPEC navigation): wordmark, four destinations, and a right cluster with the live-run chip,
// the network plate and the fixture badge. No sidebar, no header call to action.
import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLoaderData, useLocation, useNavigate, useNavigation } from "react-router";
import { Keyboard, Menu, Monitor, Moon, Sun, X } from "lucide-react";
import type { ConfigResponse } from "@aegis/types";
import { REPO_URL, scenarioCopy, shellCopy as copy, shortcutsCopy } from "@/copy/en";
import { fixtureInfo } from "@/lib/api/client";
import { useRuns } from "@/lib/api/queries";
import { Elapsed } from "@/ui/Clock";
import { useAnnounce } from "@/ui/Announcer";
import { SealMark } from "@/ui/SealMark";
import type { RootData } from "./loaders";
import { ServerDown } from "./ServerDown";
import { useShortcut } from "./shortcuts";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { NEXT_THEME, useTheme } from "./theme";
import styles from "./AppShell.module.css";

export function AppShell() {
  const data = useLoaderData() as RootData;
  if (data.kind === "server-down") return <ServerDown error={data.error} />;
  return <Chrome config={data.config} />;
}

function Chrome({ config }: { config: ConfigResponse }) {
  const navigation = useNavigation();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useGlobalShortcuts(() => setShortcutsOpen(true));
  useFocusOnNavigation();
  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#main">{copy.skip}</a>
      {navigation.state !== "idle" && <div className={styles.pending} role="progressbar" aria-label="Loading page" />}
      <header className={styles.header}>
        <Wordmark />
        <MainNav />
        <div className={styles.cluster}>
          <LiveRunChip />
          <NetworkPlate config={config} />
          <FixtureBadge />
          <button type="button" className={`btn btn--quiet btn--small ${styles.shortcuts}`} onClick={() => setShortcutsOpen(true)}>
            <Keyboard size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className={styles.shortcutsWord}>{shortcutsCopy.button}</span>
            <kbd aria-hidden="true">?</kbd>
          </button>
          <ThemeToggle />
        </div>
      </header>
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      <main id="main" tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      <Footer config={config} />
      <ScrollRestoration />
    </div>
  );
}

export function Wordmark() {
  return (
    <Link to="/" className={styles.wordmark}>
      <SealMark className={styles.seal} />
      <span className={styles.brand}>{copy.wordmark}</span>
      <span className={styles.brandSuffix}>{copy.wordmarkSuffix}</span>
    </Link>
  );
}

/** n, r and ? from anywhere (LAYOUT_SPEC "Keyboard"); l belongs to the run view. */
function useGlobalShortcuts(openList: () => void) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const announce = useAnnounce();
  const { data: runs } = useRuns();
  useShortcut("?", openList);
  useShortcut("n", () => {
    if (pathname === "/") document.getElementById("featured-run")?.focus();
    else navigate("/", { state: { focus: "featured-run" } });
  });
  useShortcut("r", () => {
    const run = runs?.find((r) => r.status === "running") ?? runs?.[0];
    if (run) navigate(`/runs/${run.id}`);
    else announce(shortcutsCopy.noRun);
  });
}

/** After a page change, focus the new page's heading, so screen readers start there (unless a shortcut asked otherwise). */
function useFocusOnNavigation() {
  const location = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if ((location.state as { focus?: string } | null)?.focus) return;
    const heading = document.querySelector<HTMLElement>("main h1");
    if (!heading) return;
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    // Only a new path moves focus: filters, ?ch= and #anchors leave it where the operator put it.
  }, [location.pathname]);
}

function MainNav() {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <nav
      aria-label="Main"
      className={styles.nav}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        setOpen(false);
        button.current?.focus();
      }}
    >
      <button ref={button} type="button" className={`btn btn--quiet ${styles.menuButton}`} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        {open ? <X size={16} strokeWidth={1.5} aria-hidden="true" /> : <Menu size={16} strokeWidth={1.5} aria-hidden="true" />}
        {copy.menu}
      </button>
      <ul id={listId} className={styles.navList} data-open={open}>
        {copy.nav.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.to === "/"} className={styles.navLink}>{item.label}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** F7: the live run is offered from every page, never forced (the chip polls E5 every 5 s while a run is live). */
function LiveRunChip() {
  const { data: runs } = useRuns();
  const live = runs?.find((r) => r.status === "running");
  if (!live) return null;
  // The name stays still while the clock beside it ticks; only the clock re-renders each second.
  return (
    <Link to={`/runs/${live.id}`} className={styles.liveChip} aria-label={`${copy.liveRun}: ${scenarioCopy[live.scenario].title}`}>
      <i className={styles.liveGlyph} aria-hidden="true" />
      <span className={styles.liveWord}>{copy.liveRun}</span>
      <span className={styles.liveTitle}>{scenarioCopy[live.scenario].title}</span>
      <span className={styles.liveClock}><Elapsed since={live.startedAt} /></span>
    </Link>
  );
}

/** The brief's network plate: engrave for testnet; caution for the local chain, so local can never pass as testnet. */
function NetworkPlate({ config }: { config: ConfigResponse }) {
  const local = config.network === "local";
  return (
    <Link to="/deployment" className={`${styles.plate} ${local ? styles.plateLocal : ""}`}>
      <span className={styles.plateName}>{local ? copy.localPlate : copy.testnetPlate}</span>
      <span className={styles.plateMeta}>
        {config.chainId}
        {local ? `, ${copy.explorerDisabled}` : ", MockUSDG"}
      </span>
    </Link>
  );
}

function FixtureBadge() {
  const fixtures = fixtureInfo();
  if (!fixtures) return null;
  return (
    <span className={styles.fixture}>
      <span className={styles.fixtureName}>{copy.fixtureBadge}</span>
      <span className={styles.plateMeta}>
        {copy.fixtureDetail}
        {fixtures.speed !== 1 && `, ${copy.fixtureSpeed(fixtures.speed)}`}
      </span>
    </span>
  );
}

function ThemeToggle() {
  const [mode, setMode] = useTheme();
  const next = NEXT_THEME[mode];
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  return (
    <button type="button" className={`icon-btn ${styles.theme}`} onClick={() => setMode(next)} aria-label={copy.themeSwitch(copy.theme[mode], copy.theme[next])} title={copy.theme[mode]}>
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}

function Footer({ config }: { config: ConfigResponse }) {
  return (
    <footer className={styles.footer}>
      <ul className={styles.footerList}>
        <li>{config.network === "local" ? copy.footer.local : copy.footer.testnet}</li>
        <li>{copy.footer.token}</li>
        <li>{copy.footer.audit}</li>
        <li><Link to="/deployment#limits">{copy.footer.limits}</Link></li>
        <li><a href={REPO_URL} target="_blank" rel="noopener noreferrer">{copy.footer.source}</a></li>
      </ul>
    </footer>
  );
}

/** Shown while the root loader runs on first load: the wordmark only, no spinner. */
export function ShellFallback() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.wordmark}>
          <SealMark className={styles.seal} />
          <span className={styles.brand}>{copy.wordmark}</span>
          <span className={styles.brandSuffix}>{copy.wordmarkSuffix}</span>
        </span>
      </header>
    </div>
  );
}
