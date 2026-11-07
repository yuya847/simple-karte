import { abs } from "../flowsheet";
import type { Patient } from "../types";
import type { VentSetting } from "./types";
export const ventAt = (vents: VentSetting[], patientId: string, atAbs: number) => vents.filter(v => v.patientId === patientId && abs(v.at.day,v.at.time) <= atAbs).sort((a,b) => abs(a.at.day,a.at.time)-abs(b.at.day,b.at.time)).at(-1) ?? null;
export function fio2At(vents: VentSetting[], patientId: string, atAbs: number): number | null {
  const v = ventAt(vents,patientId,atAbs);
  return v && v.mode !== "なし" && Number.isFinite(v.fio2) && v.fio2 >= .21 && v.fio2 <= 1 ? v.fio2 : null;
}
export const pfRatio = (pao2: number, fio2: number): number | null => Number.isFinite(pao2) && pao2 >= 0 && Number.isFinite(fio2) && fio2 >= .21 && fio2 <= 1 ? Math.round(pao2/fio2) : null;
export function abgRows(patient: Patient, vents: VentSetting[]) {
  return patient.labs.filter(l => ["pH","PaO2","PaCO2","HCO3","Lac"].some(k => Number.isFinite(l.values[k]))).sort((a,b) => abs(a.day,a.time)-abs(b.day,b.time)).map(l => {
    const fio2 = fio2At(vents,patient.id,abs(l.day,l.time));
    return {...l,fio2,pf: fio2 === null ? null : pfRatio(l.values.PaO2,fio2)};
  });
}
