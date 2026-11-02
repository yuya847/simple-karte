// The record as it stands now: the stored history, with today's stops applied and
// today's confirmed orders added.

import type { HistoryEntry, OrderEntry, Patient } from "./types";

export interface SessionChanges {
  added: OrderEntry[];
  stopped: string[];
  /** Clock time each of today's stops was confirmed ("HH:MM"). */
  stopTimes?: Record<string, string>;
}

export function currentEntries(patient: Patient, changes?: SessionChanges): HistoryEntry[] {
  if (!changes) return patient.history;
  const stopped = new Set(changes.stopped);
  const stopOf = (e: OrderEntry): OrderEntry => ({ ...e, status: "中止", stoppedOn: 0, stoppedTime: changes.stopTimes?.[e.id] });
  const base = patient.history.map((e) => (e.kind === "order" && stopped.has(e.id) ? stopOf(e) : e));
  // An order confirmed earlier today can be stopped later today too.
  return [...base, ...changes.added.map((e) => (stopped.has(e.id) ? stopOf(e) : e))];
}

export const ordersOf = (entries: HistoryEntry[]) => entries.filter((e): e is OrderEntry => e.kind === "order");
