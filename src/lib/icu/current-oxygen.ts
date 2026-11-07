import type { Patient, VitalSign } from "../types";
import { ventAt } from "./abg";
import type { IcuRecords } from "./types";

/** Current display only: historical measurements keep their recorded oxygen. */
export function currentOxygen(records: IcuRecords, patientId: string, nowAbs: number): string | undefined {
  const v = ventAt(records.vents, patientId, nowAbs);
  if (!v) return undefined;
  if (v.mode === "なし") return v.airway === "なし" ? "室内気" : `${v.airway}${v.flow !== undefined ? ` ${v.flow}L/分` : ""} FiO2 ${v.fio2}`;
  return `${v.mode} FiO2 ${v.fio2}${v.peep !== undefined ? ` PEEP ${v.peep}` : ""}${v.flow !== undefined ? ` ${v.flow}L/分` : ""}`;
}
export function currentVital(v: VitalSign, p: Pick<Patient, "currentOxygen">): VitalSign {
  return p.currentOxygen === undefined ? v : { ...v, o2: p.currentOxygen };
}
export function patientForCurrentDisplay(p: Patient): Patient {
  return { ...p, vitals: p.vitals.map((v, i) => i === p.vitals.length - 1 ? currentVital(v, p) : v) };
}
