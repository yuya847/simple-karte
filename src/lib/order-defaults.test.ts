import { describe, expect, it } from "vitest";
import { orderDefaults } from "./order-defaults";

describe("場所と区分の既定（架空の病院の取り決め）", () => {
  for (const id of ["er:er-3", "er-3", "90010231", "opd:3"]) {
    for (const category of ["定期", "臨時"] as const) {
      it(`${id} × ${category}`, () => {
        const er = id.startsWith("er");
        const d = orderDefaults(id, category, "23:58");
        expect(d.schedule).toEqual(er || category === "臨時" ? { kind: "once" } : { kind: "per_day", count: 1 });
        expect(d.start).toEqual({ day: 0, time: er || category === "臨時" ? "23:58" : "10:00" });
        expect(d.drawMode).toBe(er ? "now" : "routine");
        expect(d.imagingTime).toBe(er ? "23:58" : null);
      });
    }
  }
});

import { onceInfusionMinutes } from "./order-defaults";
it("1回だけの輸液の量から時間を選ぶ（架空）", () => {
  expect([500, 250, 100, 200, 0].map(onceInfusionMinutes)).toEqual([60, 30, 30, null, null]);
});
