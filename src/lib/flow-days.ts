// The day columns of the flow sheet (経過表): 病日, 術後日数 from the operations booked in the operating
// rooms (手術室), 外泊中・外出中 from the leave orders, and the days since a day a nurse or doctor chose
// (イベント日数, e.g. 抗菌薬の開始). Code only counts; what to count from is chosen by a person.

import { hospitalDay } from "./dates";
import { findDrug } from "./master";
import { findProc } from "./procedures";
import type { Surgery } from "./surgery";
import type { DayOffset, OrderEntry } from "./types";

/** A day a person chose to count from, kept with the patient's record. */
export interface FlowEvent {
  id: string;
  patientId: string;
  label: string;
  day: DayOffset;
  by: string;
  at: { day: DayOffset; time: string };
}

/** At most this many counted days per patient (the header stays readable). */
export const FLOW_EVENT_MAX = 3;

export type Cell = { text: string; title: string; tone: "ink" | "ai" | "yamabuki" | "faint" };

/** 病日: the admission day is 1 (before admission, none). */
export const hospitalDayText = (admittedOn: DayOffset, day: DayOffset) => (day < admittedOn ? "" : `${hospitalDay(admittedOn, day)}日目`);

/**
 * 術後日数 (POD): the operation day is 手術日 (術後0日), the next day 術後1日. Counted from the last operation on
 * or before the day; an operation booked later in the stay shows as 手術予定 on its day.
 */
export function podCell(surgeries: Pick<Surgery, "day" | "procedure" | "status" | "start">[], day: DayOffset): Cell | null {
  const on = surgeries.filter((s) => s.day === day);
  const before = surgeries.filter((s) => s.day < day).sort((a, b) => b.day - a.day);
  const all = [...surgeries].sort((a, b) => a.day - b.day).map((s) => `${s.procedure}（${s.day === 0 ? "今日" : s.day > 0 ? `${s.day}日後` : `${-s.day}日前`}${s.start ? ` ${s.start}` : ""}・${s.status}）`);
  if (on.length) {
    const done = on.some((s) => s.status === "入室" || s.status === "退室");
    const planned = !done && day >= 0;
    return { text: planned ? "手術予定" : "手術日", title: `${on.map((s) => s.procedure).join("、")}\n${all.join("\n")}`, tone: planned ? "faint" : "ai" };
  }
  if (!before.length) return null;
  const last = before[0];
  return { text: `術後${day - last.day}日`, title: `${last.procedure}から${day - last.day}日（手術日を0日として数える）\n${all.join("\n")}`, tone: day > 0 ? "faint" : "ink" };
}

/** Days strictly between going out and coming back (外泊中・外出中), from the leave orders. */
export function awayOn(entries: OrderEntry[], day: DayOffset): Cell | null {
  for (const e of entries) {
    if (e.status === "中止" || e.order.type !== "procedure" || !e.order.leave) continue;
    const l = e.order.leave;
    if (l.kind === "退院" || !l.back) continue;
    if (l.from.day < day && day < l.back.day) return { text: `${l.kind}中`, title: `${l.kind}（${l.destination}）：帰院 ${l.back.time}（${l.back.day - day}日後）`, tone: "yamabuki" };
  }
  return null;
}

/** The days since a chosen day: 当日, +1, +2 … (nothing before it). */
export function sinceCell(ev: Pick<FlowEvent, "day" | "label">, day: DayOffset): Cell | null {
  if (day < ev.day) return null;
  const n = day - ev.day;
  return { text: n === 0 ? "当日" : `+${n}日`, title: `${ev.label}${n === 0 ? "の日" : `から${n}日`}（その日を0日として数える）`, tone: day > 0 ? "faint" : n === 0 ? "ai" : "ink" };
}

/**
 * Days to choose from when adding one: the start of each injection, procedure and operation of the stay.
 * The person may type any other label and day.
 */
export function eventChoices(entries: OrderEntry[], surgeries: Pick<Surgery, "day" | "procedure">[], admittedOn: DayOffset): { label: string; day: DayOffset }[] {
  const out: { label: string; day: DayOffset }[] = [];
  const add = (label: string, day: DayOffset) => {
    if (day < admittedOn || day > 1) return;
    if (!out.some((x) => x.label === label && x.day === day)) out.push({ label, day });
  };
  // Orders stopped before they began never started.
  const began = (e: OrderEntry, start: DayOffset) => !(e.status === "中止" && e.stoppedOn !== undefined && e.stoppedOn < start);
  for (const e of entries) {
    const o = e.order;
    if (o.type === "injection" && began(e, o.start.day)) {
      const d = findDrug(o.items[0].drugCode);
      add(`${d ? (d.aliases[0] ?? d.name) : o.items[0].drugCode} 開始`, o.start.day);
    } else if (o.type === "procedure" && !o.leave && !o.move && !o.consult && !o.guide && !o.opd && began(e, o.start.day)) add(`${findProc(o.code)?.name ?? o.code} 開始`, o.start.day);
  }
  for (const s of surgeries) add(`${s.procedure}`, s.day);
  return out.sort((a, b) => a.day - b.day || a.label.localeCompare(b.label));
}
