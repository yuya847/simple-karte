// 病棟の食事: every patient on the ward × 朝・昼・夕 of the days shown, for the 管理栄養士 (and the
// nurses). Everything is worked out by code from the diet orders and the orders that hold a meal
// (exams, 外泊・外出・退院): the 食種 and 形態 of each meal, the 食数 per 食種, the kitchen's deadline
// (MEAL_DEADLINE, a rule of the fictional hospital) and the changes made after it. Nothing is decided here.

import { currentDiet, MEALS, MEAL_DEADLINE, MEAL_TIMES, TUBE_PRODUCTS, dietAt, findTherapeutic, mealHolds, type DietOrder, type ExamTime, type Meal, type MealHold } from "./diet";
import { abs } from "./flowsheet";
import type { DayOffset, OrderEntry, Patient } from "./types";

type At = { day: DayOffset; time: string };

/** The kitchen's deadline for a meal, as a moment (前日17:00 for 朝, 当日10:00 for 昼, 当日15:00 for 夕). */
export function deadlineOf(day: number, meal: Meal): At {
  const d = MEAL_DEADLINE[meal];
  return { day: day - d.dayBefore, time: d.time };
}

/** 食種: what the kitchen counts by (the diet, without its texture). */
export function mealType(o: DietOrder | undefined): string {
  if (!o) return "指示なし";
  switch (o.kind) {
    case "治療食": {
      const t = findTherapeutic(o.therapeutic);
      return [t?.name ?? "治療食", o.energyKcal ? `${o.energyKcal}kcal` : "", o.proteinG ? `蛋白${o.proteinG}g` : "", o.saltG ? `塩分${o.saltG}g未満` : ""].filter(Boolean).join(" ");
    }
    case "嚥下調整食":
      return `嚥下調整食 ${o.dysphagia ?? "?"}`;
    case "経管栄養":
      return `経管栄養（${TUBE_PRODUCTS.find((x) => x.code === o.tube?.product)?.name ?? "製品？"}）`;
    default:
      return o.kind;
  }
}

/** 形態: the staple and side dish, the thickness of drinks, or the amount of a tube feed. */
export function mealForm(o: DietOrder | undefined): string {
  if (!o || o.kind === "絶食") return "";
  if (o.kind === "経管栄養") return `${o.tube?.mlPerMeal ?? "?"}mL/回${o.tube?.ratePerH ? `・${o.tube.ratePerH}mL/時` : ""}`;
  const bits: string[] = [];
  if (o.staple && o.kind !== "流動食" && o.kind !== "嚥下調整食") bits.push(o.staple);
  if (o.side && o.kind !== "嚥下調整食") bits.push(o.side);
  if (o.thickness && o.thickness !== "なし") bits.push(`とろみ：${o.thickness}`);
  return bits.join("・");
}

export interface MealCell {
  day: number;
  meal: Meal;
  order?: DietOrder;
  /** 食種 (「指示なし」 when there is no diet order). */
  type: string;
  form: string;
  holds: MealHold[];
  /** Counted in the 食数: a diet order that is not 絶食, and no hold. */
  serve: boolean;
  /** The diet changes at this meal (from the meal before). */
  changed: boolean;
  /** Why this meal changed after the kitchen's deadline (empty when it did not). */
  late: string[];
  /** Past its serving time. */
  past: boolean;
}

export interface MealRow {
  patientId: string;
  name: string;
  room: string;
  /** アレルギー as in the chart (drugs included). */
  allergies: string[];
  /** 禁止・注意: the comments of the diet orders shown, and the chart's cautions about food and fluids. */
  notes: string[];
  cells: MealCell[];
}

export interface MealSlot {
  day: number;
  meal: Meal;
  deadline: At;
  deadlinePassed: boolean;
  /** 食数: meals to serve. */
  total: number;
  byType: { type: string; count: number; forms: { form: string; count: number }[] }[];
  npo: number;
  held: number;
  none: number;
  late: number;
}

export interface WardMeals {
  rows: MealRow[];
  slots: MealSlot[];
}

export type MealPerson = { patient: Pick<Patient, "id" | "name" | "allergies" | "cautions">; room: string; entries: OrderEntry[] };

const hm = (t: At) => `${t.day === 0 ? "今日" : t.day === 1 ? "明日" : t.day === -1 ? "昨日" : `${t.day}日`} ${t.time}`;

/** A stopped order that held this meal: the meal is back on (late when stopped after the deadline; only stops with a known time). */
function liftedHolds(entries: OrderEntry[], day: number, meal: Meal, examTime: ExamTime): { hold: MealHold; stoppedAt: At }[] {
  const stopped = entries.filter((e) => e.status === "中止" && e.stoppedOn !== undefined && e.stoppedTime !== undefined);
  return stopped.flatMap((e) => mealHolds([{ ...e, status: "有効" }], day, meal, examTime).map((hold) => ({ hold, stoppedAt: { day: e.stoppedOn!, time: e.stoppedTime! } })));
}

