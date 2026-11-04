// 依頼日と実施日: an order is written on one day (依頼日, the entry's day) and carried out on another (実施日:
// the draw, the exam slot, the start of a drip, the clinic visit, the move …). This file turns the orders into
// the things planned on each day, so the record can show them on the day they happen and the date tree can list
// the days ahead that have something planned. A drug given every day is not listed every day — only its start,
// its end (and a stop); the daily doses are the calendars' and the flow sheet's.
// Nothing here is decided by AI: the days and times come from the orders.

import { abs } from "./flowsheet";
import { examAt } from "./exams";
import { labName, oralName, orderLines, procedureTitle } from "./format";
import { WARD_RULES } from "./master";
import type { DayOffset, HistoryEntry, OrderEntry } from "./types";

export type PlanKind = "予約" | "検体検査" | "画像" | "注射" | "内服" | "処置" | "外来予約" | "移動" | "退院";

/** One thing planned on a day: what happens (採取・撮影・開始・終了・受診 …) to which order. */
export interface PlanItem {
  kind: PlanKind;
  day: DayOffset;
  /** "HH:MM" when the time is fixed. */
  time?: string;
  /** The word of what happens that day: 採取・撮影・検査・開始・終了・最終日・実施・受診・転棟・退院・中止・手術 … */
  verb: string;
  label: string;
  /** The order's id (an operation from the OR list has "sx:<id>" and no card in the record). */
  orderId: string;
  /** The day the order was written; null for something that is not an order of the record (an operation). */
  orderedOn: DayOffset | null;
}

/** An operation of the OR list, planned for this patient. */
export interface PlannedSurgery {
  id: string;
  day: number;
  start: string | null;
  procedure: string;
  status?: string;
}

/** How far ahead the record and the tree look. */
export const PLAN_HORIZON_DAYS = 90;

// Lines of the record only need the title; the day is shown apart from it.
const todayStub = { y: 2000, m: 1, d: 1 };
const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
/** The last day an interval [from, to) touches. */
const lastDayOf = (to: number) => Math.floor((to - 1) / 1440);

/** The 中止 of an order as a plan item (when the day of the stop is known), and the minute it stopped. */
function stopOf(e: OrderEntry, kind: PlanKind, label: string): { item: PlanItem; at: number } | null {
  if (e.status !== "中止" || e.stoppedOn === undefined) return null;
  const at = e.stoppedTime ? abs(e.stoppedOn, e.stoppedTime) : (e.stoppedOn + 1) * 1440;
  return { item: { kind, day: e.stoppedOn, time: e.stoppedTime, verb: "中止", label, orderId: e.id, orderedOn: e.day }, at };
}

/** What one order plans: usually one item (採取・撮影・受診 …), two for a course (開始 and 終了), plus a 中止. */
export function planItemsOf(e: OrderEntry): PlanItem[] {
  const o = e.order;
  const base = { orderId: e.id, orderedOn: e.day };
  const cancelled = e.status === "中止";
  // One-off things (a draw, an exam, a visit, a move …) that were cancelled will not happen: nothing is planned.
  const oneOff = o.type === "lab" || o.type === "imaging" || o.type === "physio" || (o.type === "procedure" && !!(o.opd || o.leave || o.move || o.hd || o.tx || o.consult || o.rehab));
  if (cancelled && oneOff) return [];
  if (o.type === "lab") {
    return [{ ...base, kind: "検体検査", day: o.collect.day, time: o.collect.time, verb: "採取", label: o.codes.map(labName).join("、") }];
  }
  if (o.type === "imaging" || o.type === "physio") {
    const at = examAt(o, abs(e.day, e.time));
    const timed = !!o.when.time || o.when.priority === "至急";
    return [{ ...base, kind: o.type === "imaging" ? "画像" : "予約", day: Math.floor(at / 1440), time: timed ? hhmm(at) : undefined, verb: o.type === "imaging" ? "撮影" : "検査", label: orderLines(o, todayStub).main }];
  }
  if (o.type === "injection") {
    const label = orderLines(o, todayStub).main;
    const from = abs(o.start.day, o.start.time ?? e.time);
    const stop = stopOf(e, "注射", label);
    if (stop && stop.at <= from) return [stop.item];
    const out: PlanItem[] = [{ ...base, kind: "注射", day: o.start.day, time: o.start.time ?? e.time, verb: o.schedule.kind === "once" ? "実施" : "開始", label }];
    if (o.days && o.schedule.kind !== "once") {
      const to = from + o.days * 1440;
      if (!stop || stop.at >= to) out.push({ ...base, kind: "注射", day: lastDayOf(to), verb: "終了", label });
    }
    if (stop) out.push(stop.item);
    return out;
  }
  if (o.type === "prescription") {
    // 退院時処方 is taken at home: its start and last day are not days of the ward's record.
    if (o.category === "退院時") return [];
    const label = `${oralName(o.drugCode)}　1回${o.amount}${o.unit}`;
    const stop = stopOf(e, "内服", label);
    if (stop && stop.item.day < o.start.day) return [stop.item];
    const out: PlanItem[] = [{ ...base, kind: "内服", day: o.start.day, time: o.start.timing ? WARD_RULES.medTimes[o.start.timing] : undefined, verb: o.timings.length === 0 ? "頓用の開始" : "服用開始", label }];
    if (o.days && o.timings.length > 0) {
      const last = o.start.day + o.days - 1;
      if (!stop || stop.item.day > last) out.push({ ...base, kind: "内服", day: last, verb: "最終日", label });
    }
    if (stop) out.push(stop.item);
    return out;
  }
  // procedure
  if (o.opd) {
    const b = o.opd;
    const label = `${b.dept}${b.doctor ? `（${b.doctor}）` : ""}${b.slot === "時刻" ? "" : `　${b.slot}`}　${b.purpose}`;
    return [{ ...base, kind: "外来予約", day: b.day, time: b.slot === "時刻" ? b.time : undefined, verb: "受診", label }];
  }
  if (o.leave) {
    const l = o.leave;
    const kind: PlanKind = l.kind === "退院" ? "退院" : "移動";
    const label = l.destination ? `${l.kind}　${l.destination}` : l.kind;
    const out: PlanItem[] = [{ ...base, kind, day: l.from.day, time: l.from.time, verb: l.kind, label }];
    if (l.back) out.push({ ...base, kind: "移動", day: l.back.day, time: l.back.time, verb: "帰院", label });
    return out;
  }
  if (o.move) {
    const m = o.move;
    const label = m.to ? `${m.kind}　${m.to.room} ${m.to.bed}` : m.toDept ? `${m.kind}　${m.toDept}${m.toDoctor ? ` ${m.toDoctor}` : ""}` : m.kind;
    return [{ ...base, kind: "移動", day: o.start.day, time: o.start.time, verb: m.kind, label }];
  }
  if (o.hd || o.tx || o.consult || o.rehab) {
    const verb = o.hd ? "透析" : o.tx ? "輸血" : o.consult ? "他科依頼" : "リハビリ開始";
    return [{ ...base, kind: "予約", day: o.start.day, time: o.start.time, verb, label: orderLines(o, todayStub).main }];
  }
  const label = procedureTitle(o);
  const stop = stopOf(e, "処置", label);
  const from = abs(o.start.day, o.start.time ?? e.time);
  if (stop && stop.at <= from) return [stop.item];
  const out: PlanItem[] = [{ ...base, kind: "処置", day: o.start.day, time: o.start.time, verb: o.schedule.kind === "once" ? "実施" : o.schedule.kind === "prn" ? "必要時の開始" : "開始", label }];
  if (o.days && o.schedule.kind !== "once" && o.schedule.kind !== "prn") {
    const to = from + o.days * 1440;
    if (!stop || stop.at >= to) out.push({ ...base, kind: "処置", day: lastDayOf(to), verb: "終了", label });
  }
  if (stop) out.push(stop.item);
  return out;
}

