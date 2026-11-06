// レセプトの点検, on the server: each patient's month through the same claim as /api/claim and the same
// receipt checks as the UKE file (記録条件仕様), every level kept so the screen can sort them. Server only.

import { checkDiseases } from "./disease-check";
import { inspectItems } from "./inspect";
import type { ClaimIssue } from "./model";
import { patientMonth, type PatientMonthInput } from "./month";
import { checkUke } from "./uke";

export interface PatientInspection {
  id: string;
  days: number;
  points: number;
  issues: ClaimIssue[];
  unresolved: number;
  /** The receipt's own checks (傷病名・主傷病・未コード化・摘要). */
  receiptProblems: string[];
}

export function receiptInspection(inputs: PatientMonthInput[], today: string, nowTime: string, month: string): PatientInspection[] {
  return inputs.map((input) => {
    const pm = patientMonth(input, today, nowTime, month);
    const candidates = checkDiseases({ ...input, today, nowTime, month, admittedOn: input.patient.admittedOn, dischargedOn: input.patient.dischargedOn });
    const issues: ClaimIssue[] = [...pm.claim.issues, ...candidates.map(c => ({ level: "review" as const, text: c.text }))];
    const receiptProblems = pm.claim.days > 0 ? checkUke([], [pm.receipt]) : [];
    const unresolved = pm.claim.days > 0 ? inspectItems(issues, receiptProblems, input.diagnoses).filter(i => i.kind !== "算定から外したもの").length : 0;
    return {
      unresolved,
      id: input.patient.id,
      days: pm.claim.days,
      points: pm.claim.totalPoints,
      issues,
      receiptProblems,
    };
  });
}
