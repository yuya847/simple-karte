// 数値の式（入力が欠けている・範囲外なら null）。値の丸めは表示のときだけ行う。
// 腎機能（CG 式・日本人の eGFR）は src/lib/abx-renal.ts の renalFunction を使い、ここには書かない。

import { concentrationMgPerMl, mlPerHFromDose } from "../icu/gamma";
import { pfRatio } from "../icu/abg";
import type { Sex } from "../types";

const ok = (...n: (number | null | undefined)[]): boolean => n.every((x) => x !== null && x !== undefined && Number.isFinite(x));
const positive = (...n: (number | null | undefined)[]): boolean => ok(...n) && n.every((x) => (x as number) > 0);

// ---------------------------------------------------------------------------
// 自由水欠乏量
// 自由水欠乏量（L）= 体水分量 ×（Na ÷ 140 − 1）、体水分量 = 体重 × 係数。
// 係数：小児 0.6、成人の男性 0.6・女性 0.5、高齢の男性 0.5・女性 0.45。
// 出典：Adrogué HJ, Madias NE. Hypernatremia. N Engl J Med 2000;342:1493-1499（Table 3 の注の体水分の割合）。
// ---------------------------------------------------------------------------

export type AgeBand = "小児" | "成人" | "高齢";
export const TBW_FACTORS = [
  { value: 0.6, label: "成人男性・小児" },
  { value: 0.5, label: "成人女性・高齢男性" },
  { value: 0.45, label: "高齢女性" },
] as const;

/**
 * 係数の区分の初期値（医師が押して替える）。出典は年齢の境を書いていないので、高齢は WHO の高齢者の定義
 * （65歳以上）、小児は CG 式の対象（18歳以上）の外とした。
 */
export const ageBand = (age: number): AgeBand => (age < 18 ? "小児" : age >= 65 ? "高齢" : "成人");

export function tbwFactor(band: AgeBand, sex: Sex): number {
  if (band === "小児") return 0.6;
  if (band === "成人") return sex === "男" ? 0.6 : 0.5;
  return sex === "男" ? 0.5 : 0.45;
}

export function freeWaterDeficit(na: number | null, weightKg: number | null, factor: number | null): { liters: number; tbw: number } | null {
  if (!positive(na, weightKg, factor)) return null;
  const tbw = weightKg! * factor!;
  return { liters: tbw * (na! / 140 - 1), tbw };
}

// ---------------------------------------------------------------------------
// 補正 Ca（Payne）：補正 Ca（mg/dL）= Ca（mg/dL）− Alb（g/dL）+ 4.0
// 出典：Payne RB ほか. Interpretation of serum calcium in patients with abnormal serum proteins. Br Med J 1973;4:643-646.
// ---------------------------------------------------------------------------

export const correctedCa = (ca: number | null, alb: number | null): number | null => (positive(ca, alb) ? ca! - alb! + 4 : null);

// ---------------------------------------------------------------------------
// アニオンギャップ：AG = Na −（Cl + HCO3）
// 出典：Emmett M, Narins RG. Clinical use of the anion gap. Medicine (Baltimore) 1977;56:38-54.
// Alb 補正 AG = AG + 2.5 ×（基準の Alb − Alb）（g/dL。g/L では 0.25）。基準の Alb は医師が選ぶ。
// 出典：Figge J ほか. Anion gap and hypoalbuminemia. Crit Care Med 1998;26:1807-1810.
// ---------------------------------------------------------------------------

export const anionGap = (na: number | null, cl: number | null, hco3: number | null): number | null => (ok(na, cl, hco3) ? na! - (cl! + hco3!) : null);
export const albuminCorrectedAg = (ag: number | null, alb: number | null, normalAlb: number | null): number | null =>
  ok(ag) && positive(alb, normalAlb) ? ag! + 2.5 * (normalAlb! - alb!) : null;

// ---------------------------------------------------------------------------
// 高血糖時の補正 Na = Na + 係数 ×（血糖 − 100）÷ 100（mg/dL）
// 係数 1.6：Katz MA. Hyperglycemia-induced hyponatremia. N Engl J Med 1973;289:843-844.
// 係数 2.4：Hillier TA ほか. Hyponatremia: evaluating the correction factor for hyperglycemia. Am J Med 1999;106:399-403.
// ---------------------------------------------------------------------------

export const NA_GLUCOSE_FACTORS = [
  { factor: 1.6, source: "Katz" },
  { factor: 2.4, source: "Hillier" },
] as const;
export const correctedNa = (na: number | null, glu: number | null, factor: number): number | null => (positive(na, glu) ? na! + (factor * (glu! - 100)) / 100 : null);

