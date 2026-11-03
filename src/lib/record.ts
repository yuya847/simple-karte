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
}

export function currentEntries(patient: Patient, changes?: SessionChanges): HistoryEntry[] {
  if (!changes) return patient.history;
  const stopped = new Set(changes.stopped);
  const stopOf = (e: OrderEntry): OrderEntry => ({ ...e, status: "中止", stoppedOn: 0, stoppedTime: changes.stopTimes?.[e.id] });
  const revised = changes.revised ?? {};
  const note = (e: NoteEntry) => revised[noteKey(e)] ?? e;
  const base = patient.history.map((e) => (e.kind === "order" && stopped.has(e.id) ? stopOf(e) : e.kind === "note" ? note(e) : e));
  // An order confirmed earlier today can be stopped later today too.
  return [...base, ...(changes.notes ?? []).map(note), ...changes.added.map((e) => (stopped.has(e.id) ? stopOf(e) : e))];
}

export const ordersOf = (entries: HistoryEntry[]) => entries.filter((e): e is OrderEntry => e.kind === "order");
