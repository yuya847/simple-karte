import { dietNutrients, type DietOrder } from "./diet";
import type { Sex } from "./types";

export const bmi = (kg: number, cm: number): number | null => Number.isFinite(kg) && Number.isFinite(cm) && kg > 0 && cm > 0 ? kg / (cm / 100) ** 2 : null;
/** Positive = weight lost; negative = weight gained. */
export const weightLoss = (now: number, before: number): number | null => now > 0 && before > 0 && Number.isFinite(now + before) ? (before - now) / before * 100 : null;
/** BAPEN MUST: loss must be unplanned over 3–6 months, NOT the admission/month comparison. */
export function mustScore(bodyMassIndex: number, lossPercent: number, acuteNoIntakeOver5Days: boolean): number | null {
  if (!Number.isFinite(bodyMassIndex + lossPercent) || bodyMassIndex <= 0) return null;
  return (bodyMassIndex < 18.5 ? 2 : bodyMassIndex <= 20 ? 1 : 0) + (lossPercent > 10 ? 2 : lossPercent >= 5 ? 1 : 0) + (acuteNoIntakeOver5Days ? 2 : 0);
}
export function requirements(sex: Sex, age: number, kg: number, cm: number, activity: number, stress: number, proteinPerKg: number) {
  if (![age, kg, cm, activity, stress, proteinPerKg].every(Number.isFinite) || age < 18 || Math.min(kg, cm, activity, stress, proteinPerKg) <= 0) return null;
  const basal = sex === "男" ? 66.473 + 13.7516 * kg + 5.0033 * cm - 6.755 * age : 655.0955 + 9.5634 * kg + 1.8496 * cm - 4.6756 * age;
  if (basal <= 0) return null;
  return { basal: Math.round(basal), kcal: Math.round(basal * activity * stress), protein: Math.round(kg * proteinPerKg * 10) / 10 };
}

/** Positive difference means the calculated amount is greater than the prescribed meal. */
export function compareDietNutrition(diet: DietOrder | undefined, calculated: { kcal: number; protein: number } | null) {
  const prescribed = dietNutrients(diet);
  return { prescribed, energyDifference: calculated && prescribed.energyKcal != null ? calculated.kcal - prescribed.energyKcal : null, proteinDifference: calculated && prescribed.proteinG != null ? Math.round((calculated.protein - prescribed.proteinG) * 10) / 10 : null };
}
