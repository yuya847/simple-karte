import { lineEndDay, type StandingLine } from "./standing-lines";
import type { DayOffset } from "./types";
import { abs } from "./flowsheet";

/** Inclusive planned end; a stop cannot extend a shorter planned duration. */
export const effectiveEnd = lineEndDay;

export function lineEffective(l: StandingLine, day: number, time = "12:00"): boolean {
  const now = abs(day, time);
  return abs(l.start.day, l.start.time ?? "00:00") <= now &&
    (!l.end || now <= abs(l.end.day, l.end.time ?? "23:59")) &&
    (!l.changed || now < abs(l.changed.day, l.changed.time)) &&
    (!l.stop || now < abs(l.stop.day, l.stop.time));
}

export interface StandingStopDraft { ids: string[]; day: number; reason: string; kind?: "終了" }
/** Only editable, un-stopped lines which have started by the chosen stop day. */
export function standingStopDraft(lines: StandingLine[], ids: string[], day: number, reason: string): StandingStopDraft {
  const selected = new Set(ids);
  return { ids: lines.filter((l) => selected.has(l.id) && !l.fromFields && !l.stop && !l.changed && l.start.day <= day && (lineEndDay(l) === null || lineEndDay(l)! >= day)).map((l) => l.id), day, reason: reason.trim() };
}

export function periodText(l: StandingLine, fmt: (d: number) => string): string {
  const end = effectiveEnd(l);
  return `有効：${fmt(l.start.day)} 〜 ${end === null ? "変えるまで続く" : fmt(end)}`;
}

/** Clamp a proposed inclusive end to today and the start; never alter historical rows. */
export function dragEnd(line: StandingLine, toDay: DayOffset, today: DayOffset): { kind: "extend" | "shorten" | "none"; end: DayOffset | null; problem?: string } {
  if (line.fromFields || line.stop || line.changed) return { kind: "none", end: line.end?.day ?? null, problem: "この指示の終了日は変えられません。" };
  if (!Number.isInteger(toDay) || !Number.isInteger(today)) return { kind: "none", end: line.end?.day ?? null, problem: "日付を確かめてください。" };
  const end = Math.max(toDay, today, line.start.day);
  return { kind: line.end?.day === end ? "none" : line.end ? end > line.end.day ? "extend" : "shorten" : end > today ? "extend" : "shorten", end };
}
