// Today's 尿量・排便・食事・体重 entered on the ward, merged into the patient's per-day record: urine and
// stools add up, a meal or the weight replaces what was there.

import type { DailyRecord } from "./types";

export interface DailyAdd {
  urineMl?: number;
  stools?: number;
  sideMeals?: [number | null, number | null, number | null];
  meals?: [number | null, number | null, number | null];
  weightKg?: number;
}

export function addDaily(cur: DailyAdd | undefined, d: { urineMl?: number; stools?: number; meal?: { slot: 0 | 1 | 2; tenths: number; sideTenths?: number }; weightKg?: number }): DailyAdd {
  const out: DailyAdd = { ...cur };
  if (d.urineMl) out.urineMl = (out.urineMl ?? 0) + d.urineMl;
  if (d.stools) out.stools = (out.stools ?? 0) + d.stools;
  if (d.meal) {
    const m: [number | null, number | null, number | null] = [...(out.meals ?? [null, null, null])];
    m[d.meal.slot] = d.meal.tenths;
    out.meals = m;
    if (d.meal.sideTenths !== undefined) {
      const side: [number | null, number | null, number | null] = [...(out.sideMeals ?? [null, null, null])];
      side[d.meal.slot] = d.meal.sideTenths;
      out.sideMeals = side;
    }
  }
  if (d.weightKg !== undefined) out.weightKg = d.weightKg;
  return out;
}

/** The patient's days with today's entries applied. */
export function withToday(daily: DailyRecord[], add: DailyAdd | undefined): DailyRecord[] {
  if (!add) return daily;
  const base = daily.find((x) => x.day === 0) ?? { day: 0 };
  const meals = add.meals ? (base.meals === "絶食" || !base.meals ? add.meals : (base.meals.map((v, i) => add.meals![i] ?? v) as [number | null, number | null, number | null])) : base.meals;
  const today: DailyRecord = {
    ...base,
    ...(add.urineMl ? { urineMl: (base.urineMl ?? 0) + add.urineMl } : {}),
    ...(add.stools ? { stools: (base.stools ?? 0) + add.stools } : {}),
    ...(meals ? { meals } : {}),
    ...(add.sideMeals ? { sideMeals: (base.sideMeals ?? [null, null, null]).map((v, i) => add.sideMeals![i] ?? v) as [number | null, number | null, number | null] } : {}),
    ...(add.weightKg !== undefined ? { weightKg: add.weightKg } : {}),
  };
  return [...daily.filter((x) => x.day !== 0), today].sort((a, b) => a.day - b.day);
}

/** The last weight before today. */
export const prevWeightOf = (daily: DailyRecord[]) => {
  const w = daily.filter((x) => x.day < 0 && x.weightKg !== undefined).sort((a, b) => b.day - a.day)[0];
  return w ? { day: w.day, kg: w.weightKg! } : undefined;
};
