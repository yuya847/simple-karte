// 点滴の速さ: mL/時 from the order, and the drops a minute to set by hand on a 20滴 (一般用, 20滴 = 1mL)
// or a 60滴 (微量用, 60滴 = 1mL) infusion set: 滴/分 = mL/時 × (滴/mL) ÷ 60. Also how long one bag takes.
// Only arithmetic on what the doctor ordered; the formula is shown with the result.

import { doseVolumeMl } from "./drafts";
import { findDrug } from "./master";
import type { InjectionOrder } from "./types";

export interface DripRate {
  mlPerH: number;
  drops20: number;
  drops60: number;
  /** Minutes one bag (or one dose) takes at this rate. */
  minutesPerBag: number;
  volumeMl: number;
  formula: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function dripRate(o: InjectionOrder): DripRate | null {
  const vol = doseVolumeMl(o.items);
  if (!vol) return null;
  let mlPerH: number;
  let formula: string;
  const fluid = o.items.every((it) => findDrug(it.drugCode)?.kind === "輸液");
  if (o.rateMlPerH) {
    mlPerH = o.rateMlPerH;
    formula = `指示 ${o.rateMlPerH}mL/時`;
  } else if (o.minutesPerDose) {
    mlPerH = (vol * 60) / o.minutesPerDose;
    formula = `${vol}mL ÷ ${o.minutesPerDose}分 × 60`;
  } else if (fluid && o.schedule.kind === "per_day") {
    mlPerH = (vol * o.schedule.count) / 24;
    formula = `${vol}mL × ${o.schedule.count}本 ÷ 24時間`;
  } else return null;
  return { mlPerH: r1(mlPerH), drops20: Math.round((mlPerH * 20) / 60), drops60: Math.round(mlPerH), minutesPerBag: Math.round((vol / mlPerH) * 60), volumeMl: vol, formula };
}

export const dripText = (d: DripRate) => {
  const h = Math.floor(d.minutesPerBag / 60);
  const m = d.minutesPerBag % 60;
  return `${d.mlPerH}mL/時（${d.formula}）→ 20滴セット 約${d.drops20}滴/分・60滴セット 約${d.drops60}滴/分。${d.volumeMl}mL は${h ? `約${h}時間` : ""}${m ? `${m}分` : ""}`;
};
