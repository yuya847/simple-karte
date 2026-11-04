"use client";

// 「受け持ちを目立たせる」 on the patient list and the ward map: on (the default), the viewer's own team stands
// out and the other patients are shown in gray; off, every patient is shown the same way. A per-viewer
// convenience kept in this browser only (both screens share it); the screens work without it.

import { useSyncExternalStore } from "react";

const KEY = "simple-karte:emphasize-team";
const listeners = new Set<() => void>();
let current: boolean | null = null;

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    // Storage blocked: the team stays emphasized until turned off.
    return true;
  }
}
const get = () => (current ??= read());
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

export function useEmphasizeTeam(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, get, () => true);
  const set = (next: boolean) => {
    current = next;
    try {
      window.localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      // Storage blocked: the choice lasts until the page is closed.
    }
    listeners.forEach((f) => f());
  };
  return [on, set];
}
