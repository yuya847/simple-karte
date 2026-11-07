"use client";

import { useSyncExternalStore } from "react";
import type { Shift } from "./worksheet";

export interface WorksheetSelection { day: -1 | 0 | 1; shift: Shift }
const choices = new Map<string, WorksheetSelection | null>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const keyOf = (person: string) => `karte:worksheet:${person}`;
export function validWorksheetSelection(value: unknown): value is WorksheetSelection {
  if (!value || typeof value !== "object") return false;
  const v = value as WorksheetSelection;
  return [-1, 0, 1].includes(v.day) && ["day", "night", "all"].includes(v.shift);
}
function get(person: string) {
  if (!choices.has(person)) {
    let value: unknown;
    try { value = JSON.parse(window.localStorage.getItem(keyOf(person)) ?? "null"); } catch { /* Use the current shift. */ }
    choices.set(person, validWorksheetSelection(value) ? value : null);
  }
  return choices.get(person) ?? null;
}
/** Personal display choice on this terminal, retained when the chart replaces the sheet. */
export function useWorksheetSelection(person: string, fallback: WorksheetSelection): [WorksheetSelection, (value: WorksheetSelection) => void] {
  const selected = useSyncExternalStore(subscribe, () => get(person), () => null);
  const set = (value: WorksheetSelection) => {
    choices.set(person, value);
    try { window.localStorage.setItem(keyOf(person), JSON.stringify(value)); } catch { /* Retain in memory for this visit. */ }
    listeners.forEach(listener => listener());
  };
  return [selected ?? fallback, set];
}
