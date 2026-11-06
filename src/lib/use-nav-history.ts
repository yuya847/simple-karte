"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 戻る for the app installed from Chrome (no browser buttons): every change of the screen (place, ward tab, the chart
 * or list in front) is remembered, and 戻る puts the previous one back. The browser's own back (a gesture, the
 * Android back key) does the same through the history entries pushed here.
 */
export function useNavHistory<T>(current: T, apply: (t: T) => void, limit = 50) {
  const key = JSON.stringify(current);
  const stack = useRef<T[]>([]);
  const prev = useRef<{ key: string; value: T } | null>(null);
  const goingBack = useRef(false);
  const applyRef = useRef(apply);
  const [depth, setDepth] = useState(0);
  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(() => {
    const last = prev.current;
    prev.current = { key, value: current };
    if (!last || last.key === key) return;
    if (goingBack.current) {
      goingBack.current = false;
      return;
    }
    stack.current = [...stack.current, last.value].slice(-limit);
    setDepth(stack.current.length);
    try {
      window.history.pushState({ simpleKarte: stack.current.length }, "");
    } catch {
      // A browser that refuses: the in-app button still works.
    }
    // `current` is read through `key` (its JSON); the effect runs only when the screen changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, limit]);
  const back = () => {
    const to = stack.current.at(-1);
    if (to === undefined) return;
    stack.current = stack.current.slice(0, -1);
    setDepth(stack.current.length);
    goingBack.current = true;
    applyRef.current(to);
  };
  const backRef = useRef(back);
  useEffect(() => {
    backRef.current = back;
  });
  useEffect(() => {
    const onPop = () => backRef.current();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return {
    canBack: depth > 0,
    /** The in-app button: one step of the browser history, so its own back and this stay in step. */
    back: () => {
      if (!stack.current.length) return;
      try {
        window.history.back();
      } catch {
        back();
      }
    },
  };
}
