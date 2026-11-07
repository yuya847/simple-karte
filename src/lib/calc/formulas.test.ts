import { describe, expect, it } from "vitest";
import { aaDo2, albuminCorrectedAg, alveolarO2, anionGap, ageBand, concentration, continuousRate, correctedCa, correctedNa, fmt, freeWaterDeficit, intermittentRate, meld, pf, tbwFactor } from "./formulas";

describe("自由水欠乏量（Adrogué・Madias の体水分の割合）", () => {
  it("体水分量 × (Na ÷ 140 − 1)", () => {
    const r = freeWaterDeficit(154, 60, 0.5)!;
    expect(r.tbw).toBe(30);
    expect(r.liters).toBeCloseTo(3, 10);
    expect(freeWaterDeficit(140, 60, 0.5)!.liters).toBe(0);
    expect(freeWaterDeficit(null, 60, 0.5)).toBeNull();
    expect(freeWaterDeficit(150, 0, 0.5)).toBeNull();
  });
  it("係数：小児 0.6、成人 男 0.6・女 0.5、高齢 男 0.5・女 0.45（区分の初期値は 18歳未満・65歳以上）", () => {
    expect([tbwFactor("小児", "女"), tbwFactor("成人", "男"), tbwFactor("成人", "女"), tbwFactor("高齢", "男"), tbwFactor("高齢", "女")]).toEqual([0.6, 0.6, 0.5, 0.5, 0.45]);
    expect([ageBand(17), ageBand(18), ageBand(64), ageBand(65)]).toEqual(["小児", "成人", "成人", "高齢"]);
  });
});

describe("電解質", () => {
  it("補正 Ca（Payne）= Ca − Alb + 4", () => {
    expect(correctedCa(8, 2)).toBe(10);
    expect(correctedCa(9.6, 4.4)).toBeCloseTo(9.2, 10);
    expect(correctedCa(8, null)).toBeNull();
  });
  it("AG = Na − (Cl + HCO3)、Alb 補正は + 2.5 × (基準 − Alb)", () => {
    expect(anionGap(140, 100, 24)).toBe(16);
    expect(albuminCorrectedAg(16, 2, 4.4)).toBeCloseTo(22, 10);
    expect(albuminCorrectedAg(16, 2, 4)).toBe(21);
    expect(albuminCorrectedAg(16, 2, null)).toBeNull();
    expect(anionGap(140, null, 24)).toBeNull();
  });
  it("高血糖の補正 Na：血糖 100 mg/dL を超えた 100 ごとに 1.6・2.4", () => {
    expect(correctedNa(130, 600, 1.6)).toBeCloseTo(138, 10);
    expect(correctedNa(130, 600, 2.4)).toBeCloseTo(142, 10);
    expect(correctedNa(130, null, 1.6)).toBeNull();
  });
});

describe("P/F と A-aDO2（肺胞気の式）", () => {
  it("P/F は整数、PAO2 = FiO2 × (760 − 47) − PaCO2 ÷ 0.8", () => {
    expect(pf(80, 0.4)).toBe(200);
    expect(alveolarO2(0.4, 40, 760)).toBeCloseTo(235.2, 10);
    expect(aaDo2(0.4, 80, 40, 760)).toBeCloseTo(155.2, 10);
    expect(aaDo2(0.21, 95, 40, 760)).toBeCloseTo(0.21 * 713 - 50 - 95, 10);
  });
  it("FiO2 は 0.21〜1.0（% で入れたものは計算しない）", () => {
    expect(pf(80, 40)).toBeNull();
    expect(alveolarO2(40, 40, 760)).toBeNull();
    expect(pf(80, 0.2)).toBeNull();
  });
});

describe("MELD（Kamath。1 未満は 1、Cre の上限 4）", () => {
  it("式どおり", () => {
    expect(meld(1, 1, 1)!.score).toBeCloseTo(6.43, 10);
    expect(meld(3.2, 1.6, 1.4)!.score).toBeCloseTo(9.57 * Math.log(1.4) + 3.78 * Math.log(3.2) + 11.2 * Math.log(1.6) + 6.43, 10);
  });
  it("下限と上限", () => {
    expect(meld(0.5, 0.9, 0.6)!.used).toEqual({ bil: 1, inr: 1, cre: 1 });
    expect(meld(2, 1.2, 6)!.used.cre).toBe(4);
    expect(meld(2, null, 1)).toBeNull();
  });
});

describe("抗菌薬の濃度と速さ", () => {
  it("濃度 = 薬剤量 ÷ 総量、1回の液量と mL/h、1日量の持続", () => {
    expect(concentration(2000, 100)).toBe(20);
    expect(intermittentRate(1000, 20, 60)).toEqual({ volumeMl: 50, mlPerH: 50 });
    expect(intermittentRate(1000, 20, 30)!.mlPerH).toBe(100);
    expect(continuousRate(6000, 20)).toBe(12.5);
    expect(concentration(0, 100)).toBeNull();
    expect(intermittentRate(1000, 20, 0)).toBeNull();
  });
  it("表示は丸めて末尾の 0 を落とす", () => {
    expect(fmt(12.5)).toBe("12.5");
    expect(fmt(3.0)).toBe("3");
    expect(fmt(0.12009, 3)).toBe("0.12");
  });
});
