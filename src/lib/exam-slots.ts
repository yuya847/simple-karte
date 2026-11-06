import type { Draft } from "./drafts";
import { addDays, type CalendarDate } from "./dates";
import { isHoliday } from "./er";
import { findPhysio } from "./exams";
import { imagingTitle } from "./format";
import { defaultRoom, type RisDesk, type RoomKey } from "./ris";
import type { OrderEntry } from "./types";

export type ExamKind = RoomKey | `PHY-${string}`;
export interface TakenExam { day: number; time: string; label: string }
export interface ExamPerson { patient: { id: string; name: string }; entries: OrderEntry[] }
export interface Slot extends TakenExam { status: "空き" | "予約あり" | "休み" }
const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function slotsFor(kind: ExamKind, day: number, taken: TakenExam[], today: CalendarDate): Slot[] {
  if (kind === "PORT") return [];
  const date = addDays(today, day);
  const dow = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
  const closed = day < 0 || day > 56 || dow === 0 || isHoliday(date.y, date.m, date.d);
  const endo = ["PHY-EGD", "PHY-CF", "PHY-BF"].includes(kind);
  const step = kind === "XR1" || kind === "PHY-ECG" ? 15 : 30;
  const times = endo ? [540, 570, 600, 630, 660, 840, 870] : Array.from({ length: (1020 - 510) / step }, (_, i) => 510 + i * step);
  return times.map((n) => {
    const time = hhmm(n);
    const labels = taken.filter((t) => t.day === day && t.time === time).map((t) => t.label);
    return { day, time, label: labels.join("・"), status: closed || (dow === 6 && n >= 720) ? "休み" : labels.length ? "予約あり" : "空き" };
  });
}
export function takenExams(people: ExamPerson[], kind: ExamKind, desk: RisDesk = {}): TakenExam[] {
  const out: TakenExam[] = [];
  const seen = new Set<string>();
  for (const { patient, entries } of people) for (const e of entries) {
    const o = e.order;
    seen.add(e.id);
    if (e.status === "中止" || (o.type !== "imaging" && o.type !== "physio")) continue;
    const w = o.type === "imaging" ? desk[e.id] : undefined;
    if (w?.notDone) continue;
    const room = o.type === "imaging" ? w?.room ?? defaultRoom(o.modality) : o.test;
    const at = w?.slot ?? o.when;
    if (room !== kind || !at.time) continue;
    out.push({ day: at.day, time: at.time, label: `${patient.name}・${o.type === "imaging" ? imagingTitle(o) : findPhysio(o.test)?.name ?? o.test}` });
  }
  for (const w of Object.values(desk)) if (!seen.has(w.orderId) && !w.notDone && w.room === kind && w.slot) {
    const name = people.find((p) => p.patient.id === w.patientId)?.patient.name ?? "患者";
    out.push({ ...w.slot, label: `${name}・${w.label}` });
  }
  return out;
}
export function firstExamSlot(kind: ExamKind, taken: TakenExam[], today: CalendarDate, startDay = 1): { day: number; time: string | null; priority: "予約" } {
  if (kind === "PORT") return { day: startDay, time: "08:30", priority: "予約" };
  for (let day = startDay; day <= 56; day++) {
    const slot = slotsFor(kind, day, taken, today).find((s) => s.status === "空き");
    if (slot) return { day, time: slot.time, priority: "予約" };
  }
  return { day: startDay, time: null, priority: "予約" };
}
export function examSlotAvailable(kind: ExamKind, when: { day: number | null; time?: string | null; priority: string | null }, taken: TakenExam[], today: CalendarDate): boolean {
  if (when.priority === "至急") return true;
  if (when.day === null || !when.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(when.time)) return false;
  if (kind === "PORT") return when.day >= 0 && when.day <= 56;
  return slotsFor(kind, when.day, taken, today).some((s) => s.time === when.time && s.status === "空き");
}

/** Check again when confirming: another order or another draft may have taken the slot. */
export function examReservationProblem(drafts: Draft[], people: ExamPerson[], desk: RisDesk): string | null {
  const used = new Set<string>();
  for (const d of drafts) {
    if ((d.kind !== "imaging" && d.kind !== "physio") || d.when.priority !== "予約" || d.when.day === null || !d.when.time) continue;
    const kind = d.kind === "imaging" ? d.modality && defaultRoom(d.modality) : d.test as ExamKind | null;
    if (!kind || kind === "PORT") continue;
    const key = `${kind}|${d.when.day}|${d.when.time}`;
    const conflict = takenExams(people, kind, desk).find((t) => t.day === d.when.day && t.time === d.when.time);
    if (conflict || used.has(key)) return `${d.when.time} は予約が重なっています${conflict ? `（${conflict.label}）` : "（ほかの下書き）"}。確定していません。検査のカレンダーで別の空き枠を選び直してください。`;
    used.add(key);
  }
  return null;
}