// ---------------------------------------------------------------------------
// P/F と A-aDO2
// P/F = PaO2 ÷ FiO2（src/lib/icu/abg.ts の pfRatio。整数）。
// 肺胞気の式（簡略式）：PAO2 = FiO2 ×（大気圧 − 47）− PaCO2 ÷ 0.8、A-aDO2 = PAO2 − PaO2（mmHg）。
// 47 は 37℃ の水蒸気圧、0.8 は呼吸商。
// 出典：Fenn WO, Rahn H, Otis AB. A theoretical study of the composition of the alveolar air at altitude.
// Am J Physiol 1946;146:637-653。
// ---------------------------------------------------------------------------

export const WATER_VAPOR_MMHG = 47;
export const RESPIRATORY_QUOTIENT = 0.8;
export const pf = (pao2: number | null, fio2: number | null): number | null => (ok(pao2, fio2) ? pfRatio(pao2!, fio2!) : null);

export function alveolarO2(fio2: number | null, paco2: number | null, patm: number | null): number | null {
  if (!ok(fio2, paco2, patm) || fio2! < 0.21 || fio2! > 1 || paco2! < 0 || patm! <= WATER_VAPOR_MMHG) return null;
  return fio2! * (patm! - WATER_VAPOR_MMHG) - paco2! / RESPIRATORY_QUOTIENT;
}
export function aaDo2(fio2: number | null, pao2: number | null, paco2: number | null, patm: number | null): number | null {
  const pa = alveolarO2(fio2, paco2, patm);
  return pa === null || !ok(pao2) || pao2! < 0 ? null : pa - pao2!;
}

// ---------------------------------------------------------------------------
// MELD = 9.57 × ln(Cre) + 3.78 × ln(T-Bil) + 11.2 × ln(PT-INR) + 6.43（mg/dL）
// 1 未満の値は 1、Cre の上限は 4.0（UNOS が臓器配分で決めた計算の仕方）。
// 出典：Kamath PS ほか. Hepatology 2001;33:464-470。式と上下限は Kamath PS, Kim WR. The model for end-stage
// liver disease (MELD). Hepatology 2007;45:797-805。
// 透析中の Cre の扱いは出典で確かめられなかったので入れていない（医師が Cre を入れ直す）。
// ---------------------------------------------------------------------------

export function meld(bil: number | null, inr: number | null, cre: number | null): { score: number; used: { bil: number; inr: number; cre: number } } | null {
  if (!positive(bil, inr, cre)) return null;
  const used = { bil: Math.max(1, bil!), inr: Math.max(1, inr!), cre: Math.min(4, Math.max(1, cre!)) };
  return { score: 9.57 * Math.log(used.cre) + 3.78 * Math.log(used.bil) + 11.2 * Math.log(used.inr) + 6.43, used };
}

// ---------------------------------------------------------------------------
// 抗菌薬の濃度と速さ（薬ごとの決まりは持たない。式だけ）
// 濃度（mg/mL）= 薬剤量 ÷ 総量（src/lib/icu/gamma.ts の concentrationMgPerMl）。
// 1回の液量（mL）= 1回量 ÷ 濃度、速さ（mL/h）= 液量 ÷（投与時間 ÷ 60）。
// 持続：速さ（mL/h）= 1日量 ÷ 24 ÷ 濃度（gamma.ts の mlPerHFromDose、mg/h）。
// ---------------------------------------------------------------------------

export const concentration = (amountMg: number | null, volumeMl: number | null): number | null =>
  positive(amountMg, volumeMl) ? concentrationMgPerMl({ amountMg: amountMg!, volumeMl: volumeMl! }) : null;

export function intermittentRate(doseMg: number | null, conc: number | null, minutes: number | null): { volumeMl: number; mlPerH: number } | null {
  if (!positive(doseMg, conc, minutes)) return null;
  const volumeMl = doseMg! / conc!;
  return { volumeMl, mlPerH: volumeMl / (minutes! / 60) };
}

export function continuousRate(dailyMg: number | null, conc: number | null): number | null {
  return positive(dailyMg, conc) ? mlPerHFromDose(dailyMg! / 24, conc!, 1, "mg/h") : null;
}

/** 表示用：小数 digits 桁で丸め、末尾の 0 を落とす。 */
export const fmt = (n: number, digits = 1): string => String(Number(n.toFixed(digits)));
