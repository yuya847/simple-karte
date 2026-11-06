import { patternDay, rxLastDay } from "./day-pattern";
import { WARD_PLANS } from "./ward";
import { regularDayOffset } from "./rx-schedule";
import { todayInTokyo, type CalendarDate } from "./dates";
import { anyDrugName } from "./master";
import type { OrderEntry, Patient } from "./types";
import type { Flag } from "./patient-flags";

export interface RxExpiry { entry: OrderEntry; lastDay: number; name: string; days: number; beforeRegular: boolean }
export const expiryDay = (day: number) => ["今日", "明日", "明後日"][day] ?? `${day}日後`;
export function rxExpiries(patient: Pick<Patient, "ward" | "dischargedAt"> & Partial<Pick<Patient, "name" | "room">>, entries: OrderEntry[], base: CalendarDate = todayInTokyo()): RxExpiry[] {
  if (patient.dischargedAt) return [];
  const planned = patient.ward.replace(/病棟$/, "") === "5階東" ? WARD_PLANS.filter(plan => plan.kind === "退院" && plan.name === patient.name && `${plan.room}${plan.bed}` === patient.room).map(plan => plan.day) : [];
  const discharge = Math.min(...planned, ...entries.flatMap(e => e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院" ? [e.order.leave.from.day] : []));
  const next = regularDayOffset(patient.ward, new Date(base.y, base.m - 1, base.d));
  const identity = (e: OrderEntry) => e.order.type === "prescription" ? `rx:${e.order.drugCode}` : e.order.type === "injection" ? `inj:${e.order.route}:${e.order.items.map(i => i.drugCode).sort().join(",")}` : e.id;
  return entries.flatMap(entry => {
    const o = entry.order;
    if (entry.status !== "有効" || (o.type !== "prescription" && o.type !== "injection") || !o.days || o.days < 1) return [];
    if (o.type === "prescription" && (o.category === "退院時" || o.prn || o.once || !o.timings.length)) return [];
    if (o.type === "injection" && o.schedule.kind === "once") return [];
    let last = o.type === "prescription" ? rxLastDay(o, base)! : o.start.day + o.days - 1;
    if (o.type === "injection") while (last >= o.start.day && !patternDay(o.dayPattern, o.start.day, last, base)) last--;
    if (last < 0 || last > discharge || last < o.start.day) return [];
    if (last > 2 && (next === null || last > next)) return [];
    if (entries.some(e => {
      const newer = e.order;
      if (e.id === entry.id || e.status !== "有効" || (newer.type !== "prescription" && newer.type !== "injection") || newer.start.day > last + 1) return false;
      if (newer.type === "prescription" && (newer.category === "退院時" || newer.prn || newer.once || !newer.timings.length)) return false;
      if (newer.type === "injection" && newer.schedule.kind === "once") return false;
      const newerEnd = newer.type === "prescription" ? rxLastDay(newer, base) : newer.days ? newer.start.day + newer.days - 1 : null;
      return newer.replaces === entry.id || (identity(e) === identity(entry) && newer.start.day > o.start.day && (newerEnd === null || newerEnd > last));
    })) return [];
    return [{ entry, lastDay: last, days: o.days, name: o.type === "prescription" ? anyDrugName(o.drugCode) : o.items.map(i => anyDrugName(i.drugCode)).join("・"), beforeRegular: next !== null && last <= next }];
  });
}
export function expiryFlags(rows: RxExpiry[]): Flag[] {
  const day = Math.min(...rows.map(r => r.lastDay));
  return Number.isFinite(day) ? [{ label: `処方切れ ${expiryDay(day)}`, tone: day === 0 ? "shu" : day === 1 ? "yamabuki" : "ink", title: rows.map(r => `${r.name}：${expiryDay(r.lastDay)}${r.beforeRegular ? "（次の定期処方日まで）" : ""}`).join("、") }] : [];
}
export const expiryKey = (r: RxExpiry) => `rx-expiry:${r.entry.id}:${r.lastDay}`;

export function visibleExpiryStickies<T extends { id: string }>(stickies: T[], rows: RxExpiry[]): T[] {
  const active = new Set(rows.map(expiryKey));
  return stickies.filter(s => !s.id.startsWith("rx-expiry:") || (active.has(s.id) && !stickies.some(done => done.id === `${s.id}:done`)));
}
export function expirySummary(rows: RxExpiry[]): string {
  const day = Math.min(...rows.map(r => r.lastDay));
  const soon = rows.filter(r => r.lastDay === day);
  const oral = soon.filter(r => r.entry.order.type === "prescription").length;
  const injection = soon.length - oral;
  return `${[oral ? `内服 ${oral}剤` : "", injection ? `注射 ${injection}件` : ""].filter(Boolean).join("・")}が${expiryDay(day)}で切れます`;
}
