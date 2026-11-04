// The ward on another day (病棟マップ・◯階の患者一覧の日付の移動). Pure functions: the beds on a chosen
// day are worked out by code from today's beds and the plans; nothing is decided or suggested here.
//
// A future day is the MORNING of that day, so that the empty-bed count follows the same sum as
// ベッドコントロール: 明日の朝の空床 ＝ いまの空床 ＋ 今日の退院 − 今日の入院. A patient leaving that day is
// still there (marked 退院予定), a patient arriving that day is not yet there (the bed is marked 入院予定
// and counted among the empty beds, as 「うち入院予定」).
//
// A past day is what the record says: a patient was there if admitted on or before the day and not
// discharged on or before it (dischargedAt). Where the record says nothing (nobody known in a bed, or a
// day before the earliest admission), the screen says so instead of showing an empty bed.
//
// Showing a forecast by moving the date is 架空の病院の取り決め (a thing this fictional hospital does).

import type { AdmissionRequest } from "./admission";
import { floorOf, WARD_PLANS, type BedAssignment, type Room, type WardPlan } from "./ward";
import type { HistoryEntry, Patient, Sex } from "./types";

/** How far ahead the date can be moved (days). 架空の病院の取り決め. */
export const DAYS_AHEAD = 7;

export type MarkKind = "入院予定" | "退院予定" | "空く予定";

/** Someone expected on a bed who has no chart yet. */
export interface Expected {
  name: string;
  sex: Sex;
  age: number;
  ageMonths?: number;
  department: string;
  note?: string;
}

/** A bed on the chosen day: the occupant (as BedAssignment) plus the mark the plans put on it. */
export interface AsOfBed extends BedAssignment {
  mark?: { kind: MarkKind; day: number; time: string | null };
  expected?: Expected;
  /** A past day: the record does not say who was in this bed. */
  unknown?: boolean;
}

export interface PlannedAdmission {
  day: number;
  time: string | null;
  /** Empty strings when no bed is decided yet (an 入院申込 waiting on the ward). */
  room: string;
  bed: string;
  floor: string;
  who: Expected;
}

export interface PlannedDischarge {
  day: number;
  time: string;
  room: string;
  bed: string;
}

export interface AsOfInput {
  /** Today's beds of the floor(s), INCLUDING patients whose discharge was already carried out (dischargedAt). */
  beds: BedAssignment[];
  rooms: Room[];
  /** Names of the floors shown (an admission without a bed counts when its floor is one of them). */
  floors: string[];
  patient: (id: string) => Patient | undefined;
  admissions: PlannedAdmission[];
  discharges: PlannedDischarge[];
}

export interface AsOfCounts {
  total: number;
  occupied: number;
  /** null on a past day: the record does not say which beds were empty. */
  empty: number | null;
  /** Beds counted empty that an admission is planned into that day（うち入院予定）. */
  reserved: number;
  /** Admissions and discharges of that day (planned, or from the record). */
  admit: number;
  discharge: number;
}

export interface WardAsOf {
  day: number;
  /** false: a past day before the earliest admission in the record（この日の記録はありません）. */
  known: boolean;
  /** The earliest day the record covers (the earliest admission), or null when no patient is known. */
  firstKnown: number | null;
  beds: AsOfBed[];
  counts: AsOfCounts;
}

const key = (room: string, bed: string) => `${room}-${bed}`;

/** The mark on a bed, when the bed came from bedsAsOf. */
export const markOf = (b: BedAssignment): AsOfBed["mark"] => ("mark" in b ? (b as AsOfBed).mark : undefined);
export const expectedOf = (b: BedAssignment): Expected | undefined => ("expected" in b ? (b as AsOfBed).expected : undefined);
export const isUnknownBed = (b: BedAssignment): boolean => "unknown" in b && !!(b as AsOfBed).unknown;

