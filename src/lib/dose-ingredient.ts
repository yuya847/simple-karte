import type { OralDrugMaster } from "./master";
import type { Patient } from "./types";

const normalized = (s: string) => s.normalize("NFKC").replace(/\s/g, "");
/** No dose judgement. Unknown units, mixtures, and ambiguous concentrations stay blank. */
export function ingredientDose(drug: Pick<OralDrugMaster, "name" | "strength" | "unit">, amount: number, weight?: number) {
  if (!Number.isFinite(amount) || amount <= 0 || !["g", "mL"].includes(drug.unit)) return null;
  const name = normalized(drug.name), spec = normalized(drug.strength);
  if (/配合|混合/.test(name)) return null;
  const explicit = spec.match(/^(\d+(?:\.\d+)?)mg\/(\d+(?:\.\d+)?)?(g|mL)$/);
  let mgPerUnit: number | undefined;
  if (explicit && explicit[3] === drug.unit && Number(explicit[2] ?? 1) > 0) mgPerUnit = Number(explicit[1]) / Number(explicit[2] ?? 1);
  // 質量百分率。50%散剤=500mg/g（カロナール添文3.1）。
  // https://www.mhlw.go.jp/content/11120000/001124472.pdf
  // 液剤の%は質量/容量の区別が不明なため、mg/mLが明記されたものだけ扱う。
  if (mgPerUnit === undefined && drug.unit === "g" && /散|細粒|顆粒|ドライシロップ|DS/.test(name)) {
    const percentages = [...`${spec} ${name}`.matchAll(/(\d+(?:\.\d+)?)%/g)].map(m => Number(m[1]));
    if (percentages.length && new Set(percentages).size === 1) mgPerUnit = percentages[0] * 10;
  }
  // カロナールシロップ2%の添文3.1は1mL中20mgと明記。
  // https://www.mhlw.go.jp/content/11120000/001124472.pdf
  if (mgPerUnit === undefined && drug.unit === "mL" && /^カロナールシロップ2%$/.test(name)) mgPerUnit = 20;
  if (!(mgPerUnit && Number.isFinite(mgPerUnit))) return null;
  const mg = amount * mgPerUnit;
  return { mg, mgPerKg: weight && Number.isFinite(weight) && weight > 0 ? mg / weight : null };
}
export function latestWeight(p?: Pick<Patient, "daily" | "weightKg">): number | undefined {
  if (!p) return undefined;
  const row = [...p.daily].filter(d => d.day <= 0 && d.weightKg != null && d.weightKg > 0).sort((a, b) => b.day - a.day)[0];
  return row?.weightKg ?? p.weightKg;
}
