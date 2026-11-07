import { describe, expect, it } from "vitest";
import { teamIdsFor } from "./team-ids";
import { SCENARIOS } from "./scenarios";
import { PATIENTS } from "./patients";
import { STAFF } from "./roles";
import { NURSES } from "./nurses";
import { doctorFor, nurseFor } from "./ward";
import { doctorsOf, involved, INITIAL_DOCTOR_BOOK } from "./patient-doctors";

const args = { patients: SCENARIOS.patients, beds: SCENARIOS.beds, doctorBook: INITIAL_DOCTOR_BOOK, scenario: true };
const icu = (nums: number[]) => nums.map(n => `9900010${n}`);
describe("受け持ち患者", () => {
  it("三浦はICU1〜4、篠原はICU5〜6の患者だけ", () => {
    expect([...teamIdsFor({ ...args, role: "看護師", meName: "看護師 三浦" })].sort()).toEqual(icu([1, 2, 3, 4]));
    expect([...teamIdsFor({ ...args, role: "看護師", meName: "看護師 篠原" })].sort()).toEqual(icu([5, 6]));
  });
  it("大野はICUの6人", () => {
    expect([...teamIdsFor({ ...args, role: "医師", meName: doctorFor("集中治療科") })].sort()).toEqual(icu([1, 2, 3, 4, 5, 6]));
  });
  it("佐藤と山本は既存の集合を保つ", () => {
    const old = new Set(SCENARIOS.patients.filter(p => involved(STAFF.医師.name, doctorsOf(p.attending, INITIAL_DOCTOR_BOOK[p.id]))).map(p => p.id));
    for (const role of ["看護師", "医師"] as const) expect(teamIdsFor({ ...args, role, meName: STAFF[role].name })).toEqual(old);
    expect(old.size).toBeGreaterThan(0);
    expect(teamIdsFor({ ...args, role: "看護師", meName: STAFF.看護師.name, patients: PATIENTS, scenario: false, beds: [] })).toEqual(new Set(["90010231", "90010244", "90010198", "90010260"]));
  });
  it("通常病棟では元の対象範囲を保ち、追加の担当医も拾う", () => {
    const extra = { ...PATIENTS[0], id: "new-team", attending: "ほかの医師" };
    const doctorBook = { [extra.id]: [{ name: STAFF.医師.name, role: "担当医" as const, since: { day: 0, time: "10:00" }, by: STAFF.医師.name }] };
    const input = { ...args, patients: [...PATIENTS, extra], basePatients: PATIENTS, beds: [], doctorBook, scenario: false };
    expect(teamIdsFor({ ...input, role: "看護師", meName: STAFF.看護師.name })).toEqual(new Set(PATIENTS.map(p => p.id)));
    expect(teamIdsFor({ ...input, role: "医師", meName: STAFF.医師.name })).toEqual(new Set([...PATIENTS.map(p => p.id), extra.id]));
  });
  it("HCUも担当表の部屋だけ", () => {
    const beds = [{ room: "HCU1", bed: "", patientId: "h1" }, { room: "HCU5", bed: "", patientId: "h5" }, { room: "HCU2", bed: "" }];
    expect(teamIdsFor({ ...args, beds, role: "看護師", meName: "看護師 大久保" })).toEqual(new Set(["h1"]));
    expect(teamIdsFor({ ...args, beds, role: "看護師", meName: "看護師 平井" })).toEqual(new Set(["h5"]));
  });
  it("転棟後の部屋で担当が替わり、空床は入らない", () => {
    const beds = args.beds.map(b => b.patientId === "99000101" ? { ...b, room: "ICU5" } : b);
    expect([...teamIdsFor({ ...args, beds, role: "看護師", meName: "看護師 三浦" })].sort()).toEqual(icu([2, 3, 4]));
    expect([...teamIdsFor({ ...args, beds, role: "看護師", meName: "看護師 篠原" })].sort()).toEqual(icu([1, 5, 6]));
  });
  it("看護師の選択肢は病棟の担当表に一致", () => {
    for (const n of NURSES.slice(1)) for (const room of n.rooms) expect(nurseFor(room)).toBe(n.name);
  });
});
