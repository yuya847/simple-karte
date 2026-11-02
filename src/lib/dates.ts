// Date helpers. The chart always works in Japan time (Asia/Tokyo).

import type { DayOffset } from "./types";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** A calendar date in Japan time, without a time of day. */
export interface CalendarDate {
  y: number;
  m: number; // 1-12
  d: number;
}

export function todayInTokyo(now: Date = new Date()): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Current time in Japan as "HH:MM". */
export function nowTimeInTokyo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

export function addDays(base: CalendarDate, offset: DayOffset): CalendarDate {
  // Use UTC arithmetic so DST or local time zones never shift the date.
  const t = Date.UTC(base.y, base.m - 1, base.d) + offset * 86_400_000;
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function weekday(date: CalendarDate): string {
  return WEEKDAYS[new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay()];
}

/** "11/5（木）" */
export function formatShort(date: CalendarDate): string {
  return `${date.m}/${date.d}（${weekday(date)}）`;
}

/** "2026年11月" */
export function formatMonth(date: CalendarDate): string {
  return `${date.y}年${date.m}月`;
}

export function isoDate(date: CalendarDate): string {
  return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

/** Hospital day number: the admission day is day 1. */
export function hospitalDay(admittedOn: DayOffset, day: DayOffset): number {
  return day - admittedOn + 1;
}

/** Minutes since midnight for "HH:MM". */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Compare two (day, time) points. Negative when a is earlier. */
export function compareMoments(a: { day: DayOffset; time: string }, b: { day: DayOffset; time: string }): number {
  return a.day - b.day || minutesOf(a.time) - minutesOf(b.time);
}
