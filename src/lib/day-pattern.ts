import { addDays, todayInTokyo, type CalendarDate } from "./dates";
import type { DayPattern, PrescriptionOrder } from "./types";

export const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
export function patternText(p?: DayPattern): string {
  if (!p) return "毎日";
  if (p.kind === "every") return p.n === 1 ? "毎日" : p.n === 2 ? "隔日" : p.n === 7 ? "7日ごと" : `${p.n}日ごと`;
  const days = [...new Set(p.days)].sort((a, b) => a - b);
  return days.length === 1 ? `週1回 ${DAY_NAMES[days[0]]}` : days.map((d) => DAY_NAMES[d]).join("");
}
export function patternDay(p: DayPattern | undefined, start: number, day: number, base?: CalendarDate): boolean {
  if (day < start) return false;
  if (!p) return true;
  if (p.kind === "every") return Number.isInteger(p.n) && p.n > 0 && (day - start) % p.n === 0;
  const date = addDays(base ?? todayInTokyo(), day);
  return p.days.includes(new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay());
}
/** 投与日数から最終投与日へ。空の曜日指定は投与なし。 */
export function patternLastDay(p: DayPattern | undefined, start: number, count: number, base?: CalendarDate): number {
  if (!Number.isInteger(count) || count < 1) return start - 1;
  if (!p || p.kind === "every") return start + (count - 1) * (p?.n && p.n > 0 ? p.n : 1);
  if (!p.days.some((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return start - 1;
  const dateBase = base ?? todayInTokyo();
  let left = count;
  for (let day = start; ; day++) if (patternDay(p, start, day, dateBase) && --left === 0) return day;
}
export function rxLastDay(o: Pick<PrescriptionOrder, "dayPattern" | "start" | "days">, base?: CalendarDate): number | null {
  return o.days ? patternLastDay(o.dayPattern, o.start.day, o.days, base) : null;
}
export function patternCourse(p: DayPattern | undefined, start: number, days: number | undefined, oral: boolean, base?: CalendarDate): string {
  if (!p) return days ? `${days}${oral ? "日分" : "日間"}` : "継続";
  const dateBase = base ?? todayInTokyo();
  const end = days ? oral ? patternLastDay(p, start, days, dateBase) : start + days - 1 : null;
  const first = oral ? patternLastDay(p, start, 1, dateBase) : start;
  const date = (d: number) => { const v = addDays(dateBase, d); return `${v.m}/${v.d}`; };
  return `${patternText(p)}・${days ? `${days}${oral ? "投与日分" : "日間"}` : "継続"}${end !== null && first >= start && first <= end ? `（${date(first)}〜${date(end)}）` : ""}`;
}

export function validDayPattern(p?: DayPattern): boolean {
  return !p || (p.kind === "every" ? Number.isInteger(p.n) && p.n > 0 : p.days.length > 0 && p.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6));
}
