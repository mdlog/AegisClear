// Light / Dark / System (DESIGN_BRIEF §4). The choice is a UI preference in localStorage, wrapped in try/catch.
import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
const KEY = "aegis-theme";
export const NEXT_THEME: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" };

function stored(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(stored);
  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") delete root.dataset.theme;
    else root.dataset.theme = mode;
    try {
      if (mode === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch {
      /* storage unavailable (private window, blocked site data) */
    }
  }, [mode]);
  return [mode, setMode];
}
