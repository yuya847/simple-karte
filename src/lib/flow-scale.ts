// The period and time scale of the flow sheet (経過表): from admission (one column a day, the default),
// a week, three days, one day, one shift (勤務帯) or one hour, moved back and forth or back to now.
// Times are absolute minutes from today 00:00 (see flowsheet.ts).

import { SHIFTS } from "./worksheet";

export type FlowScale = "all" | "week" | "3d" | "1d" | "shift" | "1h";

export const FLOW_SCALES: { key: FlowScale; label: string; title: string }[] = [
  { key: "all", label: "入院から", title: "入院の日から明日まで、1日1列" },
  { key: "week", label: "1週", title: "7日（1日1列）" },
  { key: "3d", label: "3日", title: "3日（時刻の位置に出す）" },
  { key: "1d", label: "1日", title: "0時〜24時" },
  { key: "shift", label: "勤務帯", title: `日勤 ${SHIFTS.day.from}〜${SHIFTS.day.to}／夜勤 ${SHIFTS.night.from}〜翌${SHIFTS.night.to}` },
  { key: "1h", label: "1時間", title: "1時間（10分ごと）" },
];

export interface FlowTick {
  at: number;
  label: string;
  /** A day boundary (or the start of the window). */
  major: boolean;
}

export interface FlowWindow {
  scale: FlowScale;
  lo: number;
  hi: number;
  /** Day columns (入院から・1週): the rows show one cell a day. Otherwise items sit at their time. */
  byDay: boolean;
  /** The shift shown (勤務帯). */
  shift?: "day" | "night";
  ticks: FlowTick[];
  /** Fewest pixels a day (or the whole window) needs before the sheet scrolls sideways. */
  minWidth: number;
}

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};
const hourLabel = (min: number) => `${Math.floor((((min % 1440) + 1440) % 1440) / 60)}時`;

/** The shift that holds a time, as the worksheet opens it: before 08:30 the night before, until 17:00 the day shift. */
export function shiftAt(t: number): { shift: "day" | "night"; lo: number; hi: number } {
  const d = Math.floor(t / 1440);
  const m = t - d * 1440;
  const at = (day: number, time: string) => day * 1440 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  if (m < at(0, SHIFTS.day.from)) return { shift: "night", lo: at(d - 1, SHIFTS.night.from), hi: at(d, SHIFTS.night.to) };
  if (m < at(0, SHIFTS.day.to)) return { shift: "day", lo: at(d, SHIFTS.day.from), hi: at(d, SHIFTS.day.to) };
  return { shift: "night", lo: at(d, SHIFTS.night.from), hi: at(d + 1, SHIFTS.night.to) };
}

function ticksEvery(lo: number, hi: number, step: number, label: (t: number) => string, every = 1): FlowTick[] {
  const out: FlowTick[] = [];
  let n = 0;
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step, n++) out.push({ at: t, label: n % every === 0 || t % 1440 === 0 ? label(t) : "", major: t % 1440 === 0 });
  return out;
}

/**
 * The window of a scale around `anchor` (a time in it). 入院から is fixed (admission to the end of tomorrow);
 * 1週 ends with the day after the anchor's day; 3日 is the day before, the day and the day after.
 */
export function flowWindow(scale: FlowScale, anchor: number, admittedOn: number): FlowWindow {
  const day = Math.floor(anchor / 1440);
  const days = (lo: number, hi: number, minPerDay: number, byDay: boolean): FlowWindow => ({
    scale,
    lo: lo * 1440,
    hi: hi * 1440,
    byDay,
    ticks: byDay ? Array.from({ length: hi - lo + 1 }, (_, i) => ({ at: (lo + i) * 1440, label: "", major: true })) : ticksEvery(lo * 1440, hi * 1440, 360, hourLabel),
    minWidth: (hi - lo) * minPerDay,
  });
  switch (scale) {
    case "all":
      return days(admittedOn, 2, 64, true);
    case "week":
      return days(day - 5, day + 2, 72, true);
    case "3d":
      return days(day - 1, day + 2, 160, false);
    case "1d":
      return { scale, lo: day * 1440, hi: day * 1440 + 1440, byDay: false, ticks: ticksEvery(day * 1440, day * 1440 + 1440, 60, hourLabel, 3), minWidth: 480 };
    case "shift": {
      const s = shiftAt(anchor);
      return { scale, lo: s.lo, hi: s.hi, byDay: false, shift: s.shift, ticks: ticksEvery(s.lo, s.hi, 60, hourLabel, s.shift === "night" ? 2 : 1), minWidth: 480 };
    }
    case "1h": {
      const lo = Math.floor(anchor / 60) * 60;
      return { scale, lo, hi: lo + 60, byDay: false, ticks: ticksEvery(lo, lo + 60, 10, hhmm), minWidth: 480 };
    }
  }
}

/** The anchor one window back (dir −1) or ahead (+1), kept between admission and the end of tomorrow. */
export function stepAnchor(w: FlowWindow, anchor: number, dir: 1 | -1, admittedOn: number): number {
  const step = { all: 0, week: 7 * 1440, "3d": 3 * 1440, "1d": 1440, shift: 0, "1h": 60 }[w.scale];
  const next = w.scale === "shift" ? (dir > 0 ? w.hi : w.lo - 1) : anchor + dir * step;
  return Math.max(admittedOn * 1440, Math.min(2 * 1440 - 1, next));
}

/** Whether a step in that direction still shows something of the stay. */
export function canStep(w: FlowWindow, dir: 1 | -1, admittedOn: number): boolean {
  if (w.scale === "all") return false;
  return dir < 0 ? w.lo > admittedOn * 1440 : w.hi < 2 * 1440;
}

/** The days a window touches. */
export function daysIn(w: Pick<FlowWindow, "lo" | "hi">): number[] {
  const out: number[] = [];
  for (let d = Math.floor(w.lo / 1440); d * 1440 < w.hi; d++) out.push(d);
  return out;
}

/** Where to look when switching scale: the chosen day (its morning), or now. */
export function anchorFor(selectedDay: number | null, nowAbs: number): number {
  return selectedDay === null || selectedDay === Math.floor(nowAbs / 1440) ? nowAbs : selectedDay * 1440 + 10 * 60;
}
