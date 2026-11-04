// Entering from a cell of the flow sheet (経過表): what a pressed cell asks for (which existing entry, at
// what time) and who may do it. The entries themselves are the chart's own (バイタル・看護ケアの記録・
// 水分出納・与薬の記録・指示受け); nothing here stores anything.

import { shiftAt } from "./flow-scale";
import type { Action } from "./roles";

export type FlowEntry =
  /** バイタル at a time (the entry opens with that time, not later than now). */
  | { kind: "vitals"; at: number }
  /** 看護ケア・観察 of one item, the tasks between lo and hi. */
  | { kind: "care"; item: string; lo: number; hi: number }
  /** 水分出納 at a time. */
  | { kind: "io"; at: number }
  /** 与薬・実施 of these orders between lo and hi. */
  | { kind: "mar"; orderIds: string[]; lo: number; hi: number; label: string }
  /** 指示受け of these orders (none = all this patient's orders not yet taken). */
  | { kind: "take"; orderIds: string[] };

/** Who may do each (roles.ts): nurses record care, doses and 指示受け; nurses and doctors record vitals and IN/OUT. */
export const ENTRY_ACTION: Record<FlowEntry["kind"], Action> = { vitals: "vitals", care: "mar", io: "vitals", mar: "mar", take: "mar" };

export const ENTRY_LABEL: Record<FlowEntry["kind"], string> = { vitals: "バイタルを入れる", care: "看護ケア・観察を記録する", io: "水分出納を入れる", mar: "実施を記録する（与薬）", take: "指示受けをする" };

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** The time on the axis under a point: rounded to 5 minutes, and not later than now. */
export function timeAtX(px: number, plotW: number, lo: number, hi: number, nowAbs: number): number {
  const t = lo + (Math.max(0, Math.min(plotW, px)) / plotW) * (hi - lo);
  return Math.min(nowAbs, Math.round(t / 5) * 5);
}

/** The day and clock time of a time, for an entry that takes them ("14:20" of yesterday). */
export const dayTime = (at: number) => ({ day: Math.floor(at / 1440), time: hhmm(at) });

/** The tasks a pressed cell covers: its day (one column a day), or the shift that holds the time. */
export function cellWindow(day: number, at: number | null): { lo: number; hi: number } {
  if (at === null) return { lo: day * 1440, hi: day * 1440 + 1440 };
  const s = shiftAt(at);
  return { lo: s.lo, hi: s.hi };
}

/** The "HH:MM" an IN/OUT entry starts with: only within the last 24 hours (its time box reads the last such time). */
export const ioTimeFor = (at: number, nowAbs: number) => (at <= nowAbs && nowAbs - at < 1440 ? hhmm(at) : undefined);

/** The orders not yet taken (指示受け) among these, from the change keys "orderId|新規" etc. */
export const untakenOf = (keys: string[]) => [...new Set(keys.map((k) => k.split("|")[0]))];
