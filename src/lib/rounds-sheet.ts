// 回診表: one box per patient for the ward round, printed on A4 (landscape) with a blank to write in.
// Everything is read from the record by code (no AI, nothing summarised): the open ☐ ToDos of the notes as
// written, today's plans from the orders and the OR list, the drips and antibiotics running now, oxygen, the
// newest vitals, and the newest value of a fixed set of labs with ↑↓ against the value before (as recorded,
// not judged against a range). The items, their order and the page size are the fictional hospital's choice.

import { activeOrders } from "./active-orders";
import { antibioticDays } from "./by-system";
import { addDays, hospitalDay, type CalendarDate } from "./dates";
import { diagnosisLabel, type Diagnosis } from "./diagnoses";
import { abs, orderInterval } from "./flowsheet";
import { orderLines } from "./format";
import { findDrug } from "./master";
import { ageSex } from "./person";
import { procInterval } from "./proc-timing";
import { plannedItems, type PlanKind, type PlannedSurgery } from "./schedule-days";
import type { DayOffset, LabResult, OrderEntry, Patient } from "./types";

/** The labs on the sheet, left to right. */
export const ROUNDS_LABS = ["WBC", "Hb", "Plt", "CRP", "Cre", "K", "Na"] as const;
/** What 今日の予定 lists (not the start and end of drugs: those are the calendars'). */
const TODAY_KINDS: PlanKind[] = ["検体検査", "画像", "予約", "処置", "移動", "退院"];

export interface RoundsLab {
  code: string;
  value: number;
  /** The value of the result before (null: the first one). */
  prev: number | null;
  /** ↑↓ against the value before, → the same, "" when there is none before. */
  trend: "↑" | "↓" | "→" | "";
  at: { day: DayOffset; time: string };
}

export interface RoundsRow {
  id: string;
  room: string;
  name: string;
  kana: string;
  ageSex: string;
  /** 入院◯日目 today. */
  day: number;
  diagnosis: string;
  /** The open ☐ lines of the notes, as written. */
  todos: string[];
  /** "14:00 撮影 胸部 CT" … */
  today: string[];
  drips: string[];
  /** "MEPM 4日目" … */
  antibiotics: string[];
  oxygen: string;
  /** "BT 37.2 HR 88 BP 120/70 RR 18 SpO2 96%" and when ("06:00", or "11/6 06:00" another day). */
  vitals: { text: string; at: string } | null;
  labs: RoundsLab[];
  unseen: number;
  panic: number;
  /** 指示受けがまだ (only on a nurse's sheet). */
  waiting: number | null;
}

export interface RoundsInput {
  patient: Patient;
  /** The bed as the list shows it ("506A"). */
  room: string;
  /** The orders of the record as they stand. */
  orders: OrderEntry[];
  todos: string[];
  /** The OR list (only this patient's are read). */
  surgeries?: (PlannedSurgery & { patientId?: string })[];
  diagnoses?: Diagnosis[];
  /** The ward's own plans for the bed today ("10:00 退院"). */
  plans?: string[];
  results?: { unseen: number; panic: number };
  waiting?: number | null;
  today: CalendarDate;
  /** Now, "HH:MM". */
  now: string;
}

/** "06:00" today, "11/6 06:00" on another day. */
export function stampText(day: DayOffset, time: string, today: CalendarDate): string {
  if (day === 0) return time;
  const d = addDays(today, day);
  return `${d.m}/${d.d} ${time}`;
}

/** The 主病名 that is still 継続, else the admission diagnosis. */
export function mainDiagnosis(p: Pick<Patient, "admissionDiagnosis">, list: Diagnosis[] = []): string {
  const d = list.find((x) => x.main && x.outcome === "継続");
  return d ? diagnosisLabel(d) : p.admissionDiagnosis;
}

/** The newest value of a lab up to now, and the one before it. */
export function labTrend(labs: LabResult[], code: string, nowAbs: number): RoundsLab | null {
  const rows = labs.filter((l) => Number.isFinite(l.values[code]) && abs(l.day, l.time) <= nowAbs).sort((a, b) => abs(b.day, b.time) - abs(a.day, a.time));
  const [cur, before] = rows;
  if (!cur) return null;
  const value = cur.values[code];
  const prev = before ? before.values[code] : null;
  const trend = prev === null ? "" : value > prev ? "↑" : value < prev ? "↓" : "→";
  return { code, value, prev, trend, at: { day: cur.day, time: cur.time } };
}

/** The newest set of vitals up to now, the values it has. */
export function vitalsText(p: Pick<Patient, "vitals">, nowAbs: number, today: CalendarDate): RoundsRow["vitals"] {
  const v = p.vitals.filter((x) => abs(x.day, x.time) <= nowAbs).sort((a, b) => abs(b.day, b.time) - abs(a.day, a.time))[0];
  if (!v) return null;
  const parts = [v.bt !== undefined && `BT ${v.bt}`, v.hr !== undefined && `HR ${v.hr}`, v.sbp !== undefined && `BP ${v.sbp}${v.dbp !== undefined ? `/${v.dbp}` : ""}`, v.rr !== undefined && `RR ${v.rr}`, v.spo2 !== undefined && `SpO2 ${v.spo2}%`].filter(Boolean);
  return parts.length ? { text: parts.join(" "), at: stampText(v.day, v.time, today) } : null;
}

const runningNow = (from: number, to: number | null, nowAbs: number) => from <= nowAbs && (to === null || to > nowAbs);

