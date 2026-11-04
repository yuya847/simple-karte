"use client";

// 入院患者一覧の「表示」 (columns and row height) per person, in this browser: a small store over
// list-prefs.ts so every list on the screen follows the same choice.

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LIST_PREFS, loadListPrefs, saveListPrefs, type ListPrefs } from "./list-prefs";
import { useMe } from "@/components/RoleContext";

const cache = new Map<string, ListPrefs>();
const listeners = new Set<() => void>();

function get(person: string): ListPrefs {
  let v = cache.get(person);
  if (!v) {
    v = loadListPrefs(person);
    cache.set(person, v);
  }
  return v;
}
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

/** This person's choice of columns and row height, and a function to change it. */
export function useListPrefs(): [prefs: ListPrefs, set: (p: ListPrefs) => void] {
  const person = useMe().name;
  const prefs = useSyncExternalStore(subscribe, () => get(person), () => DEFAULT_LIST_PREFS);
  const set = useCallback(
    (p: ListPrefs) => {
      cache.set(person, p);
      saveListPrefs(person, p);
      listeners.forEach((f) => f());
    },
    [person],
  );
  return [prefs, set];
}
