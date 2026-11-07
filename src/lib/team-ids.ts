import { STAFF, type Role } from "./roles";
import { DEFAULT_NURSE } from "./nurses";
import { doctorsOf, involved, type DoctorBook } from "./patient-doctors";
import type { Patient } from "./types";
import { nurseFor, type BedAssignment } from "./ward";

/** basePatients preserves the demo's original patients plus today's admissions. */
export function teamIdsFor({ role, meName, patients, beds, doctorBook, scenario, basePatients = patients }: {
  role: Role; meName: string; patients: Patient[]; beds: BedAssignment[];
  doctorBook: DoctorBook; scenario: boolean; basePatients?: Patient[];
}): Set<string> {
  const roomNurse = role === "看護師" && meName !== DEFAULT_NURSE;
  const ids = new Set((roomNurse ? [] : basePatients).filter(p => !scenario || involved(role === "医師" ? meName : STAFF.医師.name, doctorsOf(p.attending, doctorBook[p.id]))).map(p => p.id));
  if (role === "医師") for (const p of patients) if (involved(meName, doctorsOf(p.attending, doctorBook[p.id]))) ids.add(p.id);
  if (role === "看護師") for (const b of beds) if (b.patientId && nurseFor(b.room) === meName) ids.add(b.patientId);
  return ids;
}