/** One meal of one patient. */
export function mealCell(p: MealPerson, diets: DietOrder[], day: number, meal: Meal, nowAbs: number, examTime: ExamTime): MealCell {
  const o = dietAt(diets, p.patient.id, day, meal);
  const i = MEALS.indexOf(meal);
  const before = i > 0 ? dietAt(diets, p.patient.id, day, MEALS[i - 1]) : dietAt(diets, p.patient.id, day - 1, "夕");
  const holds = mealHolds(p.entries, day, meal, examTime);
  const dl = deadlineOf(day, meal);
  const after = (t: At) => abs(t.day, t.time) > abs(dl.day, dl.time);
  const late: string[] = [];
  if (o && after(o.at)) late.push(`締切後の食事の指示（${hm(o.at)} ${o.by}）`);
  for (const h of holds) if (after(h.orderedAt)) late.push(`締切後の食止め：${h.label}（${hm(h.orderedAt)}）`);
  for (const x of liftedHolds(p.entries, day, meal, examTime)) if (after(x.stoppedAt)) late.push(`締切後に食止めを取り消し：${x.hold.label}（${hm(x.stoppedAt)}）`);
  return {
    day,
    meal,
    order: o,
    type: mealType(o),
    form: mealForm(o),
    holds,
    serve: !!o && o.kind !== "絶食" && holds.length === 0,
    changed: !!o && o !== before,
    late,
    past: abs(day, MEAL_TIMES[meal]) <= nowAbs,
  };
}

/** The ward's meals for the days shown: a row per patient, and the 食数 of each meal. */
export function wardMeals(people: MealPerson[], diets: DietOrder[], days: number[], nowAbs: number, examTime: ExamTime): WardMeals {
  const rows: MealRow[] = people.map((p) => {
    const cells = days.flatMap((day) => MEALS.map((meal) => mealCell(p, diets, day, meal, nowAbs, examTime)));
    const comments = [...new Set(cells.flatMap((c) => (c.order?.comment ? [c.order.comment] : [])))];
    const cautions = p.patient.cautions.filter((c) => /水分|食|禁|嚥下|とろみ/.test(c) && !comments.some((x) => x.includes(c)));
    return { patientId: p.patient.id, name: p.patient.name, room: p.room, allergies: p.patient.allergies, notes: [...new Set([currentDiet(diets,p.patient.id,hmClock(nowAbs))?.prohibited ? `禁止：${currentDiet(diets,p.patient.id,hmClock(nowAbs))!.prohibited}` : "", ...cells.flatMap(c=>[c.order?.prohibited ? `禁止：${c.order.prohibited}` : "",c.order?.allergyNote ? `アレルギー：${c.order.allergyNote}` : ""]), ...comments, ...cautions].filter(Boolean))], cells };
  });
  const slots: MealSlot[] = days.flatMap((day) =>
    MEALS.map((meal) => {
      const cells = rows.map((r) => r.cells.find((c) => c.day === day && c.meal === meal)!);
      const served = cells.filter((c) => c.serve);
      const types = [...new Set(served.map((c) => c.type))];
      const dl = deadlineOf(day, meal);
      return {
        day,
        meal,
        deadline: dl,
        deadlinePassed: nowAbs > abs(dl.day, dl.time),
        total: served.length,
        byType: types
          .map((type) => {
            const of = served.filter((c) => c.type === type);
            const forms = [...new Set(of.map((c) => c.form))].map((form) => ({ form, count: of.filter((c) => c.form === form).length }));
            return { type, count: of.length, forms };
          })
          .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, "ja")),
        npo: cells.filter((c) => c.order?.kind === "絶食").length,
        held: cells.filter((c) => c.order?.kind !== "絶食" && c.holds.length > 0).length,
        none: cells.filter((c) => !c.order).length,
        late: cells.filter((c) => c.late.length > 0).length,
      };
    }),
  );
  return { rows, slots };
}

/** 「締切 前日 17:00」 and how long is left (or that it has passed). */
export function deadlineText(s: Pick<MealSlot, "day" | "meal" | "deadline" | "deadlinePassed">, nowAbs: number): string {
  const head = `締切 ${MEAL_DEADLINE[s.meal].dayBefore ? "前日" : "当日"} ${s.deadline.time}`;
  if (s.deadlinePassed) return `${head}（過ぎました）`;
  const left = abs(s.deadline.day, s.deadline.time) - nowAbs;
  return `${head}（あと${left >= 60 ? `${Math.floor(left / 60)}時間` : ""}${left % 60 ? `${left % 60}分` : ""}）`;
}

const hmClock = (at:number) => `${String(Math.floor(((at%1440)+1440)%1440/60)).padStart(2,"0")}:${String(((at%60)+60)%60).padStart(2,"0")}`;
