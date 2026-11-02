// The record as it stands now: the stored history, with today's stops applied and
// today's confirmed orders added.

import type { HistoryEntry, OrderEntry, Patient } from "./types";

export interface SessionChanges {
  added: OrderEntry[];
  stopped: string[];
}

export function currentEntries(patient: Patient, changes?: SessionChanges): HistoryEntry[] {
  if (!changes) return patient.history;
  const stopped = new Set(changes.stopped);
  const base = patient.history.map((e) => (e.kind === "order" && stopped.has(e.id) ? { ...e, status: "中止" as const, stoppedOn: 0 } : e));
  return [...base, ...changes.added];
}

export const ordersOf = (entries: HistoryEntry[]) => entries.filter((e): e is OrderEntry => e.kind === "order");
