// Lab values on the flow sheet (経過表): the analytes a person chose, each value at the time of its draw,
// marked H or L against the reference range in the master (共用基準範囲・SRL), and the draws without a
// result yet (採取待ち・検査中) or still ahead (予定). A result the laboratory confirms appears by itself,
// because it is part of the patient's results. Nothing is judged here.

import { abs } from "./flowsheet";
import { entryPlan, flagOf, type Flag } from "./lab-desk";
import type { PendingDraw } from "./lab-table";
import { rangeText } from "./lab-table";
import { ANALYTES, type Analyte } from "./master";
import type { DayOffset, LabResult, OrderEntry, Sex } from "./types";

/** Shown until a person chooses others (架空の病院の取り決め). */
export const DEFAULT_FLOW_ANALYTES = ["WBC", "CRP", "Hb", "Cre", "K"];

export type LabMark =
  | { kind: "value"; at: number; value: number; flag: Flag; title: string }
  | { kind: "pending"; at: number; status: PendingDraw["status"] | "予定"; title: string };

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export const labValueText = (a: Analyte, v: number) => (a.code === "WBC" ? Math.round(v).toLocaleString("ja-JP") : String(v));

/**
 * Every mark of one analyte: its values, the draws waiting for a result, and the draws ordered for later
 * (lab orders whose time is ahead), oldest first.
 */
export function labMarks(a: Analyte, labs: LabResult[], pending: PendingDraw[], entries: OrderEntry[], sex: Sex, nowAbs: number): LabMark[] {
  const range = `基準範囲 ${rangeText(a, sex)}${a.unit ? ` ${a.unit}` : ""}（${a.source ?? "—"}）`;
  const out: LabMark[] = [];
  for (const l of labs) {
    const v = l.values[a.code];
    if (v === undefined) continue;
    const flag = flagOf(a, sex, v);
    out.push({ kind: "value", at: abs(l.day, l.time), value: v, flag, title: `${a.name} ${labValueText(a, v)}${a.unit ? ` ${a.unit}` : ""}${flag ? `（${flag}）` : ""}　採取 ${l.time}${l.corrected ? `　訂正（第${l.corrected.version}版）` : ""}\n${range}` });
  }
  for (const d of pending) if (d.analytes.includes(a.code)) out.push({ kind: "pending", at: d.at, status: d.status, title: `${a.name}：${d.status}（${hhmm(d.at)} の${d.urgent ? "至急の" : ""}採血 ${d.tests}）` });
  for (const e of entries) {
    if (e.order.type !== "lab" || e.status === "中止") continue;
    const at = abs(e.order.collect.day, e.order.collect.time);
    if (at <= nowAbs || out.some((m) => m.at === at)) continue;
    if (!entryPlan(e.order.codes).analytes.some((x) => x.code === a.code)) continue;
    out.push({ kind: "pending", at, status: "予定", title: `${a.name}：採血の予定（${hhmm(at)}${e.order.priority === "至急" ? "・至急" : ""}）` });
  }
  return out.sort((x, y) => x.at - y.at);
}

export interface LabDayCell {
  /** The last value of the day, or the mark of a draw without a result. */
  mark: LabMark;
  /** More draws the same day (shown as +n; all of them on touch). */
  more: number;
  title: string;
}

/** One cell per day: the day's last value (or the waiting draw), with the others on touch. */
export function labDayCell(marks: LabMark[], day: DayOffset): LabDayCell | null {
  const mine = marks.filter((m) => Math.floor(m.at / 1440) === day);
  if (!mine.length) return null;
  const values = mine.filter((m) => m.kind === "value");
  const mark = values.at(-1) ?? mine.at(-1)!;
  return { mark, more: mine.length - 1, title: mine.map((m) => m.title).join("\n") };
}

export const findAnalyte = (code: string) => ANALYTES.find((a) => a.code === code);

/** The analytes to choose from: those this patient has values for first, then the rest of the master. */
export function analyteChoices(labs: LabResult[]): { mine: Analyte[]; others: Analyte[] } {
  const has = new Set(labs.flatMap((l) => Object.keys(l.values)));
  return { mine: ANALYTES.filter((a) => has.has(a.code)), others: ANALYTES.filter((a) => !has.has(a.code)) };
}
