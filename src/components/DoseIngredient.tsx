import { ingredientDose, latestWeight } from "@/lib/dose-ingredient";
import type { OralDrugMaster } from "@/lib/master";
import type { Patient } from "@/lib/types";

export function DoseIngredient({ drug, amount, patient }: { drug: OralDrugMaster; amount: string; patient?: Patient }) {
  const dose = ingredientDose(drug, Number(amount), latestWeight(patient));
  if (!dose) return null;
  const fmt = (n: number) => Number(n.toFixed(2));
  return <small className="ml-2 text-xs text-ink-faint">成分 {fmt(dose.mg)} mg{dose.mgPerKg !== null && `（${fmt(dose.mgPerKg)} mg/kg）`}</small>;
}
