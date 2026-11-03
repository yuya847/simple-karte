// The ward worksheet: what each nurse does in a shift, gathered from the orders by code.
// Nothing here is decided by AI. Times come from the orders and the ward's rules.

import { prescriptionCell } from "./calendar";
import { addDays, formatShort, type CalendarDate } from "./dates";
import { doseVolumeMl } from "./drafts";
import { abs, doseTimes, orderInterval } from "./flowsheet";
import { drugName, durationText, labName, oralName, orderLines, procedureTitle, scheduleTextFor } from "./format";
import { examAt } from "./exams";

// Exam lines only need the title here; the date part is not shown on the worksheet.
const todayStub = { y: 2000, m: 1, d: 1 };
import { findDrug, findLab, WARD_RULES } from "./master";
import { procEvents, procInterval } from "./proc-timing";
import { AREA_LABEL, findProc, findProcDrug, procScheduleText } from "./procedures";
import type { DayOffset, InjectionOrder, LabOrder, OrderEntry, Patient, PrescriptionOrder, ProcedureOrder } from "./types";

export type Shift = "day" | "night" | "all";

/** Shifts of the fictional ward. 夜勤 runs into the next morning. */
export const SHIFTS: Record<Shift, { label: string; from: string; to: string; nextDay?: boolean }> = {
  day: { label: "日勤", from: "08:30", to: "17:00" },
  night: { label: "夜勤", from: "16:30", to: "09:00", nextDay: true },
  all: { label: "終日", from: "00:00", to: "24:00" },
};

export function shiftWindow(shift: Shift, day: DayOffset): { lo: number; hi: number } {
  const s = SHIFTS[shift];
  const lo = abs(day, s.from);
  const hi = s.to === "24:00" ? (day + 1) * 1440 : abs(day + (s.nextDay ? 1 : 0), s.to);
  return { lo, hi };
}

export type WorkKind = "注射" | "内服" | "処置" | "採血" | "検査";

export interface WorkPatient {
  patient: Patient;
  room: string;
  entries: OrderEntry[];
}

export interface WorkItem {
  /** Minutes from today 00:00, or null for items without a clock time (必要時, 1日N回). */
  at: number | null;
  kind: WorkKind;
  patientId: string;
  room: string;
  name: string;
  main: string;
  detail: string;
  orderId: string;
  /** done = its time has passed (no 実施 record in this prototype), planned = ahead. */
  state: "done" | "planned" | null;
  urgent?: boolean;
}

/** Running all through the shift: drips, oxygen, catheters. */
export interface RunningItem {
  kind: WorkKind;
  patientId: string;
  room: string;
  name: string;
  main: string;
  detail: string;
  orderId: string;
}

export interface Worksheet {
  timed: WorkItem[];
  untimed: WorkItem[];
  running: RunningItem[];
}

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** "11/3 06:00" when the time is not on `day`, else "06:00". */
export function timeLabel(at: number, day: DayOffset, today: CalendarDate): string {
  const d = Math.floor(at / 1440);
  return d === day ? hhmm(at) : `${formatShort(addDays(today, d)).replace(/（.）/, "")} ${hhmm(at)}`;
}

const isFluid = (o: InjectionOrder) => o.items.every((it) => findDrug(it.drugCode)?.kind === "輸液");
const live = (e: OrderEntry, lo: number, hi: number, nowAbs: number, interval: (e: OrderEntry, n: number) => { from: number; to: number | null }) => {
  const { from, to } = interval(e, nowAbs);
  return from < hi && (to === null || to > lo);
};

