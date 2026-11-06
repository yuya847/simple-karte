import { insulinDoseTimes } from "./insulin-doses";
import { patternDay } from "./day-pattern";
// Calculations behind the flow sheet (経過表). Times are "absolute minutes": day offset × 1440
// plus minutes since midnight, so today 18:00 is 1080 and yesterday 06:00 is -1080.

import { defaultDoseTimes } from "./inj-entry";
import { type CalendarDate, minutesOf } from "./dates";
import { doseVolumeMl } from "./drafts";
import type { DayOffset, InjectionOrder, OrderEntry } from "./types";

export const abs = (day: DayOffset, time: string) => day * 1440 + minutesOf(time);

/** When an injection order runs: from its start until it was stopped (or open-ended). */
export function orderInterval(entry: OrderEntry, nowAbs: number): { from: number; to: number | null } {
  const o = entry.order as InjectionOrder;
  const from = abs(o.start.day, o.start.time ?? entry.time);
  let to: number | null = o.end ? abs(o.end.day, o.end.time) : null;
  if (o.days) to = Math.min(to ?? Infinity, o.dayPattern ? (o.start.day + o.days) * 1440 : from + o.days * 1440);
  if (entry.status === "中止") {
    const stopped = entry.stoppedTime ? abs(entry.stoppedOn ?? 0, entry.stoppedTime) : entry.stoppedOn === 0 || entry.stoppedOn === undefined ? nowAbs : (entry.stoppedOn + 1) * 1440;
    to = Math.min(to ?? Infinity, Math.max(from, stopped));
  }
  return { from, to };
}

/** Prescribed times, per-day defaults, or every-N-hours occurrences inside [lo, hi). */
export function doseTimes(entry: OrderEntry, nowAbs: number, lo: number, hi: number, base?: CalendarDate): number[] {
  const o = entry.order as InjectionOrder;
  const times = o.insulinDoses ? insulinDoseTimes(o.insulinDoses, o.sliding?.times) : o.sliding ? o.sliding.times : o.doseTimes?.length ? o.doseTimes : o.schedule.kind === "per_day" ? defaultDoseTimes(o.schedule) : [];
  if (times.length) {
    const { from, to } = orderInterval(entry, nowAbs);
    const out: number[] = [];
    for (let day = Math.floor(Math.max(lo, from) / 1440) - 1; day <= Math.floor(hi / 1440); day++) {
      if (!patternDay(o.dayPattern, o.start.day, day, base) || day < o.start.day || (o.days && day >= o.start.day + o.days)) continue;
      for (const time of times) {
        const at = abs(day, time);
        if (at >= from && at >= lo && at < hi && (to === null || at < to)) out.push(at);
      }
    }
    return [...new Set(out)].sort((a, b) => a - b);
  }
  if (o.schedule.kind !== "every_hours") return [];
  const { from, to } = orderInterval(entry, nowAbs);
  const step = o.schedule.hours * 60;
  const end = Math.min(hi, to ?? Infinity, o.days ? o.dayPattern ? (o.start.day + o.days) * 1440 : from + o.days * 1440 : Infinity);
  const out: number[] = [];
  for (let t = from; t < end; t += step) if (t >= lo && patternDay(o.dayPattern, o.start.day, Math.floor(t / 1440), base)) out.push(t);
  return out;
}

/** Infused volume (mL) in [lo, hi) from injection orders (not rounded). An estimate from the orders, not a measurement. */
export function fluidInWindow(entries: OrderEntry[], lo: number, hi: number, nowAbs: number): number {
  let total = 0;
  for (const e of entries) {
    if (e.order.type !== "injection") continue;
    const o = e.order;
    const vol = doseVolumeMl(o.items);
    if (vol === 0) continue;
    if (o.schedule.kind === "every_hours") {
      total += doseTimes(e, nowAbs, lo, hi).length * vol;
    } else if (o.schedule.kind === "per_day") {
      const { from, to } = orderInterval(e, nowAbs);
      let overlap = 0;
      for (let day = Math.floor(lo / 1440); day < Math.ceil(hi / 1440); day++) {
        if (patternDay(o.dayPattern, o.start.day, day)) overlap += Math.max(0, Math.min(hi, to ?? Infinity, (day + 1) * 1440) - Math.max(lo, from, day * 1440));
      }
      total += ((vol * o.schedule.count) / 1440) * overlap;
    } else {
      const t = abs(o.start.day, o.start.time ?? e.time);
      if (t >= lo && t < hi) total += vol;
    }
  }
  return total;
}

/** Infused volume (mL) per day from injection orders. An estimate from the orders, not a measurement. */
export function fluidByDay(entries: OrderEntry[], days: DayOffset[], nowAbs: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const d of days) out[d] = Math.round(fluidInWindow(entries, d * 1440, d * 1440 + 1440, nowAbs) / 10) * 10;
  return out;
}
