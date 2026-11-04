// The access log (アクセスログ): who opened which chart and when, taken from the audit log. Narrowed by
// patient, person and day, with opens of limited charts (閲覧制限) marked, and written out as CSV.

import type { AuditEvent } from "./audit";
import { csvOf } from "./extract";

/** An event of opening a chart or a visit, or of the 閲覧制限 step. */
export const isChartOpen = (e: AuditEvent): boolean => e.action === "カルテを開いた" || e.action === "受診の画面を開いた" || e.action.startsWith("閲覧制限の患者を");

/** About a limited chart (opened on the care team, with a reason, or turned back). */
export const isRestricted = (e: AuditEvent): boolean => !!e.restricted || e.action.startsWith("閲覧制限の患者を");

/** Opened from outside the care team (with a reason): the ones to look at first. */
export const isBreakGlass = (e: AuditEvent): boolean => e.action.startsWith("閲覧制限の患者を開いた");

export interface AccessQuery {
  /** "" = everyone. */
  patient: string;
  actor: string;
  /** "YYYY-MM-DD", "" = every day. */
  date: string;
  onlyRestricted: boolean;
}

export const emptyAccessQuery = (): AccessQuery => ({ patient: "", actor: "", date: "", onlyRestricted: false });

/** The chart-open events that match, newest first. */
export function accessRows(events: AuditEvent[], q: AccessQuery): AuditEvent[] {
  return events
    .filter((e) => isChartOpen(e) && (!q.patient || e.patient === q.patient) && (!q.actor || e.actor === q.actor) && (!q.date || e.date === q.date) && (!q.onlyRestricted || isRestricted(e)))
    .toReversed();
}

/** What can be chosen in the filters (from the events there are). */
export function accessChoices(events: AuditEvent[]): { patients: string[]; actors: string[]; dates: string[] } {
  const opens = events.filter(isChartOpen);
  const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "ja"));
  return { patients: uniq(opens.map((e) => e.patient)), actors: uniq(opens.map((e) => e.actor)), dates: uniq(opens.map((e) => e.date)).reverse() };
}

export const ACCESS_COLUMNS = ["番号", "日付", "時刻", "職種", "誰が", "何を", "患者", "内容", "閲覧制限"];

/** A cell that a spreadsheet would read as a formula (=, +, -, @) starts with ' instead. */
const plain = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** The rows as CSV (BOM, every field quoted), oldest first as in a log. */
export function accessCsv(rows: AuditEvent[]): string {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  return csvOf(
    ACCESS_COLUMNS,
    sorted.map((e) => [e.seq, e.date ?? "", e.at, e.role, plain(e.actor), plain(e.action), plain(e.patient ?? ""), plain(e.detail ?? ""), isBreakGlass(e) ? "理由を残して開いた" : isRestricted(e) ? "閲覧制限の患者" : ""]),
  );
}
