// Layout of the FICTIONAL ward "5階東". Room numbers skip 4 and 9, as many Japanese
// hospitals do. Patients of other teams are fictional placeholders: they fill the map so
// the ward reads as a ward, but their charts are not part of this prototype.

import type { Patient, Sex } from "./types";

export interface Room {
  no: string;
  kind: "個室" | "4床室";
  beds: string[]; // bed letters; a private room has one bed ""
  /** Which side of the corridor the room is on. */
  side: "north" | "south";
}

export interface OtherPatient {
  name: string;
  sex: Sex;
  age: number;
  department: string;
  note?: string;
}

export interface BedAssignment {
  room: string;
  bed: string;
  patientId?: string; // one of our patients
  other?: OtherPatient;
}

const four = ["A", "B", "C", "D"];

export const WARD_NAME = "5階東病棟";

export const ROOMS: Room[] = [
  { no: "516", kind: "4床室", beds: four, side: "north" },
  { no: "515", kind: "4床室", beds: four, side: "north" },
  { no: "513", kind: "4床室", beds: four, side: "north" },
  { no: "512", kind: "個室", beds: [""], side: "north" },
  { no: "511", kind: "個室", beds: [""], side: "north" },
  { no: "510", kind: "個室", beds: [""], side: "north" },
  { no: "501", kind: "個室", beds: [""], side: "south" },
  { no: "502", kind: "個室", beds: [""], side: "south" },
  { no: "503", kind: "個室", beds: [""], side: "south" },
  { no: "505", kind: "4床室", beds: four, side: "south" },
  { no: "506", kind: "4床室", beds: four, side: "south" },
  { no: "507", kind: "4床室", beds: four, side: "south" },
  { no: "508", kind: "4床室", beds: four, side: "south" },
];

const o = (name: string, sex: Sex, age: number, department: string, note?: string): OtherPatient => ({ name, sex, age, department, note });

export const BEDS: BedAssignment[] = [
  // our patients
  { room: "512", bed: "", patientId: "90010231" },
  { room: "515", bed: "B", patientId: "90010244" },
  { room: "508", bed: "A", patientId: "90010198" },
  { room: "511", bed: "", patientId: "90010260" },
  // other teams (fictional)
  { room: "501", bed: "", other: o("岡部 正二", "男", 81, "呼吸器内科", "酸素投与中") },
  { room: "503", bed: "", other: o("村井 和子", "女", 77, "消化器内科") },
  { room: "505", bed: "A", other: o("堀 誠", "男", 68, "消化器内科", "明日退院") },
  { room: "505", bed: "B", other: o("西田 浩", "男", 59, "消化器内科", "検査予定") },
  { room: "505", bed: "D", other: o("小池 隆", "男", 73, "循環器内科") },
  { room: "506", bed: "A", other: o("上野 幸子", "女", 84, "総合診療科（B チーム）") },
  { room: "506", bed: "B", other: o("吉川 ミツ", "女", 90, "総合診療科（B チーム）", "転倒注意") },
  { room: "506", bed: "C", other: o("久保 恵", "女", 66, "消化器内科") },
  { room: "507", bed: "A", other: o("原 啓介", "男", 55, "循環器内科") },
  { room: "507", bed: "C", other: o("松尾 実", "男", 79, "呼吸器内科") },
  { room: "507", bed: "D", other: o("今井 武", "男", 70, "総合診療科（B チーム）", "新入院") },
  { room: "508", bed: "B", other: o("田村 昭", "男", 83, "循環器内科") },
  { room: "508", bed: "C", other: o("杉本 進", "男", 62, "消化器内科", "明日退院") },
  { room: "510", bed: "", other: o("坂口 典子", "女", 71, "呼吸器内科", "飛沫予防策") },
  { room: "513", bed: "A", other: o("石原 清子", "女", 75, "消化器内科") },
  { room: "513", bed: "B", other: o("中野 英子", "女", 88, "総合診療科（B チーム）") },
  { room: "513", bed: "D", other: o("横山 文子", "女", 69, "循環器内科", "検査予定") },
  { room: "515", bed: "A", other: o("野口 ハル", "女", 92, "総合診療科（B チーム）") },
  { room: "515", bed: "C", other: o("菅原 洋子", "女", 58, "消化器内科") },
  { room: "516", bed: "B", other: o("藤井 さよ", "女", 80, "呼吸器内科") },
  { room: "516", bed: "C", other: o("高田 由美", "女", 63, "消化器内科", "新入院") },
  { room: "516", bed: "D", other: o("安藤 キヨ", "女", 86, "循環器内科") },
];

/** The ward as it stands: bed assignments (initial ones plus today's admissions) and a patient lookup. */
export interface WardState {
  beds: BedAssignment[];
  patient: (id: string) => Patient | undefined;
}

export function occupant(beds: BedAssignment[], room: string, bed: string): BedAssignment | undefined {
  return beds.find((b) => b.room === room && b.bed === bed);
}

export function emptyBeds(beds: BedAssignment[]): { room: Room; bed: string }[] {
  return ROOMS.flatMap((room) => room.beds.filter((bed) => !occupant(beds, room.no, bed)).map((bed) => ({ room, bed })));
}

/** Sex of the people already in a shared room, if any (shared rooms are single-sex on this ward). */
export function roomSex(ward: WardState, roomNo: string): Sex | null {
  for (const b of ward.beds.filter((x) => x.room === roomNo)) {
    const sex = b.patientId ? ward.patient(b.patientId)?.sex : b.other?.sex;
    if (sex) return sex;
  }
  return null;
}

/** Isolation shown on the map for our patients (by infection). Display only. */
export function isolationFor(infections: string[]): string | null {
  if (infections.some((i) => i.includes("MRSA"))) return "接触予防策";
  return null;
}
