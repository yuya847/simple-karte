import { labNumber } from "./lab-number";
// 検査結果の時系列表: the columns (one per draw, results and draws not yet reported), the rows (one per
// analyte), and the same table as text to paste into a note or as CSV (comma-separated values) for a
// spreadsheet. Values are shown and marked H/L against the reference range; nothing is judged.

import { addDays, type CalendarDate } from "./dates";
import { abs } from "./flowsheet";
import { entryPlan, flagOf, type DrawRow, type Flag } from "./lab-desk";
import { ANALYTES, rangeFor, type Analyte } from "./master";
import type { DayOffset, LabResult, Sex } from "./types";

/** A draw ordered for this patient that has no result yet. */
export interface PendingDraw {
  /** Scheduled draw time (minutes from today 00:00). */
  at: number;
  /** 採取待ち: not drawn yet. 検査中: drawn or taken in by the laboratory. */
  status: "採取待ち" | "検査中";
  /** Analyte codes the draw will report. */
  analytes: string[];
  tests: string;
  urgent: boolean;
}

export type LabColumn =
  | { key: string; kind: "result"; at: number; day: DayOffset; time: string; lab: LabResult }
  | { key: string; kind: "pending"; at: number; day: DayOffset; time: string; draw: PendingDraw };

export type Order = "旧→新" | "新→旧";
export const PERIODS = [
  { key: "all", label: "すべて", days: null },
  { key: "7", label: "直近7日", days: 7 },
  { key: "3", label: "直近3日", days: 3 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Columns in time order (or newest first), from `sinceDay` on when a period is chosen. */
export function labColumns(labs: LabResult[], pending: PendingDraw[], order: Order, sinceDay: DayOffset | null): LabColumn[] {
  const cols: LabColumn[] = [
    ...labs.map((lab, i): LabColumn => ({ key: `r-${lab.day}-${lab.time}-${lab.id ?? i}`, kind: "result", at: abs(lab.day, lab.time), day: lab.day, time: lab.time, lab })),
    ...pending.map((draw, i): LabColumn => ({ key: `p-${draw.at}-${i}`, kind: "pending", at: draw.at, day: Math.floor(draw.at / 1440), time: hhmm(draw.at), draw })),
  ].filter((c) => sinceDay === null || c.day >= sinceDay);
  cols.sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === "result" ? -1 : 1));
  return order === "新→旧" ? cols.reverse() : cols;
}

export type Cell = { kind: "value"; value: number; flag: Flag } | { kind: "pending"; status: PendingDraw["status"] } | { kind: "none" };

export function cellOf(col: LabColumn, a: Analyte, sex: Sex): Cell {
  if (col.kind === "pending") return col.draw.analytes.includes(a.code) ? { kind: "pending", status: col.draw.status } : { kind: "none" };
  const v = col.lab.values[a.code];
  return v === undefined ? { kind: "none" } : { kind: "value", value: v, flag: flagOf(a, sex, v) };
}

/** Analytes that have a value or a pending draw in these columns; with `abnormalOnly`, only those with an H or L. */
export function labRows(cols: LabColumn[], sex: Sex, abnormalOnly: boolean): Analyte[] {
  return ANALYTES.filter((a) => {
    const cells = cols.map((c) => cellOf(c, a, sex));
    if (!cells.some((c) => c.kind !== "none")) return false;
    return !abnormalOnly || cells.some((c) => c.kind === "value" && c.flag !== "");
  });
}

export function rangeText(a: Analyte, sex: Sex): string {
  const rg = rangeFor(a, sex);
  return rg.low !== undefined && rg.high !== undefined ? `${rg.low}〜${rg.high}` : rg.high !== undefined ? `${rg.high}以下` : rg.low !== undefined ? `${rg.low}以上` : "—";
}


const dateOf = (today: CalendarDate, day: DayOffset) => {
  const d = addDays(today, day);
  return `${d.m}/${d.d}`;
};

/**
 * Chosen result columns as lines to paste into a note (O), oldest first:
 * "11/4 06:00 WBC 12,050H Hb 9.3L CRP 16.86H". Draws without results are left out.
 */
export function copyText(cols: LabColumn[], rows: Analyte[], sex: Sex, today: CalendarDate): string {
  return cols
    .filter((c): c is Extract<LabColumn, { kind: "result" }> => c.kind === "result")
    .sort((a, b) => a.at - b.at)
    .map((c) => {
      const parts = rows.flatMap((a) => {
        const cell = cellOf(c, a, sex);
        return cell.kind === "value" ? [`${a.name} ${labNumber(a.code, cell.value)}${cell.flag}`] : [];
      });
      return parts.length ? `${dateOf(today, c.day)} ${c.time} ${parts.join(" ")}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** The table as CSV for Excel: a BOM so Japanese opens correctly, every field quoted, quotes doubled. */
export function labCsv(cols: LabColumn[], rows: Analyte[], sex: Sex, today: CalendarDate): string {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = ["項目", "単位", "基準範囲", ...cols.map((c) => `${dateOf(today, c.day)} ${c.time}${c.kind === "pending" ? `（${c.draw.status}）` : ""}`)];
  const body = rows.map((a) => [
    a.name,
    a.unit,
    rangeText(a, sex),
    ...cols.map((c) => {
      const x = cellOf(c, a, sex);
      return x.kind === "value" ? `${x.value}${x.flag ? ` ${x.flag}` : ""}` : x.kind === "pending" ? x.status : "";
    }),
  ]);
  return "﻿" + [head, ...body].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Points of one analyte over time (results only, oldest first) for the trend graph. */
export function trendOf(labs: LabResult[], code: string): { at: number; day: DayOffset; time: string; value: number }[] {
  return labs
    .filter((l) => code in l.values)
    .map((l) => ({ at: abs(l.day, l.time), day: l.day, time: l.time, value: l.values[code] }))
    .sort((a, b) => a.at - b.at);
}

/**
 * This patient's draws without a result, from the laboratory's list: 検査中 once drawn or taken in,
 * 採取待ち when the scheduled time has passed with no draw recorded. Draws later today or tomorrow
 * are not shown; draws not taken (採取しなかった) or sent back (再採血, the new draw is its own row) neither.
 */
export function pendingDraws(rows: DrawRow[], patientId: string, nowAbs: number): PendingDraw[] {
  return rows
    .filter((r) => r.patientId === patientId && !r.fromRecord && (r.status === "採取済み" || r.status === "受付済み" || (r.status === "未採取" && r.at <= nowAbs)))
    .map((r) => ({ at: r.at, status: r.status === "未採取" ? ("採取待ち" as const) : ("検査中" as const), analytes: entryPlan(r.codes).analytes.map((a) => a.code), tests: r.tests, urgent: r.urgent }))
    .filter((d) => d.analytes.length > 0);
}
