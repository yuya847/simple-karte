import { describe, expect, it } from "vitest";
import { examAt, type PhysioOrder } from "./exams";
import { abs } from "./flowsheet";
import { INITIAL_DIETS, MEALS, dietAt, dietLabel, heldBy, holdTitle, mealHolds, nextMeal, nextOrderableMeal, pastDeadline, type DietOrder } from "./diet";
import type { LeaveOrder, OrderEntry } from "./types";

describe("食事オーダー", () => {
  it("the diet in force at a meal; later orders win", () => {
    const later: DietOrder = { ...INITIAL_DIETS[1], id: "x", from: { day: 1, meal: "昼" }, kind: "嚥下調整食", dysphagia: "1j", npoReason: undefined, at: { day: 0, time: "10:00" } };
    const all = [...INITIAL_DIETS, later];
    expect(dietLabel(dietAt(all, "90010244", 1, "朝"))).toBe("絶食（誤嚥性肺炎。嚥下の評価まで）");
    expect(dietLabel(dietAt(all, "90010244", 1, "昼"))).toBe("嚥下調整食 1j");
    expect(dietLabel(dietAt(all, "90010198", 0, "昼"))).toBe("減塩食（心臓疾患）・塩分6g未満・米飯");
    expect(dietAt(all, "90010231", -4, "夕")).toBeUndefined();
  });
  it("kitchen deadlines: 朝は前日17:00、昼は当日10:00、夕は当日15:00", () => {
    const now = 9 * 60 + 30; // today 09:30
    expect(pastDeadline(0, "昼", now)).toBe(false);
    expect(pastDeadline(1, "朝", now)).toBe(false);
    expect(pastDeadline(0, "朝", now)).toBe(true);
    expect(nextOrderableMeal(now)).toEqual({ day: 0, meal: "昼" });
    expect(nextOrderableMeal(16 * 60)).toEqual({ day: 1, meal: "朝" });
    expect(nextOrderableMeal(17 * 60 + 1)).toEqual({ day: 1, meal: "昼" });
    expect(nextMeal(now)).toEqual({ day: 0, meal: "昼" });
  });
  it("an afternoon abdominal echo holds lunch; a morning one holds breakfast", () => {
    const echo = (time: string): OrderEntry => ({ kind: "order", id: "e", day: 0, time: "08:00", author: "x", status: "有効", order: { type: "physio", test: "PHY-ABDUS", when: { day: 1, time, priority: "予約" }, place: "検査室" } as unknown as OrderEntry["order"] });
    const t = (e: OrderEntry) => examAt(e.order as PhysioOrder, abs(e.day, e.time));
    expect(heldBy([echo("14:00")], 1, "昼", t)).toEqual(["腹部エコー（14:00）"]);
    expect(heldBy([echo("14:00")], 1, "朝", t)).toEqual([]);
    expect(heldBy([echo("09:00")], 1, "朝", t)).toEqual(["腹部エコー（09:00）"]);
  });
});

describe("外泊・外出・退院の食止め", () => {
  const leave = (l: LeaveOrder, status: OrderEntry["status"] = "有効"): OrderEntry => ({
    kind: "order",
    id: `leave-${l.kind}`,
    day: 0,
    time: "09:00",
    author: "山本（専攻医）",
    status,
    order: { type: "procedure", code: "PROC-LEAVE", leave: l, schedule: { kind: "once" }, start: { day: l.from.day, time: l.from.time } },
  });
  const t = () => 0;
  const held = (entries: OrderEntry[], day: number) => MEALS.filter((m) => mealHolds(entries, day, m, t).length > 0);
  it("外泊: the meals served between leaving and coming back are held", () => {
    const stay = leave({ kind: "外泊", from: { day: 0, time: "13:00" }, back: { day: 1, time: "17:00" }, destination: "自宅", note: "" });
    expect(held([stay], 0)).toEqual(["夕"]);
    expect(held([stay], 1)).toEqual(["朝", "昼"]);
    expect(mealHolds([stay], 0, "夕", t)).toEqual([{ kind: "外泊", label: "外泊（今日 13:00〜明日 17:00）", orderId: "leave-外泊", orderedAt: { day: 0, time: "09:00" } }]);
    expect(holdTitle(mealHolds([stay], 1, "朝", t))).toBe("外泊で止め");
  });
  it("外出: leaving at serving time holds that meal; coming back at serving time does not", () => {
    expect(held([leave({ kind: "外出", from: { day: 1, time: "12:00" }, back: { day: 1, time: "15:00" }, destination: "銀行", note: "" })], 1)).toEqual(["昼"]);
    expect(held([leave({ kind: "外出", from: { day: 1, time: "09:00" }, back: { day: 1, time: "12:00" }, destination: "銀行", note: "" })], 1)).toEqual([]);
  });
  it("退院 holds every meal from leaving on; a stopped order holds nothing", () => {
    const out = leave({ kind: "退院", from: { day: 1, time: "10:00" }, destination: "自宅", note: "" });
    expect(held([out], 1)).toEqual(["昼", "夕"]);
    expect(held([out], 2)).toEqual(["朝", "昼", "夕"]);
    expect(held([leave({ kind: "外泊", from: { day: 0, time: "13:00" }, back: { day: 1, time: "17:00" }, destination: "自宅", note: "" }, "中止")], 1)).toEqual([]);
  });
  it("a 外泊 without a time to come back holds nothing (the draft is stopped before it can be confirmed)", () => {
    expect(held([leave({ kind: "外泊", from: { day: 0, time: "13:00" }, destination: "自宅", note: "" })], 1)).toEqual([]);
  });
  it("different reasons are 「食止め」", () => {
    expect(holdTitle([{ kind: "検査" }, { kind: "外出" }])).toBe("食止め");
  });
});
