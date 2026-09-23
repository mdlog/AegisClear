// Follow-live (LAYOUT_SPEC run view): keep the act being played in view as steps arrive, until the operator scrolls
// up; from then on the tape stays put and a "Jump to live" control brings it back. Motion honours reduced motion.
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { isTyping } from "@/app/shortcuts";

const reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function useFollowLive(active: boolean, tick: number) {
  const [following, setFollowing] = useState(true);

  // Listening starts with the commit (a layout effect), so a scroll right after the tape appears is never missed.
  useLayoutEffect(() => {
    if (!active) return;
    const stop = () => setFollowing(false);
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) stop();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "PageUp" || e.key === "ArrowUp" || e.key === "Home") && !isTyping(e.target)) stop();
    };
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      if ((e.touches[0]?.clientY ?? 0) - startY > 12) stop(); // the finger drags down: the page scrolls up
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [active]);

  const scrollToLive = useCallback((smooth: boolean) => {
    const act = document.querySelector<HTMLElement>("[data-live-act]");
    act?.scrollIntoView?.({ block: "nearest", behavior: smooth && !reducedMotion() ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (active && following) scrollToLive(true);
  }, [active, following, tick, scrollToLive]);

  return {
    following,
    jump: () => {
      setFollowing(true);
      scrollToLive(false);
    },
  };
}
