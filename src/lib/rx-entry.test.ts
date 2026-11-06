import { describe, expect, it } from "vitest";
import { candidateIndex, doseStep, halfWidthNumber, rxChoiceIndex, rxEntryStep, validDose, type RxStep } from "./rx-entry";

describe("罫線の処方入力", () => {
  it.each(["Enter", "Tab"])("%sで薬から確定まで進み、Escで一つ戻る", (key) => {
    let step: RxStep = "drug";
    for (const next of ["dose", "times", "usage", "days", "done"]) {
      const before = step;
      step = rxEntryStep(step, key);
      expect(step).toBe(next);
      expect(rxEntryStep(step, "Escape")).toBe(before);
    }
    expect(rxEntryStep("dose", key, false)).toBe("dose");
    expect(rxEntryStep("drug", "Escape")).toBe("drug");
  });
  it("候補が一つなら選択位置にかかわらず確定できる", () => {
    expect(candidateIndex(1, 5)).toBe(0);
    expect(candidateIndex(0, 0)).toBeNull();
    expect(candidateIndex(3, 1)).toBe(1);
  });
  it("分割情報を優先し、未指定の錠剤は0.25、カプセルは整数にする", () => {
    expect(validDose("0.25", { unit: "錠" })).toBe(true);
    expect(validDose("0.25", { unit: "錠", scored: true })).toBe(false);
    expect(validDose("0.5", { unit: "錠", scored: true })).toBe(true);
    expect(validDose("0.5", { unit: "錠", scored: false })).toBe(false);
    expect(validDose("0.5", { unit: "カプセル" })).toBe(false);
    expect(validDose("1.25", { unit: "mL" })).toBe(true);
    expect(doseStep({ unit: "mg" })).toBe(0.001);
    for (const value of ["", "0", "-1", "NaN", "Infinity"]) expect(validDose(value, { unit: "錠" })).toBe(false);
  });
  it("矢印と数字で選ぶ", () => {
    expect(rxChoiceIndex(0, "ArrowLeft", 5)).toBe(4);
    expect(rxChoiceIndex(0, "3", 5)).toBe(2);
    expect(rxChoiceIndex(4, "ArrowDown", 5)).toBe(0);
  });
});

describe("全角の数字", () => {
  it("日本語入力の「１」「０．５」も量として読む", () => {
    expect(halfWidthNumber("１")).toBe("1");
    expect(halfWidthNumber("０．５")).toBe("0.5");
    expect(validDose("１", { unit: "錠", scored: true })).toBe(true);
    expect(validDose("０．２５", { unit: "錠", scored: true })).toBe(false);
  });
});
