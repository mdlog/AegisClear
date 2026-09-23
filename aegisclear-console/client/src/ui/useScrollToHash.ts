// Hash anchors (LAYOUT_SPEC routing rules): scroll to `#id` once the data behind it has rendered.
import { useEffect } from "react";
import { useLocation } from "react-router";

export function useScrollToHash(ready: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    el?.scrollIntoView?.({ block: "start" });
  }, [ready, hash]);
}
