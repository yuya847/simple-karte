// 食事オーダー（入院中の食事）. The doctor orders the diet; Claude only copies spoken words into the
// fields; which meal it starts at, the kitchen's deadlines, meals held for tests and the billing
// class are code. The diet changes from a given meal and stays until the next order.

import { abs } from "./flowsheet";
import { examAt } from "./exams";
import type { DayOffset, OrderEntry } from "./types";

export type Meal = "朝" | "昼" | "夕";
export const MEALS: Meal[] = ["朝", "昼", "夕"];
/** Serving times on this ward (fictional). */
export const MEAL_TIMES: Record<Meal, string> = { 朝: "07:30", 昼: "12:00", 夕: "18:00" };
/** The kitchen's deadline for a change (fictional hospital rule): day offset from the meal's day, and time. */
export const MEAL_DEADLINE: Record<Meal, { dayBefore: 0 | 1; time: string }> = { 朝: { dayBefore: 1, time: "17:00" }, 昼: { dayBefore: 0, time: "10:00" }, 夕: { dayBefore: 0, time: "15:00" } };

export type DietKind = "常食" | "治療食" | "嚥下調整食" | "流動食" | "経管栄養" | "絶食";
export const DIET_KINDS: DietKind[] = ["常食", "治療食", "嚥下調整食", "流動食", "経管栄養", "絶食"];
export type Staple = "米飯" | "軟飯" | "全粥" | "七分粥" | "五分粥" | "三分粥" | "パン";
export const STAPLES: Staple[] = ["米飯", "軟飯", "全粥", "七分粥", "五分粥", "三分粥", "パン"];
export type SideForm = "常菜" | "一口大" | "刻み" | "ミキサー";
export const SIDE_FORMS: SideForm[] = ["常菜", "一口大", "刻み", "ミキサー"];

/** 嚥下調整食分類2021（日本摂食嚥下リハビリテーション学会）のコード. */
export type DysphagiaCode = "0j" | "0t" | "1j" | "2-1" | "2-2" | "3" | "4";
export const DYSPHAGIA_CODES: { code: DysphagiaCode; label: string }[] = [
  { code: "0j", label: "0j 嚥下訓練食品（ゼリー）" },
  { code: "0t", label: "0t 嚥下訓練食品（とろみ水）" },
  { code: "1j", label: "1j 嚥下調整食（ゼリー・プリン・ムース状）" },
  { code: "2-1", label: "2-1 嚥下調整食（なめらかなペースト）" },
  { code: "2-2", label: "2-2 嚥下調整食（粒のあるペースト）" },
  { code: "3", label: "3 嚥下調整食（形はあるが押しつぶせる）" },
  { code: "4", label: "4 嚥下調整食（やわらかい・箸で切れる）" },
];
export type Thickness = "なし" | "薄いとろみ" | "中間のとろみ" | "濃いとろみ";
export const THICKNESS: Thickness[] = ["なし", "薄いとろみ", "中間のとろみ", "濃いとろみ"];

/** Therapeutic diets of the fictional hospital. `special` = counts for 特別食加算 (set from the rules). */
export interface Therapeutic {
  code: string;
  name: string;
  /** What is set with it. */
  params: ("energyKcal" | "saltG" | "proteinG")[];
  aliases: string[];
}
export const THERAPEUTICS: Therapeutic[] = [
  { code: "TD-ENERGY", name: "エネルギー調整食（糖尿病）", params: ["energyKcal"], aliases: ["糖尿病食", "糖尿食", "エネルギー制限", "カロリー制限"] },
  { code: "TD-SALT-HEART", name: "減塩食（心臓疾患）", params: ["saltG"], aliases: ["心臓食", "減塩食", "塩分制限", "心不全食"] },
  { code: "TD-KIDNEY", name: "腎臓食", params: ["energyKcal", "proteinG", "saltG"], aliases: ["腎臓食", "蛋白制限", "タンパク制限", "腎食"] },
  { code: "TD-LIVER", name: "肝臓食", params: ["energyKcal", "proteinG"], aliases: ["肝臓食", "肝食"] },
  { code: "TD-PANCREAS", name: "膵臓食", params: ["energyKcal"], aliases: ["膵臓食", "膵炎食", "脂肪制限"] },
  { code: "TD-LIPID", name: "脂質異常症食", params: ["energyKcal"], aliases: ["脂質異常症食", "高脂血症食"] },
  { code: "TD-ULCER", name: "胃潰瘍食", params: [], aliases: ["胃潰瘍食", "潰瘍食"] },
  { code: "TD-LOWRESIDUE", name: "低残渣食（検査食）", params: [], aliases: ["低残渣", "検査食", "注腸食"] },
];
export const findTherapeutic = (code?: string) => THERAPEUTICS.find((t) => t.code === code);

/** Enteral nutrition products of the fictional hospital (generic names). */
export const TUBE_PRODUCTS = [
  { code: "EN-STD", name: "標準濃厚流動食（1 kcal/mL）", kcalPerMl: 1 },
  { code: "EN-HIGH", name: "濃厚流動食（1.5 kcal/mL）", kcalPerMl: 1.5 },
  { code: "EN-SEMI", name: "半固形の流動食（1 kcal/mL）", kcalPerMl: 1 },
];

export interface DietOrder {
  id: string;
  patientId: string;
  /** Effective from this meal; stays until the next order. */
  from: { day: DayOffset; meal: Meal };
  kind: DietKind;
  staple?: Staple;
  side?: SideForm;
  therapeutic?: string;
  energyKcal?: number;
  saltG?: number;
  proteinG?: number;
  dysphagia?: DysphagiaCode;
  thickness?: Thickness;
  tube?: { product: string; mlPerMeal: number; ratePerH?: number };
  /** Why the patient is fasting (絶食). */
  npoReason?: string;
  comment?: string;
  by: string;
  at: { day: DayOffset; time: string };
}

