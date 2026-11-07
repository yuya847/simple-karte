"use client";
// This person's look (設定), shared by the 設定 window and the part that puts it on the page. Kept apart from
// appearance.ts, which the server's layout reads for the script that runs before the first paint.

import { useSyncExternalStore } from "react";
import { loadAppearance, saveAppearance, DEFAULT_APPEARANCE, type Appearance } from "./appearance";

const listeners = new Set<() => void>();
const cache = new Map<string, Appearance>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
function read(person: string): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  const c = cache.get(person);
  if (c) return c;
  const v = loadAppearance(person);
  cache.set(person, v);
  return v;
}

/** This person's look, shared by the 設定 window and the part that puts it on the page. */
export function useAppearance(person: string): [Appearance, (v: Appearance) => void] {
  const snapshot = () => read(person);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  return [
    state,
    (v) => {
      cache.set(person, v);
      saveAppearance(person, v);
      for (const f of listeners) f();
    },
  ];
}