/** 持続の点滴 running now: fluids by drip (not a single bag), and the pumps of the ICU record. */
export function dripsOf(orders: OrderEntry[], nowAbs: number, today: CalendarDate): string[] {
  return activeOrders(orders, 0).flatMap((e) => {
    const o = e.order;
    if (o.type !== "injection") return [];
    const fluid = o.route === "点滴静注" && o.schedule.kind !== "once" && o.items.every((it) => findDrug(it.drugCode)?.kind === "輸液");
    if (!(fluid || o.continuous)) return [];
    const { from, to } = orderInterval(e, nowAbs);
    if (!runningNow(from, to, nowAbs)) return [];
    return [`${orderLines(o, today).main}${o.rateMlPerH ? ` ${o.rateMlPerH.toFixed(1)}mL/時` : ""}`];
  });
}

/** Oxygen now: the ICU record's setting, else the 酸素 order running, else the newest vitals' (not room air). */
export function oxygenOf(p: Pick<Patient, "currentOxygen" | "vitals">, orders: OrderEntry[], nowAbs: number): string {
  if (p.currentOxygen && p.currentOxygen !== "室内気") return p.currentOxygen;
  for (const e of orders) {
    if (e.status !== "有効" || e.order.type !== "procedure" || !e.order.o2) continue;
    const { from, to } = procInterval(e, nowAbs);
    if (runningNow(from, to, nowAbs)) return `${e.order.o2.device} ${e.order.o2.lpm}L/分`;
  }
  if (p.currentOxygen) return "";
  const v = p.vitals.filter((x) => x.o2 !== undefined && abs(x.day, x.time) <= nowAbs).sort((a, b) => abs(b.day, b.time) - abs(a.day, a.time))[0];
  return v?.o2 && v.o2 !== "室内気" ? v.o2 : "";
}

/** 今日の予定: tests, procedures, operations, discharge and moves planned today, by time. */
export function todayPlans(patientId: string, orders: OrderEntry[], surgeries: (PlannedSurgery & { patientId?: string })[] = [], plans: string[] = []): string[] {
  const items = plannedItems(orders, surgeries.filter((s) => s.patientId === patientId)).filter((i) => i.day === 0 && TODAY_KINDS.includes(i.kind) && i.verb !== "中止");
  // 「11:00 退院　自宅」: the verb is left out when the label already starts with it.
  const out = items.map((i) => [i.time, i.label.startsWith(i.verb) ? "" : i.verb, i.label].filter(Boolean).join(" "));
  const leaving = items.some((i) => i.kind === "退院");
  return [...out, ...plans.filter((t) => !(leaving && t.includes("退院")))];
}

export function roundsRow(x: RoundsInput): RoundsRow {
  const p = x.patient;
  const nowAbs = abs(0, x.now);
  return {
    id: p.id,
    room: x.room,
    name: p.name,
    kana: p.kana,
    ageSex: ageSex(p),
    day: hospitalDay(p.admittedOn, 0),
    diagnosis: mainDiagnosis(p, x.diagnoses),
    todos: x.todos,
    today: todayPlans(p.id, x.orders, x.surgeries, x.plans),
    drips: dripsOf(x.orders, nowAbs, x.today),
    antibiotics: antibioticDays(p.history, x.orders),
    oxygen: oxygenOf(p, x.orders, nowAbs),
    vitals: vitalsText(p, nowAbs, x.today),
    labs: ROUNDS_LABS.map((c) => labTrend(p.labs, c, nowAbs)).filter((l): l is RoundsLab => !!l),
    unseen: x.results?.unseen ?? 0,
    panic: x.results?.panic ?? 0,
    waiting: x.waiting ?? null,
  };
}

/** Labs are shown as recorded: 12300 stays 12300 (thousands get a comma to be read at a glance). */
export const labValueText = (v: number) => (Number.isInteger(v) && Math.abs(v) >= 1000 ? v.toLocaleString("en-US") : String(v));

// The page: A4 landscape inside 10mm margins is 277 × 190mm; the heading, the column heads and the footer take
// about 20mm. A box is at least ROW_MIN_MM tall (room to write) and grows with its longest column.
export const PAGE_BODY_MM = 170;
export const ROW_MIN_MM = 27;
const LINE_MM = 3.7;
/** Characters a line holds in each column (8pt; a half-width character counts as one, so this errs long). */
const COLUMN_CHARS = { todo: 18, today: 11, treat: 12 };

const linesOf = (texts: string[], perLine: number) => texts.reduce((n, t) => n + Math.max(1, Math.ceil(t.length / perLine)), 0);

/** How tall a box is expected to print (mm). */
export function rowHeightMm(r: RoundsRow): number {
  const treat = [...r.drips, ...r.antibiotics, ...(r.oxygen ? [r.oxygen] : [])];
  const lines = Math.max(linesOf(r.todos, COLUMN_CHARS.todo), linesOf(r.today, COLUMN_CHARS.today), linesOf(treat, COLUMN_CHARS.treat));
  return Math.max(ROW_MIN_MM, lines * LINE_MM + 3);
}

/** The boxes in their order, a page at a time: six of the usual height, fewer when a box runs long. */
export function paginateRounds<T>(rows: T[], height: (r: T) => number, body = PAGE_BODY_MM): T[][] {
  const pages: T[][] = [];
  let used = 0;
  for (const r of rows) {
    const h = height(r);
    if (!pages.length || (pages.at(-1)!.length && used + h > body)) {
      pages.push([]);
      used = 0;
    }
    pages.at(-1)!.push(r);
    used += h;
  }
  return pages;
}
