// ベッドコントロール: the whole hospital's beds on one screen — occupied and empty beds by floor (with the
// sex of each 4床室, so a man is not put in a women's room), today's and tomorrow's admissions and
// discharges, and tomorrow morning's empty beds counted from them. For each waiting 入院申込, the empty
// beds that fit (sex, 個室の希望, 感染対策) are listed with the reason; the bed is chosen by a person.

import type { AdmissionRequest } from "./admission";
import type { Sex } from "./types";
import type { BedAssignment, Floor, Room } from "./ward";

export interface EmptyBed {
  floor: string;
  room: Room;
  bed: string;
  /** The sex already in the room (4床室), or null when the room is empty. */
  roomSex: Sex | null;
}

export interface FloorCount {
  floor: string;
  beds: number;
  occupied: number;
  empty: EmptyBed[];
  admit: [number, number];
  discharge: [number, number];
  /** Tomorrow morning: empty + today's discharges − today's admissions not yet in a bed. */
  tomorrowEmpty: number;
}

export interface PlannedMove {
  floor: string;
  day: number;
  kind: "入院" | "退院";
  transfer?: boolean;
}

const sexOf = (b: BedAssignment, patient: (id: string) => { sex: Sex } | undefined): Sex | undefined => (b.patientId ? patient(b.patientId)?.sex : b.other?.sex);

export function emptyBedsOf(floors: Floor[], beds: BedAssignment[], patient: (id: string) => { sex: Sex } | undefined): EmptyBed[] {
  return floors.flatMap((f) =>
    f.rooms.flatMap((room) => {
      const inRoom = beds.filter((b) => b.room === room.no);
      const roomSex = inRoom.map((b) => sexOf(b, patient)).find(Boolean) ?? null;
      return room.beds.filter((bed) => !inRoom.some((b) => b.bed === bed)).map((bed) => ({ floor: f.name, room, bed, roomSex }));
    }),
  );
}

export function floorCounts(floors: Floor[], beds: BedAssignment[], patient: (id: string) => { sex: Sex } | undefined, plans: PlannedMove[]): FloorCount[] {
  const empty = emptyBedsOf(floors, beds, patient);
  return floors.map((f) => {
    const total = f.rooms.reduce((n, r) => n + r.beds.length, 0);
    const mine = empty.filter((e) => e.floor === f.name);
    const count = (kind: PlannedMove["kind"], day: number) => plans.filter((p) => p.floor === f.name && p.kind === kind && p.day === day).length;
    const admit: [number, number] = [count("入院", 0), count("入院", 1)];
    const discharge: [number, number] = [count("退院", 0), count("退院", 1)];
    return { floor: f.name, beds: total, occupied: total - mine.length, empty: mine, admit, discharge, tomorrowEmpty: mine.length + discharge[0] - admit[0] + plans.filter(p => p.floor === f.name && p.transfer && p.day === 1).reduce((n,p) => n + (p.kind === "退院" ? 1 : -1), 0) };
  });
}

/** Rooms that need a 個室 for the infection precautions asked for (架空の病院の取り決め). */
export const NEEDS_PRIVATE: AdmissionRequest["isolation"][] = ["飛沫予防策", "空気予防策"];

/** The empty beds that fit a request, best first, each with why it fits (or what to check). */
export function bedsFor(r: Pick<AdmissionRequest, "sex" | "roomWish" | "isolation" | "ward">, empty: EmptyBed[]): { bed: EmptyBed; why: string; note?: string }[] {
  const needPrivate = NEEDS_PRIVATE.includes(r.isolation) || r.roomWish === "個室";
  return empty
    .filter((e) => (needPrivate ? e.room.kind === "個室" : r.roomWish === "大部屋" ? e.room.kind === "4床室" : true))
    .filter((e) => e.room.kind === "個室" || e.roomSex === null || e.roomSex === r.sex)
    .map((e) => ({
      bed: e,
      why: [e.floor === r.ward ? "希望の病棟" : "ほかの病棟", e.room.kind, e.room.kind === "4床室" ? (e.roomSex ? `${e.roomSex}性の部屋` : "空室") : ""].filter(Boolean).join("・"),
      note: r.isolation === "接触予防策" && e.room.kind === "4床室" ? "接触予防策：同室者との距離・物品の専用化を確かめる" : undefined,
    }))
    .sort((a, b) => Number(b.bed.floor === r.ward) - Number(a.bed.floor === r.ward) || Number(b.bed.room.kind === "個室" && r.isolation !== "なし") - Number(a.bed.room.kind === "個室" && r.isolation !== "なし") || a.bed.room.no.localeCompare(b.bed.room.no));
}
