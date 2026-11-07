import { rateAt, doseText, concentrationMgPerMl } from "./gamma";
import type { IcuRecords } from "./types";
import type { InjectionOrder } from "../types";
export function currentInfusion(o: InjectionOrder, records: IcuRecords | undefined, patientId: string, at: number) {
  const inf = records?.infusions.find(i => i.id === o.continuous?.infusionId && i.patientId === patientId);
  if (!inf) return undefined;
  const rate = rateAt(inf, at);
  if (rate === null) return undefined;
  const c = concentrationMgPerMl(inf);
  return { inf, rate, text: inf.doseUnit === "単位/h" && c !== null ? `持続 ${Number((rate*c).toFixed(3))}単位/時（${rate.toFixed(1)}mL/時）` : `持続 ${infusionSpeedText(inf, at)}` };
}

export function infusionSpeedText(inf: import("./types").Infusion, at: number, ordered?: number): string {
  const rate = rateAt(inf, at);
  return rate === null ? "—" : `${rate.toFixed(1)}mL/時${ordered !== undefined && rate !== ordered ? `（指示 ${ordered}）` : ""}・${doseText(inf, at).split("（")[0]}`;
}
