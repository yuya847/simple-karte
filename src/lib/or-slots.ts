import { minutesOf } from "./dates";
import { OR_RULES, type OrRoom, type Surgery } from "./surgery";

export interface OrSlot { start: string; minutes: number }
const clock = (m: number) => `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;
/** 空き区間。申込も枠を使い、手術の前後の片付け時間を確保する（架空の病院）。 */
export function orSlots(day: number, room: OrRoom, surgeries: Surgery[]): OrSlot[] {
  const open = minutesOf(OR_RULES.open), close = minutesOf(OR_RULES.close);
  const busy = surgeries.filter((s) => s.day === day && s.room === room && s.start && s.minutes && s.minutes > 0)
    .map((s) => [minutesOf(s.start!) - OR_RULES.turnover, minutesOf(s.start!) + s.minutes! + OR_RULES.turnover])
    .sort((a, b) => a[0] - b[0]);
  const out: OrSlot[] = [];
  let cursor = open;
  for (const [a, b] of busy) {
    if (a > cursor) out.push({ start: clock(cursor), minutes: Math.min(a, close) - cursor });
    cursor = Math.max(cursor, b);
    if (cursor >= close) break;
  }
  if (cursor < close) out.push({ start: clock(cursor), minutes: close - cursor });
  return out.filter((s) => s.minutes > 0);
}
export function fitsOrSlot(day: number, room: OrRoom, start: string, minutes: number, surgeries: Surgery[]): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && Number.isInteger(minutes) && minutes > 0 && orSlots(day, room, surgeries).some((s) => minutesOf(start) >= minutesOf(s.start) && minutesOf(start) + minutes <= minutesOf(s.start) + s.minutes);
}
