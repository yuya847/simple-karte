// When a procedure order runs and when each time of it is done. Shared by the 処置カレンダー
// and the billing engine so both read the same times.
//
// Doing is not recorded in this prototype for scheduled procedures: a time that has passed
// counts as done (as for injections). As-needed (必要時) ones count only from the record of
// when they were done.

import { minutesOf } from "./dates";
import { procTimes } from "./procedures";
import type { OrderEntry, ProcedureOrder } from "./types";

const DAY = 1440;
const abs = (day: number, time: string) => day * DAY + minutesOf(time);

/** [from, to) in minutes from today 00:00. `to` is null while the order runs on. */
export function procInterval(entry: OrderEntry, nowAbs: number): { from: number; to: number | null } {
  const o = entry.order as ProcedureOrder;
  const from = abs(o.start.day, o.start.time ?? entry.time);
  let to: number | null = null;
  if (entry.status === "中止") {
    if (entry.stoppedTime) to = abs(entry.stoppedOn ?? 0, entry.stoppedTime);
    // Stops made today are at "now"; earlier stops without a time are at the end of that day.
    else to = entry.stoppedOn === 0 || entry.stoppedOn === undefined ? nowAbs : (entry.stoppedOn + 1) * DAY;
    to = Math.max(from, to);
  }
  if (o.days) to = Math.min(to ?? Infinity, from + o.days * DAY);
  return { from, to };
}

/** Minutes the order ran inside [lo, hi), counting only up to now. */
export function procMinutes(entry: OrderEntry, lo: number, hi: number, nowAbs: number): number {
  const { from, to } = procInterval(entry, nowAbs);
  const start = Math.max(lo, from);
  const end = Math.min(hi, to ?? Infinity, nowAbs);
  return Math.max(0, end - start);
}

/**
 * Times (minutes from today 00:00) the procedure is done inside [lo, hi), past or ahead.
 * Ward clock times; on the first day, the clock times from the start on, or the start itself
 * when none is left that day.
 */
export function procEvents(entry: OrderEntry, lo: number, hi: number, nowAbs: number): number[] {
  const o = entry.order as ProcedureOrder;
  const { from, to } = procInterval(entry, nowAbs);
  const end = Math.min(hi, to ?? Infinity);
  const inside = (t: number) => t >= lo && t < end && t >= from;
  const s = o.schedule;
  if (s.kind === "continuous") return [];
  if (s.kind === "prn") return (o.done ?? []).map((d) => abs(d.day, d.time)).filter(inside);
  if (s.kind === "once") return inside(from) ? [from] : [];

  const count = s.kind === "per_day" ? s.count : 1;
  const every = s.kind === "every_days" ? s.days : 1;
  const firstDay = Math.floor(from / DAY);
  const out: number[] = [];
  for (let day = Math.floor(lo / DAY); day * DAY < end; day++) {
    if ((day - firstDay) % every !== 0 || day < firstDay) continue;
    const times = procTimes(count).map((t) => abs(day, t));
    if (day === firstDay) {
      const left = times.filter((t) => t >= from);
      out.push(...(left.length ? left : [from]));
    } else out.push(...times);
  }
  return out.filter(inside);
}
