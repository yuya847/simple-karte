import { describe, expect, it } from "vitest";
import { REQUEST_WARDS, CHART_WARDS, INITIAL_REQUESTS, admitFromEr, admitFromOpd, bedProblem, formProblems, requestProblems, type AdmissionRequest, type AdmitForm } from "./admission";
import { OPD_PATIENTS, waitingMinutes } from "./opd";
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

describe("入院申込 from 外来", () => {
  const op = OPD_PATIENTS.find((x) => x.id === "opd-1")!;
  const req: AdmissionRequest = { ...INITIAL_REQUESTS[0], id: "r2", from: { kind: "opd", id: op.id }, name: op.name, kana: op.kana, sex: op.sex, age: op.age, diagnosis: "心不全の増悪", purpose: "治療", heightCm: 164, weightKg: 63.5, urgency: "予定", rest: "歩行可" };

  it("asks for what the doctor must write", () => {
    expect(requestProblems({ diagnosis: "", purpose: " ", heightCm: 0, weightKg: 50 })).toEqual(["入院時の病名", "入院の目的", "身長"]);
    expect(requestProblems(req)).toEqual([]);
  });

  it("builds the ward patient from the outpatient record and the request", () => {
    const { patient, bed } = admitFromOpd(op, req, { room: "502", bed: "" }, "90020002", "11:00", ["夜間の起座呼吸あり。"]);
    expect(bed).toEqual({ room: "502", bed: "", patientId: "90020002" });
    expect(patient).toMatchObject({ admittedOn: 0, room: "502", admissionDiagnosis: "心不全の増悪", weightKg: 63.5, attending: req.attending });
    expect(patient.history.map((h) => (h.kind === "note" ? h.text : ""))).toEqual([
      "外来：体重60.5kg、下腿浮腫なし。処方継続。",
      "外来：HbA1c 7.1%。体重60.8kg。処方継続。",
      "外来：夜間の起座呼吸あり。",
      "外来から入院（予定）。入院時病名：心不全の増悪。目的：治療。安静度：歩行可。502へ。",
    ]);
    expect(patient.vitals[0]).toMatchObject({ day: 0, time: "08:42", sbp: 156, spo2: 92 });
  });

  it("counts the wait from reception, not during or after the visit", () => {
    expect(waitingMinutes(OPD_PATIENTS.find((x) => x.id === "opd-2")!, 9 * 60 + 35)).toBe(30);
    expect(waitingMinutes(op, 9 * 60 + 35)).toBeNull(); // 診察中
  });
});

it("ICU・HCUへ入院を申し込み、病棟で受けられる", () => {
  expect(REQUEST_WARDS).toEqual(expect.arrayContaining(["ICU", "HCU"]));
  expect(CHART_WARDS).toEqual(expect.arrayContaining(["ICU", "HCU"]));
});
