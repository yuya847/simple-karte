import { abs } from "../flowsheet";
import type { Infusion } from "./types";
const valid = (...n: number[]) => n.every(Number.isFinite);
export function concentrationMgPerMl(inf: Pick<Infusion, "amountMg" | "volumeMl">): number | null {
  return valid(inf.amountMg, inf.volumeMl) && inf.amountMg > 0 && inf.volumeMl > 0 ? inf.amountMg / inf.volumeMl : null;
}
export function rateAt(inf: Infusion, atAbs: number): number | null {
  if (atAbs < abs(inf.start.day, inf.start.time) || inf.end && atAbs >= abs(inf.end.day, inf.end.time)) return null;
  const c = inf.changes.filter(c => abs(c.at.day, c.at.time) <= atAbs).sort((a,b) => abs(a.at.day,a.at.time)-abs(b.at.day,b.at.time)).at(-1);
  return c && Number.isFinite(c.rateMlPerH) && c.rateMlPerH >= 0 ? c.rateMlPerH : null;
}
// γ = mL/h × mg/mL × 1000 ÷ (kg × 60). Inverse: γ × kg × 60 ÷ (mg/mL × 1000).
export function gammaFromMlPerH(rate: number, concentration: number, kg: number): number | null {
  return valid(rate,concentration,kg) && rate >= 0 && concentration > 0 && kg > 0 ? rate*concentration*1000/(kg*60) : null;
}
export function mlPerHFromGamma(gamma: number, concentration: number, kg: number): number | null {
  return valid(gamma,concentration,kg) && gamma >= 0 && concentration > 0 && kg > 0 ? gamma*kg*60/(concentration*1000) : null;
}
export function doseFromMlPerH(rate: number, c: number, kg: number, unit: Infusion["doseUnit"]): number | null {
  if (!valid(rate,c) || rate < 0 || c <= 0) return null;
  switch(unit) {
    case "γ": return gammaFromMlPerH(rate,c,kg);
    case "mL/h": return rate;
    case "μg/h": return rate*c*1000;
    case "mg/kg/h": return kg > 0 && Number.isFinite(kg) ? rate*c/kg : null;
    default: return rate*c; // mg/h or 単位/h (insulin concentration is 単位/mL).
  }
}
export function mlPerHFromDose(dose: number, c: number, kg: number, unit: Infusion["doseUnit"]): number | null {
  if (!valid(dose,c) || dose < 0 || c <= 0) return null;
  switch(unit) {
    case "γ": return mlPerHFromGamma(dose,c,kg);
    case "mL/h": return dose;
    case "μg/h": return dose/(c*1000);
    case "mg/kg/h": return kg > 0 && Number.isFinite(kg) ? dose*kg/c : null;
    default: return dose/c;
  }
}
export function doseText(inf: Infusion, atAbs: number): string {
  const rate = rateAt(inf,atAbs), c = concentrationMgPerMl(inf);
  if (rate === null || c === null) return "—";
  const dose = doseFromMlPerH(rate,c,inf.weightKg,inf.doseUnit);
  if (dose === null) return "—";
  const unit = inf.doseUnit === "単位/h" ? "単位" : "mg";
  const formula = inf.doseUnit === "γ" ? `${rate.toFixed(1)}×${c}×1000÷(${inf.weightKg}×60)` : inf.doseUnit === "mg/kg/h" ? `${rate.toFixed(1)}×${c}÷${inf.weightKg}` : inf.doseUnit === "μg/h" ? `${rate.toFixed(1)}×${c}×1000` : inf.doseUnit === "mL/h" ? `${rate.toFixed(1)}` : `${rate.toFixed(1)}×${c}`;
  return `${dose.toFixed(inf.doseUnit === "γ" ? 2 : 1)}${inf.doseUnit}（${rate.toFixed(1)}mL/h：${inf.amountMg}${unit}/${inf.volumeMl}mL＝${Number(c.toPrecision(8))}${unit}/mL、${inf.weightKg}kg；${formula}）`;
}
