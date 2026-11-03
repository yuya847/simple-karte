// 処方の記憶: the prescriptions a doctor has written, grouped into Rp (drugs given with one usage) and
// counted, so the doctor can pick one of their own patterns instead of typing it again. Also this
// patient's previous prescriptions (Do 処方) and named sets. The doctor chooses; the app only remembers
// and sorts (by how often and how recently). The past orders here are FICTIONAL.

import { kanaMatch } from "./kana";
import { findOralDrug } from "./master";
import { TIMINGS_BY_TIMES } from "./rx";
import type { DoseTiming, OrderEntry, PrescriptionOrder } from "./types";

export interface RxPattern {
  key: string;
  rows: { drugCode: string; per: number }[];
  times: number | "頓用";
  /** The usage label (毎食後, 朝夕食後 …), empty for 頓用. */
  timing: string;
  days: number | null;
  category: "定期" | "臨時";
  prn?: string;
  maxPerDay?: number;
  count: number;
  /** The most recent day it was ordered (day offset). */
  lastDay: number;
  patients: number;
}

const timingLabel = (t: DoseTiming[]) => (t.length ? (TIMINGS_BY_TIMES[t.length]?.find((c) => c.timings.join() === t.join())?.label ?? t.join("・")) : "");

/** One Rp per (patient, rp) from prescription orders; 持参薬 (the patient's own drugs) are left out. */
export function rpsOf(entries: { patientId: string; entry: OrderEntry }[]): (Omit<RxPattern, "count" | "lastDay" | "patients"> & { day: number; patientId: string })[] {
  const groups = new Map<string, { patientId: string; day: number; orders: PrescriptionOrder[] }>();
  for (const { patientId, entry } of entries) {
    const o = entry.order;
    if (o.type !== "prescription" || o.category === "持参薬") continue;
    const k = `${patientId}|${o.rp ?? entry.id}`;
    const g = groups.get(k) ?? { patientId, day: entry.day, orders: [] };
    g.orders.push(o);
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => {
    const o = g.orders[0];
    const rows = g.orders.map((x) => ({ drugCode: x.drugCode, per: x.amount }));
    const times: number | "頓用" = o.timings.length ? o.timings.length : "頓用";
    const timing = timingLabel(o.timings);
    const category = o.category === "定期" ? "定期" : "臨時";
    const key = [rows.map((r) => `${r.drugCode}:${r.per}`).join("+"), times, timing, o.days ?? "", category, o.prn ?? "", o.maxPerDay ?? ""].join("|");
    return { key, rows, times, timing, days: o.days ?? null, category, prn: o.prn, maxPerDay: o.maxPerDay, day: g.day, patientId: g.patientId };
  });
}

/** The doctor's patterns, most used first (then most recent). */
export function patternsOf(entries: { patientId: string; entry: OrderEntry }[]): RxPattern[] {
  const out = new Map<string, RxPattern & { who: Set<string> }>();
  for (const r of rpsOf(entries)) {
    const cur = out.get(r.key);
    if (cur) {
      cur.count += 1;
      cur.lastDay = Math.max(cur.lastDay, r.day);
      cur.who.add(r.patientId);
    } else {
      const { day, patientId, ...rest } = r;
      out.set(r.key, { ...rest, count: 1, lastDay: day, patients: 0, who: new Set([patientId]) });
    }
  }
  return [...out.values()]
    .map(({ who, ...p }) => ({ ...p, patients: who.size }))
    .sort((a, b) => b.count - a.count || b.lastDay - a.lastDay);
}

/** This patient's prescriptions, newest first (for Do 処方). */
export function previousOf(patientId: string, entries: OrderEntry[]): RxPattern[] {
  return rpsOf(entries.map((entry) => ({ patientId, entry })))
    .sort((a, b) => b.day - a.day)
    .map(({ day, patientId: _p, ...rest }) => ({ ...rest, count: 1, lastDay: day, patients: 1 }));
}

