import { addDays, type CalendarDate } from "./dates";
import { labItemText } from "./lab-paste";
import { labNumber } from "./lab-number";
import { flagOf } from "./lab-desk";
import { ANALYTES } from "./master";
import type { LabResult, Patient } from "./types";

export const LAB_RESULT_MIME = "application/x-simple-karte-lab-result";
export const LAB_PASTE_EVENT = "simple-karte-lab-paste";
export type LabTransfer = { patientId: string; text: string; table: string };
export const LAB_SELECTIONS: Record<string, string[]> = {
  血算: ["WBC", "Neut", "Lymph", "Hb", "Ht", "MCV", "Plt", "Ret"],
  肝機能: ["AST", "ALT", "ALP", "γ-GTP", "T-Bil", "D-Bil", "Alb", "ChE"],
  腎機能: ["BUN", "Cre", "eGFR", "UA"],
  電解質: ["Na", "K", "Cl", "Ca", "Mg", "IP"],
  炎症: ["CRP", "PCT"],
};
export function selectLabSet(available: string[], name: string): string[] {
  return available.filter(c => LAB_SELECTIONS[name]?.includes(c));
}
export function labTransfer(patient: Pick<Patient, "id" | "sex">, labs: LabResult[], codes: string[], today: CalendarDate): LabTransfer {
  const sorted = [...labs].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  const dates = sorted.map(l => { const d = addDays(today, l.day); return `${d.m}/${d.d} ${l.time}`; });
  const text = sorted.map((l, i) => {
    const values = codes.filter(c => l.values[c] !== undefined).map(c => labItemText(c, l.values[c], patient.sex));
    return values.length ? `${dates[i]} ${values.join("、")}` : "";
  }).filter(Boolean).join("\n");
  const body = codes.filter(c => sorted.some(l => l.values[c] !== undefined)).map(code => {
    const a = ANALYTES.find(a => a.code === code);
    const values = sorted.map(l => l.values[code] === undefined ? "—" : `${labNumber(code, l.values[code])}${a ? flagOf(a, patient.sex, l.values[code]) : ""}`);
    return sorted.length === 1 ? [code, ...values, a?.unit ?? ""] : [code, a?.unit ?? "", ...values];
  });
  const matrix = sorted.length === 1 ? [["項目", dates[0], "単位"], ...body] : [["項目", "単位", ...dates], ...body];
  const width = (s: string) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
  const widths = matrix[0].map((_, i) => Math.max(...matrix.map(r => width(r[i] ?? ""))));
  const table = text ? matrix.map(r => r.map((v, i) => v + " ".repeat(widths[i] - width(v))).join("  ").trimEnd()).join("\n") : "";
  return { patientId: patient.id, text, table };
}
export function readLabTransfer(raw: string): LabTransfer | null {
  try { const p = JSON.parse(raw); return p && typeof p.patientId === "string" && typeof p.text === "string" && typeof p.table === "string" ? p : null; } catch { return null; }
}

/** Only our padded table header opts the note into a fixed-width font. */
export function hasLabTable(text: string): boolean {
  return /^項目 {2,}(?:単位 {2,})?\d{1,2}\/\d{1,2} \d{2}:\d{2}/m.test(text);
}
