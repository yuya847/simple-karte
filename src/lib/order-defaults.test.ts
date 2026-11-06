import { describe, expect, it } from "vitest";
import { orderDefaults } from "./order-defaults";

describe("場所と区分の既定", () => {
  for (const id of ["er:er-3", "er-3", "90010231", "opd:3"]) {
    for (const category of ["定期", "臨時"] as const) {
      it(`${id} × ${category}`, () => {
        const er = id.startsWith("er");
        const d = orderDefaults(id, category, "23:58");
        expect(d.schedule).toEqual(er || category === "臨時" ? { kind: "once" } : { kind: "per_day", count: 1 });
        expect(d.start).toEqual({ day: 0, time: er || category === "臨時" ? "23:58" : "10:00" });
        expect(d.drawMode).toBe(er ? "now" : "time");
        expect(d.imagingTime).toBe(er ? "23:58" : null);
      });
    }
  }
});

import { onceInfusionMinutes } from "./order-defaults";
it("1回だけの輸液の量から時間を選ぶ", () => {
  expect([500, 250, 100, 200, 0].map(onceInfusionMinutes)).toEqual([60, 30, 30, null, null]);
});

it("口頭指示は病棟の定期でも1回だけ・今すぐ", () => {
  expect(orderDefaults("90010231", "定期", "23:59", "verbal")).toMatchObject({ schedule: { kind: "once" }, start: { day: 0, time: "23:59" } });
});

it("口頭指示の今すぐは過去時刻の注射確認をせず、採血も今すぐ", () => {
  expect(orderDefaults("90010231", "定期", "08:03", "verbal")).toMatchObject({ startNow: true, drawMode: "now" });
  expect(orderDefaults("90010231", "定期", "08:03").startNow).toBe(false);
});
