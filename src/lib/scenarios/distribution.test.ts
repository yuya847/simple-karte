import { describe, expect, it } from "vitest";
import { generateScenarios } from ".";
import { FEMALE_NAMES, MALE_NAMES, SURNAMES } from "./names";
import { deriveDpc } from "../billing/dpc";
import { duesOf } from "../admit-eval";
import { FLOORS, nurseFor } from "../ward";
import { involved, doctorsOf } from "../patient-doctors";
import { STAFF } from "../roles";
import { standingFromBlocks } from "../standing-blocks";

const ratio = (n: number, total: number) => n / total;
describe("試験病棟の分布", () => {
  it.each([20261106, 42, 7])("seed %s: 氏名・担当・病床・完了状態に偏りがない", (seed) => {
    const s = generateScenarios(seed);
    const admitted = s.cases.filter((c) => c.stage === "入院");
    expect(SURNAMES.length).toBeGreaterThanOrEqual(100);
    expect(MALE_NAMES.length + FEMALE_NAMES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(s.patients.map((p) => p.name.split(" ")[0])).size).toBe(100);
    expect(new Set(s.patients.map((p) => p.kana)).size).toBe(100);
    expect(new Set(admitted.map((c) => c.patient.age)).size).toBeGreaterThan(15);
    const doctors = admitted.map((c) => c.patient.attending);
    expect(new Set(doctors).size).toBeGreaterThanOrEqual(5);
    for (const doctor of doctors) expect(ratio(doctors.filter((d) => d === doctor).length, doctors.length)).toBeLessThan(0.4);
    const mine = admitted.filter(({ patient: p }) => involved(STAFF.医師.name, doctorsOf(p.attending, [])));
    expect(mine.length).toBeGreaterThanOrEqual(10);
    expect(mine.length).toBeLessThanOrEqual(15);
    const coded = admitted.filter(({ patient: p, diagnoses }) => {
      const d = diagnoses.find((d) => d.main)!;
      return deriveDpc({ icd10: d.icd10 ?? "", diagnosis: d.name, age: p.age, acts: [], others: [], transfer: false }).ok;
    });
    expect(ratio(coded.length, admitted.length)).toBeGreaterThanOrEqual(0.7);
    const taken = admitted.filter(({ patient: p }) => standingFromBlocks(s.standingLines[p.id], s.standing[p.id][0])?.taken);
    expect(ratio(taken.length, admitted.length)).toBeGreaterThan(0.8);
    expect(taken.length).toBeLessThan(admitted.length);
    expect(ratio(admitted.filter((c) => s.consents.some((r) => r.patientId === c.patient.id && r.status === "同意")).length, admitted.length)).toBeGreaterThan(0.8);
    expect(admitted.filter((c) => s.consents.some((r) => r.patientId === c.patient.id && r.status === "説明前")).length).toBeGreaterThan(0);
    expect(new Set(admitted.map((c) => nurseFor(c.patient.room))).size).toBeGreaterThanOrEqual(6);
    expect(new Set(admitted.map((c) => c.patient.ward)).size).toBe(3);
    expect(new Set(s.beds.map((b) => `${b.room}:${b.bed}`)).size).toBe(s.beds.length);
    for (const room of new Set(s.patients.map((p) => p.room))) expect(new Set(s.patients.filter((p) => p.room === room).map((p) => p.sex)).size).toBe(1);
    for (const c of s.cases) {
      expect(FLOORS.find((f) => f.name === c.patient.ward)?.rooms.some((r) => r.no === c.patient.room && r.beds.includes(c.bed))).toBe(true);
      if (c.stage === "入院" && c.patient.admittedOn <= -2) {
        expect(duesOf(s.evals[c.patient.id], c.patient.admittedOn).filter((d) => d.key !== "reassess").every((d) => d.doneOn !== undefined || d.dueOn === null)).toBe(true);
      }
    }
  });
});
