// Single-key shortcuts (LAYOUT_SPEC "Keyboard"; README §1.1 C8). WCAG 2.1.4: they can be turned off, the choice is a
// UI preference in localStorage (try/catch), and they never fire while focus is in a form field or a dialog is open.
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

const KEY = "aegis-shortcuts";
const listeners = new Set<() => void>();

/** Read on every call, so the answer always matches storage (other tabs, tests clearing it). */
export function shortcutsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setShortcutsOn(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    /* storage unavailable: the switch still works until the page reloads */
  }
  listeners.forEach((l) => l());
}

export function useShortcutsOn(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    shortcutsOn,
    () => true,
  );
}

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.getAttribute("role") === "textbox";
}

/** Runs `handler` when `key` is pressed on its own, unless shortcuts are off, a field has focus or a dialog is open. */
export function useShortcut(key: string, handler: () => void, active = true) {
  const latest = useRef(handler);
  // Layout effects run with the commit, so the listener exists as soon as the page it belongs to is on screen.
  useLayoutEffect(() => {
    latest.current = handler;
  });
  useLayoutEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== key || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (!shortcutsOn() || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, active]);
}
