"use client";

// 使い方の説明: the how-to sentences on the screens (marked with the class "hint") are hidden unless the
// viewer turns them on. A per-viewer convenience kept in this browser only; the screens work without it.

import { useEffect, useSyncExternalStore } from "react";

const KEY = "simple-karte:hints";
const listeners = new Set<() => void>();
let current: boolean | null = null;

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    // Storage blocked: the explanations stay hidden until turned on.
    return false;
  }
}
const get = () => (current ??= read());
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

export function useHints(): [boolean, () => void] {
  const on = useSyncExternalStore(subscribe, get, () => false);
  useEffect(() => {
    document.documentElement.dataset.hints = on ? "on" : "off";
  }, [on]);
  const toggle = () => {
    current = !get();
    try {
      window.localStorage.setItem(KEY, current ? "on" : "off");
    } catch {
      // Storage blocked: the choice lasts until the page is closed.
    }
    listeners.forEach((f) => f());
  };
  return [on, toggle];
}
