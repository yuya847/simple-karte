import { describe, expect, it } from "vitest";
import { dripRate, dripText } from "./drip";
import type { InjectionOrder } from "./types";

const o = (x: Partial<InjectionOrder>): InjectionOrder => ({ type: "injection", items: [{ drugCode: "INJ-NS500", amount: 500, unit: "mL" }], route: "点滴静注", schedule: { kind: "per_day", count: 2 }, start: { day: 0 }, ...x });

describe("点滴の速さ", () => {
  it("continuous fluid: bags a day × volume ÷ 24", () => {
    const d = dripRate(o({}))!;
    expect(d).toMatchObject({ mlPerH: 41.7, drops20: 14, drops60: 42, minutesPerBag: 720 });
    expect(dripText(d)).toContain("500mL × 2本 ÷ 24時間");
  });
  it("a dose over minutes: volume ÷ minutes × 60", () => {
    const d = dripRate(o({ items: [{ drugCode: "INJ-NS100", amount: 100, unit: "mL" }], schedule: { kind: "every_hours", hours: 8 }, minutesPerDose: 30 }))!;
    expect(d).toMatchObject({ mlPerH: 200, drops20: 67, drops60: 200, minutesPerBag: 30 });
  });
  it("uses the ordered rate when there is one", () => {
    expect(dripRate(o({ rateMlPerH: 80 }))).toMatchObject({ mlPerH: 80, drops20: 27 });
  });
});
