import { describe, expect, it } from "vitest";
import { addDaily, prevWeightOf, withToday } from "./daily-input";

describe("今日の尿量・食事・体重", () => {
  it("adds urine and stools, sets a meal and the weight", () => {
    let a = addDaily(undefined, { urineMl: 300 });
    a = addDaily(a, { urineMl: 250, stools: 1, meal: { slot: 1, tenths: 7 }, weightKg: 61.2 });
    expect(a).toEqual({ urineMl: 550, stools: 1, meals: [null, 7, null], weightKg: 61.2 });
    const days = withToday([{ day: -1, weightKg: 62 }, { day: 0, urineMl: 400, meals: [8, null, null] }], a);
    expect(days.find((d) => d.day === 0)).toEqual({ day: 0, urineMl: 950, stools: 1, meals: [8, 7, null], weightKg: 61.2 });
    expect(prevWeightOf(days)).toEqual({ day: -1, kg: 62 });
  });
});
