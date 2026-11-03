import { describe, expect, it } from "vitest";
import { INITIAL_DIETS, type DietOrder } from "./diet";
import { examAt, type PhysioOrder } from "./exams";
import { abs } from "./flowsheet";
import type { OrderEntry } from "./types";
import { deadlineOf, deadlineText, mealForm, mealType, wardMeals, type MealPerson } from "./ward-meals";

const t = (e: OrderEntry) => examAt(e.order as PhysioOrder, abs(e.day, e.time));
const person = (id: string, name: string, room: string, entries: OrderEntry[] = [], cautions: string[] = [], allergies: string[] = []): MealPerson => ({ patient: { id, name, allergies, cautions }, room, entries });
const stay: OrderEntry = {
  kind: "order",
  id: "leave",
  day: 0,
  time: "10:30",
  author: "山本（専攻医）",
  status: "有効",
  order: { type: "procedure", code: "PROC-LEAVE", leave: { kind: "外泊", from: { day: 0, time: "13:00" }, back: { day: 1, time: "17:00" }, destination: "自宅", note: "" }, schedule: { kind: "once" }, start: { day: 0, time: "13:00" } },
};
// An abdominal echo today 14:00 (holds lunch), stopped at 10:30 — after lunch's deadline (10:00).
const echoStopped: OrderEntry = { kind: "order", id: "echo", day: -1, time: "15:00", author: "山本（専攻医）", status: "中止", stoppedOn: 0, stoppedTime: "10:30", order: { type: "physio", test: "PHY-ABDUS", when: { day: 0, time: "14:00", priority: "予約" }, place: "検査室" } as unknown as OrderEntry["order"] };
// 大浦さん: 絶食 → 嚥下調整食 1j from today's dinner, ordered at 15:30 (dinner's deadline is 15:00).
const swallow: DietOrder = { ...INITIAL_DIETS[1], id: "d-1j", from: { day: 0, meal: "夕" }, kind: "嚥下調整食", dysphagia: "1j", npoReason: undefined, by: "山本（専攻医）", at: { day: 0, time: "15:30" } };
const diets = [...INITIAL_DIETS, swallow];
const people = [
  person("90010231", "佐倉 修", "512A", [echoStopped], ["転倒注意"], ["ヨード造影剤（蕁麻疹）"]),
  person("90010244", "大浦", "513A"),
  person("90010198", "北村", "515A", [], ["水分制限 1,000mL/日"]),
  person("90010260", "森", "516A", [stay]),
  person("new", "新しい患者", "518A"),
];
const now = abs(0, "16:00");
const w = wardMeals(people, diets, [0, 1], now, t);
const slot = (day: number, meal: string) => w.slots.find((s) => s.day === day && s.meal === meal)!;
const cell = (pid: string, day: number, meal: string) => w.rows.find((r) => r.patientId === pid)!.cells.find((c) => c.day === day && c.meal === meal)!;

describe("病棟の食事（食種・形態・食止め・食数）", () => {
  it("names the 食種 and the 形態 of a diet", () => {
    expect(mealType(INITIAL_DIETS[2])).toBe("減塩食（心臓疾患） 塩分6g未満");
    expect(mealForm(INITIAL_DIETS[2])).toBe("米飯・常菜");
    expect(mealType(swallow)).toBe("嚥下調整食 1j");
    expect(mealType(undefined)).toBe("指示なし");
    expect(mealForm({ ...INITIAL_DIETS[0], kind: "経管栄養", tube: { product: "EN-STD", mlPerMeal: 300, ratePerH: 150 } })).toBe("300mL/回・150mL/時");
  });
  it("counts the 食数 per 食種 for each meal; 絶食・食止め・指示なし are not counted", () => {
    expect(slot(0, "朝")).toMatchObject({ total: 3, npo: 1, held: 0, none: 1 });
    expect(slot(0, "朝").byType[0]).toEqual({ type: "常食", count: 2, forms: [{ form: "米飯・常菜", count: 2 }] });
    // 今日の夕: 森さんは外泊で止め、大浦さんは嚥下調整食から
    expect(slot(0, "夕")).toMatchObject({ total: 3, npo: 0, held: 1, none: 1, late: 1 });
    expect(slot(0, "夕").byType.map((b) => `${b.type}×${b.count}`)).toEqual(["減塩食（心臓疾患） 塩分6g未満×1", "常食×1", "嚥下調整食 1j×1"]);
    expect(slot(1, "朝").total).toBe(3);
    expect(slot(1, "夕").total).toBe(4); // 森さんは17:00に戻る
  });
  it("marks the meal where the diet changes, the holds and the meals already served", () => {
    expect(cell("90010244", 0, "夕").changed).toBe(true);
    expect(cell("90010244", 1, "朝").changed).toBe(false);
    expect(cell("90010260", 1, "昼").holds.map((h) => h.kind)).toEqual(["外泊"]);
    expect(cell("90010260", 0, "昼")).toMatchObject({ serve: true, past: true });
  });
  it("flags changes made after the kitchen's deadline (架空の病院の取り決め)", () => {
    expect(cell("90010244", 0, "夕").late).toEqual(["締切後の食事の指示（今日 15:30 山本（専攻医））"]);
    expect(cell("90010244", 1, "朝").late).toEqual([]); // 明日の朝の締切は今日 17:00
    expect(cell("90010260", 0, "夕").late).toEqual([]); // 外泊は 10:30 に出ていた（夕の締切 15:00 より前）
    expect(cell("90010231", 0, "昼").late).toEqual(["締切後に食止めを取り消し：腹部エコー（14:00）（今日 10:30）"]);
    expect(cell("90010231", 0, "昼").serve).toBe(true);
  });
  it("collects allergies and food cautions without repeating them", () => {
    const kita = w.rows.find((r) => r.patientId === "90010198")!;
    expect(kita.notes).toEqual(["水分制限 1,000mL/日（食事の水分を含む）"]);
    expect(w.rows.find((r) => r.patientId === "90010231")!).toMatchObject({ allergies: ["ヨード造影剤（蕁麻疹）"], notes: [] });
  });
  it("the deadline of each meal and the time left", () => {
    expect(deadlineOf(1, "朝")).toEqual({ day: 0, time: "17:00" });
    expect(deadlineText(slot(1, "朝"), now)).toBe("締切 前日 17:00（あと1時間）");
    expect(deadlineText(slot(0, "夕"), now)).toBe("締切 当日 15:00（過ぎました）");
    const early = wardMeals(people, diets, [0], abs(0, "09:30"), t).slots.find((s) => s.meal === "昼")!;
    expect(deadlineText(early, abs(0, "09:30"))).toBe("締切 当日 10:00（あと30分）");
  });
});
