"use client";

// How a person likes the flow sheet (経過表): which lab values it shows, and later the rows and the scale.
// A per-viewer convenience kept in this browser only, per user name; the sheet works the same without it
// (storage blocked, a private window): it then starts from the defaults each time.

import { useSyncExternalStore } from "react";
import { DEFAULT_FLOW_ANALYTES } from "./flow-labs";

export interface FlowPrefs {
  /** Analyte codes of the lab rows, in order. */
  analytes: string[];
}

export const DEFAULT_FLOW_PREFS: FlowPrefs = { analytes: DEFAULT_FLOW_ANALYTES };

const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined);

/** Read what was kept; anything missing or broken falls back to the default. */
export function parseFlowPrefs(raw: string | null): FlowPrefs {
  if (!raw) return DEFAULT_FLOW_PREFS;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    return { analytes: strings(v.analytes) ?? DEFAULT_FLOW_PREFS.analytes };
  } catch {
    return DEFAULT_FLOW_PREFS;
  }
}

const keyOf = (user: string) => `simple-karte:flowsheet:${user}`;
const cache = new Map<string, FlowPrefs>();
const listeners = new Set<() => void>();

function read(user: string): FlowPrefs {
  const hit = cache.get(user);
  if (hit) return hit;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(keyOf(user));
  } catch {
    // Storage blocked: the defaults.
  }
  const p = parseFlowPrefs(raw);
  cache.set(user, p);
  return p;
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

/** The person's flow sheet settings, and a way to change them (kept in this browser when it can). */
export function useFlowPrefs(user: string): [FlowPrefs, (change: (p: FlowPrefs) => FlowPrefs) => void] {
  const prefs = useSyncExternalStore(subscribe, () => read(user), () => DEFAULT_FLOW_PREFS);
  const set = (change: (p: FlowPrefs) => FlowPrefs) => {
    const next = change(read(user));
    cache.set(user, next);
    try {
      window.localStorage.setItem(keyOf(user), JSON.stringify(next));
    } catch {
      // Storage blocked: the change lasts until the page is closed.
    }
    listeners.forEach((f) => f());
  };
  return [prefs, set];
}
