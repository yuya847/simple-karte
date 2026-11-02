// Values shown next to orders for reference. These are displays only: the app never
// says whether a dose is high or low.

import type { Patient } from "./types";

/** Latest value of an analyte, with the day it was measured. */
export function latestValue(patient: Patient, code: string): { value: number; day: number } | undefined {
  const sorted = [...patient.labs].sort((a, b) => b.day - a.day);
  for (const r of sorted) {
    if (code in r.values) return { value: r.values[code], day: r.day };
  }
  return undefined;
}

/**
 * Estimated creatinine clearance by the Cockcroft-Gault equation (mL/min), using actual body weight.
 * Cockcroft DW, Gault MH. Nephron 1976;16:31-41.
 */
export function cockcroftGault(age: number, weightKg: number, serumCr: number, sex: "男" | "女"): number {
  const base = ((140 - age) * weightKg) / (72 * serumCr);
  return sex === "女" ? base * 0.85 : base;
}

export function bmi(heightCm: number, weightKg: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}