export const patternLine = (p: Pick<RxPattern, "rows" | "times" | "timing" | "days" | "category" | "prn" | "maxPerDay">) => {
  const drugs = p.rows.map((r) => {
    const d = findOralDrug(r.drugCode);
    return `${d ? `${d.name}${d.strength}` : r.drugCode} 1回${r.per}${d?.unit ?? ""}`;
  });
  const how = p.times === "頓用" ? `頓用 ${p.prn ?? ""}${p.maxPerDay ? `（1日${p.maxPerDay}回まで）` : ""}` : `1日${p.times}回 ${p.timing}${p.days ? `　${p.days}日分` : ""}　${p.category}`;
  return `${drugs.join("、")}　${how}`;
};

export const matchPattern = (p: RxPattern, typed: string) => !typed.trim() || p.rows.some((r) => {
  const d = findOralDrug(r.drugCode);
  return !!d && [d.name, ...d.aliases].some((w) => kanaMatch(w, typed));
});

// ---------------------------------------------------------------------------
// The doctor's earlier prescriptions to patients already discharged (FICTIONAL), so that the
// dictionary has something to remember in the demo.
// ---------------------------------------------------------------------------

const past = (id: string, patientId: string, day: number, o: Omit<PrescriptionOrder, "type" | "start" | "unit"> & { unit?: string }): { patientId: string; entry: OrderEntry } => ({
  patientId,
  entry: { kind: "order", id, day, time: "10:00", author: "山本（専攻医）", status: "中止", stoppedOn: day + (o.days ?? 3), order: { type: "prescription", unit: "錠", start: { day }, ...o } },
});

export const PAST_RX: { patientId: string; entry: OrderEntry }[] = [
  ...[-120, -96, -80, -61, -45, -30, -21, -12].map((d, i) => past(`past-mgo-${i}`, `x${i}`, d, { category: "定期", drugCode: "ORAL-MGO330", amount: 1, timings: ["朝", "夕"], days: 7 })),
  ...[-110, -90, -70, -52, -40, -33, -25, -18, -9, -4].map((d, i) => past(`past-apap-${i}`, `y${i}`, d, { category: "臨時", drugCode: "ORAL-APAP500", amount: 1, timings: [], prn: "発熱時（38.5℃以上）", maxPerDay: 3 })),
  ...[-100, -75, -50, -28, -14].map((d, i) => past(`past-senna-${i}`, `z${i}`, d, { category: "臨時", drugCode: "ORAL-SENNA12", amount: 2, timings: [], prn: "便秘時", maxPerDay: 1 })),
  ...[-88, -60, -35, -16].flatMap((d, i) => [
    past(`past-lox-${i}`, `w${i}`, d, { category: "臨時", drugCode: "ORAL-LOX60", amount: 1, timings: ["朝", "昼", "夕"], days: 3, rp: `lox-${i}` }),
    past(`past-reba-${i}`, `w${i}`, d, { category: "臨時", drugCode: "ORAL-REBA100", amount: 1, timings: ["朝", "昼", "夕"], days: 3, rp: `lox-${i}` }),
  ]),
  ...[-95, -66, -38].map((d, i) => past(`past-lpz-${i}`, `v${i}`, d, { category: "定期", drugCode: "ORAL-LPZ15", amount: 1, timings: ["朝"], days: 14 })),
  ...[-85, -42].map((d, i) => past(`past-frs-${i}`, `u${i}`, d, { category: "定期", drugCode: "ORAL-FRS20", amount: 1, timings: ["朝"], days: 14 })),
];

// ---------------------------------------------------------------------------
// セット（約束処方）: named groups of Rp kept per person in this browser.
// ---------------------------------------------------------------------------

export interface RxSet {
  id: string;
  name: string;
  owner: string;
  rps: Omit<RxPattern, "count" | "lastDay" | "patients" | "key">[];
}

const SETS_KEY = "simple-karte:rx-sets";
export function loadSets(): RxSet[] {
  try {
    const v = typeof window === "undefined" ? null : window.localStorage.getItem(SETS_KEY);
    const o: unknown = v ? JSON.parse(v) : [];
    return Array.isArray(o) ? (o as RxSet[]) : [];
  } catch {
    return [];
  }
}
export function saveSets(sets: RxSet[]) {
  try {
    window.localStorage.setItem(SETS_KEY, JSON.stringify(sets));
  } catch {
    // Storage blocked: the set lasts until the page is closed.
  }
}
