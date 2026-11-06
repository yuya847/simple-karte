import { describe, expect, it } from "vitest";
import { dietAt, type DietOrder } from "./diet";
import { afterMeals, dietChangeOrders, undoDietChange } from "./diet-change";
import { calendarDietDrafts } from "./diet-calendar-edit";
import { mealCell } from "./ward-meals";

const original: DietOrder = { id: "base", patientId: "p", kind: "常食", staple: "米飯", side: "常菜", prohibited: "卵", from: { day: -1, meal: "朝" }, at: { day: -1, time: "09:00" }, by: "医師" };
const base: DietOrder = { ...original, kind: "絶食", npoReason: "検査", at: { day: 0, time: "06:00" } };
let seq = 0;
const id = () => `new-${seq++}`;
describe("回数を選ぶ食事変更", () => {
  it.each(["朝", "昼", "夕"] as const)("%sの1回だけ変更し、次の食事で元の内容に戻す", meal => {
    const at = { day: 1, meal };
    const before = structuredClone(original);
    const added = dietChangeOrders([original], base, at, { kind: "once" }, id);
    expect(added).toHaveLength(2);
    expect(added[0].id).not.toBe(added[1].id);
    const end = afterMeals(at, 1);
    expect(dietAt([original, ...added], "p", at.day, meal)?.kind).toBe("絶食");
    expect(dietAt([original, ...added], "p", end.day, end.meal)).toMatchObject({ kind: "常食", staple: "米飯", prohibited: "卵" });
    expect(original).toEqual(before);
  });
  it("夕から3回は翌日の昼まで、翌夕に戻る", () => {
    const added = dietChangeOrders([original], base, { day: 1, meal: "夕" }, { kind: "meals", count: 3 }, id);
    expect(added[1].from).toEqual({ day: 2, meal: "夕" });
    expect(dietAt([original, ...added], "p", 2, "昼")?.kind).toBe("絶食");
    expect(calendarDietDrafts(added, id)).toHaveLength(2);
  });
  it("ずっとは1件で、予約済みの次の指示を残す", () => {
    const future = { ...original, id: "future", from: { day: 2, meal: "昼" as const }, kind: "流動食" as const };
    const added = dietChangeOrders([original, future], base, { day: 1, meal: "朝" }, { kind: "until-changed" }, id);
    expect(added).toHaveLength(1);
    expect(dietAt([original, future, ...added], "p", 2, "昼")).toEqual(future);
  });
  it("回数の途中や終了時に予約済み指示があれば、その指示を優先する", () => {
    for (const meal of ["昼", "夕"] as const) {
      const future = { ...original, id: "future", from: { day: 1, meal }, kind: "流動食" as const };
      const added = dietChangeOrders([original, future], base, { day: 1, meal: "朝" }, { kind: "meals", count: 2 }, id);
      expect(added).toHaveLength(1);
      expect(dietAt([original, future, ...added], "p", 2, "朝")).toEqual(future);
    }
  });
  it.each([0, -1, 1.5, NaN, Infinity])("不正な回数 %s を拒む", count => {
    expect(() => dietChangeOrders([original], base, { day: 1, meal: "朝" }, { kind: "meals", count }, id)).toThrow("整数");
  });
  it("元の指示がなければ有限回は保存せず、他患者の指示も使わない", () => {
    expect(() => dietChangeOrders([{ ...original, patientId: "other" }], base, { day: 1, meal: "朝" }, { kind: "once" }, id)).toThrow("元に戻す");
  });
  it("取り消しも下書きにでき、変更前の指示に戻る", () => {
    const added = dietChangeOrders([original], base, { day: 1, meal: "朝" }, { kind: "meals", count: 3 }, id);
    const undo = undoDietChange([original, ...added], added[0], { by: "医師", at: { day: 0, time: "07:00" } }, id);
    const all = [original, ...added, ...undo];
    expect(calendarDietDrafts(undo, id)[0].kind).toBe("diet");
    for (const meal of ["朝", "昼", "夕"] as const) expect(dietAt(all, "p", 1, meal)?.kind).toBe("常食");
    expect(dietAt(all, "p", 2, "朝")?.kind).toBe("常食");
  });
  it("確定後の既存の配膳計算に反映される", () => {
    const added = dietChangeOrders([original], base, { day: 1, meal: "朝" }, { kind: "meals", count: 3 }, id);
    const person = { patient: { id: "p" }, entries: [] } as unknown as Parameters<typeof mealCell>[0];
    expect(mealCell(person, [original, ...added], 1, "夕", 0, () => 0).type).toBe("絶食");
    expect(mealCell(person, [original, ...added], 2, "朝", 0, () => 0).type).toBe("常食");
  });
});
