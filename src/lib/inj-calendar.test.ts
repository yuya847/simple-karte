import { describe, expect, it } from "vitest";
import { START_BANDS, doStartOf, draftSpan, startAt } from "./inj-calendar";
import type { InjectionOrder } from "./types";

const drip: InjectionOrder = { type: "injection", items: [{ drugCode: "INJ-CTRX", amount: 2, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, minutesPerDose: 60, start: { day: -2, time: "10:00" }, days: 7 };

describe("注射カレンダーから新しい注射の開始を渡す", () => {
  it("押した日と時刻帯の時刻がそのまま開始になる", () => {
    expect(startAt(3, "14:00")).toEqual({ day: 3, time: "14:00" });
    expect(startAt(0, null)).toEqual({ day: 0, time: null });
  });
  it("時刻でない文字は時刻なし（指示受け後すぐ）になる", () => {
    expect(startAt(1, "午後")).toEqual({ day: 1, time: null });
    expect(startAt(1, "25:00").time).toBeNull();
  });
  it("時刻帯は時刻なしが先頭で、ほかは HH:MM", () => {
    expect(START_BANDS[0].time).toBeNull();
    for (const b of START_BANDS.slice(1)) expect(b.time).toMatch(/^\d\d:\d\d$/);
  });
});

describe("Do（同じ内容で続けて新規）の開始", () => {
  it("日数の決まった有効なオーダは、終わりの翌日の同じ時刻から", () => {
    // -2 から 7 日間 → 最後の日は 4、次は 5
    expect(doStartOf(drip, "有効")).toEqual({ day: 5, time: "10:00" });
  });
  it("終わりが過ぎているなら今日から", () => {
    expect(doStartOf({ ...drip, start: { day: -10, time: "10:00" }, days: 3 }, "有効").day).toBe(0);
  });
  it("終了日なし・中止のオーダは今日から（時刻は残す）", () => {
    expect(doStartOf({ ...drip, days: undefined }, "有効")).toEqual({ day: 0, time: "10:00" });
    expect(doStartOf(drip, "中止")).toEqual({ day: 0, time: "10:00" });
    expect(doStartOf({ ...drip, start: { day: 0 } }, "中止")).toEqual({ day: 0, time: null });
  });
});

describe("下書きの注射がカレンダーで占める日", () => {
  it("開始日から日数ぶん（カレンダーの最後の日まで）", () => {
    expect(draftSpan({ day: 2 }, 3, 7)).toEqual({ from: 2, to: 4 });
    expect(draftSpan({ day: 5 }, 10, 7)).toEqual({ from: 5, to: 7 });
  });
  it("日数なしは最後の日まで、開始日なしは今日から", () => {
    expect(draftSpan({ day: null }, null, 7)).toEqual({ from: 0, to: 7 });
  });
});
