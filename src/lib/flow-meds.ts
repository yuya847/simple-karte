// 内服 and 血糖・インスリン on the flow sheet (経過表). Oral drugs given at fixed timings (定期・持参薬・臨時の
// 定時の分) are shown per timing (朝・昼・夕・眠前) with what the nurses recorded in the 与薬の記録 (MAR):
// 済 / 不可 (未実施) / 未 (not yet recorded) / 中止. Glucose values come from the 血糖測定 recorded as a
// 看護ケア・観察 (and the 検体検査 Glu); insulin from injection orders. Code only gathers what was recorded.

import { prescriptionCell } from "./calendar";
import { recordOf, type CareOrder, type CareRecord } from "./care-orders";
import { abs, doseTimes, orderInterval } from "./flowsheet";
import { oralName } from "./format";
import { marKey, marState, type AdminRecord, type MarState } from "./mar";
import { findDrug, WARD_RULES } from "./master";
import type { DayOffset, DoseTiming, LabResult, OrderEntry, PrescriptionOrder } from "./types";

export const TIMINGS: DoseTiming[] = ["朝", "昼", "夕", "眠前"];

/** Oral orders given on the ward at fixed timings (not 頓用, not 退院時処方). */
export const timedOral = (entries: OrderEntry[]) => entries.filter((e) => e.order.type === "prescription" && e.order.category !== "退院時" && e.order.timings.length > 0);

/** The timings any of these orders has, in the day's order. */
export const timingsOf = (entries: OrderEntry[]) => TIMINGS.filter((t) => timedOral(entries).some((e) => (e.order as PrescriptionOrder).timings.includes(t)));

export interface OralSlot {
  orderId: string;
  drug: string;
  timing: DoseTiming;
  /** The dose time (absolute minutes): the ward's clock time of the timing (架空の病院の取り決め). */
  at: number;
  state: MarState;
  record?: AdminRecord;
}

/** The doses of one timing on one day, and the orders of that timing stopped that day. */
export function oralSlots(entries: OrderEntry[], day: DayOffset, timing: DoseTiming, records: Record<string, AdminRecord>, sessionStart: number, nowAbs: number): { slots: OralSlot[]; stopped: string[] } {
  const slots: OralSlot[] = [];
  const stopped: string[] = [];
  const at = abs(day, WARD_RULES.medTimes[timing]);
  for (const e of timedOral(entries)) {
    const o = e.order as PrescriptionOrder;
    if (!o.timings.includes(timing)) continue;
    const cell = prescriptionCell(e, day, nowAbs);
    if (cell.stopped) stopped.push(`${oralName(o.drugCode)}${o.comment ? `（${o.comment}）` : ""}`);
    if (!cell.slots.find((s) => s.timing === timing)?.state) continue;
    slots.push({ orderId: e.id, drug: `${oralName(o.drugCode)} ${o.amount}${o.unit}`, timing, at, state: marState({ orderId: e.id, at }, records, sessionStart, nowAbs), record: records[`${e.id}|${at}`] });
  }
  return { slots, stopped };
}

export interface MedCell {
  text: string;
  tone: "done" | "not" | "late" | "plan" | "stop";
  title: string;
}

const LINE: Record<MarState, string> = { 実施: "実施", 未実施: "未実施", 記録済み: "実施（前の勤務）", 未入力: "記録がまだ", 予定: "予定" };

/**
 * One cell: 済 when every dose so far is given (済 2/3 when some are), 不可 when one was not given (未実施),
 * 未 when one is past without a record, ・ when they are all ahead, 中止 when an order of the timing was
 * stopped that day and nothing else is due.
 */
export function medCell(slots: OralSlot[], stopped: string[]): MedCell | null {
  if (!slots.length && !stopped.length) return null;
  const lines = slots.map((s) => `${s.drug}：${LINE[s.state]}${s.record ? ` ${s.record.doneAt} ${s.record.by}${s.record.reason ? `（${s.record.reason}）` : ""}` : ""}`);
  const title = [...lines, ...stopped.map((x) => `中止：${x}`)].join("\n");
  const past = slots.filter((s) => s.state !== "予定");
  const done = past.filter((s) => s.state === "実施" || s.state === "記録済み").length;
  if (!slots.length) return { text: "中止", tone: "stop", title };
  if (past.some((s) => s.state === "未実施")) return { text: "不可", tone: "not", title };
  if (past.some((s) => s.state === "未入力")) return { text: done ? `未${past.length - done}` : "未", tone: "late", title };
  if (!past.length) return { text: slots.length > 1 ? `・${slots.length}` : "・", tone: "plan", title };
  return { text: done === slots.length ? "済" : `済${done}/${slots.length}`, tone: "done", title };
}

