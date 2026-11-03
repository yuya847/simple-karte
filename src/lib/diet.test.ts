import { describe, expect, it } from "vitest";
import { INITIAL_DIETS, dietAt, dietLabel, heldBy, nextMeal, nextOrderableMeal, pastDeadline, type DietOrder } from "./diet";
import type { OrderEntry } from "./types";

describe("食事オーダー", () => {
  it("the diet in force at a meal; later orders win", () => {
    const later: DietOrder = { ...INITIAL_DIETS[1], id: "x", from: { day: 1, meal: "昼" }, kind: "嚥下調整食", dysphagia: "1j", npoReason: undefined, at: { day: 0, time: "10:00" } };
    const all = [...INITIAL_DIETS, later];
    expect(dietLabel(dietAt(all, "90010244", 1, "朝"))).toBe("絶食（誤嚥性肺炎。嚥下の評価まで）");
    expect(dietLabel(dietAt(all, "90010244", 1, "昼"))).toBe("嚥下調整食 1j");
    expect(dietLabel(dietAt(all, "90010198", 0, "昼"))).toBe("減塩食（心臓疾患）・塩分6g未満・米飯");
    expect(dietAt(all, "90010231", -4, "夕")).toBeUndefined();
  });
  it("kitchen deadlines: 朝は前日17:00、昼は当日10:00、夕は当日15:00（架空）", () => {
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
    expect(heldBy([echo("14:00")], 1, "昼")).toEqual(["腹部エコー（14:00）"]);
    expect(heldBy([echo("14:00")], 1, "朝")).toEqual([]);
    expect(heldBy([echo("09:00")], 1, "朝")).toEqual(["腹部エコー（09:00）"]);
  });
});
