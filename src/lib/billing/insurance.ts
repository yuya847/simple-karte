// Insurance of the (fictional) patients, and what follows from it on the receipt.
// All numbers here are made up for the demo. 保険者番号 follow the official format
// (法別番号・都道府県番号・保険者別番号・検証番号) so the receipt checks can run on them.

import type { MealClass } from "./model";

export type InsurerKind = "協会けんぽ" | "組合健保" | "共済" | "国保" | "後期高齢者";

/**
 * 所得区分 for the 高額療養費 limit. Under 70: ア〜オ. 70 and over: 現役並みⅢ〜Ⅰ, 一般, 低所得Ⅱ, 低所得Ⅰ;
 * 後期高齢者 一般 is split into 一般Ⅱ (2割) and 一般Ⅰ (1割).
 */
export type IncomeClass =
  | "ア"
  | "イ"
  | "ウ"
  | "エ"
  | "オ"
  | "現役並みⅢ"
  | "現役並みⅡ"
  | "現役並みⅠ"
  | "一般"
  | "一般Ⅱ"
  | "一般Ⅰ"
  | "低所得Ⅱ"
  | "低所得Ⅰ";

export interface Insurance {
  kind: InsurerKind;
  /** 8 digits (国保 6 digits). */
  insurerNumber: string;
  symbol?: string;
  number: string;
  /** 枝番 (2 digits); none for 後期高齢者. */
  branch?: string;
  /** 本人（国保は世帯主）か家族（国保はその他）か. */
  relation: "本人" | "家族";
  birthDate: string; // YYYY-MM-DD
  /** 負担割合 (%): 10, 20 or 30. */
  rate: 10 | 20 | 30;
  incomeClass: IncomeClass;
  /**
   * The window knows the 適用区分: 限度額適用認定証 shown, or the information given through
   * オンライン資格確認 (マイナ保険証). For 70歳以上 一般・現役並みⅢ the 高齢受給者証 or 資格確認書 is enough.
   */
  limitKnown: boolean;
  mealClass: MealClass;
  /** Days in hospital in the last 12 months (for 低所得Ⅱ 90日超). */
  daysLast12Months?: number;
}

/** 検証番号 of a 保険者番号 / 公費負担者番号: weights 2,1,2,1… from the right, digit sums, 10 − (sum mod 10). */
export function checkDigit(body: string): string {
  let sum = 0;
  [...body].reverse().forEach((ch, i) => {
    const v = Number(ch) * (i % 2 === 0 ? 2 : 1);
    sum += Math.floor(v / 10) + (v % 10);
  });
  return String((10 - (sum % 10)) % 10);
}

export const validInsurerNumber = (n: string) => /^(\d{6}|\d{8})$/.test(n) && checkDigit(n.slice(0, -1)) === n.slice(-1);

const withCheck = (body: string) => body + checkDigit(body);

/** Fictional insurance of the demo patients (神奈川県 = 14). */
export const INSURANCE: Record<string, Insurance> = {
  // 72歳・国保の高齢受給者（2割・一般）
  "90010231": {
    kind: "国保",
    insurerNumber: withCheck("14099"),
    symbol: "架空",
    number: "1072",
    branch: "00",
    relation: "本人",
    birthDate: "1954-04-12",
    rate: 20,
    incomeClass: "一般",
    limitKnown: true,
    mealClass: "一般",
  },
  // 86歳・後期高齢者（1割・低所得Ⅱ、限度額適用・標準負担額減額認定あり）
  "90010244": {
    kind: "後期高齢者",
    insurerNumber: withCheck("3914099"),
    number: "00086001",
    relation: "本人",
    birthDate: "1940-02-20",
    rate: 10,
    incomeClass: "低所得Ⅱ",
    limitKnown: true,
    mealClass: "低所得Ⅱ（90日以下）",
    daysLast12Months: 12,
  },
  // 79歳・後期高齢者（2割・一般Ⅱ）
  "90010198": {
    kind: "後期高齢者",
    insurerNumber: withCheck("3914099"),
    number: "00079001",
    relation: "本人",
    birthDate: "1947-05-03",
    rate: 20,
    incomeClass: "一般Ⅱ",
    limitKnown: true,
    mealClass: "一般",
  },
  // 64歳・協会けんぽの家族（3割・区分ウ、マイナ保険証で適用区分の情報あり）
  "90010260": {
    kind: "協会けんぽ",
    insurerNumber: withCheck("0114099"),
    symbol: "９９９９",
    number: "64",
    branch: "01",
    relation: "家族",
    birthDate: "1962-03-15",
    rate: 30,
    incomeClass: "ウ",
    limitKnown: true,
    mealClass: "一般",
  },
};