/** Planned admissions: the ward's fixed plans and the 入院申込 still waiting (no bed yet). */
export function admissionPlans(plans: WardPlan[] = WARD_PLANS, requests: AdmissionRequest[] = []): PlannedAdmission[] {
  return [
    ...plans.filter((p) => p.kind === "入院").map((p) => ({ day: p.day, time: p.time, room: p.room, bed: p.bed, floor: floorOf(p.room), who: { name: p.name, sex: p.sex, age: p.age, department: p.department, note: p.note } })),
    ...requests
      .filter((r) => r.status === "申込")
      .map((r) => ({ day: r.when.day, time: r.when.time, room: "", bed: "", floor: r.ward, who: { name: r.name, sex: r.sex, age: r.age, ageMonths: r.ageMonths, department: r.department, note: r.diagnosis } })),
  ];
}

/**
 * Planned discharges: the ward's fixed plans (by bed) and every bed patient's 退院 order (有効, from today on).
 * A patient already discharged has no plan left.
 */
export function dischargePlans(beds: BedAssignment[], patient: (id: string) => Patient | undefined, entriesOf: (p: Patient) => HistoryEntry[], plans: WardPlan[] = WARD_PLANS): PlannedDischarge[] {
  const out: PlannedDischarge[] = plans.filter((p) => p.kind === "退院").map((p) => ({ day: p.day, time: p.time, room: p.room, bed: p.bed }));
  for (const b of beds) {
    const p = b.patientId ? patient(b.patientId) : undefined;
    if (!p || p.dischargedAt) continue;
    for (const e of entriesOf(p)) {
      if (e.kind === "order" && e.status === "有効" && e.order.type === "procedure" && e.order.leave?.kind === "退院" && e.order.leave.from.day >= 0) {
        out.push({ day: e.order.leave.from.day, time: e.order.leave.from.time, room: b.room, bed: b.bed });
      }
    }
  }
  return out;
}

/** The earliest discharge planned for a bed (today or later). */
function dischargeOf(discharges: PlannedDischarge[], room: string, bed: string): PlannedDischarge | undefined {
  return discharges.filter((d) => d.room === room && d.bed === bed && d.day >= 0).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time))[0];
}

