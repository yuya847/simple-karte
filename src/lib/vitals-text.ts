import { consciousnessText } from "./consciousness";
// Vital signs as text to copy into a note: "11/3 07:00 BT 37.6℃ HR 88 BP 122/70 RR 16 SpO2 97%（室内気）".
// Made by code from the flow sheet; nothing is rounded or judged.

import { addDays, formatShort, minutesOf, type CalendarDate } from "./dates";
import { abs } from "./flowsheet";
import type { DayOffset, VitalSign } from "./types";

export type VitalRange = "latest" | "today" | "24h" | "day";

export const VITAL_RANGES: { value: VitalRange; label: string }[] = [
  { value: "latest", label: "最新" },
  { value: "today", label: "今日" },
  { value: "24h", label: "24時間" },
  { value: "day", label: "選んだ日" },
];

const AVPU: Record<string, string> = { A: "清明", C: "新たな混乱", V: "声に反応", P: "痛みに反応", U: "反応なし" };

export function vitalLine(v: VitalSign, today: CalendarDate): string {
  const parts = [
    `${formatShort(addDays(today, v.day)).replace(/（.）/, "")} ${v.time}`,
    v.bt !== undefined && `BT ${v.bt.toFixed(1)}℃`,
    v.hr !== undefined && `HR ${v.hr}`,
    v.sbp !== undefined && `BP ${v.sbp}/${v.dbp ?? "—"}`,
    v.rr !== undefined && `RR ${v.rr}`,
    v.spo2 !== undefined && `SpO2 ${v.spo2}%${v.o2 ? `（${v.o2}）` : ""}`,
    consciousnessText(v),
    v.avpu && `意識 ${AVPU[v.avpu] ?? v.avpu}`,
  ];
  return parts.filter(Boolean).join(" ");
}

/** The measurements in the range, oldest first. `day` is the day chosen on the flow sheet. */
export function vitalsIn(vitals: VitalSign[], range: VitalRange, nowAbs: number, day: DayOffset | null): VitalSign[] {
  const sorted = [...vitals].sort((a, b) => a.day - b.day || minutesOf(a.time) - minutesOf(b.time));
  if (range === "latest") return sorted.filter(v => abs(v.day, v.time) <= nowAbs).slice(-1);
  if (range === "today") return sorted.filter((v) => v.day === 0);
  if (range === "24h") return sorted.filter((v) => abs(v.day, v.time) > nowAbs - 1440 && abs(v.day, v.time) <= nowAbs);
  return day === null ? [] : sorted.filter((v) => v.day === day);
}

export const vitalsText = (vs: VitalSign[], today: CalendarDate) => vs.map((v) => vitalLine(v, today)).join("\n");

/**
 * Put lines into the O) part of a SOAP note: after "O)" (on the same line when it is empty), or at
 * the end of the O) part; at the end of the note when there is no O).
 */
export function insertIntoO(note: string, text: string): string {
  const lines = note.replace(/\s+$/, "").split("\n");
  const o = lines.findIndex((l) => /^O\)/.test(l));
  const add = text.split("\n");
  if (o < 0) return `${note.replace(/\s*$/, "")}\n${text}\n`;
  if (/^O\)\s*$/.test(lines[o])) {
    lines.splice(o, 1, `O) ${add[0]}`, ...add.slice(1));
  } else {
    let end = o + 1;
    while (end < lines.length && !/^[SAP]\)/.test(lines[end])) end++;
    lines.splice(end, 0, ...add);
  }
  return `${lines.join("\n")}\n`;
}
