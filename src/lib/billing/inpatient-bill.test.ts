import { describe, expect, it } from "vitest";
import { INITIAL_DIAGNOSES } from "../diagnoses";
import { PATIENTS } from "../patients";
import { dpcMonth, dpcView } from "./dpc-claim";
import { receiptSheet, dpcReceiptSheet } from "./receipt-sheet";
import { receiptRecords } from "./uke";
import { inpatientBill } from "./inpatient-bill";
import { calculateBill, limitFor } from "./kaikei";
import { patientMonth, type PatientMonthInput } from "./month";
import { DEFAULT_OPTIONS, type ClaimInput } from "./model";
import { patientMonthPayload } from "./payload";

function fixture(id: string, month = "2026-11", noDiagnosis = false) {
  const p = PATIENTS.find(p => p.id === id)!;
  const payload = patientMonthPayload(p, p.history, noDiagnosis ? [] : INITIAL_DIAGNOSES[id], DEFAULT_OPTIONS);
  const pm = patientMonth(payload as unknown as PatientMonthInput, "2026-11-04", "12:00", month);
  const input = { ...payload, today: "2026-11-04", nowTime: "12:00", mealClass: pm.insurance.mealClass } as unknown as Omit<ClaimInput, "month">;
  const dpc = dpcView(dpcMonth(input, month, { coefficient: 1.3, transfer: null }));
  return { ...pm, input, dpc };
}

describe("患者の算定ウインドウの入院会計", () => {
  it.each([ ["90010231", "2026-11"], ["90010198", "2026-11"], ["90010198", "2026-10"] ])("%s %s：DPC 合計で医療費・負担・食事を計算する", (id, month) => {
    const { claim, insurance, dpc } = fixture(id, month);
    const r = inpatientBill(claim, insurance, dpc);
    expect(r.useDpc).toBe(true);
    expect(r.bill.totalPoints).toBe(dpc.pkg!.total + dpc.outsideTotal);
    expect(r.bill.medicalCostYen).toBe(dpc.dpcTotal! * 10);
    expect(r.bill.ichibuYen).toBe(Math.floor((dpc.dpcTotal! * 10 * insurance.rate / 100 + 5) / 10) * 10);
    expect(r.bill.medicalYen).toBe(Math.min(r.bill.ichibuYen, r.bill.limit?.yen ?? Infinity));
    expect(r.bill.totalYen).toBe(r.bill.medicalYen + claim.meals.futanYen);
    expect(r.bill.sections.reduce((s, x) => s + x.points, 0)).toBe(dpc.dpcTotal);
    expect(r.receiptDiffers).toBe(dpc.dpcTotal !== claim.totalPoints);
  });

  it("所得に応じた限度額も DPC の医療費から計算する", () => {
    const { claim, insurance, dpc } = fixture("90010231");
    const ins = { ...insurance, rate: 30 as const, limitKnown: true, incomeClass: "ウ" as const };
    const r = inpatientBill(claim, ins, dpc);
    expect(r.bill.limit).toEqual(limitFor(ins, dpc.dpcTotal! * 10, claim.month, false));
  });

  it.each(["90010231", "90010198"])("%s：病名がなければ理由付きで出来高に戻る", id => {
    const { claim, insurance, dpc } = fixture(id, "2026-11", true);
    const r = inpatientBill(claim, insurance, dpc);
    expect(r.useDpc).toBe(false);
    expect(r.reason).toContain("ICD-10");
    expect(r.bill).toEqual(calculateBill(claim, insurance));
    expect(r.receiptDiffers).toBe(false);
  });

  it("病名があっても ICD-10 がなければ出来高に戻る", () => {
    const { claim, insurance, input } = fixture("90010231");
    const dpc = dpcView(dpcMonth({ ...input, diagnoses: input.diagnoses.map(d => ({ ...d, icd10: undefined })) }, claim.month, { coefficient: 1.3, transfer: null }));
    expect(inpatientBill(claim, insurance, dpc)).toMatchObject({ useDpc: false, receiptDiffers: false, bill: calculateBill(claim, insurance) });
  });

  it("DPC 医療費に連動する限度額を超えた分を差し引き、食事を別に足す", () => {
    const { claim, insurance, dpc } = fixture("90010231");
    // 高額な月の負担計算を検証するため、包括の集計結果だけを差し替える。
    const high = { ...dpc, dpcTotal: 100_000, pkg: { ...dpc.pkg!, total: 100_000 - dpc.outsideTotal } };
    const ins = { ...insurance, rate: 30 as const, limitKnown: true, incomeClass: "ウ" as const };
    const r = inpatientBill(claim, ins, high);
    expect(r.bill.kogaku).toBe(true);
    expect(r.bill.limit).toEqual(limitFor(ins, 1_000_000, claim.month, false));
    expect(r.bill.medicalYen).toBe(r.bill.limit!.yen);
    expect(r.bill.kogakuYen).toBe(300_000 - r.bill.limit!.yen);
    expect(r.bill.totalYen).toBe(r.bill.limit!.yen + claim.meals.futanYen);
  });

  it("病名・係数・入院経路を変えると会計も変わる", () => {
    const { claim, insurance, input } = fixture("90010231");
    const a = dpcView(dpcMonth(input, claim.month, { coefficient: 1.3, transfer: null, mainDiagnosisId: "d-sakura-1" }));
    const b = dpcView(dpcMonth(input, claim.month, { coefficient: 1.5, transfer: null, mainDiagnosisId: "d-sakura-2" }));
    expect(inpatientBill(claim, insurance, a).bill.totalPoints).not.toBe(inpatientBill(claim, insurance, b).bill.totalPoints);
    const kitamura = fixture("90010198");
    const transfer = dpcView(dpcMonth(kitamura.input, claim.month, { coefficient: 1.3, transfer: true }));
    expect(inpatientBill(kitamura.claim, kitamura.insurance, transfer).bill.totalPoints).not.toBe(kitamura.dpc.dpcTotal);
  });

  it("包括の対象外・分類できないときは出来高に戻る", () => {
    const { claim, insurance, dpc } = fixture("90010231");
    if (!dpc.outcome?.ok) throw new Error("DPC fixture");
    const excluded = { ...dpc, outcome: { ok: true as const, d: { ...dpc.outcome.d, hokatsu: false } }, pkg: null, dpcTotal: null };
    expect(inpatientBill(claim, insurance, excluded)).toMatchObject({ useDpc: false, reason: "包括の対象外のため、出来高で計算しています。", bill: calculateBill(claim, insurance) });
    const failed = { ...dpc, outcome: { ok: false as const, reason: "分類に必要な記録がありません。", issues: [] }, pkg: null, dpcTotal: null };
    expect(inpatientBill(claim, insurance, failed)).toMatchObject({ useDpc: false, reason: failed.outcome.reason, bill: calculateBill(claim, insurance) });
  });
});


