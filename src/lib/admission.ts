// Admitting a patient from the emergency department to the ward. Builds the ward patient
// from what the ED recorded plus what the admitting doctor enters. Fictional data only.

import type { ErPatient } from "./er";
import type { Patient } from "./types";
import type { BedAssignment, Room, WardState } from "./ward";
import { roomSex } from "./ward";

export interface AdmitForm {
  diagnosis: string;
  department: string;
  heightCm: number;
  weightKg: number;
  allergies: string[];
  room: string;
  bed: string;
}

export const DOCTOR = "山本（専攻医）";

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Why a bed cannot take this patient, or null if it can. Shared rooms are single-sex. */
export function bedProblem(ward: WardState, room: Room, sex: ErPatient["sex"]): string | null {
  if (room.kind === "個室") return null;
  const s = roomSex(ward, room.no);
  return s && s !== sex ? `${s}性の部屋です` : null;
}

export function formProblems(f: AdmitForm): string[] {
  const out: string[] = [];
  if (!f.diagnosis.trim()) out.push("入院時の病名を入れてください");
  if (!(f.weightKg > 0)) out.push("体重を入れてください");
  if (!(f.heightCm > 0)) out.push("身長を入れてください");
  if (!f.room) out.push("ベッドを選んでください");
  return out;
}

export function admitFromEr(er: ErPatient, f: AdmitForm, id: string, nowTime: string): { patient: Patient; bed: BedAssignment } {
  const arrivedDay = Math.floor(er.arrivedAbs / 1440);
  const arrivedTime = hhmm(er.arrivedAbs - arrivedDay * 1440);
  const v = er.vitals;
  const vitalText = v
    ? [
        v.bt !== undefined && `BT ${v.bt.toFixed(1)}℃`,
        v.sbp !== undefined && `BP ${v.sbp}/${v.dbp}`,
        v.hr !== undefined && `HR ${v.hr}`,
        v.rr !== undefined && `RR ${v.rr}`,
        v.spo2 !== undefined && `SpO2 ${v.spo2}%（${v.o2 ?? "室内気"}）`,
      ]
        .filter(Boolean)
        .join("、")
    : "";

  const patient: Patient = {
    id,
    name: er.name,
    kana: er.kana,
    sex: er.sex,
    age: er.age,
    ...(er.ageMonths !== undefined ? { ageMonths: er.ageMonths } : {}),
    ward: "5階東",
    room: f.room,
    department: f.department,
    attending: DOCTOR,
    admittedOn: 0,
    admissionDiagnosis: f.diagnosis.trim(),
    heightCm: f.heightCm,
    weightKg: f.weightKg,
    allergies: f.allergies,
    infections: [],
    cautions: [],
    history: [
      {
        kind: "note",
        day: arrivedDay,
        time: arrivedTime,
        author: "救急外来",
        role: "看護師",
        text: `${er.arrival}で来院。主訴：${er.complaint}。トリアージ JTAS ${er.jtas}。${vitalText ? `来院時 ${vitalText}。` : ""}${er.note ?? ""}`,
      },
      {
        kind: "note",
        day: 0,
        time: nowTime,
        author: DOCTOR,
        role: "医師",
        text: `救急外来から入院。入院時病名：${f.diagnosis.trim()}。${f.room}${f.bed ? `-${f.bed}` : ""}へ。`,
      },
    ],
    labs: [],
    cultures: [],
    imaging: [],
    vitals: v ? [{ day: arrivedDay, time: arrivedTime, ...v }] : [],
    daily: [{ day: 0, weightKg: f.weightKg }],
  };
  return { patient, bed: { room: f.room, bed: f.bed, patientId: id } };
}
