// Turn orders into the short lines shown in the chart.

import { addDays, formatShort, type CalendarDate } from "./dates";
import { findDrug, findLab, findSet } from "./master";
import type { InjectionOrder, InjectionSchedule, LabOrder, Order } from "./types";

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
export function scheduleTextFor(order: InjectionOrder): string {
  const main = findDrug(order.items[0]?.drugCode ?? "");
  if (order.schedule.kind === "per_day" && main?.kind === "輸液") return `1日${order.schedule.count}本`;
  return scheduleText(order.schedule);
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
  if (order.minutesPerDose) parts.push(`1回${order.minutesPerDose}分`);
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

export function orderLines(order: Order, today: CalendarDate) {
  return order.type === "injection" ? injectionLines(order, today) : labLines(order, today);
}

export const ORDER_TYPE_LABEL: Record<Order["type"], string> = {
  injection: "注射",
  lab: "検体検査",
};
