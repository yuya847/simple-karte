// 注射カレンダーから新しい注射を出す: the start (the day pressed and a time band) that is handed to the
// 注射 tab, and the start of a Do (the same order written again, from the day after it ends).
// Nothing is drafted here; the doctor picks the drugs and confirms in the 注射 tab as always.

import type { DayOffset, InjectionOrder } from "./types";
import { orderEndDay } from "./drafts";

export interface InjStart {
  day: DayOffset;
  /** "HH:MM", or null for 指示受け後すぐ (no clock time). */
  time: string | null;
}

/** What the calendar hands to the 注射 tab: the start, and for Do the order to copy. */
export interface InjSeed {
  key: string;
  order?: InjectionOrder;
  start?: InjStart;
}

/**
 * 時刻帯 the calendar offers for the start of a new injection. The clock times are this fictional
 * hospital's rule (架空の病院の取り決め; the same hours as its scheduled 処置). The doctor can type any time in the 注射 tab.
 */
export const START_BANDS: { label: string; time: string | null }[] = [
  { label: "時刻なし（指示受け後すぐ）", time: null },
  { label: "早朝", time: "06:00" },
  { label: "午前", time: "10:00" },
  { label: "午後", time: "14:00" },
  { label: "夕", time: "18:00" },
  { label: "夜", time: "22:00" },
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The start for a cell of the calendar: its day, and a time only when it is a clock time. */
export function startAt(day: DayOffset, time: string | null | undefined): InjStart {
  return { day, time: time && HHMM.test(time) ? time : null };
}

/**
 * Do from the calendar: the same order again. A running order with an end starts the day after it ends
 * (never before today); one without an end, or a stopped one, starts today. The clock time is kept.
 */
export function doStartOf(o: InjectionOrder, status: "有効" | "中止"): InjStart {
  const end = status === "有効" ? orderEndDay(o) : null;
  return startAt(end === null ? 0 : Math.max(0, end + 1), o.start.time);
}

/** The days a not-yet-confirmed injection draft would cover on the calendar (last day clamped to `lastDay`). */
export function draftSpan(start: { day: DayOffset | null }, days: number | null, lastDay: DayOffset): { from: DayOffset; to: DayOffset } {
  const from = start.day ?? 0;
  return { from, to: days && days > 0 ? Math.min(lastDay, from + days - 1) : lastDay };
}
