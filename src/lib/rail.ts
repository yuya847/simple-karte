// 右端ツールのお気に入り: which tools this person pinned (★) and how the rail is shown, kept per person in
// this browser (a convenience only; the chart works without it). A pin is a tool's key, or
// `template:<id>` for one record template (テンプレート) that opens straight into its form.

import { useSyncExternalStore } from "react";

export type RailMode = "icons" | "list";

/** A pinned tool: a panel's key, or a record template by id. */
export type RailPin = string;

export interface RailState {
  mode: RailMode;
  pins: RailPin[];
}

const RAIL_KEY = "simple-karte:tool-rail";
const TEMPLATE_PREFIX = "template:";

export const pinOfTemplate = (id: string): RailPin => `${TEMPLATE_PREFIX}${id}`;
export const isTemplatePin = (p: RailPin) => p.startsWith(TEMPLATE_PREFIX);
/** The template's id from its pin, or null for a tool's pin. */
export const templateIdOf = (p: RailPin): string | null => (isTemplatePin(p) ? p.slice(TEMPLATE_PREFIX.length) : null);

const EMPTY: RailState = { mode: "icons", pins: [] };

export function loadRail(person: string): RailState {
  try {
    const o = JSON.parse(window.localStorage.getItem(`${RAIL_KEY}:${person}`) ?? "null") as { mode?: RailMode; pins?: unknown } | null;
    return { mode: o?.mode === "list" ? "list" : "icons", pins: Array.isArray(o?.pins) ? o!.pins!.filter((p): p is string => typeof p === "string") : [] };
  } catch {
    return EMPTY;
  }
}

const listeners = new Set<() => void>();
const cache = new Map<string, RailState>();

export function saveRail(person: string, v: RailState) {
  cache.set(person, v);
  try {
    window.localStorage.setItem(`${RAIL_KEY}:${person}`, JSON.stringify(v));
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
  for (const f of listeners) f();
}

/** Adds the pin when it is missing, removes it when it is there. */
export const togglePin = (pins: RailPin[], p: RailPin): RailPin[] => (pins.includes(p) ? pins.filter((k) => k !== p) : [...pins, p]);

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

function read(person: string): RailState {
  if (typeof window === "undefined") return EMPTY;
  const c = cache.get(person);
  if (c) return c;
  const v = loadRail(person);
  cache.set(person, v);
  return v;
}

/**
 * The rail's state for this person, shared by every part of the screen that shows or changes the pins
 * (the rail itself and the ★ in the template list). Without a browser (the server) there are no pins;
 * the rail is only ever drawn after login, in the browser.
 */
export function useRail(person: string): [RailState, (v: RailState) => void] {
  const snapshot = () => read(person);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  return [state, (v) => saveRail(person, v)];
}
