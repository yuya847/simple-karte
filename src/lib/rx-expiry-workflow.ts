import { expiryDay, expiryKey, rxExpiries, type RxExpiry } from "./rx-expiry";
import { involved, type PatientDoctors } from "./patient-doctors";
import { doctorOf, onTeamOf } from "./doctors";
import type { CalendarDate } from "./dates";
import type { ExtendDraft } from "./drafts";
import type { OrderEntry, Patient } from "./types";
import type { Sticky } from "@/components/StickyStrip";

export const expiryRequest = (p: Patient, r: RxExpiry, sender: string): Sticky => ({ id: expiryKey(r), text: `${p.name}さん：${r.name}が${expiryDay(r.lastDay)}で切れます（${sender}）`, by: sender, at: "", shared: true });
export const expiryExtension = (entry: OrderEntry, days: number, id: string): ExtendDraft => ({ id, kind: "extend", targetOrderId: entry.id, addDays: days, origin: "manual", sourceText: "（延長）", comment: null });
export function receivesExpiry(name: string, doctors: PatientDoctors): boolean {
  return involved(name, doctors) || doctors.others.some(d => d.role === "担当医" && doctorOf(d.name)?.rank === "研修医" && doctorOf(name)?.rank === "指導医" && onTeamOf(name, d.name));
}
export function expiryInbox(people: { patient: Patient; entries: OrderEntry[] }[], today: CalendarDate, stickies: Record<string, Sticky[]>, mine: (patient: Patient, entries: OrderEntry[]) => boolean) {
  return people.filter(x => mine(x.patient, x.entries)).flatMap(x => {
    const rows = rxExpiries(x.patient, x.entries, today).filter(r => !(stickies[x.patient.id] ?? []).some(s => s.id === `${expiryKey(r)}:done`));
    return rows.length ? [{ patient: x.patient, rows, messages: rows.flatMap(r => (stickies[x.patient.id] ?? []).filter(s => s.id === expiryKey(r)).map(s => s.text)) }] : [];
  });
}
export function expiryCounts(inbox: ReturnType<typeof expiryInbox>) {
  const rows = inbox.flatMap(x => x.rows);
  return { total: rows.length, today: rows.filter(r => r.lastDay === 0).length, tomorrow: rows.filter(r => r.lastDay === 1).length };
}
