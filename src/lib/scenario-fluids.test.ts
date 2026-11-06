import { expect, it } from "vitest";
import { scenarioFluid } from "./scenario-fluids";
import type { InjectionOrder } from "./types";
const fluid: InjectionOrder = { type: "injection", route: "点滴静注", items: [{ drugCode: "INJ-SOL3A500", amount: 500, unit: "mL" }], start: { day: -2, time: "10:00" }, schedule: { kind: "per_day", count: 2 }, rateMlPerH: 42, days: 3 };
it("模擬症例の補液は病歴別の固定データになり、元のオーダと抗菌薬は変えない", () => {
  expect(scenarioFluid(fluid, "急性腎障害")).toMatchObject({ items: [{ drugCode: "INJ-NS500" }], days: 2 });
  expect(scenarioFluid(fluid, "胃癌（術後）")).toMatchObject({ days: 1, schedule: { count: 1 } });
  expect(scenarioFluid(fluid, "胃潰瘍（出血）").items[0].drugCode).toBe("INJ-VEENF500");
  expect(fluid.days).toBe(3);
  const abx = { ...fluid, items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }] };
  expect(scenarioFluid(abx, "術後")).toBe(abx);
});
