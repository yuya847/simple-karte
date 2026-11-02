// Turn orders into the short lines shown in the chart.

import { addDays, formatShort, type CalendarDate } from "./dates";
import { findDrug, findLab, findOralDrug, findSet } from "./master";
import type { InjectionOrder, InjectionSchedule, LabOrder, Order, PrescriptionOrder } from "./types";

export function scheduleText(s: InjectionSchedule): string {
  switch (s.kind) {
    case "per_day":
      return `1日${s.count}回`;
    case "every_hours":
      return `${s.hours}時間ごと`;
    case "once":
      return "1回のみ";
  }
}

/** Fluids are counted in bags ("本"), other drugs in doses ("回"). */
export function scheduleLabel(s: InjectionSchedule, mainDrugCode?: string | null): string {
  const main = mainDrugCode ? findDrug(mainDrugCode) : undefined;
  if (s.kind === "per_day" && main?.kind === "輸液") return `1日${s.count}本`;
  return scheduleText(s);
}

export function scheduleTextFor(order: InjectionOrder): string {
  return scheduleLabel(order.schedule, order.items[0]?.drugCode);
}

/** "30分", "1時間", "10時間", "1時間30分" */
export function durationText(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}分`;
  return m % 60 === 0 ? `${m / 60}時間` : `${Math.floor(m / 60)}時間${m % 60}分`;
}

export function drugName(code: string): string {
  const d = findDrug(code);
  return d ? `${d.name} ${d.package}` : code;
}

export function labName(code: string): string {
  return findSet(code)?.name ?? findLab(code)?.name ?? code;
}

export function injectionLines(order: InjectionOrder, today: CalendarDate): { main: string; detail: string } {
  const main = order.items.map((it) => `${drugName(it.drugCode)}　${it.amount}${it.unit}`).join(" ＋ ");
  const parts = [order.route, scheduleTextFor(order)];
  if (order.minutesPerDose) parts.push(`1回${durationText(order.minutesPerDose)}`);
  if (order.rateMlPerH) parts.push(`${order.rateMlPerH}mL/時`);
  const start = formatShort(addDays(today, order.start.day));
  parts.push(`開始 ${start}${order.start.time ? ` ${order.start.time}` : ""}`);
  parts.push(order.days ? `${order.days}日間` : "継続");
  if (order.comment) parts.push(order.comment);
  return { main, detail: parts.join("　") };
}

export function labLines(order: LabOrder, today: CalendarDate): { main: string; detail: string } {
  const main = order.codes.map(labName).join("、");
  const when = `${formatShort(addDays(today, order.collect.day))} ${order.collect.time}`;
  const parts = [`採取 ${when}`, order.priority];
  if (order.comment) parts.push(order.comment);
  return { main, detail: parts.join("　") };
}

export function oralName(code: string): string {
  const d = findOralDrug(code);
  return d ? `${d.name} ${d.strength}` : code;
}

/** "1日2回 朝・夕" or "頓用 発熱時（38.5℃以上） 1日3回まで" */
export function timingText(o: PrescriptionOrder): string {
  if (o.timings.length === 0) return `頓用 ${o.prn ?? ""}${o.maxPerDay ? ` 1日${o.maxPerDay}回まで` : ""}`.trim();
  return `1日${o.timings.length}回 ${o.timings.join("・")}`;
}

export function prescriptionLines(order: PrescriptionOrder, today: CalendarDate): { main: string; detail: string } {
  const main = `${oralName(order.drugCode)}　1回${order.amount}${order.unit}`;
  const parts: string[] = [order.category, timingText(order)];
  parts.push(`開始 ${formatShort(addDays(today, order.start.day))}${order.start.timing ? ` ${order.start.timing}` : ""}`);
  parts.push(order.days ? `${order.days}日分` : "継続");
  if (order.comment) parts.push(order.comment);
  return { main, detail: parts.join("　") };
}

export function orderLines(order: Order, today: CalendarDate) {
  if (order.type === "injection") return injectionLines(order, today);
  if (order.type === "lab") return labLines(order, today);
  return prescriptionLines(order, today);
}

export const ORDER_TYPE_LABEL: Record<Order["type"], string> = {
  injection: "注射",
  lab: "検体検査",
  prescription: "処方",
};
