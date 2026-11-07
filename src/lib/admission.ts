// Admitting a patient from the emergency department to the ward. Builds the ward patient
// from what the ED recorded plus what the admitting doctor enters. Fictional data only.

import type { ErPatient } from "./er";
import type { OpdPatient } from "./opd";
import type { HistoryEntry, Patient } from "./types";
import type { BedAssignment, Room, WardState } from "./ward";
import { floorOf, roomSex } from "./ward";

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

// ---------------------------------------------------------------------------
// 入院申込: the doctor in 外来 or 救急外来 asks for an admission; the ward decides the bed and takes
// the patient in. Until then the request waits on the ward (病棟マップ・◯階の患者一覧).
// ---------------------------------------------------------------------------

export interface AdmissionRequest {
  id: string;
  /** The visit it came from. */
  from: { kind: "er" | "opd"; id: string };
  name: string;
  kana: string;
  sex: ErPatient["sex"];
  age: number;
  ageMonths?: number;
  diagnosis: string;
  department: string;
  attending: string;
  urgency: "緊急" | "予定";
  /** 入院予定日 (day offset) and time if known. */
  when: { day: number; time: string | null };
  ward: string;
  roomWish: "個室" | "大部屋" | "どちらでも";
  /** 感染対策 needed on the ward. */
  isolation: "なし" | "接触予防策" | "飛沫予防策" | "空気予防策";
  /** 安静度 at admission. */
  rest: "ベッド上" | "車いす" | "歩行可";
  purpose: string;
  heightCm: number;
  weightKg: number;
  allergies: string[];
  note: string;
  status: "申込" | "入院済" | "取消";
  by: string;
  at: { day: number; time: string };
  /** The ward patient id once admitted. */
  admittedAs?: string;
}

export const REQUEST_WARDS = ["5階東病棟", "5階南病棟", "6階東病棟", "ICU", "HCU"];
/** Wards whose charts this prototype can hold. */
export const CHART_WARDS = ["5階東病棟", "ICU", "HCU"];

/** What is missing before the request can be sent. */
export function requestProblems(r: Pick<AdmissionRequest, "diagnosis" | "purpose" | "heightCm" | "weightKg">): string[] {
  const out: string[] = [];
  if (!r.diagnosis.trim()) out.push("入院時の病名");
  if (!r.purpose.trim()) out.push("入院の目的");
  if (!(r.heightCm > 0)) out.push("身長");
  if (!(r.weightKg > 0)) out.push("体重");
  return out;
}

/** One line for lists: "緊急　11/3 14:00　5階東病棟　尿路感染症の疑い（総合診療科）". */
export const requestLine = (r: AdmissionRequest, fmtDay: (d: number) => string) =>
  `${r.urgency}　${fmtDay(r.when.day)}${r.when.time ? ` ${r.when.time}` : ""}　${r.ward}　${r.diagnosis}（${r.department}）`;

/** Keep the existing emergency chart and its patient identity on admission. */
export function admitExistingPatient(p: Patient, r: AdmissionRequest, bed: { room: string; bed: string }, nowTime: string): { patient: Patient; bed: BedAssignment } {
  return {
    patient: {
      ...p,
      ward: floorOf(bed.room),
      room: bed.room,
      department: r.department,
      attending: r.attending,
      admissionDiagnosis: r.diagnosis.trim(),
      heightCm: r.heightCm > 0 ? r.heightCm : p.heightCm,
      weightKg: r.weightKg > 0 ? r.weightKg : p.weightKg,
      infections: r.isolation === "なし" || p.infections.includes(r.isolation) ? p.infections : [...p.infections, r.isolation],
      history: [...p.history, { kind: "note", day: 0, time: nowTime, author: r.attending, role: "医師", text: `救急外来から入院。入院時病名：${r.diagnosis.trim()}。${bed.room}${bed.bed ? `-${bed.bed}` : ""} へ。` }],
    },
    bed: { ...bed, patientId: p.id },
  };
}

/** Admit from an outpatient visit: the ward patient built from the request and the outpatient record. */
export function admitFromOpd(op: OpdPatient, r: AdmissionRequest, bed: { room: string; bed: string }, id: string, nowTime: string, visitNotes: string[]): { patient: Patient; bed: BedAssignment } {
  const v = op.vitals;
  const history: HistoryEntry[] = [
    ...op.visits.map((x): HistoryEntry => ({ kind: "note", day: x.day, time: "10:00", author: op.doctor, role: "医師", text: `外来：${x.text}` })),
    ...(op.referral ? [{ kind: "note", day: 0, time: op.arrived ?? "09:00", author: "外来", role: "看護師", text: `紹介状：${op.referral}` } as HistoryEntry] : []),
    ...visitNotes.map((t): HistoryEntry => ({ kind: "note", day: 0, time: nowTime, author: r.attending, role: "医師", text: `外来：${t}` })),
    {
      kind: "note",
      day: 0,
      time: nowTime,
      author: r.attending,
      role: "医師",
      text: `外来から入院（${r.urgency}）。入院時病名：${r.diagnosis.trim()}。目的：${r.purpose.trim()}。安静度：${r.rest}。${r.isolation !== "なし" ? `感染対策：${r.isolation}。` : ""}${bed.room}${bed.bed ? `-${bed.bed}` : ""}へ。`,
    },
  ];
  const patient: Patient = {
    id,
    name: op.name,
    kana: op.kana,
    sex: op.sex,
    age: op.age,
    ...(op.ageMonths !== undefined ? { ageMonths: op.ageMonths } : {}),
    ward: "5階東",
    room: bed.room,
    department: r.department,
    attending: r.attending,
    admittedOn: 0,
    admissionDiagnosis: r.diagnosis.trim(),
    heightCm: r.heightCm,
    weightKg: r.weightKg,
    allergies: r.allergies,
    infections: [],
    cautions: [],
    history,
    labs: [],
    cultures: [],
    imaging: [],
    vitals: v ? [{ day: 0, time: op.arrived ?? nowTime, ...v }] : [],
    daily: [{ day: 0, weightKg: r.weightKg }],
  };
  return { patient, bed: { room: bed.room, bed: bed.bed, patientId: id } };
}

/** A request already waiting when the demo starts: the ED asked 総合診療科 to admit 宮本さん (er-1). */
export const INITIAL_REQUESTS: AdmissionRequest[] = [
  {
    id: "req-1",
    from: { kind: "er", id: "er-1" },
    name: "宮本 タケ",
    kana: "ミヤモト タケ",
    sex: "女",
    age: 82,
    diagnosis: "尿路感染症の疑い",
    department: "総合診療科",
    attending: DOCTOR,
    urgency: "緊急",
    when: { day: 0, time: null },
    ward: "5階東病棟",
    roomWish: "どちらでも",
    isolation: "なし",
    rest: "車いす",
    purpose: "治療（抗菌薬の点滴）",
    heightCm: 148,
    weightKg: 42,
    allergies: [],
    note: "施設から救急搬送。尿の混濁あり。",
    status: "申込",
    by: DOCTOR,
    at: { day: 0, time: "09:30" },
  },
];
