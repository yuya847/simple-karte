import { patternDay, rxLastDay } from "./day-pattern";
import type { CalendarDate } from "./dates";
import type { PrescriptionOrder, OrderEntry } from "./types";
import { previousOf, type RxPattern } from "./rx-memory";
export type PrescriptionSeed = { key: string; pattern?: RxPattern; day?: number };
export const calendarGroup = (key: string) => key === "rxcal" ? "intervention" : "reference";
export function resizedPrescriptionDays(days: number, pixels: number, width: number, order?: PrescriptionOrder, today?: CalendarDate): number | null {
  let delta = Math.round(pixels / width);
  if (order?.dayPattern && order.days) {
    const target = (rxLastDay(order, today) ?? order.start.day) + delta;
    let count = 0;
    for (let day = order.start.day; day <= target; day++) if (patternDay(order.dayPattern, order.start.day, day, today)) count++;
    delta = count - days;
  }
  return delta && Number.isInteger(days) && days + delta > 0 ? delta : null;
}

export function prescriptionCalendarSeed(key: string, day: number, patientId: string, from?: OrderEntry): PrescriptionSeed {
  const entry = from?.order.type === "prescription" && from.order.category === "持参薬" ? { ...from, order: { ...from.order, category: "定期" as const } } : from;
  return { key, day, pattern: entry ? previousOf(patientId, [entry])[0] : undefined };
}
