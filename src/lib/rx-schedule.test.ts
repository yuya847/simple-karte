import { describe, expect, it } from "vitest";
import { nextRegularDay, regularDayOffset } from "./rx-schedule";
describe("架空の病院の定期処方日", () => {
  it("東は火曜、西は木曜。元の日付を書き換えない", () => {
    const today = new Date(2026, 10, 4);
    expect(nextRegularDay("5階東", today)).toEqual(new Date(2026, 10, 10));
    expect(nextRegularDay("5階西病棟", today)).toEqual(new Date(2026, 10, 5));
    expect(today.getDate()).toBe(4);
    expect(regularDayOffset("5階東", today)).toBe(6);
    expect(regularDayOffset("未設定", today)).toBeNull();
  });
  it("当日なら次週、月と年を越えられる。未設定はnull", () => {
    expect(nextRegularDay("5階東", new Date(2026, 10, 10))).toEqual(new Date(2026, 10, 17));
    expect(nextRegularDay("5階西", new Date(2026, 11, 31))).toEqual(new Date(2027, 0, 7));
    expect(nextRegularDay("未設定", new Date(2026, 10, 4))).toBeNull();
  });
});
