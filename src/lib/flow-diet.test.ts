import { describe, expect, it } from "vitest";
import { INITIAL_DIETS, type DietOrder } from "./diet";
import { dietDayCell, dietShort, mealDiets } from "./flow-diet";
import type { OrderEntry } from "./types";

const noExam = () => 0;

describe("経過表の食種", () => {
  it("short names for a narrow cell", () => {
    expect(dietShort(undefined)).toBe("指示なし");
    expect(dietShort(INITIAL_DIETS[0])).toBe("常食");
    expect(dietShort(INITIAL_DIETS[1])).toBe("絶食");
    expect(dietShort(INITIAL_DIETS[2])).toBe("心臓食 塩6g");
    expect(dietShort({ ...INITIAL_DIETS[0], staple: "全粥" })).toBe("常食 全粥");
    expect(dietShort({ ...INITIAL_DIETS[0], kind: "嚥下調整食", dysphagia: "2-1" })).toBe("嚥下2-1");
  });

  it("one cell per day; a change in the day is joined with →", () => {
    const later: DietOrder = { ...INITIAL_DIETS[1], id: "x", from: { day: 0, meal: "昼" }, kind: "常食", staple: "全粥", npoReason: undefined, at: { day: 0, time: "09:00" } };
    const meals = mealDiets([...INITIAL_DIETS, later], [], "90010244", [-1, 0, 1], noExam);
    // Admitted the day before yesterday's 夕: the meals before the first order are left out.
    expect(dietDayCell(meals, -1)).toMatchObject({ text: "夕〜絶食", changed: false, empty: false });
    const today = dietDayCell(meals, 0);
    expect(today.text).toBe("絶食→常食 全粥");
    expect(today.changed).toBe(true);
    expect(today.title.split("\n")).toHaveLength(3);
    expect(dietDayCell(meals, 1)).toMatchObject({ text: "常食 全粥", changed: false });
  });

  it("a held meal shows why (外泊で止め)", () => {
    const leave: OrderEntry = {
      kind: "order",
      id: "lv",
      day: 0,
      time: "09:00",
      author: "医師",
      status: "有効",
      order: { type: "procedure", code: "PROC-LEAVE", schedule: { kind: "once" }, start: { day: 0 }, leave: { kind: "外出", from: { day: 0, time: "11:00" }, back: { day: 0, time: "15:00" }, destination: "自宅", note: "" } },
    } as OrderEntry;
    const meals = mealDiets(INITIAL_DIETS, [leave], "90010231", [0], noExam);
    const c = dietDayCell(meals, 0);
    expect(c.text).toBe("常食→外出で止め→常食");
    expect(c.held).toBe(true);
    expect(c.changed).toBe(false);
  });

  it("no order at all: an empty cell", () => {
    const meals = mealDiets(INITIAL_DIETS, [], "90010231", [-5], noExam);
    expect(dietDayCell(meals, -5)).toMatchObject({ text: "", empty: true });
  });
});
