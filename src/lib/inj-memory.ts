// 注射の記憶: the injections a doctor has ordered, grouped by the same drugs, route, frequency and drip,
// counted (most used first), and this patient's previous injections (Do). The doctor picks; the past
// orders here are FICTIONAL.

import { kanaMatch } from "./kana";
import { DRUGS } from "./master";
import type { InjectionOrder, OrderEntry } from "./types";

export interface InjPattern {
  key: string;
  order: InjectionOrder;
  count: number;
  lastDay: number;
  patients: number;
}

const keyOf = (o: InjectionOrder) => [o.items.map((i) => `${i.drugCode}:${i.amount}${i.unit}`).join("+"), o.route, JSON.stringify(o.schedule), JSON.stringify(o.dayPattern ?? null), o.minutesPerDose ?? "", o.rateMlPerH ?? "", o.days ?? ""].join("|");

export function injPatternsOf(entries: { patientId: string; entry: OrderEntry }[]): InjPattern[] {
  const out = new Map<string, InjPattern & { who: Set<string> }>();
  for (const { patientId, entry } of entries) {
    if (entry.order.type !== "injection") continue;
    const o = entry.order;
    if (o.items.some((i) => DRUGS.find((d) => d.code === i.drugCode)?.chemo)) continue; // 抗がん薬はレジメンの欄から
    const k = keyOf(o);
    const cur = out.get(k);
    if (cur) {
      cur.count += 1;
      cur.lastDay = Math.max(cur.lastDay, entry.day);
      cur.who.add(patientId);
    } else out.set(k, { key: k, order: o, count: 1, lastDay: entry.day, patients: 0, who: new Set([patientId]) });
  }
  return [...out.values()].map(({ who, ...p }) => ({ ...p, patients: who.size })).sort((a, b) => b.count - a.count || b.lastDay - a.lastDay);
}

/** This patient's injections, newest first (Do). */
export function injPreviousOf(patientId: string, entries: OrderEntry[]): InjPattern[] {
  return injPatternsOf(entries.map((entry) => ({ patientId, entry }))).sort((a, b) => b.lastDay - a.lastDay);
}

export const matchInj = (p: InjPattern, typed: string) => !typed.trim() || p.order.items.some((i) => {
  const d = DRUGS.find((x) => x.code === i.drugCode);
  return !!d && [d.name, d.generic ?? "", d.category ?? "", ...d.aliases].some((w) => kanaMatch(w, typed));
});

const past = (id: string, patientId: string, day: number, o: Omit<InjectionOrder, "type" | "start">): { patientId: string; entry: OrderEntry } => ({
  patientId,
  entry: { kind: "order", id, day, time: "10:00", author: "山本（専攻医）", status: "中止", stoppedOn: day + 5, order: { type: "injection", start: { day, time: "12:00" }, ...o } },
});

/** The doctor's earlier injections to patients already discharged (FICTIONAL). */
export const PAST_INJ: { patientId: string; entry: OrderEntry }[] = [
  ...[-100, -77, -50, -31, -12].map((d, i) =>
    past(`pi-cez-${i}`, `a${i}`, d, { items: [{ drugCode: "INJ-CEZ1", amount: 2, unit: "g" }, { drugCode: "INJ-NS100", amount: 100, unit: "mL" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 8 }, minutesPerDose: 30 }),
  ),
  ...[-90, -60, -44, -20, -8, -3].map((d, i) =>
    past(`pi-ctrx-${i}`, `b${i}`, d, { items: [{ drugCode: "INJ-CTRX1", amount: 2, unit: "g" }, { drugCode: "INJ-NS100", amount: 100, unit: "mL" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 24 }, minutesPerDose: 30 }),
  ),
  ...[-70, -40, -15].map((d, i) =>
    past(`pi-sbt-${i}`, `c${i}`, d, { items: [{ drugCode: "INJ-SBTABPC3", amount: 3, unit: "g" }, { drugCode: "INJ-NS100", amount: 100, unit: "mL" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 6 }, minutesPerDose: 30 }),
  ),
  ...[-85, -55, -25, -6].map((d, i) => past(`pi-sol-${i}`, `d${i}`, d, { items: [{ drugCode: "INJ-SOL3A500", amount: 1, unit: "本" }], route: "点滴静注", schedule: { kind: "per_day", count: 2 }, rateMlPerH: 80 })),
  ...[-65, -22].map((d, i) => past(`pi-frs-${i}`, `e${i}`, d, { items: [{ drugCode: "INJ-FRS20", amount: 20, unit: "mg" }], route: "静注", schedule: { kind: "per_day", count: 1 } })),
];
