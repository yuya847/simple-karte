import { describe, expect, it } from "vitest";
import { admissionMonths, canSettleDischarge } from "./admission-accounting";
import { linkInsurance, currentRecord, DEMO_FORMS, toInsurance, withRecord, type InsuranceRecord } from "./registration";
import { calculateBill } from "./kaikei";
import type { ClaimResult } from "./model";
import { birthDateOf } from "../patient-contacts";
import { birthDateOf as qualificationBirth } from "../national/fictional";
import { isoDate } from "../dates";

const today = { y: 2026, m: 11, d: 7 };
describe("医事課の点検の修正", () => {
  it("退院した月を最後にし、入院のない月・退院月以外の会計を止める", () => {
    expect(admissionMonths(today, -38, -7)).toEqual(["2026-09", "2026-10"]);
    expect(canSettleDischarge("2026-10", today, -7, 31)).toBe(true);
    expect(canSettleDischarge("2026-11", today, -7, 0)).toBe(false);
    expect(canSettleDischarge("2026-09", today, -7, 1)).toBe(false);
    expect(canSettleDischarge("2026-11", today, undefined, 7)).toBe(false);
  });
  it("救急で登録した履歴を病棟でも読み、適用期間で前の版を読める", () => {
    const form = { ...DEMO_FORMS["90010260"], validFrom: "2026-10-01", validUntil: "2026-10-31" };
    const r: InsuranceRecord = {form, insurance: toInsurance(form), action: "登録", by: "試験", at: {day: 0, time: "10:00"}};
    let book = withRecord({}, "er:trial", r);
    expect(currentRecord(book, "trial")).toMatchObject(r);
    const next = {...r, form: {...form, validFrom: "2026-11-01", validUntil: "2027-10-31"}};
    book = withRecord(book, "trial", next);
    expect(book.trial).toHaveLength(2);
    expect(currentRecord(book, "er:trial")).toMatchObject(next);
    expect(currentRecord(book, "trial", "2026-10-15")).toMatchObject(r);
    expect(currentRecord(book, "trial", "2027-11-01")).toBeUndefined();
  });
  it("入院時に番号が変わっても再読込後の変更を共有する", () => {
    const form = DEMO_FORMS["90010260"];
    const r: InsuranceRecord = {form, insurance: toInsurance(form), action: "登録", by: "試験", at: {day: 0, time: "10:00"}};
    const linked = linkInsurance(withRecord({}, "er:visit-1", r), "er:visit-1", "ward-1");
    const saved = JSON.parse(JSON.stringify(linked));
    const updated = withRecord(saved, "er:visit-1", {...r, action: "変更"});
    expect(currentRecord(updated, "ward-1")?.action).toBe("変更");
    expect(updated["ward-1"]).toHaveLength(2);
  });
  it("自費は保険割合にかかわらず医療費と食事代の全額で、限度額を使わない", () => {
    const claim = { month: "2026-10", days: 1, totalPoints: 1000, acts: [], meals: {ryoyoYen: 2070, futanYen: 1530} } as unknown as ClaimResult;
    const bill = calculateBill(claim, {...toInsurance(DEMO_FORMS["90010260"]), coverage: "自費", rate: 30});
    expect(bill.medicalYen).toBe(10000);
    expect(bill.mealFutanYen).toBe(2070);
    expect(bill.totalYen).toBe(12070);
    expect(bill.limit).toBeNull();
  });
  it("基本情報と資格確認の生年月日を同じ患者情報から出す", () => {
    const p = {id: "trial", age: 38};
    expect(qualificationBirth(p, today)).toBe(isoDate(birthDateOf(p, today)));
    expect(birthDateOf({...p, id: "er:trial"}, today)).toEqual(birthDateOf(p, today));
  });
});