/** The ward as it stands on `day` (0 = today, 1 = tomorrow, −1 = yesterday). */
export function bedsAsOf(day: number, input: AsOfInput): WardAsOf {
  const { rooms, patient } = input;
  const inRooms = (room: string, bed: string) => rooms.some((r) => r.no === room && r.beds.includes(bed));
  const beds = input.beds.filter((b) => inRooms(b.room, b.bed));
  const total = rooms.reduce((n, r) => n + r.beds.length, 0);
  const patients = beds.flatMap((b) => (b.patientId ? (patient(b.patientId) ? [patient(b.patientId)!] : []) : []));
  const firstKnown = patients.length ? Math.min(...patients.map((p) => p.admittedOn)) : null;
  // Admissions that concern these rooms: with a bed here, or without a bed but for one of these floors.
  const admissions = input.admissions.filter((a) => (a.room ? inRooms(a.room, a.bed) : input.floors.includes(a.floor)));
  const discharges = input.discharges.filter((d) => inRooms(d.room, d.bed));
  // Who is here now (a discharge carried out empties the bed at once; the chart stays open elsewhere).
  const gone = (p: Patient | undefined, d: number) => !!p?.dischargedAt && p.dischargedAt.day <= d;
  const present0 = beds.filter((b) => !gone(b.patientId ? patient(b.patientId) : undefined, 0));

  if (day < 0) {
    // What the record says: admitted on or before the day, not discharged on or before it.
    const present: AsOfBed[] = beds.filter((b) => {
      const p = b.patientId ? patient(b.patientId) : undefined;
      return !!p && p.admittedOn <= day && !gone(p, day);
    });
    const unknown: AsOfBed[] = rooms.flatMap((r) => r.beds.filter((bed) => !present.some((b) => b.room === r.no && b.bed === bed)).map((bed) => ({ room: r.no, bed, unknown: true })));
    const admit = patients.filter((p) => p.admittedOn === day).length;
    const discharge = patients.filter((p) => p.dischargedAt?.day === day).length;
    const known = firstKnown !== null && day >= firstKnown;
    return { day, known, firstKnown, beds: known ? [...present, ...unknown] : unknown, counts: { total, occupied: known ? present.length : 0, empty: null, reserved: 0, admit, discharge } };
  }

  // Today or later. Start from today's beds; on a later day drop those who leave before it and mark those who leave that day.
  const out: AsOfBed[] = [];
  const freed = new Map<string, AsOfBed>();
  for (const b of present0) {
    const leave = day > 0 ? dischargeOf(discharges, b.room, b.bed) : undefined;
    if (leave && leave.day < day) freed.set(key(b.room, b.bed), { room: b.room, bed: b.bed, mark: { kind: "空く予定", day: leave.day, time: leave.time } });
    else if (leave && leave.day === day) out.push({ ...b, mark: { kind: "退院予定", day: leave.day, time: leave.time } });
    else out.push(b);
  }
  // Admissions up to that day go to the beds they are planned for, if those beds are free then.
  for (const a of [...admissions].sort((x, y) => x.day - y.day || (x.time ?? "").localeCompare(y.time ?? ""))) {
    if (!a.room || a.day > day) continue;
    const k = key(a.room, a.bed);
    if (out.some((b) => key(b.room, b.bed) === k)) continue; // the bed is taken (or already promised)
    freed.delete(k);
    out.push({ room: a.room, bed: a.bed, mark: { kind: "入院予定", day: a.day, time: a.time }, expected: a.who });
  }
  out.push(...freed.values());
  // Occupied that morning: here with no mark, leaving that day, or arrived on an earlier day. An arrival
  // that day is counted among the empty beds（うち入院予定）, as ベッドコントロール does.
  const occupied = out.filter((b) => !b.mark || b.mark.kind === "退院予定" || (b.mark.kind === "入院予定" && b.mark.day < day)).length;
  const reserved = out.filter((b) => b.mark?.kind === "入院予定" && b.mark.day === day).length;
  // Today's admissions and discharges include those already in the record (admitted today; discharged today).
  const admitToday = day === 0 ? patients.filter((p) => p.admittedOn === 0 && !gone(p, 0)).length : 0;
  const dischargeBeds = new Set([...discharges.filter((d) => d.day === day).map((d) => key(d.room, d.bed)), ...(day === 0 ? beds.filter((b) => b.patientId && patient(b.patientId)?.dischargedAt?.day === 0).map((b) => key(b.room, b.bed)) : [])]);
  return {
    day,
    known: true,
    firstKnown,
    beds: out,
    counts: { total, occupied, empty: total - occupied, reserved, admit: admissions.filter((a) => a.day === day).length + admitToday, discharge: dischargeBeds.size },
  };
}

/** The range the date can be moved over: back to the earliest admission in the record, ahead DAYS_AHEAD days. */
export function dayRange(asOf: WardAsOf): { min: number; max: number } {
  return { min: Math.min(0, asOf.firstKnown ?? 0), max: DAYS_AHEAD };
}

/** "入院予定 14:00" / "入院予定（11/4）" / "退院予定 10:00" / "空く予定（11/5 10:00 退院）", for a bed seen on `day`. */
export function markText(mark: NonNullable<AsOfBed["mark"]>, day: number, fmtDay: (d: number) => string): string {
  if (mark.kind === "空く予定") return `空く予定（${fmtDay(mark.day)}${mark.time ? ` ${mark.time}` : ""} 退院）`;
  if (mark.day === day) return mark.time ? `${mark.kind} ${mark.time}` : mark.kind;
  return `${mark.kind}（${fmtDay(mark.day)}${mark.time ? ` ${mark.time}` : ""}）`;
}
