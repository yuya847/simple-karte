import type { Flash } from "./flash";
import type { CallNote } from "./phs";
import type { Patient } from "./types";

/** A simulated contact uses the same call-note history as the PHS screen. */
export function vitalsContact(flash: Flash | null, patient: Pick<Patient, "id" | "name" | "attending">, from: string, at: string, id: string): CallNote | null {
  if (!flash || typeof flash === "string" || !flash.contact) return null;
  return { id, at, from, to: patient.attending, patientId: patient.id, text: `看護師から連絡：${patient.name} NEWS2 ${flash.contact.score}　${flash.contact.reasons.join("、")}（模擬）` };
}
export const vitalsContactTodos = (notes: CallNote[]) => notes.filter((n) => n.text.startsWith("看護師から連絡：")).map((n) => ({ key: `nurse-contact-${n.id}`, label: n.text.split("　")[0], detail: `${n.at} ${n.from} → ${n.to}`, count: 1, tone: "shu" as const, patientId: n.patientId }));
