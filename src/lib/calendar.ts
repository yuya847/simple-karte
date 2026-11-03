// What each day cell of the injection / prescription calendars shows. Administration is
// not recorded in this prototype: a dose whose time has passed is shown as given.

import { abs, doseTimes, orderInterval } from "./flowsheet";
import { doseVolumeMl } from "./drafts";
import { findDrug, WARD_RULES } from "./master";
import { procEvents, procInterval } from "./proc-timing";
import type { DayOffset, DoseTiming, InjectionOrder, OrderEntry, PrescriptionOrder, ProcedureOrder } from "./types";

export type MarkState = "done" | "planned";

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const stateAt = (t: number, nowAbs: number): MarkState => (t <= nowAbs ? "done" : "planned");

export interface InjectionCell {
  running: boolean;
  /** Timed doses (every N hours, once). */
  doses: { time: string; state: MarkState }[];
  /** Fluids given continuously: volume over this day and whether it is past, ongoing or ahead. */
  infusion?: { volumeMl: number; state: MarkState | "now" };
  /** Drugs given N times a day without set clock times. */
  timesPerDay?: number;
  /** Set when the order was stopped on this day. */
  stopped?: { time: string | null };
}

export function isFluidOrder(o: InjectionOrder): boolean {
  return o.items.every((it) => findDrug(it.drugCode)?.kind === "輸液");
}

export function injectionCell(entry: OrderEntry, day: DayOffset, nowAbs: number): InjectionCell {
  const o = entry.order as InjectionOrder;
  const lo = day * 1440;
  const hi = lo + 1440;
  const { from, to } = orderInterval(entry, nowAbs);
  const running = from < hi && (to === null || to > lo);
  const cell: InjectionCell = { running, doses: [] };

  if (entry.status === "中止" && (entry.stoppedOn ?? 0) === day) {
    cell.stopped = { time: day === 0 && to !== null ? hhmm(to - lo) : null };
  }
  if (!running) return cell;

  if (o.schedule.kind === "every_hours") {
    cell.doses = doseTimes(entry, nowAbs, lo, hi).map((t) => ({ time: hhmm(t - lo), state: stateAt(t, nowAbs) }));
  } else if (o.schedule.kind === "once") {
    if (from >= lo && from < hi) cell.doses = [{ time: hhmm(from - lo), state: stateAt(from, nowAbs) }];
  } else if (isFluidOrder(o)) {
    const start = Math.max(lo, from);
    const end = Math.min(hi, to ?? Infinity);
    const volumeMl = Math.round(((doseVolumeMl(o.items) * o.schedule.count) / 1440) * Math.max(0, end - start) / 10) * 10;
    cell.infusion = { volumeMl, state: end <= nowAbs ? "done" : start > nowAbs ? "planned" : "now" };
  } else {
    cell.timesPerDay = o.schedule.count;
  }
  return cell;
}

export interface PrescriptionCell {
  /** One slot per prescribed timing; null where the drug is not taken that day at that timing. */
  slots: { timing: DoseTiming; state: MarkState | null }[];
  prnUses: string[];
  stopped: boolean;
}

/** Window in which scheduled doses are taken: from the first dose to the end of the course or the stop. */
function rxWindow(entry: OrderEntry, nowAbs: number): { from: number; to: number } {
  const o = entry.order as PrescriptionOrder;
  const firstTiming = o.start.timing ?? o.timings[0];
  const from = firstTiming ? abs(o.start.day, WARD_RULES.medTimes[firstTiming]) : o.start.day * 1440;
  let to = o.days ? (o.start.day + o.days) * 1440 + (firstTiming ? abs(0, WARD_RULES.medTimes[firstTiming]) : 0) : Infinity;
  if (entry.status === "中止") {
    const stop = entry.stoppedOn === undefined || entry.stoppedOn === 0 ? nowAbs : (entry.stoppedOn + 1) * 1440;
    to = Math.min(to, stop);
  }
  return { from, to };
}

export function prescriptionCell(entry: OrderEntry, day: DayOffset, nowAbs: number): PrescriptionCell {
  const o = entry.order as PrescriptionOrder;
  const { from, to } = rxWindow(entry, nowAbs);
  const slots = o.timings.map((timing) => {
    const t = abs(day, WARD_RULES.medTimes[timing]);
    // 退院時処方 is taken at home: nothing to give on the ward.
    return { timing, state: o.category !== "退院時" && t >= from && t < to ? stateAt(t, nowAbs) : null };
  });
  return {
    slots,
    prnUses: (o.prnUses ?? []).filter((u) => u.day === day).map((u) => u.time),
    stopped: entry.status === "中止" && (entry.stoppedOn ?? 0) === day,
  };
}

export interface ProcedureCell {
  /** 酸素・留置: the order runs (part of) this day. */
  running?: { state: MarkState | "now"; from?: string; to?: string };
  /** Times it is done (scheduled ones past now count as done; 必要時 ones only as recorded). */
  times: { time: string; state: MarkState }[];
  stopped?: { time: string | null };
}

export function procedureCell(entry: OrderEntry, day: DayOffset, nowAbs: number): ProcedureCell {
  const o = entry.order as ProcedureOrder;
  const lo = day * 1440;
  const hi = lo + 1440;
  const { from, to } = procInterval(entry, nowAbs);
  const cell: ProcedureCell = { times: [] };
  if (entry.status === "中止" && to !== null && to >= lo && to < hi) cell.stopped = { time: hhmm(to - lo) };
  if (o.schedule.kind === "continuous") {
    if (from < hi && (to === null || to > lo)) {
      const end = Math.min(hi, to ?? Infinity);
      cell.running = {
        state: end <= nowAbs ? "done" : Math.max(lo, from) > nowAbs ? "planned" : "now",
        from: from >= lo ? hhmm(from - lo) : undefined,
        to: to !== null && to < hi ? hhmm(to - lo) : undefined,
      };
    }
    return cell;
  }
  cell.times = procEvents(entry, lo, hi, nowAbs).map((t) => ({ time: hhmm(t - lo), state: stateAt(t, nowAbs) }));
  return cell;
}

/** Short list of what is still ahead today (and the next morning's draw), for the patient list. */
export function upcomingToday(entries: OrderEntry[], nowAbs: number): string[] {
  const out: { at: number; text: string }[] = [];
  for (const e of entries) {
    const o = e.order;
    if (o.type === "lab" && e.status !== "中止") {
      const t = abs(o.collect.day, o.collect.time);
      if (t > nowAbs && o.collect.day <= 1) out.push({ at: t, text: `${o.collect.day === 1 ? "明日" : ""}${o.collect.time} 採血` });
    }
    if (o.type === "injection" && e.status === "有効" && o.schedule.kind === "every_hours") {
      for (const t of doseTimes(e, nowAbs, nowAbs + 1, 1440)) {
        const d = findDrug(o.items[0].drugCode);
        out.push({ at: t, text: `${hhmm(t)} ${d?.aliases[0] ?? d?.name ?? ""}` });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.text);
}
