import { lineEndDay, type StandingLine } from "./standing-lines";
import { abs } from "./flowsheet";

/** Inclusive planned end; a stop cannot extend a shorter planned duration. */
export const effectiveEnd = lineEndDay;

export function lineEffective(l: StandingLine, day: number, time = "12:00"): boolean {
  const now = abs(day, time);
  return abs(l.start.day, l.start.time ?? "00:00") <= now &&
    (!l.end || now <= abs(l.end.day, l.end.time ?? "23:59")) &&
    (!l.stop || now < abs(l.stop.day, l.stop.time));
}

export interface StandingStopDraft { ids: string[]; day: number; reason: string }
/** Only editable, un-stopped lines which have started by the chosen stop day. */
export function standingStopDraft(lines: StandingLine[], ids: string[], day: number, reason: string): StandingStopDraft {
  const selected = new Set(ids);
  return { ids: lines.filter((l) => selected.has(l.id) && !l.fromFields && !l.stop && l.start.day <= day && (lineEndDay(l) === null || lineEndDay(l)! >= day)).map((l) => l.id), day, reason: reason.trim() };
}

export function periodText(l: StandingLine, fmt: (d: number) => string): string {
  const end = effectiveEnd(l);
  return `有効：${fmt(l.start.day)} 〜 ${end === null ? "変えるまで続く" : fmt(end)}`;
}
