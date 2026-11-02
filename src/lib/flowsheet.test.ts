import { describe, expect, it } from "vitest";
import { abs, doseTimes, fluidByDay, orderInterval } from "./flowsheet";
import type { OrderEntry } from "./types";

const veenF: OrderEntry = {
  kind: "order",
  id: "v",
  day: -3,
  time: "14:35",
  author: "",
  status: "有効",
  order: {
    type: "injection",
    items: [{ drugCode: "INJ-VEENF500", amount: 500, unit: "mL" }],
    route: "点滴静注",
    schedule: { kind: "per_day", count: 2 },
    rateMlPerH: 42,
    start: { day: -3, time: "15:00" },
  },
};

const vcm: OrderEntry = {
  kind: "order",
  id: "vcm",
  day: 0,
  time: "09:00",
  author: "",
  status: "有効",
  order: {
    type: "injection",
    items: [
      { drugCode: "INJ-VCM05", amount: 1, unit: "g" },
      { drugCode: "INJ-NS100", amount: 100, unit: "mL" },
    ],
    route: "点滴静注",
    schedule: { kind: "every_hours", hours: 12 },
    minutesPerDose: 60,
    start: { day: 0, time: "18:00" },
  },
};

const now = abs(0, "09:00");

describe("flow sheet calculations", () => {
  it("an order stopped today runs until now", () => {
    expect(orderInterval({ ...veenF, status: "中止", stoppedOn: 0 }, now)).toEqual({ from: abs(-3, "15:00"), to: now });
  });

  it("lists 12-hourly doses inside a window", () => {
    expect(doseTimes(vcm, now, abs(0, "00:00"), abs(2, "00:00"))).toEqual([abs(0, "18:00"), abs(1, "06:00"), abs(1, "18:00")]);
  });

  it("estimates infused volume per day from the orders", () => {
    const v = fluidByDay([veenF, vcm], [-3, -2, 0, 1], now);
    expect(v[-3]).toBe(380); // 1,000 mL/day from 15:00 → 9/24 of a day = 375, rounded to 10 mL
    expect(v[-2]).toBe(1000);
    expect(v[0]).toBe(1100); // fluid 1,000 + one 100 mL VCM dose at 18:00
    expect(v[1]).toBe(1200); // fluid 1,000 + two doses
  });

  it("stops counting a fluid once it is stopped", () => {
    const v = fluidByDay([{ ...veenF, status: "中止", stoppedOn: 0 }], [0], now);
    expect(v[0]).toBe(380); // 9 hours of 1,000 mL/day = 375 → rounded to 10 mL
  });
});
