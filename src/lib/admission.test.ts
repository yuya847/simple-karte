import { describe, expect, it } from "vitest";
import { admitFromEr, bedProblem, formProblems, type AdmitForm } from "./admission";
import { initialErPatients } from "./er";
import { abs } from "./flowsheet";
import { findPatient } from "./patients";
import { BEDS, ROOMS, emptyBeds, type WardState } from "./ward";

const ward: WardState = { beds: BEDS, patient: findPatient };
const room = (no: string) => ROOMS.find((r) => r.no === no)!;
const now = abs(0, "10:00");
const miyamoto = initialErPatients(now)[0]; // 82歳女性, 08:25 着

const form: AdmitForm = {
  diagnosis: "尿路感染症の疑い",
  department: "総合診療科",
  heightCm: 148,
  weightKg: 42,
  allergies: [],
  room: "513",
  bed: "C",
};

describe("admission from the emergency department", () => {
  it("keeps shared rooms single-sex", () => {
    expect(bedProblem(ward, room("513"), "女")).toBeNull(); // women's room
    expect(bedProblem(ward, room("513"), "男")).toBe("女性の部屋です");
    expect(bedProblem(ward, room("502"), "男")).toBeNull(); // private room
  });

  it("lists empty beds", () => {
    const empty = emptyBeds(BEDS).map((b) => `${b.room.no}${b.bed}`);
    expect(empty).toContain("513C");
    expect(empty).toContain("502");
    expect(empty).not.toContain("512");
  });

  it("asks for what the admitting doctor must enter", () => {
    expect(formProblems({ ...form, diagnosis: " ", weightKg: 0, room: "" })).toEqual([
      "入院時の病名を入れてください",
      "体重を入れてください",
      "ベッドを選んでください",
    ]);
  });

  it("builds the ward patient from the ED record", () => {
    const { patient, bed } = admitFromEr(miyamoto, form, "90020001", "10:00");
    expect(bed).toEqual({ room: "513", bed: "C", patientId: "90020001" });
    expect(patient).toMatchObject({ admittedOn: 0, room: "513", admissionDiagnosis: "尿路感染症の疑い", weightKg: 42 });
    expect(patient.vitals).toEqual([{ day: 0, time: "08:25", bt: 38.8, hr: 112, sbp: 98, dbp: 54, rr: 24, spo2: 94, o2: "室内気" }]);
    expect(patient.history[0]).toMatchObject({ author: "救急外来", time: "08:25" });
    expect(patient.history[0].kind === "note" && patient.history[0].text).toContain("JTAS 2");
  });
});
