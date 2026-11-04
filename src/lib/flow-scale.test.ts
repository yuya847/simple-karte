import { describe, expect, it } from "vitest";
import { anchorFor, canStep, daysIn, flowWindow, shiftAt, stepAnchor } from "./flow-scale";

const at = (day: number, h: number, m = 0) => day * 1440 + h * 60 + m;

describe("経過表の表示期間と時間の目盛り", () => {
  it("入院から: admission to the end of tomorrow, one column a day", () => {
    const w = flowWindow("all", at(0, 10), -3);
    expect([w.lo, w.hi, w.byDay]).toEqual([at(-3, 0), at(2, 0), true]);
    expect(daysIn(w)).toEqual([-3, -2, -1, 0, 1]);
    expect(canStep(w, -1, -3)).toBe(false);
  });

  it("1週 ends with tomorrow, 3日 is yesterday to tomorrow, 1日 is 0時〜24時", () => {
    expect(daysIn(flowWindow("week", at(0, 10), -3))).toEqual([-5, -4, -3, -2, -1, 0, 1]);
    const three = flowWindow("3d", at(0, 10), -3);
    expect(daysIn(three)).toEqual([-1, 0, 1]);
    expect(three.byDay).toBe(false);
    expect(three.ticks.filter((t) => t.major).map((t) => t.at)).toEqual([at(-1, 0), at(0, 0), at(1, 0), at(2, 0)]);
    const one = flowWindow("1d", at(-1, 23), -3);
    expect([one.lo, one.hi]).toEqual([at(-1, 0), at(0, 0)]);
    expect(one.ticks.filter((t) => t.label).map((t) => t.label)).toEqual(["0時", "3時", "6時", "9時", "12時", "15時", "18時", "21時", "0時"]);
  });

  it("勤務帯: the shift that holds the time (as the worksheet)", () => {
    expect(shiftAt(at(0, 10))).toMatchObject({ shift: "day", lo: at(0, 8, 30), hi: at(0, 17) });
    expect(shiftAt(at(0, 7))).toMatchObject({ shift: "night", lo: at(-1, 16, 30), hi: at(0, 9) });
    expect(shiftAt(at(0, 18))).toMatchObject({ shift: "night", lo: at(0, 16, 30), hi: at(1, 9) });
    // Back and forth: day → night before → day before; and ahead.
    const day = flowWindow("shift", at(0, 10), -3);
    const before = flowWindow("shift", stepAnchor(day, at(0, 10), -1, -3), -3);
    expect(before.shift).toBe("night");
    expect(before.lo).toBe(at(-1, 16, 30));
    const ahead = flowWindow("shift", stepAnchor(day, at(0, 10), 1, -3), -3);
    expect([ahead.shift, ahead.lo]).toEqual(["night", at(0, 16, 30)]);
    const next = flowWindow("shift", stepAnchor(ahead, at(0, 17), 1, -3), -3);
    expect([next.shift, next.lo]).toEqual(["day", at(1, 8, 30)]);
  });

  it("1時間: from the hour, ticks every 10 minutes", () => {
    const w = flowWindow("1h", at(0, 10, 25), -3);
    expect([w.lo, w.hi]).toEqual([at(0, 10), at(0, 11)]);
    expect(w.ticks.map((t) => t.label)).toEqual(["10:00", "10:10", "10:20", "10:30", "10:40", "10:50", "11:00"]);
  });

  it("steps stay within the stay; switching scale looks at the chosen day", () => {
    const w = flowWindow("1d", at(-3, 10), -3);
    expect(canStep(w, -1, -3)).toBe(false);
    expect(stepAnchor(w, at(-3, 10), -1, -3)).toBe(at(-3, 0));
    expect(canStep(flowWindow("1d", at(1, 10), -3), 1, -3)).toBe(false);
    expect(anchorFor(null, at(0, 9))).toBe(at(0, 9));
    expect(anchorFor(-2, at(0, 9))).toBe(at(-2, 10));
  });
});
