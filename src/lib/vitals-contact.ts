import type { Flash } from "./flash";
import type { CallNote } from "./phs";
import { placeBlock } from "./note-insert";
import { noteFormOf } from "./notes";
import type { VitalSign, Patient } from "./types";

/** A simulated contact uses the same call-note history as the PHS screen. */
export function vitalsContact(flash: Flash | null, patient: Pick<Patient, "id" | "name" | "attending">, from: string, at: string, id: string, vital: VitalSign): CallNote | null {
  if (!flash || typeof flash === "string" || !flash.contact) return null;
  return { id, at, from, to: patient.attending, patientId: patient.id, text: `看護師から連絡：${patient.name} ${contactVitalLine(vital)}　${flash.contact.reasons.join("、")}（模擬）` };
}
export const vitalsContactTodos = (notes: CallNote[]) => notes.filter((n) => n.text.startsWith("看護師から連絡：")).map((n) => ({ key: `nurse-contact-${n.id}`, label: contactTitle(n.text), detail: `${n.at} ${n.from} → ${n.to}`, count: 1, tone: "shu" as const, patientId: n.patientId }));

/** Only the confirmed measurement is used, never a later chart value. */
export function contactVitalLine(v: VitalSign): string {
  return [v.time, v.bt !== undefined && `BT ${v.bt.toFixed(1)}℃`, v.hr !== undefined && `HR ${v.hr}`,
    (v.sbp !== undefined || v.dbp !== undefined) && `BP ${v.sbp ?? "—"}/${v.dbp ?? "—"}`,
    v.rr !== undefined && `RR ${v.rr}`, v.spo2 !== undefined && `SpO2 ${v.spo2}%（${v.o2 || "室内気"}）`,
    v.avpu && `意識 ${v.avpu}`].filter(Boolean).join(" ");
}

export function contactDraft(note: string, v: VitalSign, score: number, attending: string): string {
  const line = `${contactVitalLine(v)}。NEWS2 ${score}点。主治医 ${attending}に連絡（模擬）。`;
  const form = noteFormOf(note);
  const block = form === "フォーカス（DAR）" ? `# バイタル・主治医への連絡\nD) ${line}\nAct) 主治医に連絡\nR) `
    : form === "経時記録" ? `【経時記録】\n${line}` : line;
  return placeBlock(note, note.length, note.length, form === "経時記録" && !/^【経時記録】\s*\d{1,2}:\d{2}\s*$/.test(note) ? line : block).text;
}

function contactTitle(text: string): string {
  const first = text.split("　")[0];
  if (!/ \d{1,2}:\d{2}/.test(first)) return first;
  return `${first.split(/ \d{1,2}:\d{2}/)[0]} ${text.match(/NEWS2 \d+点/)?.[0] ?? ""}`.trim();
}
