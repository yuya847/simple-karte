// One patient's month, end to end: insurance → 算定 → 会計 → レセプト. Server only (reads the masters).

import { birthDateOf } from "../patient-contacts";
import { isoDate } from "../dates";
import { diagnosisClaimable, type Diagnosis } from "../diagnoses";
import { prepareBillingDocumentation } from "./documentation";
import { calculateClaim } from "./engine";
import { ageOn, ASSUMED_INSURANCE_ISSUE, assumedInsurance, INSURANCE, type Insurance } from "./insurance";
import { calculateBill, type Bill } from "./kaikei";
import type { KisaiWorkspace } from "./kisai-workspace";
import type { BillingOptions, ClaimInput, ClaimIssue, ClaimResult } from "./model";
import type { ShokiRequirement } from "./shoki";
import type { TekiyoTask } from "./tekiyo";
import { loadTekiyoMaster } from "./tekiyo-master";
import type { Receipt, ReceiptDiagnosis } from "./uke";
import { reviewIssues } from "./worklist";

export interface PatientMonthInput {
  patient: ClaimInput["patient"] & { kana: string };
  entries: ClaimInput["entries"];
  insulinGiven?: ClaimInput["insulinGiven"];
  notGiven?: ClaimInput["notGiven"];
  daily: ClaimInput["daily"];
  cultures: ClaimInput["cultures"];
  diagnoses: Diagnosis[];
  options: BillingOptions;
  diets?: ClaimInput["diets"];
  letters?: ClaimInput["letters"];
  /** The insurance 医事課 registered (保険の登録). Without it: the demo's own, else assumed from age. */
  insurance?: Insurance;
  insuranceHistory?: Insurance[];
  /** 記載・書類の保存（症状詳記・摘要のコメントの答え）。無ければ自動で決まるコメントだけ。 */
  kisai?: Partial<KisaiWorkspace>;
}

/** 記載・書類の画面に返すもの。点検（checkKisai）は画面がカルテの記録で行う。 */
export interface MonthDocumentation {
  tekiyo: TekiyoTask[];
  requiredShoki: ShokiRequirement[];
}

export interface PatientMonth {
  insurance: Insurance & { assumed?: boolean };
  claim: ClaimResult;
  bill: Bill;
  receipt: Receipt;
  documentation: MonthDocumentation;
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
  const historyInsurance = input.insuranceHistory ? [...input.insuranceHistory].reverse().find(i => (!i.validFrom || i.validFrom.slice(0, 7) <= month) && (!i.validUntil || i.validUntil.slice(0, 7) >= month)) : input.insurance;
  const insurance = historyInsurance ?? INSURANCE[input.patient.id] ?? { ...assumedInsurance(input.patient.age, t), birthDate: isoDate(birthDateOf(input.patient, t)) };
  const computed = calculateClaim({
    today,
    nowTime,
    month,
    patient: input.patient,
    entries: input.entries,
    notGiven: input.notGiven,
    insulinGiven: input.insulinGiven,
    daily: input.daily,
    cultures: input.cultures,
    diagnoses: input.diagnoses,
    options: input.options,
    mealClass: insurance.mealClass,
    diets: input.diets,
    letters: input.letters,
  });
  if ("assumed" in insurance) computed.issues.push({ level: "review", text: ASSUMED_INSURANCE_ISSUE });
  // 摘要のコメント（決まっているものは自動、人が選んだもの）を足し、確定した症状詳記をレセプトへ。点数・回数は変えない。
  const doc = prepareBillingDocumentation(computed, { patientId: input.patient.id, today, admittedOn: input.patient.admittedOn, entries: input.entries }, loadTekiyoMaster(), input.kisai);
  const claim = doc.claim;
  const ageAtMonth = ageOn(insurance.birthDate, parse(`${month}-01`));
  const [by, bm, bd] = insurance.birthDate.split("-").map(Number);
  const turns75ThisMonth = Number(month.slice(0, 4)) - by === 75 && Number(month.slice(5)) === bm && bd !== 1;
  const bill = calculateBill(claim, insurance, { turns75ThisMonth });
  const receipt: Receipt = {
    shoki: doc.shoki,
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
  return { insurance, claim, bill, receipt, documentation: { tekiyo: doc.tekiyo, requiredShoki: doc.requiredShoki } };
}

/** For 医事課の仕事: each patient's month through the same claim, keeping only what a person must look at. */
export function claimChecks(inputs: PatientMonthInput[], today: string, nowTime: string, month: string): { id: string; days: number; issues: ClaimIssue[] }[] {
  return inputs.map((input) => {
    const pm = patientMonth(input, today, nowTime, month);
    return { id: input.patient.id, days: pm.claim.days, issues: reviewIssues(pm.claim.issues) };
  });
}
