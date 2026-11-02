// The patient's bill at the window (会計) for one inpatient month at this hospital.
//
// 一部負担金 = 医療費（点数 × 10円）× 負担割合, 10円未満四捨五入（健康保険法75条ほか）.
// When the window knows the patient's 適用区分, the 高額療養費 is paid in kind (現物給付):
// the window collects at most the 自己負担限度額. 食事療養標準負担額 is paid on top and is outside
// the 高額療養費. The limits live in LIMITS, with the date they apply from and their source.

import { type IncomeClass, type Insurance } from "./insurance";
import type { ClaimResult, Shikibetsu } from "./model";

export interface LimitRule {
  /** Fixed part (円). */
  base: number;
  /** For the 1% part: 医療費 above this amount (円). Null when the limit is a fixed amount. */
  threshold: number | null;
  /** 多数回該当 (4か月目以降). */
  tasuu: number | null;
}

/** 自己負担限度額（入院、1か月、1つの医療機関）. Filled from the official tables; see LIMIT_SOURCE. */
export const LIMITS: Partial<Record<IncomeClass, LimitRule>> = {};
export const LIMIT_SOURCE = "";

const round10 = (yen: number) => Math.floor((yen + 5) / 10) * 10;

export interface Bill {
  totalPoints: number;
  medicalCostYen: number;
  rate: number;
  /** 一部負担金 before any limit. */
  ichibuYen: number;
  limit: { yen: number; formula: string } | null;
  /** 医療の一部負担金 collected at the window. */
  medicalYen: number;
  kogaku: boolean;
  /** Paid by the insurer as 高額療養費 (現物給付). */
  kogakuYen: number;
  mealFutanYen: number;
  /** What the patient pays for this month at this hospital (保険の分). */
  totalYen: number;
  /** 領収証の区分（保険・点数）. */
  sections: { name: string; points: number }[];
  notes: string[];
}

/** 領収証（入院）の区分. 食事療養 is shown in 円 separately. */
const SECTION_OF: Record<Shikibetsu, string> = {
  "13": "医学管理等",
  "21": "投薬",
  "22": "投薬",
  "24": "投薬",
  "27": "投薬",
  "31": "注射",
  "32": "注射",
  "33": "注射",
  "60": "検査",
  "80": "その他",
  "90": "入院料等",
  "92": "入院料等",
  "97": "食事療養",
};

const SECTION_ORDER = ["入院料等", "医学管理等", "投薬", "注射", "検査", "その他"];

export function limitFor(ins: Insurance, medicalCostYen: number, tasuu: boolean): { yen: number; formula: string } | null {
  const rule = LIMITS[ins.incomeClass];
  if (!rule) return null;
  if (tasuu && rule.tasuu !== null) return { yen: rule.tasuu, formula: `多数回該当 ${rule.tasuu.toLocaleString("ja-JP")}円` };
  if (rule.threshold === null) return { yen: rule.base, formula: `${rule.base.toLocaleString("ja-JP")}円` };
  const over = Math.max(0, medicalCostYen - rule.threshold);
  // The 1% part: 円未満の端数 is rounded (see LIMIT_SOURCE).
  const yen = rule.base + Math.round(over / 100);
  return {
    yen,
    formula: `${rule.base.toLocaleString("ja-JP")}円 ＋（${medicalCostYen.toLocaleString("ja-JP")}円 − ${rule.threshold.toLocaleString("ja-JP")}円）× 1%`,
  };
}

export function calculateBill(claim: ClaimResult, ins: Insurance, opts: { tasuu?: boolean } = {}): Bill {
  const notes: string[] = [];
  const medicalCostYen = claim.totalPoints * 10;
  const ichibuYen = round10((medicalCostYen * ins.rate) / 100);
  const limit = ins.limitKnown ? limitFor(ins, medicalCostYen, !!opts.tasuu) : null;
  if (!ins.limitKnown) notes.push("適用区分がわからないため、高額療養費は窓口では差し引いていません（限度額適用認定証か、マイナ保険証での情報提供が必要です）。");
  else if (!limit) notes.push("この所得区分の限度額がまだ入っていません。");
  const kogaku = !!limit && ichibuYen > limit.yen;
  const medicalYen = kogaku ? limit!.yen : ichibuYen;
  const sections = new Map<string, number>();
  for (const a of claim.acts) {
    if (a.shikibetsu === "97") continue;
    const name = SECTION_OF[a.shikibetsu];
    sections.set(name, (sections.get(name) ?? 0) + a.parts.reduce((s, p) => s + p.points, 0) * a.count);
  }
  return {
    totalPoints: claim.totalPoints,
    medicalCostYen,
    rate: ins.rate,
    ichibuYen,
    limit,
    medicalYen,
    kogaku,
    kogakuYen: kogaku ? ichibuYen - medicalYen : 0,
    mealFutanYen: claim.meals.futanYen,
    totalYen: medicalYen + claim.meals.futanYen,
    sections: SECTION_ORDER.filter((n) => sections.has(n)).map((name) => ({ name, points: sections.get(name)! })),
    notes,
  };
}
