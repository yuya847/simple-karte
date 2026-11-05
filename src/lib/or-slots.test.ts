import { describe, expect, it } from "vitest";
import { fitsOrSlot, orSlots } from "./or-slots";
import { initialSurgeries } from "./surgery";

describe("手術室の空き", () => {
  it("部屋と日付を分け、申込と片付けを含めた空き区間を返す", () => {
    const all = initialSurgeries(0);
    expect(orSlots(3, "手術室1", all)).toEqual([{ start: "08:30", minutes: 570 }]);
    expect(orSlots(0, "手術室1", all)).toEqual([{ start: "11:15", minutes: 105 }, { start: "15:30", minutes: 150 }]);
    expect(orSlots(0, "手術室3", all)).toEqual([{ start: "08:30", minutes: 570 }]);
    expect(orSlots(0, "手術室1", [{ ...all[0], status: "申込" }])).toEqual([{ start: "11:15", minutes: 405 }]);
  });
  it("区間の端に収まる予定を許し、重なり・不正な時間・閉室後を拒む", () => {
    const all = initialSurgeries(0);
    expect(fitsOrSlot(0, "手術室1", "11:15", 105, all)).toBe(true);
    expect(fitsOrSlot(0, "手術室1", "11:15", 106, all)).toBe(false);
    for (const n of [0, -1, 0.5, NaN]) expect(fitsOrSlot(3, "手術室1", "12:00", n, all)).toBe(false);
    expect(fitsOrSlot(3, "手術室1", "08:00", 60, all)).toBe(false);
    expect(fitsOrSlot(3, "手術室1", "17:00", 61, all)).toBe(false);
    expect(fitsOrSlot(3, "手術室1", "99:00", 60, all)).toBe(false);
  });
  it("重なる予定をまとめ、入力の順番を変えても同じで、元の配列は変えない", () => {
    const base = initialSurgeries(0)[0];
    const a = { ...base, start: "08:30", minutes: 120 }, b = { ...base, id: "b", start: "09:00", minutes: 120 };
    expect(orSlots(0, "手術室1", [a, b])).toEqual([{ start: "11:30", minutes: 390 }]);
    expect(orSlots(0, "手術室1", [b, a])).toEqual(orSlots(0, "手術室1", [a, b]));
    expect(a.start).toBe("08:30");
  });
});
