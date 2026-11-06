"use client";

import { displayText } from "@/lib/display-text";
import { RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const READY = 64;

type State = "idle" | "pulling" | "ready" | "refreshing" | "blocked";

/** Whether every scrolling box from the touched element up is at its top (so a pull down is not a scroll). */
function atTop(el: Element | null): boolean {
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    const oy = getComputedStyle(e).overflowY;
    if ((oy === "auto" || oy === "scroll") && e.scrollHeight > e.clientHeight + 1 && e.scrollTop > 0) return false;
  }
  return true;
}

/**
 * 引っ張って更新 (iPad): pulling the screen down from the top reloads the page, after saving the records
 * first. When the records are not kept (no workspace, or the last save failed), it says so and does not
 * reload, since reloading would lose what was entered. Not on text fields, drawing areas or images.
 */
export function PullToRefresh({ refresh, blocked }: { refresh: () => Promise<void>; blocked: string | null }) {
  const [pull, setPull] = useState(0);
  const [state, setState] = useState<State>("idle");
  const live = useRef({ refresh, blocked });
  useEffect(() => {
    live.current = { refresh, blocked };
  });

  useEffect(() => {
    let active = false;
    let startY = 0;
    let startX = 0;
    let dist = 0;
    const reset = () => {
      dist = 0;
      setPull(0);
      setState((s) => (s === "refreshing" || s === "blocked" ? s : "idle"));
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.target as Element;
      if (t.closest("input, textarea, select, canvas, video, [contenteditable=true], [data-no-pull]") || !atTop(t)) return;
      active = true;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (dy <= 0 || dx > dy) {
        if (dist === 0) active = false;
        else reset();
        return;
      }
      dist = Math.min(120, dy * 0.5);
      setPull(dist);
      setState(dist >= READY ? "ready" : "pulling");
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      if (dist < READY) return reset();
      const { refresh: go, blocked: why } = live.current;
      setPull(READY);
      if (why) {
        setState("blocked");
        window.setTimeout(() => (setState("idle"), setPull(0)), 3500);
        return;
      }
      setState("refreshing");
      go().catch(() => {
        setState("blocked");
        window.setTimeout(() => (setState("idle"), setPull(0)), 3500);
      });
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", reset);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, []);

  if (state === "idle" && pull === 0) return null;
  const text = state === "refreshing" ? "記録を保存して更新しています…" : state === "blocked" ? (blocked ?? "記録を保存できなかったので、更新しませんでした") : state === "ready" ? "離すと更新" : "引っ張って更新";
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center print:hidden" style={{ transform: `translateY(${Math.max(0, pull - 16)}px)`, transition: state === "pulling" || state === "ready" ? "none" : "transform 0.2s" }}>
      <div className={`flex max-w-[90vw] items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-md ${state === "blocked" ? "border-yamabuki bg-yamabuki-soft text-ink" : "border-rule bg-sheet text-ink-soft"}`}>
        <RotateCw size={16} className={state === "refreshing" ? "animate-spin text-ai" : state === "ready" ? "text-ai" : "text-ink-faint"} style={state === "refreshing" ? undefined : { transform: `rotate(${pull * 3}deg)` }} />
        {displayText(text)}
      </div>
    </div>
  );
}
