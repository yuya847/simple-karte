"use client";

// The ☆ on the patient list, the patient bar and 「お気に入りの患者」 share one list per person: a small
// store over favorites.ts (this browser only), so a star pressed in one place shows everywhere at once.

import { useCallback, useSyncExternalStore } from "react";
import { loadFavorites, saveFavorites, toggleFavorite } from "./favorites";
import { useMe } from "@/components/RoleContext";

const NONE: string[] = [];
const cache = new Map<string, string[]>();
const listeners = new Set<() => void>();

function get(person: string): string[] {
  let v = cache.get(person);
  if (!v) {
    v = loadFavorites(person);
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

/** This person's starred patients, and a function to star or unstar one. */
export function useFavorites(): [ids: string[], toggle: (id: string) => void] {
  const person = useMe().name;
  const ids = useSyncExternalStore(subscribe, () => get(person), () => NONE);
  const toggle = useCallback(
    (id: string) => {
      const next = toggleFavorite(get(person), id);
      cache.set(person, next);
      saveFavorites(person, next);
      listeners.forEach((f) => f());
    },
    [person],
  );
  return [ids, toggle];
}