const byTime = (a: PlanItem, b: PlanItem) => a.day - b.day || (a.time ?? "99").localeCompare(b.time ?? "99") || a.kind.localeCompare(b.kind);

/** Everything planned for one patient, from the orders of the record and the operations booked, by day and time. */
export function plannedItems(entries: HistoryEntry[], surgeries: PlannedSurgery[] = []): PlanItem[] {
  const out: PlanItem[] = [];
  for (const e of entries) if (e.kind === "order") out.push(...planItemsOf(e));
  for (const s of surgeries) out.push({ kind: "予約", day: s.day, time: s.start ?? undefined, verb: "手術", label: s.procedure, orderId: `sx:${s.id}`, orderedOn: null });
  return out.sort(byTime);
}

/**
 * What is planned on `day` as the record's day section shows it: not the items of orders written that very day
 * (their card is already in the section), and only those `keep` lets through (the record's filters).
 */
export function plansOn(items: PlanItem[], day: DayOffset, keep: (p: PlanItem) => boolean = () => true): PlanItem[] {
  return items.filter((p) => p.day === day && p.orderedOn !== day && keep(p)).sort(byTime);
}

/** The days after today (within the horizon) that have something planned, nearest first, with their items. */
export function plannedDaysAhead(items: PlanItem[], keep: (p: PlanItem) => boolean = () => true, horizon = PLAN_HORIZON_DAYS): { day: DayOffset; items: PlanItem[] }[] {
  const days = new Map<DayOffset, PlanItem[]>();
  for (const p of items) {
    if (p.day <= 0 || p.day > horizon || !keep(p)) continue;
    days.set(p.day, [...(days.get(p.day) ?? []), p]);
  }
  return [...days.entries()].sort((a, b) => a[0] - b[0]).map(([day, its]) => ({ day, items: its.sort(byTime) }));
}

/** Whether the item is still ahead: after now (nowAbs in minutes from today 00:00), or today/later when the clock is unknown. */
export function isAhead(p: PlanItem, nowAbs: number | null): boolean {
  if (nowAbs === null) return p.day >= 0;
  if (p.time) return abs(p.day, p.time) > nowAbs;
  return p.day >= Math.floor(nowAbs / 1440);
}

/** "採取予定" while ahead, "採取" once past. */
export function planVerb(p: PlanItem, nowAbs: number | null): string {
  return isAhead(p, nowAbs) ? `${p.verb}予定` : p.verb;
}

/**
 * The marks for an order's heading in the record: its items on another day than the order was written, or still
 * ahead (an order written for the same moment and already done needs none).
 */
export function executionMarks(e: OrderEntry, nowAbs: number | null): PlanItem[] {
  return planItemsOf(e).filter((p) => p.day !== e.day || isAhead(p, nowAbs));
}

/** "予定 2" for the tree, or the one kind when a day has a single item. */
export function planDayLabel(items: PlanItem[]): string {
  return items.length === 1 ? items[0].kind : `予定 ${items.length}`;
}

/** The kinds planned on a day, each once ("検体検査・画像"), for the heading of the folded days ahead. */
export function planKindsLabel(items: PlanItem[]): string {
  return [...new Set(items.map((p) => p.kind))].join("・");
}