/** For a patient admitted in this demo without insurance details: assumed from age, and marked as such. */
export function assumedInsurance(age: number, today: { y: number; m: number; d: number }): Insurance & { assumed: true } {
  const birthYear = today.y - age - (today.m > 1 ? 0 : 1);
  const birthDate = `${birthYear}-01-01`;
  if (age >= 75) {
    return { kind: "後期高齢者", insurerNumber: withCheck("3914099"), number: "00000000", relation: "本人", birthDate, rate: 10, incomeClass: "一般Ⅰ", limitKnown: true, mealClass: "一般", assumed: true };
  }
  if (age >= 70) {
    return { kind: "国保", insurerNumber: withCheck("14099"), number: "0000", relation: "本人", birthDate, rate: 20, incomeClass: "一般", limitKnown: true, mealClass: "一般", assumed: true };
  }
  return { kind: "協会けんぽ", insurerNumber: withCheck("0114099"), symbol: "０", number: "0", relation: "本人", birthDate, rate: age < 6 ? 20 : 30, incomeClass: "ウ", limitKnown: false, mealClass: "一般", assumed: true };
}

export function ageOn(birthDate: string, on: { y: number; m: number; d: number }): number {
  const [y, m, d] = birthDate.split("-").map(Number);
  return on.y - y - (on.m < m || (on.m === m && on.d < d) ? 1 : 0);
}

/** レセプト種別 (別表5), inpatient, insurance only (no 公費). */
export function receiptType(ins: Insurance, ageAtMonth: number, preschool: boolean): string {
  if (ins.kind === "後期高齢者") return ins.rate === 30 ? "1319" : "1317";
  if (ageAtMonth >= 70) return ins.rate === 30 ? "1119" : "1117";
  if (preschool) return "1113";
  return ins.relation === "本人" ? "1111" : "1115";
}

/** レセプト特記事項 (別表9) for the 所得区分, when the window applied the limit (記載要領 (13)). */
export function tokkiCode(ins: Insurance, ageAtMonth: number): string | null {
  if (!ins.limitKnown) return null;
  const c = ins.incomeClass;
  if (ageAtMonth < 70) return ({ ア: "26", イ: "27", ウ: "28", エ: "29", オ: "30" } as Record<string, string>)[c] ?? null;
  if (c === "現役並みⅢ") return "26";
  if (c === "現役並みⅡ") return "27";
  if (c === "現役並みⅠ") return "28";
  if (c === "低所得Ⅱ" || c === "低所得Ⅰ") return "30";
  if (ins.kind === "後期高齢者") return c === "一般Ⅱ" ? "41" : c === "一般Ⅰ" ? "42" : null;
  return c === "一般" ? "29" : null;
}

/** 一部負担金・食事療養費標準負担額区分 (RE 項番11, 別表8). */
export function futanKubun(ins: Insurance, ageAtMonth: number): string | null {
  if (!ins.limitKnown) return null;
  const low = ins.incomeClass === "オ" || ins.incomeClass === "低所得Ⅱ";
  if (low) return (ins.daysLast12Months ?? 0) > 90 ? "2" : "1";
  if (ins.incomeClass === "低所得Ⅰ" && ageAtMonth >= 70) return "3";
  return null;
}

export const TOKKI_NAME: Record<string, string> = { "26": "区ア", "27": "区イ", "28": "区ウ", "29": "区エ", "30": "区オ", "41": "区カ", "42": "区キ" };
