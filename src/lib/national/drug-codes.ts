// The codes of the oral drugs of the fictional hospital's master, as the official 医薬品マスター
// (社会保険診療報酬支払基金・厚生労働省 基本マスター y_20261013.csv) gives them: レセプト電算処理システム用
// コード (9桁), 薬価基準収載医薬品コード (12桁) and, where the master has one, 一般名処方マスタのコードと一般名.
// A test checks every row against the downloaded master (src/data/generated/y.json).
// The other institutions' drugs (OTHER_DRUGS) are drugs of the same master used in the FICTIONAL records of
// other hospitals and pharmacies (薬剤情報・他院の処方).

import { DRUG_CODES } from "../billing/codes";

export interface DrugCodes {
  /** レセプト電算処理システム用コード（医薬品, 9桁）. */
  receipt: string;
  /** 薬価基準収載医薬品コード（12桁）. */
  yakka: string;
  /** 医薬品マスターの基本漢字名称. */
  name: string;
  /** 一般名処方マスタ: コードと一般名（ない品目もある）. */
  generic?: { code: string; name: string };
  /** 単位（医薬品マスターの単位名称）. */
  unit: string;
}

export const DRUG_MASTER_SOURCE = { name: "医薬品マスター（基本マスター）", file: "y_20261013.csv", url: "https://shinryohoshu.mhlw.go.jp/shinryohoshu/downloadMenu/yFile" };

/** Our oral drugs (master.ts codes) → the official codes. */
export const ORAL_DRUG_CODES: Record<string, DrugCodes> = {
  "ORAL-AMLO5": { receipt: "620007860", yakka: "2171022F2017", name: "アムロジピン錠５ｍｇ「ＮＳ」", unit: "錠" },
  "ORAL-LPZ15": { receipt: "620009451", yakka: "2329023F1012", name: "ランソプラゾールＯＤ錠１５ｍｇ「トーワ」", generic: { code: "2329023F1ZZZ", name: "【般】ランソプラゾール口腔内崩壊錠１５ｍｇ" }, unit: "錠" },
  "ORAL-APAP500": { receipt: "622381201", yakka: "1141007F3023", name: "カロナール錠５００　５００ｍｇ", generic: { code: "1141007F3ZZZ", name: "【般】アセトアミノフェン錠５００ｍｇ" }, unit: "錠" },
  "ORAL-DNP5": { receipt: "622092001", yakka: "1190012F4017", name: "ドネペジル塩酸塩ＯＤ錠５ｍｇ「アメル」", generic: { code: "1190012F4ZZZ", name: "【般】ドネペジル塩酸塩口腔内崩壊錠５ｍｇ" }, unit: "錠" },
  "ORAL-ENA5": { receipt: "621244404", yakka: "2144002F2012", name: "エナラプリルマレイン酸塩錠５ｍｇ「ＶＴＲＳ」", unit: "錠" },
  "ORAL-BISO25": { receipt: "621399401", yakka: "2123016F1018", name: "ビソプロロールフマル酸塩錠２．５ｍｇ「トーワ」", generic: { code: "2123016F1ZZZ", name: "【般】ビソプロロールフマル酸塩錠２．５ｍｇ" }, unit: "錠" },
  "ORAL-SPL25": { receipt: "620003560", yakka: "2133001F1018", name: "スピロノラクトン錠２５ｍｇ「トーワ」", generic: { code: "2133001F1ZZZ", name: "【般】スピロノラクトン錠２５ｍｇ" }, unit: "錠" },
  "ORAL-ROSU25": { receipt: "622582001", yakka: "2189017F1014", name: "ロスバスタチン錠２．５ｍｇ「トーワ」", generic: { code: "2189017F1ZZZ", name: "【般】ロスバスタチン錠２．５ｍｇ" }, unit: "錠" },
  "ORAL-MGO330": { receipt: "620005434", yakka: "2344009F2015", name: "酸化マグネシウム錠３３０ｍｇ「モチダ」", generic: { code: "2344009F2ZZZ", name: "【般】酸化マグネシウム錠３３０ｍｇ" }, unit: "錠" },
  "ORAL-FRS20": { receipt: "620004042", yakka: "2139005F1010", name: "フロセミド錠２０ｍｇ「ＮＰ」", generic: { code: "2139005F1ZZZ", name: "【般】フロセミド錠２０ｍｇ" }, unit: "錠" },
  "ORAL-LOX60": { receipt: "620098902", yakka: "1149019F1013", name: "ロキソプロフェンＮａ錠６０ｍｇ「ＹＤ」", generic: { code: "1149019F1ZZZ", name: "【般】ロキソプロフェンＮａ錠６０ｍｇ" }, unit: "錠" },
  "ORAL-REBA100": { receipt: "620009460", yakka: "2329021F1013", name: "レバミピド錠１００ｍｇ「あすか」", unit: "錠" },
  "ORAL-SENNA12": { receipt: "620480205", yakka: "2354003F2014", name: "センノシド錠１２ｍｇ「セイコー」", generic: { code: "2354003F2ZZZ", name: "【般】センノシド錠１２ｍｇ" }, unit: "錠" },
  "ORAL-MET250": { receipt: "621676001", yakka: "3962002F1110", name: "メトホルミン塩酸塩錠２５０ｍｇ「ＳＮ」", generic: { code: "3962002F1ZZZ", name: "【般】メトホルミン塩酸塩錠２５０ｍｇ：ＧＬ" }, unit: "錠" },
};

/** Drugs that appear only in the FICTIONAL records of other institutions (codes from the same master). */
export const OTHER_DRUGS: Record<string, DrugCodes & { ingredient: string }> = {
  "OTHER-EPL25": { receipt: "620005824", yakka: "2149045F1029", name: "セララ錠２５ｍｇ", generic: { code: "2149045F1ZZZ", name: "【般】エプレレノン錠２５ｍｇ" }, unit: "錠", ingredient: "エプレレノン" },
};

/** Every code of this file, for the test against the downloaded master. */
export const ALL_DRUG_CODES: DrugCodes[] = [...Object.values(ORAL_DRUG_CODES), ...Object.values(OTHER_DRUGS)];

/** The receipt code the billing already uses for an oral drug must be the same as here. */
export const billingReceiptCode = (code: string): string | undefined => DRUG_CODES[code];