describe("DPC レセプト様式", () => {
  it("佐倉さんの様式の合計・負担額が会計と一致し、包括と出来高を二重計上しない", () => {
    const { claim, insurance, dpc, receipt, input } = fixture("90010231");
    const bill = inpatientBill(claim, insurance, dpc).bill;
    const base = receiptSheet(receipt, receiptRecords(receipt, 1, claim.month));
    const sheet = dpcReceiptSheet(base, dpc, bill, input.diagnoses, input.patient.admittedOn);
    expect(sheet.dpc?.code).toHaveLength(14);
    expect(sheet.totalPoints).toBe(bill.totalPoints);
    expect(sheet.medicalYen).toBe(bill.medicalYen);
    expect(sheet.dpc!.total + sheet.rows.reduce((s,r) => s + r.points! * r.count, 0)).toBe(bill.totalPoints);
    expect(sheet.rows.map(r => r.code)).toEqual(dpc.outside.map(l => l.code));
    expect(sheet.dpc!.categories.filter(c => c.includes("医療資源を最も投入"))).toHaveLength(1);
    expect(sheet.dpc!.categories.join()).not.toContain("入院時併存症");
  });
  it("出来高の患者は元の様式を維持する", () => {
    const { claim, insurance, dpc, receipt, input } = fixture("90010231", "2026-11", true);
    const base = receiptSheet(receipt, receiptRecords(receipt, 1, claim.month));
    expect(dpcReceiptSheet(base, dpc, inpatientBill(claim, insurance, dpc).bill, input.diagnoses, input.patient.admittedOn)).toBe(base);
  });
});