// ---------- 血糖・インスリン ----------

/** A 看護ケア・観察 that measures blood glucose (its item says 血糖). */
export const isGlucoseCare = (o: Pick<CareOrder, "item" | "kind">) => o.kind === "観察" && /血糖/.test(o.item);

export interface GlucosePoint {
  at: number;
  value: number;
  /** 簡易血糖 = measured on the ward (看護ケア・観察), 検体検査 = the laboratory's Glu. */
  source: "簡易血糖" | "検体検査";
  title: string;
}

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Glucose values in time order: the ward's 血糖測定 records (a number) and the laboratory's Glu. */
export function glucosePoints(orders: CareOrder[], records: CareRecord[], labs: LabResult[], mar: AdminRecord[] = []): GlucosePoint[] {
  const ids = new Set(orders.filter(isGlucoseCare).map((o) => o.id));
  // The observation belongs to the administration record, so cancelling it also withdraws the glucose.
  const observed = mar.filter(r=>r.status === "実施" && !r.cancellation && r.insulin?.glucose != null).map(r=>({key:`insulin:${r.key}`,orderId:`insulin:${r.orderId}`,patientId:r.patientId,at:r.insulin?.measuredAt ?? r.at,status:"実施" as const,value:String(r.insulin!.glucose),doneAt:r.doneAt,writtenAt:r.doneAt,by:r.by}));
  observed.forEach(r=>ids.add(r.orderId));
  records = [...records,...observed];
  const out: GlucosePoint[] = [];
  for (const r of records) {
    if (!ids.has(r.orderId) || r.voided || r.status !== "実施" || recordOf(records, r.key) !== r) continue;
    const v = Number(String(r.value ?? "").replace(/[^\d.]/g, ""));
    if (!r.value || !Number.isFinite(v) || v <= 0) continue;
    out.push({ at: r.measuredAt ?? r.at, value: v, source: "簡易血糖", title: `簡易血糖 ${v} mg/dL　${r.doneAt} ${r.by}${r.note ? `　${r.note}` : ""}` });
  }
  for (const l of labs) {
    const v = l.values.Glu;
    if (v !== undefined) out.push({ at: abs(l.day, l.time), value: v, source: "検体検査", title: `検体検査 Glu ${v} mg/dL（採取 ${l.time}）` });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** One cell per day: the day's values in order ("182/146/201"), each with its time on touch. */
export function glucoseDayCell(points: GlucosePoint[], day: DayOffset): { text: string; title: string } | null {
  const mine = points.filter((p) => Math.floor(p.at / 1440) === day);
  if (!mine.length) return null;
  return { text: mine.map((p) => p.value).join("/"), title: mine.map((p) => `${hhmm(p.at)} ${p.title}`).join("\n") };
}

/** Injection orders with insulin in them (by the drug's name in the master). */
export const insulinOrders = (entries: OrderEntry[]) =>
  entries.filter((e) => e.order.type === "injection" && e.order.items.some((it) => /インスリン/.test(findDrug(it.drugCode)?.name ?? "")));

/** The doses of an insulin order in [lo, hi) with what the MAR says (scheduled doses only). */
export function insulinDoses(e: OrderEntry, lo: number, hi: number, records: Record<string, AdminRecord>, sessionStart: number, nowAbs: number): { at: number; state: MarState; record?: AdminRecord }[] {
  if (e.order.type !== "injection") return [];
  const times = e.order.sliding || e.order.doseTimes?.length || e.order.schedule.kind === "per_day" || e.order.schedule.kind === "every_hours" ? doseTimes(e, nowAbs, lo, hi) : e.order.schedule.kind === "once" ? [orderInterval(e, nowAbs).from].filter((t) => t >= lo && t < hi) : [];
  return times.map((at) => ({ at, state: marState({ orderId: e.id, at }, records, sessionStart, nowAbs), record: records[marKey(e.id, at)] }));
}
