import { describe, expect, it } from "vitest";
import { angle, distance, finishMeasurement, ratio, roiStats } from "./measure";

describe("距離", () => {
  it("3・4・5 の直角三角形：画素 0.5 mm なら 2.5 mm", () => {
    const d = distance({ x: 0, y: 0 }, { x: 3, y: 4 }, 0.5);
    expect(d.mm).toBeCloseTo(2.5, 9);
    expect(d.formula.join(" ")).toContain("√((3.0 × 0.5)² + (4.0 × 0.5)²)");
    expect(d.formula.at(-1)).toContain("= 2.5 mm");
  });

  it("向きを逆にしても同じ", () => {
    expect(distance({ x: 10, y: 2 }, { x: 1, y: 7 }, 0.9).mm).toBeCloseTo(distance({ x: 1, y: 7 }, { x: 10, y: 2 }, 0.9).mm, 9);
  });
});

describe("角度", () => {
  it("直角は 90°、まっすぐは 180°、同じ向きは 0°", () => {
    expect(angle({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }, 1)?.deg).toBeCloseTo(90, 9);
    expect(angle({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 7, y: 0 }, 1)?.deg).toBeCloseTo(180, 9);
    expect(angle({ x: 3, y: 3 }, { x: 0, y: 0 }, { x: 6, y: 6 }, 1)?.deg).toBeCloseTo(0, 4);
  });

  it("45° と、式の文字", () => {
    const a = angle({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }, 0.8);
    expect(a?.deg).toBeCloseTo(45, 9);
    expect(a?.formula[0]).toContain("arccos");
  });

  it("点が頂点と重なると計算しない", () => {
    expect(angle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }, 1)).toBeNull();
  });
});

describe("ROI（関心領域）の平均・標準偏差", () => {
  // 10×10 の画像：左半分 0、右半分 100
  const w = 10;
  const h = 10;
  const px = new Int16Array(w * h).map((_, k) => (k % w < 5 ? 0 : 100));

  it("値がそろった所では SD は 0", () => {
    const s = roiStats(px, w, h, { x: 0, y: 0 }, { x: 4, y: 10 }, 1, "HU");
    expect(s?.mean).toBe(0);
    expect(s?.sd).toBe(0);
    expect(s?.min).toBe(0);
    expect(s?.max).toBe(0);
  });

  it("境をまたぐと平均は間、SD は標本の式（n − 1）", () => {
    const s = roiStats(px, w, h, { x: 0, y: 0 }, { x: 10, y: 10 }, 1, "HU")!;
    // 画素の中心が楕円の中にあるものだけを数える。左右対称なので半分ずつ
    expect(s.n % 2).toBe(0);
    expect(s.mean).toBeCloseTo(50, 9);
    const n = s.n;
    expect(s.sd).toBeCloseTo(Math.sqrt((n * 2500) / (n - 1)), 9);
    expect(s.areaMm2).toBe(n);
  });

  it("画素の中心が楕円の中にあるものを数える（4×4 の箱の楕円 → 12 画素）", () => {
    const s = roiStats(new Int16Array(100).fill(5), 10, 10, { x: 2, y: 2 }, { x: 6, y: 6 }, 0.5, "HU")!;
    expect(s.n).toBe(12);
    expect(s.areaMm2).toBeCloseTo(12 * 0.25, 9);
    expect(s.formula[0]).toContain("÷ 12");
  });

  it("画像の外は数えない・大きさ 0 は計算しない", () => {
    const s = roiStats(px, w, h, { x: -20, y: -20 }, { x: 2, y: 2 }, 1, "HU");
    expect(s === null || s.n < 10).toBe(true);
    expect(roiStats(px, w, h, { x: 3, y: 3 }, { x: 3, y: 8 }, 1, "HU")).toBeNull();
  });
});

describe("計測を仕上げる", () => {
  const ctx = { spacing: 0.9, pixels: new Int16Array(100).fill(40), width: 10, height: 10, unit: "HU" };
  it("距離・角度・ROI の表示の値", () => {
    expect(finishMeasurement("a", "distance", [{ x: 0, y: 0 }, { x: 10, y: 0 }], ctx)?.value).toBe("9.0 mm");
    expect(finishMeasurement("b", "angle", [{ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 5 }], ctx)?.value).toBe("90.0°");
    expect(finishMeasurement("c", "roi", [{ x: 2, y: 2 }, { x: 8, y: 8 }], ctx)?.value).toContain("平均 40.0 ± 0.0 HU");
  });
  it("長さ 0 の距離や点の足りない角度は作らない", () => {
    expect(finishMeasurement("a", "distance", [{ x: 1, y: 1 }, { x: 1, y: 1 }], ctx)).toBeNull();
    expect(finishMeasurement("b", "angle", [{ x: 1, y: 1 }, { x: 2, y: 2 }], ctx)).toBeNull();
  });
});

describe("比", () => {
  it("2 つの距離の比を式つきで（判定はしない）", () => {
    const r = ratio(150, 260);
    expect(r?.value).toBeCloseTo(150 / 260, 9);
    expect(r?.formula).toBe("150.0 ÷ 260.0 = 0.58（57.7%）");
    expect(ratio(1, 0)).toBeNull();
  });
});
