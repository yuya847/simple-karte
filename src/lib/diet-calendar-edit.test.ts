import { describe, expect, it } from "vitest";
import { calendarDietDrafts, calendarDietOrders } from "./diet-calendar-edit";
import { dietAt, type DietOrder } from "./diet";
import { mealCell } from "./ward-meals";

const base: DietOrder = { id: "base", patientId: "p", from: { day: -1, meal: "朝" }, kind: "常食", staple: "全粥", comment: "卵禁止", by: "医師", at: { day: -1, time: "09:00" } };
const edit: DietOrder = { ...base, id: "edit", from: { day: 1, meal: "昼" }, kind: "絶食", at: { day: 0, time: "09:00" } };
describe("カレンダーからの食事変更", () => {
  it("選んだ食事から変更し、既存の次の指示は残す", () => {
    const future = { ...base, id: "future", from: { day: 3, meal: "朝" as const } };
    const all = [base, future, ...calendarDietOrders([base, future], edit, "from")];
    expect(dietAt(all, "p", 1, "朝")).toEqual(base);
    expect(dietAt(all, "p", 2, "夕")?.kind).toBe("絶食");
    expect(dietAt(all, "p", 3, "朝")).toEqual(future);
  });
  it("当日だけなら翌朝に元の主食と禁止食品を戻す", () => {
    const original = structuredClone(base);
    const added = calendarDietOrders([base], edit, "day");
    const all = [base, ...added];
    expect(dietAt(all, "p", 1, "夕")?.kind).toBe("絶食");
    expect(dietAt(all, "p", 2, "朝")).toMatchObject({ kind: "常食", staple: "全粥", comment: "卵禁止" });
    expect(base).toEqual(original);
    expect(calendarDietDrafts(added, () => "draft")).toHaveLength(2);
  });
  it("翌朝の予約済み指示を重ねて上書きしない", () => {
    const future = { ...base, id: "future", kind: "流動食" as const, from: { day: 2, meal: "朝" as const } };
    expect(calendarDietOrders([base, future], edit, "day")).toEqual([edit]);
  });
  it("他患者の指示を復元に使わず、元の指示がなければ止める", () => {
    expect(() => calendarDietOrders([{ ...base, patientId: "other" }], edit, "day")).toThrow("翌朝");
  });
  it("確定後の既存の配膳計算に変更が渡る", () => {
    const all = [base, ...calendarDietOrders([base], edit, "day")];
    const person = { patient: { id: "p" }, entries: [] } as unknown as Parameters<typeof mealCell>[0];
    expect(mealCell(person, all, 1, "昼", 0, () => 0).type).toBe("絶食");
    expect(mealCell(person, all, 2, "朝", 0, () => 0).type).toBe("常食");
  });
});
