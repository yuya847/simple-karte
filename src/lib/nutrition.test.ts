import { describe, expect, it } from "vitest";
import { bmi, weightLoss, mustScore, requirements } from "./nutrition";
describe("nutrition calculations", () => {
  it("keeps missing measurements missing and preserves weight gain", () => {
    expect(bmi(60, 0)).toBeNull(); expect(bmi(60, 200)).toBe(15);
    expect(weightLoss(54, 60)).toBe(10); expect(weightLoss(66, 60)).toBe(-10);
  });
  it("scores MUST boundaries with a separate acute component", () => {
    expect(mustScore(18.5, 5, false)).toBe(2); expect(mustScore(20, 10, true)).toBe(4);
    expect(mustScore(18.4, 10.1, true)).toBe(6); expect(mustScore(21, 0, false)).toBe(0);
  });
  it("calculates both sex equations and refuses children or invalid values", () => {
    expect(requirements("男", 40, 60, 170, 1.2, 1, 1)).toEqual({ basal: 1472, kcal: 1766, protein: 60 });
    expect(requirements("女", 40, 60, 170, 1, 1, 1)?.basal).toBe(1356);
    expect(requirements("男", 10, 60, 170, 1, 1, 1)).toBeNull();
  });
});

it("uses the action permission for each nutrition/nursing tile", async () => {
  const { nutritionTileBlocks } = await import("./nutrition-access");
  expect(nutritionTileBlocks("管理栄養士").nutrition).toBeUndefined();
  expect(nutritionTileBlocks("管理栄養士").io).toBeTruthy();
  expect(nutritionTileBlocks("医師")).toEqual({});
});

import { compareDietNutrition } from "./nutrition";
import { INITIAL_DIETS } from "./diet";
it("食種の既定量と計算量を比べ、指示なしは比較しない", () => {
  expect(compareDietNutrition(INITIAL_DIETS[0], { kcal: 2000, protein: 72.5 })).toEqual({ prescribed: { energyKcal: 1800, proteinG: 70 }, energyDifference: 200, proteinDifference: 2.5 });
  expect(compareDietNutrition(undefined, { kcal: 2000, protein: 72.5 }).energyDifference).toBeNull();
  expect(compareDietNutrition(INITIAL_DIETS[0], null).proteinDifference).toBeNull();
});

it("管理栄養士の食事タイルを無効にしない", async () => {
  const { nutritionTileBlocks } = await import("./nutrition-access");
  expect(nutritionTileBlocks("管理栄養士").diet).toBeUndefined();
});
