// The patient's bill at the window (会計) for one inpatient month at this hospital.
//
// 一部負担金 = 医療費（点数 × 10円）× 負担割合, 10円未満四捨五入（健康保険法75条、国保法42条の2、高確法68条）.
// When the window knows the patient's 適用区分, the 高額療養費 is paid in kind (現物給付, 健保令43条):
// the window collects min(一部負担金, 自己負担限度額), and a limit that applies is charged in 円 as is
// (記載要領 (21)ウ(ウ)). 食事療養標準負担額 is paid on top and is outside the 高額療養費 (総医療費 is
// 点数 × 10円 without 食事療養; 健保則100条・104条). One hospital, one month, 入院 separate from 外来.
// The 21,000円 rule (世帯合算) and the 年間上限 are settled later by the insurer, not at the window.

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

type Table = Record<"ア" | "イ" | "ウ" | "エ" | "オ" | "一般70" | "低所得Ⅱ" | "低所得Ⅰ", LimitRule>;

/**
 * 自己負担限度額（入院、1か月、1つの医療機関。70歳以上は入院を含む世帯の額）.
 * 健康保険法施行令42条・43条、高齢者医療確保法施行令15条・16条（同じ額）.
 * From 2026-08-01: 令和8年政令第240号（2026-07-29 公布、附則で施行日前の療養は従前の例）.
 * The text was read on e-Gov for both dates (2026-07-29 版 and 2026-08-01 版の42条).
 */
export const LIMIT_TABLES: { from: string; source: string; table: Table }[] = [
  {
    from: "2026-08",
    source: "健康保険法施行令42条・43条（令和8年政令第240号による改正、2026年8月1日施行）",
    table: {
      ア: { base: 270_300, threshold: 901_000, tasuu: 140_100 },
      イ: { base: 179_100, threshold: 597_000, tasuu: 93_000 },
      ウ: { base: 85_800, threshold: 286_000, tasuu: 44_400 },
      エ: { base: 61_500, threshold: null, tasuu: 44_400 },
      オ: { base: 36_900, threshold: null, tasuu: 24_600 },
      一般70: { base: 61_500, threshold: null, tasuu: 44_400 },
      低所得Ⅱ: { base: 25_700, threshold: null, tasuu: 24_600 },
      低所得Ⅰ: { base: 15_700, threshold: null, tasuu: null },
    },
  },
  {
    from: "0000-00",
    source: "健康保険法施行令42条・43条（2026年7月診療分まで）",
    table: {
      ア: { base: 252_600, threshold: 842_000, tasuu: 140_100 },
      イ: { base: 167_400, threshold: 558_000, tasuu: 93_000 },
      ウ: { base: 80_100, threshold: 267_000, tasuu: 44_400 },
      エ: { base: 57_600, threshold: null, tasuu: 44_400 },
      オ: { base: 35_400, threshold: null, tasuu: 24_600 },
      一般70: { base: 57_600, threshold: null, tasuu: 44_400 },
      低所得Ⅱ: { base: 24_600, threshold: null, tasuu: null },
      低所得Ⅰ: { base: 15_000, threshold: null, tasuu: null },
    },
  },
];

/** The 区分 of the table for a patient's 所得区分 (70歳以上の現役並みⅢ・Ⅱ・Ⅰ use the ア・イ・ウ amounts). */
const ROW: Record<IncomeClass, keyof Table> = {
  ア: "ア",
  イ: "イ",
  ウ: "ウ",
  エ: "エ",
  オ: "オ",
  現役並みⅢ: "ア",
  現役並みⅡ: "イ",
  現役並みⅠ: "ウ",
  一般: "一般70",
  一般Ⅱ: "一般70",
  一般Ⅰ: "一般70",
  低所得Ⅱ: "低所得Ⅱ",
  低所得Ⅰ: "低所得Ⅰ",
};

export function limitTableFor(month: string) {
  return LIMIT_TABLES.find((t) => month >= t.from)!;
}

const round10 = (yen: number) => Math.floor((yen + 5) / 10) * 10;

export interface Bill {
  totalPoints: number;
  medicalCostYen: number;
  rate: number;
  /** 一部負担金 before any limit. */
  ichibuYen: number;
  limit: { yen: number; formula: string; source: string } | null;
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

export function limitFor(ins: Insurance, medicalCostYen: number, month: string, tasuu: boolean): { yen: number; formula: string; source: string } | null {
  const t = limitTableFor(month);
  const rule = t.table[ROW[ins.incomeClass]];
  const f = (n: number) => n.toLocaleString("ja-JP");
  if (tasuu && rule.tasuu !== null) return { yen: rule.tasuu, formula: `多数回該当 ${f(rule.tasuu)}円`, source: t.source };
  if (rule.threshold === null) return { yen: rule.base, formula: `${f(rule.base)}円`, source: t.source };
  const over = Math.max(0, medicalCostYen - rule.threshold);
  // The 1% part: 円未満 is rounded half up (五十銭未満切り捨て・五十銭以上切り上げ, 健保令42条).
  const yen = rule.base + Math.round(over / 100);
  return { yen, formula: `${f(rule.base)}円 ＋（${f(medicalCostYen)}円 − ${f(rule.threshold)}円）× 1%`, source: t.source };
}

export function calculateBill(claim: ClaimResult, ins: Insurance, opts: { tasuu?: boolean; turns75ThisMonth?: boolean } = {}): Bill {
  const notes: string[] = [];
  const medicalCostYen = claim.totalPoints * 10;
  const ichibuYen = round10((medicalCostYen * ins.rate) / 100);
  const limit = ins.limitKnown && claim.days > 0 ? limitFor(ins, medicalCostYen, claim.month, !!opts.tasuu) : null;
  if (!ins.limitKnown)
    notes.push("適用区分がわからないため、高額療養費は窓口では差し引いていません（限度額適用認定証の提示か、マイナ保険証での情報提供が要ります）。あとで保険者に申請すれば払い戻されます。");
  if (opts.turns75ThisMonth) notes.push("75歳になる月は、限度額が半分になる特例があります（健保令42条）。この計算には入れていないので、確かめてください。");
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
