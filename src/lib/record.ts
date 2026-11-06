import { replacementBoundaries } from "./order-revisions";
// The record as it stands now: the stored history, with today's stops applied and
// today's confirmed orders added.

import { STAFF } from "./roles";
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
  changes ??= { added: [], stopped: [] };
  const stopped = new Set(changes.stopped);
  const stopOf = (e: OrderEntry): OrderEntry => ({ ...e, status: "中止", stoppedOn: 0, stoppedTime: changes.stopTimes?.[e.id] });
  const revised = changes.revised ?? {};
  const extended = changes.extended ?? {};
  const all = [...patient.history.filter((e): e is OrderEntry => e.kind === "order"), ...changes.added];
  const endings = replacementBoundaries(all);
  const ext = (e: OrderEntry): OrderEntry => {
    const next = endings.get(e.id);
    if (next) return { ...e, status: "中止", stoppedOn: next.day, stoppedTime: next.time };
    return extended[e.id] !== undefined ? { ...e, order: { ...e.order, days: extended[e.id] } } as OrderEntry : e;
  };
  const note = (e: NoteEntry) => revised[noteKey(e)] ?? e;
  const base = patient.history.map((e) => (e.kind === "order" ? ext(stopped.has(e.id) ? stopOf(e) : e) : e.kind === "note" ? note(e) : e));
  // An order confirmed earlier today can be stopped (or extended) later today too.
  return [...base, ...(changes.notes ?? []).map(note), ...changes.added.map((e) => ext(stopped.has(e.id) ? stopOf(e) : e))];
}

export const ordersOf = (entries: HistoryEntry[]) => entries.filter((e): e is OrderEntry => e.kind === "order");

/** 記事に科の項目がないため、記録の属する受診・入院の科を使う。 */
export function recordFacets(e: HistoryEntry, department: string) {
  const staff = Object.values(STAFF).find((s) => s.name === e.author);
  return { department, role: e.kind === "note" ? e.role : staff?.role ?? "医師" };
}

/** 同じ項目内は複数選択のいずれか、科と職種の間は両方を満たす。空は制限なし。 */
export function matchesRecordFacets(e: HistoryEntry, department: string, departments: string[], roles: string[]): boolean {
  const f = recordFacets(e, department);
  return (!departments.length || departments.includes(f.department)) && (!roles.length || roles.includes(f.role));
}

export function recordFacetOptions(records: { entry: HistoryEntry; department: string }[]) {
  const facets = records.map(({ entry, department }) => recordFacets(entry, department));
  return { departments: [...new Set(facets.map((f) => f.department))].sort(), roles: [...new Set(facets.map((f) => f.role))].sort() };
}
