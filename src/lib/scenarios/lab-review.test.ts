import { expect, it } from "vitest";
import { SCENARIOS } from ".";
import { floorOf } from "../ward";
import { physiologyIndication } from "./physiology";

it("患者の主病名・病棟・保険と検査の設定が一貫する", () => {
  for (const { patient: p, diagnoses } of SCENARIOS.cases) {
    expect(diagnoses.find((d) => d.main)?.name).toBe(p.admissionDiagnosis);
    expect(floorOf(p.room)).toBe(p.ward);
    const insurance = SCENARIOS.insurance[p.id]?.[0];
    if (insurance && !/骨折|外傷/.test(p.admissionDiagnosis)) expect(insurance.form.coverage).not.toBe("労災");
    if (/腎盂腎炎/.test(p.admissionDiagnosis)) expect(p.cultures.some((c) => c.specimen === "尿")).toBe(true);
  }
  expect(physiologyIndication("急性腎盂腎炎").test).toBe("PHY-ABDUS");
  expect(physiologyIndication("切迫早産").test).toBe("PHY-ECG");
  expect(physiologyIndication("クロストリジオイデス・ディフィシル腸炎").test).toBe("PHY-ABDUS");
});
it("生理検査・外来採血・救急の採取時刻に幅がある", () => {
  const physio = SCENARIOS.patients.flatMap((p) => p.history.flatMap((e) => e.kind === "order" && e.order.type === "physio" ? [e.order.when.time] : []));
  expect(new Set(physio).size).toBe(12);
  const opd = SCENARIOS.cases.filter((c) => c.stage === "外来").flatMap((c) => c.patient.labs.filter((l) => l.day === 0).map((l) => l.time));
  expect(new Set(opd).size).toBeGreaterThan(5);
  const er = SCENARIOS.cases.filter((c) => c.stage === "救急").flatMap((c) => c.patient.history.flatMap((e) => e.kind === "order" && e.order.type === "lab" ? [e.order.collect.time] : []));
  expect(new Set(er).size).toBeGreaterThan(5);
});
it("同一患者の日ごとの腎機能・電解質が固定値にならない", () => {
  const p = SCENARIOS.patients.find((p) => p.admittedOn < -14 && /肺炎/.test(p.admissionDiagnosis))!;
  for (const code of ["Cre", "BUN", "Na", "K"]) expect(new Set(p.labs.map((l) => l.values[code]).filter((v) => v !== undefined)).size, code).toBeGreaterThan(1);
});
