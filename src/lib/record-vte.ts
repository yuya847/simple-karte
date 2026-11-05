import type { TemplateValues } from "./note-templates";
import type { Patient } from "./types";
import type { StandingOrders } from "./standing";
import { effectiveFields } from "./standing-field-end";

/** Barbar S et al. J Thromb Haemost 2010;8:2450–2457, Table 1. */
export const PADUA_ITEMS = [
  ["活動性癌", 3], ["VTE の既往", 3], ["臥床（3日以上）", 3], ["血栓性素因", 3],
  ["1か月以内の外傷か手術", 2], ["70歳以上", 1], ["心不全か呼吸不全", 1],
  ["急性心筋梗塞か脳卒中", 1], ["急性感染症かリウマチ性疾患", 1], ["BMI 30以上", 1], ["ホルモン治療", 1],
] as const;
export const VTE_SOURCES = [
  { label: "Barbar S et al. Padua Prediction Score. J Thromb Haemost 2010;8:2450–2457（Table 1）", url: "https://doi.org/10.1111/j.1538-7836.2010.04044.x" },
  { label: "米国医療研究・品質調査機構（AHRQ）Appendix B.12：Padua 原著の配点・定義を掲載", url: "https://www.ahrq.gov/patient-safety/settings/hospital/vtguide/appb2.html" },
  { label: "日本循環器学会ほか 2017年改訂版 第V章 予防（リスクレベルと予防法）", url: "https://js-phlebology.jp/wp/wp-content/uploads/2019/03/JCS2017_ito_h.pdf" },
];
export function paduaTotal(values: TemplateValues): number | null {
  if (!PADUA_ITEMS.every(([label]) => (values[`選択:Padua ${label}`] === "あり" || values[`選択:Padua ${label}`] === "なし"))) return null;
  return PADUA_ITEMS.reduce((n, [label, points]) => n + (values[`選択:Padua ${label}`] === "あり" ? points : 0), 0);
}
export function paduaText(values: TemplateValues): string {
  const total = paduaTotal(values);
  return `Padua 合計：${total === null ? "未計算（11項目を選んでください）" : `${total}点（${total >= 4 ? "高リスク" : "4点未満"}）`}。評価・予防法を決めるのは医師。`;
}
export function vtePrefill(f: { patient: Pick<Patient, "age" | "heightCm" | "weightKg" | "infections"> & Partial<Pick<Patient, "admissionDiagnosis">>; me: { name: string }; nowTime: string; standing?: StandingOrders }): TemplateValues {
  const p = f.patient;
  const out: TemplateValues = { "文:評価者": f.me.name, "選択:Padua 70歳以上": p.age >= 70 ? "あり" : "なし" };
  if (Number.isFinite(p.heightCm) && Number.isFinite(p.weightKg) && p.heightCm > 0 && p.weightKg > 0) {
    const bmi = p.weightKg / (p.heightCm / 100) ** 2;
    out["選択:Padua BMI 30以上"] = bmi >= 30 ? "あり" : "なし";
    out["文:引用した情報"] = `年齢 ${p.age}歳、BMI ${bmi.toFixed(1)}（身長 ${p.heightCm}cm・体重 ${p.weightKg}kg）`;
  }
  // 入院病名に明示された肯定的な情報のみ。記載がないことから「なし」と推定しない。
  if (p.admissionDiagnosis && /心不全|呼吸不全/.test(p.admissionDiagnosis) && !/疑い|否定/.test(p.admissionDiagnosis)) out["選択:Padua 心不全か呼吸不全"] = "あり";
  if (p.admissionDiagnosis && /肺炎|急性.*感染|尿路感染|蜂窩織炎|敗血症/.test(p.admissionDiagnosis) && !/疑い|否定/.test(p.admissionDiagnosis)) out["選択:Padua 急性感染症かリウマチ性疾患"] = "あり";
  // 感染症のプロフィール（HBV 等）を急性感染症とみなさない。
  if (f.standing && (f.standing.until === undefined || f.standing.until >= 0)) {
    const rest = effectiveFields(f.standing, 0, f.nowTime).rest;
    if (rest?.startsWith("ベッド上")) {
      out["文:臥床の確認"] = `安静度：${rest}。3日以上の臥床（予定を含む）か確認してください。`;
      // 指示簿は安静度の開始日を保証しないため、期間確認前に3点を加えない。
    }
  }
  return out;
}
