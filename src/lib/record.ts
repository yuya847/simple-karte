// The record as it stands now: the stored history, with today's stops applied and
// today's confirmed orders added.

import { noteKey } from "./notes";
import type { HistoryEntry, NoteEntry, OrderEntry, Patient } from "./types";

export interface SessionChanges {
  added: OrderEntry[];
  stopped: string[];
  /** Clock time each of today's stops was confirmed ("HH:MM"). */
  stopTimes?: Record<string, string>;
  /** Notes confirmed in this session. */
  notes?: NoteEntry[];
  /** Corrected notes by their key; they replace the note in place (earlier versions inside). */
  revised?: Record<string, NoteEntry>;
  /** 延長 confirmed in this session: order id → its new 日数. */
  extended?: Record<string, number>;
}

export function currentEntries(patient: Patient, changes?: SessionChanges): HistoryEntry[] {
  if (!changes) return patient.history;
  const stopped = new Set(changes.stopped);
  const stopOf = (e: OrderEntry): OrderEntry => ({ ...e, status: "中止", stoppedOn: 0, stoppedTime: changes.stopTimes?.[e.id] });
  const revised = changes.revised ?? {};
  const extended = changes.extended ?? {};
  const ext = (e: OrderEntry): OrderEntry => (extended[e.id] !== undefined ? ({ ...e, order: { ...e.order, days: extended[e.id] } } as OrderEntry) : e);
  const note = (e: NoteEntry) => revised[noteKey(e)] ?? e;
  const base = patient.history.map((e) => (e.kind === "order" ? (stopped.has(e.id) ? stopOf(ext(e)) : ext(e)) : e.kind === "note" ? note(e) : e));
  // An order confirmed earlier today can be stopped (or extended) later today too.
  return [...base, ...(changes.notes ?? []).map(note), ...changes.added.map((e) => (stopped.has(e.id) ? stopOf(ext(e)) : ext(e)))];
}

export const ordersOf = (entries: HistoryEntry[]) => entries.filter((e): e is OrderEntry => e.kind === "order");
