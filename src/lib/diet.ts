// 食事オーダー（入院中の食事）. The doctor orders the diet; Claude only copies spoken words into the
// fields; which meal it starts at, the kitchen's deadlines, meals held for tests and the billing
// class are code. The diet changes from a given meal and stays until the next order.

import { abs } from "./flowsheet";
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
export const FASTING_EXAMS: Record<string, string> = { "PHY-ABDUS": "腹部エコー", "CT-CONTRAST": "造影CT", "PHY-EGD": "胃カメラ", "PHY-CF": "大腸内視鏡", "PHY-BF": "気管支鏡" };

/** `examTime` gives an exam order's time (minutes from today 00:00); passed in to keep this module free of exams.ts. */
export type ExamTime = (e: OrderEntry) => number;

/** Why a meal is not served (食止め): an exam, or the patient is away (外泊・外出) or has left (退院). */
export interface MealHold {
  kind: "検査" | "外泊" | "外出" | "退院";
  label: string;
  /** The order that holds the meal, and when it was ordered (to compare with the kitchen's deadline). */
  orderId: string;
  orderedAt: { day: DayOffset; time: string };
}

/**
 * 外泊・外出・退院 hold the meals whose serving time falls while the patient is off the ward
 * (fictional hospital rule): from the time of leaving (that meal included) up to the time of coming back
 * (a meal served at the time of coming back is served). 退院 has no coming back.
 */
export const LEAVE_HOLD_RULE = "外泊・外出は出る時刻から戻る時刻まで、退院は出る時刻からあとの、配膳の時刻（朝7:30・昼12:00・夕18:00）がある食事を止める（架空の病院の取り決め）";

const relDay = (d: number) => (d === 0 ? "今日" : d === 1 ? "明日" : d === 2 ? "明後日" : d === -1 ? "昨日" : d > 0 ? `${d}日後` : `${-d}日前`);
const clock = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;

/** Every hold of one meal, with its reason. */
export function mealHolds(entries: OrderEntry[], day: number, meal: Meal, examTime: ExamTime): MealHold[] {
  const out: MealHold[] = [];
  const served = abs(day, MEAL_TIMES[meal]);
  for (const e of entries) {
    if (e.status === "中止") continue;
    const o = e.order;
    const orderedAt = { day: e.day, time: e.time };
    if (o.type === "procedure" && o.leave) {
      const l = o.leave;
      const from = abs(l.from.day, l.from.time);
      const back = l.back ? abs(l.back.day, l.back.time) : null;
      if (l.kind !== "退院" && back === null) continue; // 外泊・外出 need a time to come back (the draft stops without it)
      if (served < from || (back !== null && served >= back)) continue;
      const span = `${relDay(l.from.day)} ${l.from.time}${l.back ? `〜${relDay(l.back.day)} ${l.back.time}` : ""}`;
      out.push({ kind: l.kind, label: `${l.kind}（${span}）`, orderId: e.id, orderedAt });
      continue;
    }
    let label: string | null = null;
    if (o.type === "physio" && FASTING_EXAMS[o.test]) label = FASTING_EXAMS[o.test];
    if (o.type === "imaging" && o.modality === "CT" && o.contrast !== "単純") label = FASTING_EXAMS["CT-CONTRAST"];
    if (!label || (o.type !== "physio" && o.type !== "imaging")) continue;
    const at = examTime(e);
    if (Math.floor(at / 1440) !== day) continue;
    const before = MEALS.filter((m) => abs(day, MEAL_TIMES[m]) < at).at(-1);
    if (before === meal) out.push({ kind: "検査", label: `${label}（${clock(at)}）`, orderId: e.id, orderedAt });
  }
  return out;
}

/** What holds the meal, in words (for the grid and the calendar). */
export function heldBy(entries: OrderEntry[], day: number, meal: Meal, examTime: ExamTime): string[] {
  return mealHolds(entries, day, meal, examTime).map((h) => h.label);
}

/** The heading of a held meal: 「検査で止め」「外泊で止め」…, or 「食止め」 when there are different reasons. */
export function holdTitle(holds: Pick<MealHold, "kind">[]): string {
  const kinds = [...new Set(holds.map((h) => h.kind))];
  return kinds.length === 1 ? `${kinds[0]}で止め` : "食止め";
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

// ---------- 入院時食事療養（令和8年6月〜）----------
// 告示第76号・第77号、保医発0305第16号. Amounts come from the master (codes below).
export const MEAL_CODES = {
  /** 入院時食事療養（１）（２以外）730円 */
  normal: "197000110",
  /** 入院時食事療養（１）流動食のみ（市販の流動食だけを経管で）665円 */
  liquidOnly: "197003110",
  /** 特別食加算 76円 */
  special: "197000470",
} as const;

/** The fictional hospital has not filed the 届出 for 嚥下調整食 as a 特別食 (new in R8; four requirements). */
export const DYSPHAGIA_SPECIAL_FILED = false;

/** Whether this meal counts as 特別食 (code reads the order; the doctor's 食事箋 is the order itself). */
export function specialDiet(o: DietOrder): { special: boolean; note: string; review?: string } {
  if (o.kind === "経管栄養") return { special: false, note: "市販の流動食だけを経管で出す食事は「流動食のみ」（特別食加算はつかない）" };
  if (o.kind === "嚥下調整食")
    return DYSPHAGIA_SPECIAL_FILED
      ? { special: true, note: "嚥下調整食（令和8年度から特別食）", review: "単にペースト・刻みにしただけのものは対象外" }
      : { special: false, note: "嚥下調整食の特別食加算は届出が要る（架空の病院は未届出）" };
  if (o.kind !== "治療食") return { special: false, note: "" };
  switch (o.therapeutic) {
    case "TD-ENERGY":
      return { special: true, note: "糖尿食" };
    case "TD-KIDNEY":
      return { special: true, note: "腎臓食" };
    case "TD-LIVER":
      return { special: true, note: "肝臓食" };
    case "TD-PANCREAS":
      return { special: true, note: "膵臓食" };
    case "TD-ULCER":
      return { special: true, note: "胃潰瘍食（流動食は除く）" };
    case "TD-SALT-HEART":
      return o.saltG !== undefined && o.saltG <= 6 ? { special: true, note: "心臓疾患の減塩食（食塩6g未満は腎臓食に準じる）" } : { special: false, note: "減塩食は食塩6g未満のときだけ特別食" };
    case "TD-LIPID":
      return { special: true, note: "脂質異常症食", review: "LDL 140以上・HDL 40未満・中性脂肪 150以上（mg/dL）のいずれかか、高度肥満症（BMI 35以上など）であることを確かめる" };
    case "TD-LOWRESIDUE":
      return { special: true, note: "検査食", review: "大腸X線・大腸内視鏡の前の低残渣食か潜血食に限る" };
    default:
      return { special: false, note: "" };
  }
}

/** Meals served on a day by the diet orders: each served meal with its class. */
export function mealsServed(orders: DietOrder[], entries: OrderEntry[], patientId: string, day: number, untilAbs: number, examTime: ExamTime) {
  const out: { meal: Meal; code: string; special: boolean; note: string; review?: string }[] = [];
  for (const meal of MEALS) {
    if (abs(day, MEAL_TIMES[meal]) > untilAbs) continue;
    const o = dietAt(orders, patientId, day, meal);
    if (!o || o.kind === "絶食" || heldBy(entries, day, meal, examTime).length) continue;
    const s = specialDiet(o);
    out.push({ meal, code: o.kind === "経管栄養" ? MEAL_CODES.liquidOnly : MEAL_CODES.normal, ...s });
  }
  return out;
}
