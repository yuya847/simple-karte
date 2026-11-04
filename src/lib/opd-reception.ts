// 外来の受付（初診・予約外の再診）: what the window must still fill before it can receive, and the insurance
// the window registers with the visit (the same 保険の登録 as 医事課 and the 患者基本情報 window; registration.ts).
// Code names what is missing and checks the card's numbers; the person receives.

import type { CalendarDate } from "./dates";
import type { Card } from "./opd-desk";
import { checkInsurance, hasErrors, KIND_OPTIONS, toInsurance, type InsuranceForm, type InsuranceRecord } from "./billing/registration";

/** What the 受付 window types (besides the insurance). */
export interface ReceptionFields {
  name: string;
  kana: string;
  sex: "男" | "女" | "";
  age: string;
  cardNo: string;
  dept: string;
  doctor: string;
  reason: string;
  referral: string;
  /** 保険証（資格確認書）かマイナ保険証で資格を確かめた. */
  insured: boolean;
}

export const EMPTY_RECEPTION: ReceptionFields = { name: "", kana: "", sex: "", age: "", cardNo: "", dept: "", doctor: "", reason: "", referral: "", insured: false };

/** The 保険の種類 the window offers: the 医保 kinds and 自費. 生活保護・労災・公費のみ are registered in 患者基本情報. */
export const RECEPTION_KIND_OPTIONS = KIND_OPTIONS.filter((o) => o.coverage === "医保" || o.coverage === "自費");

/** The person started filling the insurance (a kind chosen): then it must pass the checks before receiving. */
export const insuranceStarted = (f: InsuranceForm): boolean => f.kind !== "" || f.coverage !== "";

/**
 * What is still missing before 受け付ける, in the order of the form, as the labels of the fields (「医師」「受診の理由」
 * 「保険の確認」…). Empty when the window may receive. `insuranceErrors` is how many 「直す」 the insurance has.
 */
export function receptionMissing(kind: "初診" | "再診" | "", f: ReceptionFields, card: Card | undefined, insuranceErrors: number): string[] {
  const out: string[] = [];
  if (!kind) return ["区分（初診・再診）"];
  if (kind === "初診") {
    if (!f.name.trim()) out.push("氏名");
    if (!f.kana.trim()) out.push("カナ");
    if (!f.sex) out.push("性別");
    if (f.age === "" || !(Number(f.age) >= 0)) out.push("年齢");
  } else if (!card) out.push(f.cardNo ? "診察券（見つかりません）" : "診察券番号か氏名");
  if (!f.dept) out.push("診療科");
  if (!f.doctor) out.push("医師");
  if (!f.reason.trim()) out.push("受診の理由");
  if (!f.insured) out.push("保険の確認");
  if (insuranceErrors > 0) out.push(`保険の入力（直す ${insuranceErrors}件）`);
  return out;
}

/** The insurance's 「直す」 for the window: none when the insurance was not started. */
export function receptionInsuranceErrors(form: InsuranceForm, age: number, today: CalendarDate): number {
  if (!insuranceStarted(form)) return 0;
  return checkInsurance(form, { age, on: today }).filter((c) => c.level === "error").length;
}

/**
 * The registration the window makes when it receives: null when the insurance was not started or has
 * errors (then nothing is registered; 医事課 registers later). action 登録, by the person at the window.
 */
export function receptionInsuranceRecord(form: InsuranceForm, ctx: { age: number; today: CalendarDate; by: string; time: string }): InsuranceRecord | null {
  if (!insuranceStarted(form)) return null;
  const checks = checkInsurance(form, { age: ctx.age, on: ctx.today });
  if (hasErrors(checks)) return null;
  return { form, insurance: toInsurance(form), action: "登録", by: ctx.by, at: { day: 0, time: ctx.time } };
}

/**
 * A 再診 received at the window gets today's visit as a new entry: the registration found for the same
 * 診察券 (an earlier visit) is carried to it as 「確認」 (nothing changed, seen again today).
 */
export function carriedInsurance(earlier: InsuranceRecord, by: string, time: string): InsuranceRecord {
  const { reason: _reason, ...rest } = earlier;
  void _reason;
  return { ...rest, action: "確認", by, at: { day: 0, time } };
}

/** The visit key the 患者基本情報 window and 医事課 use for an outpatient ("opd:" + id). */
export const visitInsuranceKey = (opdId: string) => `opd:${opdId}`;