export function buildWorksheet(people: WorkPatient[], lo: number, hi: number, nowAbs: number): Worksheet {
  const timed: WorkItem[] = [];
  const untimed: WorkItem[] = [];
  const running: RunningItem[] = [];
  const state = (t: number) => (t <= nowAbs ? "done" : "planned");

  for (const { patient: p, room, entries } of people) {
    const base = { patientId: p.id, room, name: p.name };
    for (const e of entries) {
      const o = e.order;
      if (o.type === "injection") {
        if (!live(e, lo, hi, nowAbs, orderInterval)) continue;
        const main = o.items.map((it) => `${drugName(it.drugCode)} ${it.amount}${it.unit}`).join(" ＋ ");
        const parts = [o.route, scheduleTextFor(o)];
        if (o.minutesPerDose) parts.push(`1回${durationText(o.minutesPerDose)}`);
        if (o.rateMlPerH) parts.push(`${o.rateMlPerH}mL/時`);
        const detail = parts.join("　");
        if (o.schedule.kind === "every_hours") {
          for (const t of doseTimes(e, nowAbs, lo, hi)) timed.push({ ...base, at: t, kind: "注射", main, detail, orderId: e.id, state: state(t) });
        } else if (o.schedule.kind === "once") {
          const { from } = orderInterval(e, nowAbs);
          if (from >= lo && from < hi) timed.push({ ...base, at: from, kind: "注射", main, detail, orderId: e.id, state: state(from) });
        } else if (isFluid(o)) {
          // Continuous fluid: each bag starts every 24h ÷ (bags a day) from the start.
          const { from, to } = orderInterval(e, nowAbs);
          const step = 1440 / o.schedule.count;
          const vol = doseVolumeMl(o.items);
          running.push({ ...base, kind: "注射", main, detail: `${detail}${vol ? `　1本 ${vol}mL` : ""}`, orderId: e.id });
          let n = 0;
          for (let t = from; t < Math.min(hi, to ?? Infinity); t += step) {
            n++;
            if (t >= lo) timed.push({ ...base, at: t, kind: "注射", main: `${main}（${n}本目）`, detail: "つなぎ替え", orderId: e.id, state: state(t) });
          }
        } else {
          untimed.push({ ...base, at: null, kind: "注射", main, detail: `${detail}（時刻の指定なし）`, orderId: e.id, state: null });
        }
      } else if (o.type === "prescription") {
        const rx = o as PrescriptionOrder;
        if (rx.category === "退院時") continue;
        const main = `${oralName(rx.drugCode)} 1回${rx.amount}${rx.unit}`;
        if (rx.timings.length === 0) {
          if (e.status === "有効") untimed.push({ ...base, at: null, kind: "内服", main, detail: `頓用 ${rx.prn ?? ""}${rx.maxPerDay ? `（1日${rx.maxPerDay}回まで）` : ""}`, orderId: e.id, state: null });
          continue;
        }
        for (let day = Math.floor(lo / 1440); day * 1440 < hi; day++) {
          const cell = prescriptionCell(e, day, nowAbs);
          for (const s of cell.slots) {
            if (!s.state) continue;
            const t = abs(day, WARD_RULES.medTimes[s.timing]);
            if (t >= lo && t < hi) timed.push({ ...base, at: t, kind: "内服", main, detail: `${rx.category}　${s.timing}`, orderId: e.id, state: state(t) });
          }
        }
      } else if (o.type === "procedure") {
        const pr = o as ProcedureOrder;
        if (!live(e, lo, hi, nowAbs, procInterval)) continue;
        const main = procedureTitle(pr);
        const bits: string[] = [];
        if (pr.depth) bits.push(pr.depth);
        if (pr.area) bits.push(AREA_LABEL[pr.area]);
        if (pr.drug) bits.push(`${findProcDrug(pr.drug.code)?.name ?? pr.drug.code} ${pr.drug.amount}${findProcDrug(pr.drug.code)?.unit ?? ""}`);
        if (pr.comment) bits.push(pr.comment);
        const detail = [procScheduleText(pr.schedule), ...bits].join("　");
        if (pr.schedule.kind === "continuous") {
          running.push({ ...base, kind: "処置", main, detail: findProc(pr.code)?.code === "PROC-FOLEY" ? `留置中　${bits.join("　")}` : detail, orderId: e.id });
        } else if (pr.schedule.kind === "prn") {
          untimed.push({ ...base, at: null, kind: "処置", main, detail, orderId: e.id, state: null });
        } else {
          for (const t of procEvents(e, lo, hi, nowAbs)) timed.push({ ...base, at: t, kind: "処置", main, detail, orderId: e.id, state: state(t) });
        }
      } else if (o.type === "imaging" || o.type === "physio") {
        if (e.status === "中止") continue;
        const t = examAt(o, abs(e.day, e.time));
        if (t < lo || t >= hi) continue;
        const { main, detail } = orderLines(o, todayStub);
        timed.push({ ...base, at: t, kind: "検査", main, detail: [o.type === "imaging" ? o.transport : o.place === "検査室" ? `検査室へ ${o.transport ?? ""}` : "ベッドサイド", o.when.priority === "至急" ? "至急" : ""].filter(Boolean).join("　") || detail, orderId: e.id, state: state(t), urgent: o.when.priority === "至急" });
      } else if (o.type === "lab") {
        const lab = o as LabOrder;
        if (e.status === "中止") continue;
        const t = abs(lab.collect.day, lab.collect.time);
        if (t < lo || t >= hi) continue;
        const urine = lab.codes.every((c) => findLab(c)?.specimen === "尿");
        timed.push({
          ...base,
          at: t,
          kind: "採血",
          main: lab.codes.map(labName).join("、"),
          detail: [urine ? "尿" : "採血", lab.priority, lab.comment].filter(Boolean).join("　"),
          orderId: e.id,
          state: state(t),
          urgent: lab.priority === "至急",
        });
      }
    }
  }
  const order = (a: WorkItem, b: WorkItem) => (a.at ?? 0) - (b.at ?? 0) || a.room.localeCompare(b.room);
  return { timed: timed.sort(order), untimed: untimed.sort(order), running: running.sort((a, b) => a.room.localeCompare(b.room)) };
}

