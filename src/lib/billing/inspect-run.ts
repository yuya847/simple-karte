// レセプトの点検, on the server: each patient's month through the same claim as /api/claim and the same
// receipt checks as the UKE file (記録条件仕様), every level kept so the screen can sort them. Server only.

import type { ClaimIssue } from "./model";
import { patientMonth, type PatientMonthInput } from "./month";
import { checkUke } from "./uke";

export interface PatientInspection {
  id: string;
  days: number;
  points: number;
  issues: ClaimIssue[];
  /** The receipt's own checks (傷病名・主傷病・未コード化・摘要). */
  receiptProblems: string[];
}

export function receiptInspection(inputs: PatientMonthInput[], today: string, nowTime: string, month: string): PatientInspection[] {
  return inputs.map((input) => {
    const pm = patientMonth(input, today, nowTime, month);
    return {
      id: input.patient.id,
      days: pm.claim.days,
      points: pm.claim.totalPoints,
      issues: pm.claim.issues,
      receiptProblems: pm.claim.days > 0 ? checkUke([], [pm.receipt]) : [],
    };
  });
}
