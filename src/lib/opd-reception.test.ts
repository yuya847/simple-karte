import { describe, expect, it } from "vitest";
import { EMPTY_FORM, INITIAL_INSURANCE_BOOK, type InsuranceForm } from "./billing/registration";
import { CARDS } from "./opd-desk";
import { carriedInsurance, EMPTY_RECEPTION, insuranceStarted, RECEPTION_KIND_OPTIONS, receptionInsuranceErrors, receptionInsuranceRecord, receptionMissing, visitInsuranceKey } from "./opd-reception";

const today = { y: 2026, m: 11, d: 4 };
const ishida = CARDS[0];
const ishidaForm: InsuranceForm = INITIAL_INSURANCE_BOOK["opd:opd-1"][0].form;

describe("受付で足りないもの", () => {
  it("names the fields still to fill, in the form's order", () => {
    expect(receptionMissing("", EMPTY_RECEPTION, undefined, 0)).toEqual(["区分（初診・再診）"]);
    expect(receptionMissing("初診", EMPTY_RECEPTION, undefined, 0)).toEqual(["氏名", "カナ", "性別", "年齢", "診療科", "医師", "受診の理由", "保険の確認"]);
    const some = { ...EMPTY_RECEPTION, name: "架空 太郎", kana: "カクウ タロウ", sex: "男" as const, age: "40", dept: "総合診療科" };
    expect(receptionMissing("初診", some, undefined, 0)).toEqual(["医師", "受診の理由", "保険の確認"]);
    expect(receptionMissing("初診", { ...some, doctor: "山本（専攻医）", reason: "発熱", insured: true }, undefined, 0)).toEqual([]);
  });
  it("再診 needs the 診察券: 「見つかりません」 once something was typed", () => {
    const f = { ...EMPTY_RECEPTION, dept: "総合診療科", doctor: "山本（専攻医）", reason: "定期受診", insured: true };
    expect(receptionMissing("再診", f, undefined, 0)).toEqual(["診察券番号か氏名"]);
    expect(receptionMissing("再診", { ...f, cardNo: "9999999" }, undefined, 0)).toEqual(["診察券（見つかりません）"]);
    expect(receptionMissing("再診", { ...f, cardNo: "1000101" }, ishida, 0)).toEqual([]);
  });
  it("an insurance with 「直す」 blocks the reception and says how many", () => {
    const f = { ...EMPTY_RECEPTION, cardNo: "1000101", dept: "総合診療科", doctor: "山本（専攻医）", reason: "定期受診", insured: true };
    expect(receptionMissing("再診", f, ishida, 2)).toEqual(["保険の入力（直す 2件）"]);
  });
});

describe("受付での保険の登録", () => {
  it("offers the 医保 kinds and 自費 only", () => {
    expect(RECEPTION_KIND_OPTIONS.map((o) => o.label)).toEqual(["国民健康保険", "後期高齢者医療", "協会けんぽ（社保）", "組合健保（社保）", "共済（社保）", "自費"]);
  });
  it("an untouched insurance is not started: no errors, nothing registered", () => {
    expect(insuranceStarted(EMPTY_FORM)).toBe(false);
    expect(receptionInsuranceErrors(EMPTY_FORM, 40, today)).toBe(0);
    expect(receptionInsuranceRecord(EMPTY_FORM, { age: 40, today, by: "医事課 渡辺", time: "09:30" })).toBeNull();
  });
  it("a started insurance with empty fields counts its 「直す」 and registers nothing", () => {
    const f: InsuranceForm = { ...EMPTY_FORM, kind: "国保" };
    expect(insuranceStarted(f)).toBe(true);
    expect(receptionInsuranceErrors(f, 40, today)).toBeGreaterThanOrEqual(5);
    expect(receptionInsuranceRecord(f, { age: 40, today, by: "医事課 渡辺", time: "09:30" })).toBeNull();
  });
  it("a complete card registers (登録, by the person at the window) with the claim's insurance", () => {
    const r = receptionInsuranceRecord(ishidaForm, { age: 78, today, by: "医事課 渡辺", time: "09:30" })!;
    expect(r).not.toBeNull();
    expect(r.action).toBe("登録");
    expect(r.by).toBe("医事課 渡辺");
    expect(r.at).toEqual({ day: 0, time: "09:30" });
    expect(r.insurance.kind).toBe("後期高齢者");
    expect(r.insurance.rate).toBe(20);
    expect(r.insurance.verify?.method).toBe("オンライン資格確認（模擬）");
  });
  it("自費 registers without the card's numbers", () => {
    const f: InsuranceForm = { ...EMPTY_FORM, coverage: "自費", birthDate: "1986-05-01" };
    const r = receptionInsuranceRecord(f, { age: 40, today, by: "医事課 渡辺", time: "09:30" });
    expect(r?.insurance.coverage).toBe("自費");
  });
  it("a 再診's earlier registration is carried to today's visit as 確認", () => {
    const earlier = { ...INITIAL_INSURANCE_BOOK["opd:opd-1"][0], reason: "前の変更" };
    const r = carriedInsurance(earlier, "医事課 渡辺", "09:40");
    expect(r.action).toBe("確認");
    expect(r.by).toBe("医事課 渡辺");
    expect(r.at).toEqual({ day: 0, time: "09:40" });
    expect(r.insurance).toEqual(earlier.insurance);
    expect("reason" in r).toBe(false);
    expect(visitInsuranceKey("opd-12")).toBe("opd:opd-12");
  });
});