// ---------------------------------------------------------------------------
// 指示受け: orders given or stopped since a time, and whether a nurse has taken them.
// ---------------------------------------------------------------------------

export interface OrderChange {
  kind: "新規" | "中止";
  at: number;
  entry: OrderEntry;
  patientId: string;
  room: string;
  name: string;
  /** Key under which the nurse's 指示受け is recorded. */
  key: string;
  /** false when only the day of a stop is known. */
  timeKnown: boolean;
}

export const changeKey = (entryId: string, kind: "新規" | "中止") => `${entryId}|${kind}`;

export function orderChanges(people: WorkPatient[], since: number, nowAbs: number): OrderChange[] {
  const out: OrderChange[] = [];
  for (const { patient: p, room, entries } of people) {
    for (const e of entries) {
      const given = abs(e.day, e.time);
      if (given >= since && given <= nowAbs) out.push({ kind: "新規", at: given, entry: e, patientId: p.id, room, name: p.name, key: changeKey(e.id, "新規"), timeKnown: true });
      if (e.status === "中止") {
        // A stop without a clock time sorts at the end of its day.
        const timeKnown = !!e.stoppedTime || e.stoppedOn === undefined || e.stoppedOn === 0;
        const stopped = e.stoppedTime ? abs(e.stoppedOn ?? 0, e.stoppedTime) : e.stoppedOn === undefined || e.stoppedOn === 0 ? nowAbs : abs(e.stoppedOn, "23:59");
        if (stopped >= since && stopped <= nowAbs) out.push({ kind: "中止", at: stopped, entry: e, patientId: p.id, room, name: p.name, key: changeKey(e.id, "中止"), timeKnown });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at || a.room.localeCompare(b.room));
}

/**
 * Changes in the fictional record (before this session) count as taken (指示受け済み).
 * Changes made in this session wait for a nurse.
 */
export function sessionChangeKeys(changes: Record<string, { added: OrderEntry[]; stopped: string[] }>): Set<string> {
  const keys = new Set<string>();
  for (const c of Object.values(changes)) {
    for (const e of c.added) keys.add(changeKey(e.id, "新規"));
    for (const id of c.stopped) keys.add(changeKey(id, "中止"));
  }
  return keys;
}
