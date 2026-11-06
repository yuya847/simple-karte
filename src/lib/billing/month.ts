// One patient's month, end to end: insurance → 算定 → 会計 → レセプト. Server only (reads the masters).

import { diagnosisClaimable, type Diagnosis } from "../diagnoses";
import { calculateClaim } from "./engine";
import { ageOn, ASSUMED_INSURANCE_ISSUE, assumedInsurance, INSURANCE, type Insurance } from "./insurance";
import { calculateBill, type Bill } from "./kaikei";
import type { BillingOptions, ClaimInput, ClaimIssue, ClaimResult } from "./model";
import type { Receipt, ReceiptDiagnosis } from "./uke";
import { reviewIssues } from "./worklist";

export interface PatientMonthInput {
  patient: ClaimInput["patient"] & { kana: string };
  entries: ClaimInput["entries"];
  notGiven?: ClaimInput["notGiven"];
  daily: ClaimInput["daily"];
  cultures: ClaimInput["cultures"];
  diagnoses: Diagnosis[];
  options: BillingOptions;
  diets?: ClaimInput["diets"];
  letters?: ClaimInput["letters"];
  /** The insurance 医事課 registered (保険の登録). Without it: the demo's own, else assumed from age. */
  insurance?: Insurance;
}

export interface PatientMonth {
  insurance: Insurance & { assumed?: boolean };
  claim: ClaimResult;
  bill: Bill;
  receipt: Receipt;
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};

/** The calendar date (YYYY-MM-DD) of a day offset from `today`. */
export function dateOf(today: string, offset: number): string {
  const { y, m, d: day } = parse(today);
  const d = new Date(Date.UTC(y, m - 1, day) + offset * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Diagnoses that belong on the month's receipt, with their dates and the 転帰 as of that month. */
export function receiptDiagnoses(diagnoses: Diagnosis[], today: string, month: string): ReceiptDiagnosis[] {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  return diagnoses.flatMap((d) => {
    if (!diagnosisClaimable(d, month)) return [];
    const startDate = dateOf(today, d.start);
    if (startDate > last) return [];
    if (d.outcome !== "継続") {
      const end = d.outcomeDay === undefined ? null : dateOf(today, d.outcomeDay);
      if (end && end < first) return [];
      if (end && end > last) return [{ ...d, outcome: "継続" as const, startDate }];
    }
    return [{ ...d, startDate }];
  });
}

export function patientMonth(input: PatientMonthInput, today: string, nowTime: string, month: string): PatientMonth {
  const t = parse(today);
  const insurance = input.insurance ?? INSURANCE[input.patient.id] ?? assumedInsurance(input.patient.age, t);
  const claim = calculateClaim({
    today,
    nowTime,
    month,
    patient: input.patient,
    entries: input.entries,
    notGiven: input.notGiven,
    daily: input.daily,
    cultures: input.cultures,
    diagnoses: input.diagnoses,
    options: input.options,
    mealClass: insurance.mealClass,
    diets: input.diets,
    letters: input.letters,
  });
  if ("assumed" in insurance) claim.issues.push({ level: "review", text: ASSUMED_INSURANCE_ISSUE });
  const ageAtMonth = ageOn(insurance.birthDate, parse(`${month}-01`));
  const [by, bm, bd] = insurance.birthDate.split("-").map(Number);
  const turns75ThisMonth = Number(month.slice(0, 4)) - by === 75 && Number(month.slice(5)) === bm && bd !== 1;
  const bill = calculateBill(claim, insurance, { turns75ThisMonth });
  const receipt: Receipt = {
    patient: {
      id: input.patient.id,
      name: input.patient.name,
      kana: input.patient.kana,
      sex: input.patient.sex,
      admittedDate: dateOf(today, input.patient.admittedOn),
      insurance,
      ageAtMonth,
      preschool: ageAtMonth < 6,
    },
    claim,
    diagnoses: receiptDiagnoses(input.diagnoses, today, month),
    window: { medicalYen: bill.medicalYen, kogaku: bill.kogaku, tasuu: false },
  };
  return { insurance, claim, bill, receipt };
}

/** For 医事課の仕事: each patient's month through the same claim, keeping only what a person must look at. */
export function claimChecks(inputs: PatientMonthInput[], today: string, nowTime: string, month: string): { id: string; days: number; issues: ClaimIssue[] }[] {
  return inputs.map((input) => {
    const pm = patientMonth(input, today, nowTime, month);
    return { id: input.patient.id, days: pm.claim.days, issues: reviewIssues(pm.claim.issues) };
  });
}
