// One polite live region for the whole console (README §6.1): phase changes, run results, "Copied".
// Never every log row.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const AnnounceContext = createContext<(message: string) => void>(() => {});

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  const announce = useCallback((next: string) => {
    // Clear first so the same text twice ("Copied", "Copied") is announced twice.
    setMessage("");
    clearTimeout(pending.current);
    pending.current = setTimeout(() => setMessage(next), 40);
  }, []);
  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">{message}</div>
    </AnnounceContext.Provider>
  );
}

export const useAnnounce = () => useContext(AnnounceContext);
