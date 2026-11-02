// Calculations behind the flow sheet (経過表). Times are "absolute minutes": day offset × 1440
// plus minutes since midnight, so today 18:00 is 1080 and yesterday 06:00 is -1080.

import { minutesOf } from "./dates";
import { doseVolumeMl } from "./drafts";
import type { DayOffset, InjectionOrder, OrderEntry } from "./types";

export const abs = (day: DayOffset, time: string) => day * 1440 + minutesOf(time);

/** When an injection order runs: from its start until it was stopped (or open-ended). */
export function orderInterval(entry: OrderEntry, nowAbs: number): { from: number; to: number | null } {
  const o = entry.order as InjectionOrder;
  const from = abs(o.start.day, o.start.time ?? entry.time);
  if (entry.status === "中止") {
    // Stops made today are at "now"; earlier stops are at the end of the day they were made.
    const to = entry.stoppedOn === 0 || entry.stoppedOn === undefined ? nowAbs : (entry.stoppedOn + 1) * 1440;
    return { from, to: Math.max(from, to) };
  }
  if (o.days) return { from, to: from + o.days * 1440 };
  return { from, to: null };
}

/** Dose times of an every-N-hours order inside [lo, hi). */
export function doseTimes(entry: OrderEntry, nowAbs: number, lo: number, hi: number): number[] {
  const o = entry.order as InjectionOrder;
  if (o.schedule.kind !== "every_hours") return [];
  const { from, to } = orderInterval(entry, nowAbs);
  const step = o.schedule.hours * 60;
  const end = Math.min(hi, to ?? Infinity);
  const out: number[] = [];
  for (let t = from; t < end; t += step) if (t >= lo) out.push(t);
  return out;
}

/** Infused volume (mL) per day from injection orders. An estimate from the orders, not a measurement. */
export function fluidByDay(entries: OrderEntry[], days: DayOffset[], nowAbs: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const d of days) {
    const lo = d * 1440;
    const hi = lo + 1440;
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
        const overlap = Math.max(0, Math.min(hi, to ?? Infinity) - Math.max(lo, from));
        total += ((vol * o.schedule.count) / 1440) * overlap;
      } else {
        const t = abs(o.start.day, o.start.time ?? e.time);
        if (t >= lo && t < hi) total += vol;
      }
    }
    out[d] = Math.round(total / 10) * 10;
  }
  return out;
}
