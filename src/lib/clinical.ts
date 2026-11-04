// Values shown next to orders for reference. These are displays only: the app never
// says whether a dose is high or low.

import type { Patient } from "./types";

/** Latest value of an analyte, with the day it was measured. */
export function latestValue(patient: Patient, code: string): { value: number; day: number } | undefined {
  const sorted = [...patient.labs].sort((a, b) => b.day - a.day || b.time.localeCompare(a.time));
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

/** A height or weight is on record only when it is above 0 (a 救急外来・外来 visit has none until it is measured). */
export const measured = (v: number | undefined | null): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * 体格 as the patient bar and the 患者基本情報 window show it: each value with its unit, or 「—」 when not on record,
 * and the BMI only when both are. `spaced` puts a space before the unit (164 cm).
 */
export function bodyText(p: { heightCm: number; weightKg: number }, opts: { spaced?: boolean } = {}): { height: string; weight: string; bmi: string; unmeasured: boolean } {
  const sp = opts.spaced ? " " : "";
  const h = measured(p.heightCm);
  const w = measured(p.weightKg);
  return {
    height: h ? `${p.heightCm}${sp}cm` : "—",
    weight: w ? `${p.weightKg}${sp}kg` : "—",
    bmi: h && w ? bmi(p.heightCm, p.weightKg).toFixed(1) : "—",
    unmeasured: !h || !w,
  };
}

/** 推定CCr by Cockcroft-Gault, or null when the weight is not on record (the formula needs it). */
export function estimatedCcr(p: { age: number; weightKg: number; sex: "男" | "女" }, serumCr: number | undefined): number | null {
  if (serumCr === undefined || !measured(p.weightKg) || !(serumCr > 0)) return null;
  return cockcroftGault(p.age, p.weightKg, serumCr, p.sex);
}
