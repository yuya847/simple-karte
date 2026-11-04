// 食種 on the flow sheet (経過表): the diet each meal is served under, from the doctor's diet orders
// (食事オーダー), with meals held for an exam or a leave. Code only reads the orders; nothing is decided.

import { MEALS, MEAL_TIMES, dietAt, dietLabel, findTherapeutic, holdTitle, mealHolds, type DietOrder, type ExamTime, type Meal, type MealHold } from "./diet";
import { abs } from "./flowsheet";
import type { DayOffset, OrderEntry } from "./types";

/** One meal on the flow sheet: when it is served, the order in force, and what holds it. */
export interface MealDiet {
  day: DayOffset;
  meal: Meal;
  /** Serving time (absolute minutes from today 00:00). */
  at: number;
  order?: DietOrder;
  /** The full line (as on the diet calendar), and a short one for a narrow cell. */
  label: string;
  short: string;
  holds: MealHold[];
}

/** A short name for a narrow cell; the full line is shown on touch. */
export function dietShort(o?: DietOrder): string {
  if (!o) return "指示なし";
  switch (o.kind) {
    case "絶食":
      return "絶食";
    case "経管栄養":
      return `経管${o.tube?.mlPerMeal ? ` ${o.tube.mlPerMeal}mL` : ""}`;
    case "流動食":
      return "流動食";
    case "嚥下調整食":
      return `嚥下${o.dysphagia ?? ""}`;
    case "治療食": {
      const t = findTherapeutic(o.therapeutic);
      const bits = [t?.aliases[0] ?? "治療食"];
      if (o.energyKcal) bits.push(`${o.energyKcal}kcal`);
      if (o.saltG) bits.push(`塩${o.saltG}g`);
      if (o.staple && o.staple !== "米飯") bits.push(o.staple);
      return bits.join(" ");
    }
    default:
      return o.staple && o.staple !== "米飯" ? `${o.kind} ${o.staple}` : o.kind;
  }
}

/** Every meal of the given days, in order. */
export function mealDiets(diets: DietOrder[], entries: OrderEntry[], patientId: string, days: DayOffset[], examTime: ExamTime): MealDiet[] {
  return days.flatMap((day) =>
    MEALS.map((meal): MealDiet => {
      const order = dietAt(diets, patientId, day, meal);
      return { day, meal, at: abs(day, MEAL_TIMES[meal]), order, label: dietLabel(order), short: dietShort(order), holds: mealHolds(entries, day, meal, examTime) };
    }),
  );
}

/** What the cell of one meal says: the hold (検査で止め…) when held, else the diet. */
export const mealText = (m: MealDiet) => (m.holds.length ? holdTitle(m.holds) : m.short);

export interface DietDayCell {
  /** "常食", or the changes in the day: "絶食→全粥". */
  text: string;
  /** Each meal in full, one per line. */
  title: string;
  /** The diet changed at a meal of this day (from the meal before, the day before's 夕 included). */
  changed: boolean;
  /** Some meal of the day is held (検査・外泊・外出・退院). */
  held: boolean;
  /** No meal of the day has an order (before the first diet order). */
  empty: boolean;
}

/**
 * One cell per day: the meals of the day joined where they change ("絶食→全粥"). `meals` is the list from
 * mealDiets; `day` picks the day. Meals before the first order of the stay are left out of the text.
 */
export function dietDayCell(meals: MealDiet[], day: DayOffset): DietDayCell {
  const mine = meals.filter((m) => m.day === day);
  const idx = meals.findIndex((m) => m.day === day);
  const before = idx > 0 ? meals[idx - 1] : undefined;
  const shown = mine.filter((m) => m.order || m.holds.length);
  const parts: string[] = [];
  for (const m of shown) {
    const t = mealText(m);
    if (parts.at(-1) !== t) parts.push(t);
  }
  const first = shown[0];
  const lead = first && first.meal !== "朝" && !mine[0].order ? `${first.meal}〜` : "";
  const changed = mine.some((m, i) => {
    const prev = i === 0 ? before : mine[i - 1];
    return !!prev?.order && !!m.order && prev.label !== m.label;
  });
  const title = mine
    .map((m) => `${m.meal}（${MEAL_TIMES[m.meal]}）${m.holds.length ? `${holdTitle(m.holds)}：${m.holds.map((h) => h.label).join("、")}（食種は ${m.label}）` : m.label}${m.order ? `　${m.order.by}の指示` : ""}`)
    .join("\n");
  return { text: parts.length ? lead + parts.join("→") : "", title, changed, held: mine.some((m) => m.holds.length > 0), empty: shown.length === 0 };
}
