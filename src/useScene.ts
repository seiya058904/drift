import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type View = "home" | "write" | "found" | "read" | "empty" | "sent" |
  "held" | "about" | "ritual-send" | "ritual-open";

// Business state changes are immediate for rituals; ordinary sheets get an exit.
// One owned animation and generation guard prevent late completions navigating back.
export function useScene(motion: boolean) {
  const [view, setView] = useState<View>("home");
  const [leaving, setLeaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const current = useRef<View>("home");
  const target = useRef<View>("home");
  const animation = useRef<Animation | null>(null);
  const revision = useRef(0);
  const enabled = useRef(motion);
  const arrivingFrom = useRef<View>("home");

  const navigate = useCallback((next: View) => {
    const ticket = ++revision.current;
    animation.current?.cancel();
    target.current = next;
    const commit = () => {
      if (ticket !== revision.current) return;
      arrivingFrom.current = current.current;
      current.current = next;
      setLeaving(false);
      setClosing(false);
      setView(next);
    };
    if (!enabled.current || current.current === "home" ||
      current.current.startsWith("ritual") || next.startsWith("ritual") ||
      current.current === next || !sheet.current) {
      commit();
      return;
    }
    setLeaving(true);
    setClosing(next === "home");
    const exit = sheet.current.animate([
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: `translateY(${next === "home" ? 12 : -6}px)` },
    ], { duration: next === "home" ? 240 : 140, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    animation.current = exit;
    if (document.hidden) exit.pause();
    exit.finished.then(commit, () => {});
  }, []);

  useLayoutEffect(() => {
    enabled.current = motion;
    if (!motion) {
      ++revision.current;
      animation.current?.cancel();
      current.current = target.current;
      setView(target.current);
      setLeaving(false);
      setClosing(false);
    }
  }, [motion]);

  useLayoutEffect(() => {
    animation.current?.cancel();
    if (view !== "home" && !view.startsWith("ritual") &&
      !(view === "read" && arrivingFrom.current === "ritual-open") && enabled.current && sheet.current) {
      animation.current = sheet.current.animate([
        { opacity: 0, transform: "translateY(16px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 380, easing: "cubic-bezier(.16,1,.3,1)" });
      if (document.hidden) animation.current.pause();
    }
  }, [view]);

  useLayoutEffect(() => {
    const generation = revision;
    const visibility = () => {
      const active = animation.current;
      if (!active || active.playState === "finished" || active.playState === "idle") return;
      if (document.hidden) active.pause();
      else active.play();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      ++generation.current;
      animation.current?.cancel();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return { view, navigate, sheet, leaving, closing };
}
