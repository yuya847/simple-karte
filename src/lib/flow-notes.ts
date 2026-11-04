// 記録 on the flow sheet (経過表): how many notes each day has, by who wrote them (医師・看護師・ほかの職種),
// so that the day's record can be opened from the sheet. Code only counts.

import { noteKey, noteText } from "./notes";
import { minutesOf } from "./dates";
import type { DayOffset, HistoryEntry, NoteEntry } from "./types";

/** The kinds of the record list (経過) the marks open, with their short mark. */
export const NOTE_GROUPS = [
  { key: "doctor", mark: "医", label: "医師の記載", test: (n: NoteEntry) => n.role === "医師" },
  { key: "nurse", mark: "看", label: "看護の記載", test: (n: NoteEntry) => n.role === "看護師" },
  { key: "staff", mark: "他", label: "ほかの職種", test: (n: NoteEntry) => n.role !== "医師" && n.role !== "看護師" },
] as const;
export type NoteGroupKey = (typeof NOTE_GROUPS)[number]["key"];

export interface NoteMark {
  key: NoteGroupKey;
  mark: string;
  label: string;
  count: number;
  /** "09:10 看護師 佐藤" for each note, in time order. */
  lines: string[];
}

/** The day's notes by group (groups without a note are left out). */
export function noteMarks(entries: HistoryEntry[], day: DayOffset): NoteMark[] {
  const notes = entries.filter((e): e is NoteEntry => e.kind === "note" && e.day === day).sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
  return NOTE_GROUPS.flatMap((g) => {
    const mine = notes.filter(g.test);
    return mine.length ? [{ key: g.key, mark: g.mark, label: g.label, count: mine.length, lines: mine.map((n) => `${n.time} ${n.role} ${n.author}`) }] : [];
  });
}

/** Each note with its time (absolute minutes), for the zoomed-in views. */
export function noteTimes(entries: HistoryEntry[]): { at: number; group: NoteGroupKey; line: string; day: DayOffset }[] {
  return entries.flatMap((e) => {
    if (e.kind !== "note") return [];
    const g = NOTE_GROUPS.find((x) => x.test(e))!;
    return [{ at: e.day * 1440 + minutesOf(e.time), group: g.key, line: `${e.time} ${e.role} ${e.author}`, day: e.day }];
  });
}

/** 看護師の現在の本文を記録時刻順に返す。同じ時刻の記事も残す。 */
export function nursingNotesByTime(entries: HistoryEntry[], day: DayOffset) {
  return entries.filter((e): e is NoteEntry => e.kind === "note" && e.role === "看護師" && e.day === day)
    .sort((a, b) => minutesOf(a.time) - minutesOf(b.time))
    .map((e) => {
      const full = noteText(e);
      const first = (e.soap?.s?.trim() || e.soap?.o?.trim() || e.timeline?.[0]?.text?.trim() || e.focus?.[0]?.d?.trim() || full).split("\n")[0];
      return { key: noteKey(e), day, time: e.time, full, summary: Array.from(first).slice(0, 40).join("") };
    });
}
