// FICTIONAL records held by the national services about other institutions: what other clinics prescribed
// and pharmacies dispensed (the 薬剤情報 of オンライン資格確認 and the past prescriptions the 電子処方箋
// 管理サービス checks against). Every institution and record here is made up for the demo.

import type { DoseTiming } from "../types";
import { ORAL_DRUG_CODES, OTHER_DRUGS, type DrugCodes } from "./drug-codes";

export interface OtherInstitution {
  /** A fictional 医療機関コード (10桁: 都道府県2・点数表1・郡市区2・番号4・検証1), made up. */
  code: string;
  name: string;
  kind: "医科" | "薬局";
}

export const OTHER_INSTITUTIONS = {
  minato: { code: "1419900028", name: "みなと循環器クリニック（架空）", kind: "医科" },
  aoba: { code: "1419900036", name: "あおば内科（架空）", kind: "医科" },
  kaede: { code: "1419900044", name: "かえで内科医院（架空）", kind: "医科" },
  sakuraPh: { code: "1449900011", name: "さくら調剤薬局（架空）", kind: "薬局" },
  umiPh: { code: "1449900029", name: "うみかぜ薬局（架空）", kind: "薬局" },
} satisfies Record<string, OtherInstitution>;
export type InstitutionKey = keyof typeof OTHER_INSTITUTIONS;

/** One drug of a past prescription, as the service would return it. */
export interface OtherRx {
  /** Our master code (ORAL-…) or an OTHER-… drug: for the checks. */
  drug: string;
  perDose: number;
  timings: DoseTiming[];
  days: number;
  /** Day offset from today when the prescription was issued (and dispensed the same day). */
  issuedOn: number;
  prescriber: InstitutionKey;
  pharmacy: InstitutionKey;
  /** Where the service learned it: an 電子処方箋 is known the day it is dispensed, a レセプト about a month later. */
  via: "電子処方箋" | "レセプト";
}

export const codesOf = (drug: string): (DrugCodes & { ingredient?: string }) | undefined => ORAL_DRUG_CODES[drug] ?? OTHER_DRUGS[drug];

const r = (drug: string, perDose: number, timings: DoseTiming[], days: number, issuedOn: number, prescriber: InstitutionKey, pharmacy: InstitutionKey, via: OtherRx["via"] = "電子処方箋"): OtherRx => ({ drug, perDose, timings, days, issuedOn, prescriber, pharmacy, via });

/**
 * By patient id (inpatients) or outpatient id. Patients not here have no records at other institutions.
 * 北村 博: the clinic that prescribed his 持参薬 (the 退院時処方 duplicates them while their days last).
 * 石田 正男 (外来): another clinic gave エプレレノン, so a new スピロノラクトン is 併用禁忌 (アルダクトンA 電子添文 10.1).
 */
export const OTHER_RX: Record<string, OtherRx[]> = {
  // 佐倉 修
  "90010231": [r("ORAL-AMLO5", 1, ["朝"], 28, -20, "kaede", "sakuraPh"), r("ORAL-LPZ15", 1, ["朝"], 28, -20, "kaede", "sakuraPh"), r("ORAL-AMLO5", 1, ["朝"], 28, -48, "kaede", "sakuraPh", "レセプト")],
  // 大浦 トメ
  "90010244": [r("ORAL-DNP5", 1, ["朝"], 28, -15, "aoba", "umiPh")],
  // 北村 博
  "90010198": [r("ORAL-ENA5", 1, ["朝"], 56, -26, "minato", "sakuraPh"), r("ORAL-BISO25", 1, ["朝"], 56, -26, "minato", "sakuraPh"), r("ORAL-SPL25", 1, ["朝"], 56, -26, "minato", "sakuraPh")],
  // 森 久美子
  "90010260": [r("ORAL-ROSU25", 1, ["夕"], 30, -12, "kaede", "umiPh")],
  // 石田 正男（外来）
  "opd-1": [r("OTHER-EPL25", 1, ["朝"], 28, -9, "aoba", "umiPh")],
  // 原田 恵子（外来）
  "opd-2": [r("ORAL-AMLO5", 1, ["朝"], 30, -5, "kaede", "sakuraPh")],
};

export const otherRxOf = (id: string): OtherRx[] => OTHER_RX[id] ?? [];
