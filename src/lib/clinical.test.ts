import { describe, expect, it } from "vitest";
import { bodyText, estimatedCcr, measured } from "./clinical";

describe("体格の表示（未測定）", () => {
  it("shows the values with units, and the BMI, when both are on record", () => {
    expect(bodyText({ heightCm: 164, weightKg: 63.5 })).toEqual({ height: "164cm", weight: "63.5kg", bmi: "23.6", unmeasured: false });
    expect(bodyText({ heightCm: 164, weightKg: 63.5 }, { spaced: true })).toEqual({ height: "164 cm", weight: "63.5 kg", bmi: "23.6", unmeasured: false });
  });
  it("an outpatient without a measurement (0) gets 「—」: no 0cm, no BMI NaN", () => {
    const t = bodyText({ heightCm: 0, weightKg: 0 });
    expect(t).toEqual({ height: "—", weight: "—", bmi: "—", unmeasured: true });
    expect(JSON.stringify(t)).not.toContain("NaN");
    expect(bodyText({ heightCm: 170, weightKg: 0 })).toEqual({ height: "170cm", weight: "—", bmi: "—", unmeasured: true });
  });
  it("measured: only a finite number above 0", () => {
    expect(measured(0)).toBe(false);
    expect(measured(undefined)).toBe(false);
    expect(measured(NaN)).toBe(false);
    expect(measured(55)).toBe(true);
  });
  it("推定CCr needs the weight: null without it, the Cockcroft-Gault value with it", () => {
    expect(estimatedCcr({ age: 71, weightKg: 0, sex: "男" }, 1.0)).toBeNull();
    expect(estimatedCcr({ age: 71, weightKg: 60, sex: "男" }, undefined)).toBeNull();
    expect(estimatedCcr({ age: 71, weightKg: 60, sex: "男" }, 1.0)).toBeCloseTo(((140 - 71) * 60) / 72, 5);
    expect(estimatedCcr({ age: 71, weightKg: 60, sex: "女" }, 1.0)).toBeCloseTo((((140 - 71) * 60) / 72) * 0.85, 5);
  });
});
