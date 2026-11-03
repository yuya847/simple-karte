import { describe, expect, it } from "vitest";
import { INITIAL_B, bFor, bNeeded, bScore, evaluateDay, responseCoefficient } from "./acuity";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";

const ord = (id: string) => PATIENTS.find((p) => p.id === id)!.history.filter((e): e is OrderEntry => e.kind === "order");

describe("看護必要度（令和8年度、急性期一般入院料４・必要度Ⅰ）", () => {
  it("B: 状態×介助 for B9–B12 only", () => {
    const r = INITIAL_B.find((x) => x.patientId === "90010244")!;
    // 寝返り1 + 移乗2×1 + 口腔1×1 + 食事2×0（絶食は実施なし）+ 着脱2×1 + 指示0 + 危険0 = 6
    expect(bScore(r)).toBe(6);
  });
  it("B carries the latest evaluation forward; R8 measuring days", () => {
    expect(bFor(INITIAL_B, "90010198", -1)?.day).toBe(-2);
    expect(bNeeded(INITIAL_B, "90010198", -5, -2)).toBe(true); // day 4
    expect(bNeeded(INITIAL_B, "90010198", -5, 0)).toBe(false); // measured 2 days ago
  });
  it("大浦さん（救急搬送・酸素）: A7 2点＋A2 1点 → A3点で該当", () => {
    const e = evaluateDay(ord("90010244"), INITIAL_B, "90010244", -1, { admittedOn: -1, ambulance: true, nowAbs: 600 });
    expect(e.a.map((x) => x.no)).toContain("A7");
    expect(e.meets).toBe(true);
  });
  it("救急患者応需係数 = 1床あたり年間件数 × 0.005、上限 0.1", () => {
    expect(responseCoefficient(1340, 134)).toBeCloseTo(0.05, 6);
    expect(responseCoefficient(5000, 100)).toBe(0.1);
  });
});
