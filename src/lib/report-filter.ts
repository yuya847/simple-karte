// レポート一覧の絞り込み: the kind (画像・生理・内視鏡・細菌培養・病理), 未読だけ, the period (すべて・入院中・7日) and
// words typed (見出し・本文・報告医; ひらがな・カタカナ・全角半角 are matched alike by kana.ts searchKey). Only which rows
// are shown changes here; nothing is decided about a report. The choice (not the words) is a per-person convenience kept
// in this browser, so it stays when the patient changes; the list works without it.

import { searchKey } from "./kana";
import { KIND_LABEL, REPORT_KINDS, unreadReports, type Report, type ReportKind } from "./reports";
import type { Ack } from "./results";
import type { DayOffset } from "./types";

export type ReportPeriod = "すべて" | "入院中" | "7日";
export const REPORT_PERIODS: readonly ReportPeriod[] = ["すべて", "入院中", "7日"];

export interface ReportFilter {
  /** null: every kind. */
  kind: ReportKind | null;
  unread: boolean;
  period: ReportPeriod;
  /** Words typed (all of them must be found). */
  q: string;
}

export const NO_REPORT_FILTER: ReportFilter = { kind: null, unread: false, period: "すべて", q: "" };

/** Whether anything narrows the list. */
export const isFiltered = (f: ReportFilter) => f.kind !== null || f.unread || f.period !== "すべて" || f.q.trim() !== "";

/** The text a search looks through: the kind, the title, the part, who reported it, the step, the body and the drugs of a susceptibility table. */
export function reportText(r: Report): string {
  return [
    KIND_LABEL[r.kind],
    r.title,
    r.region ?? "",
    r.by,
    r.stage ?? "",
    ...r.sections.flatMap((s) => [s.label, s.text]),
    ...(r.susceptibility ?? []).map((s) => `${s.drug} ${s.result} ${s.mic}`),
  ].join("\n");
}

/** Whether every word typed is in the report (however it was typed: かな・カナ・全角・半角・大小). */
export function matchesWords(r: Report, q: string): boolean {
  const words = q.trim().split(/\s+/).filter(Boolean).map(searchKey).filter(Boolean);
  if (words.length === 0) return true;
  const text = searchKey(reportText(r));
  return words.every((w) => text.includes(w));
}

/** Whether a report falls in the period, by the day it was reported (入院中: from the admission day; 7日: today and the six days before). */
export function inPeriod(r: Pick<Report, "at">, period: ReportPeriod, admittedOn?: DayOffset): boolean {
  if (period === "7日") return r.at.day >= -6;
  if (period === "入院中") return admittedOn === undefined || r.at.day >= admittedOn;
  return true;
}

interface Context {
  acks: Record<string, Ack>;
  /** The admission day (入院中); without it (a visit) the period is not narrowed by it. */
  admittedOn?: DayOffset;
}

/** The reports the filter keeps, in the order given. */
export function filterReports(reports: readonly Report[], f: ReportFilter, ctx: Context): Report[] {
  const unread = f.unread ? new Set(unreadReports(reports, ctx.acks).map((r) => r.key)) : null;
  return reports.filter((r) => (f.kind === null || r.kind === f.kind) && (!unread || unread.has(r.key)) && inPeriod(r, f.period, ctx.admittedOn) && matchesWords(r, f.q));
}

export interface KindCount {
  kind: ReportKind | null;
  label: string;
  /** How many the list shows with this kind chosen (the other conditions kept). */
  count: number;
}

/**
 * The kind chips: すべて, then each kind the patient has a report of (a kind with none is left out, unless it is the one
 * chosen). The numbers follow the other conditions (未読だけ・期間・検索), so a chip says how many it would show.
 */
export function kindCounts(reports: readonly Report[], f: ReportFilter, ctx: Context): KindCount[] {
  const rest = filterReports(reports, { ...f, kind: null }, ctx);
  const has = new Set(reports.map((r) => r.kind));
  return [
    { kind: null, label: "すべて", count: rest.length },
    ...REPORT_KINDS.filter((k) => has.has(k) || f.kind === k).map((k) => ({ kind: k, label: KIND_LABEL[k], count: rest.filter((r) => r.kind === k).length })),
  ];
}

// ---------------------------------------------------------------------------
// Kept in this browser (per person): the kind, 未読だけ and the period
// ---------------------------------------------------------------------------

const keyOf = (person: string) => `simple-karte:report-filter:${person}`;

/** Make saved (or broken) data a valid filter; anything unknown falls back to no filter. The words are not kept. */
export function normalizeReportFilter(raw: unknown): ReportFilter {
  if (!raw || typeof raw !== "object") return NO_REPORT_FILTER;
  const o = raw as { kind?: unknown; unread?: unknown; period?: unknown };
  return {
    kind: REPORT_KINDS.find((k) => k === o.kind) ?? null,
    unread: o.unread === true,
    period: REPORT_PERIODS.find((p) => p === o.period) ?? "すべて",
    q: "",
  };
}

export function loadReportFilter(person: string): ReportFilter {
  try {
    const raw = window.localStorage.getItem(keyOf(person));
    return raw ? normalizeReportFilter(JSON.parse(raw)) : NO_REPORT_FILTER;
  } catch {
    return NO_REPORT_FILTER;
  }
}

export function saveReportFilter(person: string, f: ReportFilter) {
  try {
    window.localStorage.setItem(keyOf(person), JSON.stringify({ kind: f.kind, unread: f.unread, period: f.period }));
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
}