const mealIndex = (day: number, meal: Meal) => day * 3 + MEALS.indexOf(meal);

/** The diet in force at this meal. Later orders (and later `from`) win. */
export function dietAt(orders: DietOrder[], patientId: string, day: number, meal: Meal): DietOrder | undefined {
  const idx = mealIndex(day, meal);
  return orders
    .filter((o) => o.patientId === patientId && mealIndex(o.from.day, o.from.meal) <= idx)
    .sort((a, b) => mealIndex(a.from.day, a.from.meal) - mealIndex(b.from.day, b.from.meal) || abs(a.at.day, a.at.time) - abs(b.at.day, b.at.time))
    .at(-1);
}

/** One line for the note, the grid and the worksheet. */
export function dietLabel(o?: DietOrder): string {
  if (!o) return "指示なし";
  if (o.kind === "絶食") return `絶食${o.npoReason ? `（${o.npoReason}）` : ""}`;
  if (o.kind === "経管栄養") {
    const p = TUBE_PRODUCTS.find((x) => x.code === o.tube?.product);
    return `経管栄養 ${p?.name ?? ""} ${o.tube?.mlPerMeal ?? "?"}mL/回${o.tube?.ratePerH ? `（${o.tube.ratePerH}mL/時）` : ""}`;
  }
  const bits: string[] = [];
  if (o.kind === "治療食") {
    const t = findTherapeutic(o.therapeutic);
    bits.push(t?.name ?? "治療食");
    if (o.energyKcal) bits.push(`${o.energyKcal}kcal`);
    if (o.proteinG) bits.push(`蛋白${o.proteinG}g`);
    if (o.saltG) bits.push(`塩分${o.saltG}g未満`);
  } else if (o.kind === "嚥下調整食") {
    bits.push(`嚥下調整食 ${o.dysphagia ?? "?"}`);
  } else bits.push(o.kind);
  if (o.staple && o.kind !== "流動食" && o.kind !== "嚥下調整食") bits.push(o.staple);
  if (o.side && o.side !== "常菜" && o.kind !== "嚥下調整食") bits.push(o.side);
  if (o.thickness && o.thickness !== "なし") bits.push(`水分は${o.thickness}`);
  return bits.join("・");
}

/** Exams that hold a meal (fictional hospital rule): the last meal served before the exam, that day. */
export const FASTING_EXAMS: Record<string, string> = { "PHY-ABDUS": "腹部エコー", "CT-CONTRAST": "造影CT" };

export function heldBy(entries: OrderEntry[], day: number, meal: Meal): string[] {
  const out: string[] = [];
  for (const e of entries) {
    if (e.status === "中止") continue;
    const o = e.order;
    let label: string | null = null;
    if (o.type === "physio" && FASTING_EXAMS[o.test]) label = FASTING_EXAMS[o.test];
    if (o.type === "imaging" && o.modality === "CT" && o.contrast !== "単純") label = FASTING_EXAMS["CT-CONTRAST"];
    if (!label || (o.type !== "physio" && o.type !== "imaging")) continue;
    const at = examAt(o, abs(e.day, e.time));
    if (Math.floor(at / 1440) !== day) continue;
    const before = MEALS.filter((m) => abs(day, MEAL_TIMES[m]) < at).at(-1);
    if (before === meal) out.push(`${label}（${String(Math.floor((at % 1440) / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}）`);
  }
  return out;
}

/** Past the kitchen's deadline for this meal (the change then needs a phone call). */
export function pastDeadline(day: number, meal: Meal, nowAbs: number): boolean {
  const d = MEAL_DEADLINE[meal];
  return nowAbs > abs(day - d.dayBefore, d.time);
}

/** The first meal whose deadline has not passed (the earliest a change reaches the kitchen in time). */
export function nextOrderableMeal(nowAbs: number): { day: number; meal: Meal } {
  for (let day = Math.floor(nowAbs / 1440); ; day++) for (const meal of MEALS) if (!pastDeadline(day, meal, nowAbs)) return { day, meal };
}

/** The next meal still to be served (may be past its deadline). */
export function nextMeal(nowAbs: number): { day: number; meal: Meal } {
  for (let day = Math.floor(nowAbs / 1440); ; day++) for (const meal of MEALS) if (abs(day, MEAL_TIMES[meal]) > nowAbs) return { day, meal };
}

/** FICTIONAL starting diets (from admission). */
export const INITIAL_DIETS: DietOrder[] = [
  { id: "diet-90010231", patientId: "90010231", from: { day: -3, meal: "夕" }, kind: "常食", staple: "米飯", side: "常菜", by: "山本（専攻医）", at: { day: -3, time: "15:00" } },
  { id: "diet-90010244", patientId: "90010244", from: { day: -1, meal: "夕" }, kind: "絶食", npoReason: "誤嚥性肺炎。嚥下の評価まで", by: "山本（専攻医）", at: { day: -1, time: "14:00" } },
  { id: "diet-90010198", patientId: "90010198", from: { day: -5, meal: "夕" }, kind: "治療食", therapeutic: "TD-SALT-HEART", saltG: 6, staple: "米飯", side: "常菜", comment: "水分制限 1,000mL/日（食事の水分を含む）", by: "山本（専攻医）", at: { day: -5, time: "16:00" } },
  { id: "diet-90010260", patientId: "90010260", from: { day: -2, meal: "昼" }, kind: "常食", staple: "米飯", side: "常菜", by: "山本（専攻医）", at: { day: -2, time: "10:30" } },
];
