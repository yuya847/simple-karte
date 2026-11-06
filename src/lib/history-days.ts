import { examAt } from "./exams";
import { abs } from "./flowsheet";
import type { DayOffset, HistoryEntry } from "./types";

export type OrderDayMode = "予定日" | "依頼日";

/** 表示する節だけを決める。依頼日時・中止状態は書き換えない。 */
export function entryDayFor(entry: HistoryEntry, mode: OrderDayMode): DayOffset {
  if (entry.kind !== "order" || mode === "依頼日") return entry.day;
  const o = entry.order;
  if (o.type === "lab") return o.collect.day;
  if (o.type === "imaging" || o.type === "physio") return Math.floor(examAt(o, abs(entry.day, entry.time)) / 1440);
  if (o.type === "procedure") {
    if (o.opd) return o.opd.day;
    if (o.leave) return o.leave.from.day;
  }
  return o.start.day;
}
