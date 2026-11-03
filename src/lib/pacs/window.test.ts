import { describe, expect, it } from "vitest";
import { applyWindow, autoWindow, buildLut, CT_PRESETS, dragStep, dragWindow, MIN_WW } from "./window";

describe("WW/WL の変換（DICOM の線形の式）", () => {
  it("下の端以下は 0、上の端より上は 255", () => {
    // WW 400・WL 40 → 下の端 = 40 − 0.5 − 199.5 = −160、上の端 = 40 − 0.5 + 199.5 = 239
    expect(applyWindow(-160, 400, 40)).toBe(0);
    expect(applyWindow(-1000, 400, 40)).toBe(0);
    expect(applyWindow(239.5, 400, 40)).toBe(255);
    expect(applyWindow(3000, 400, 40)).toBe(255);
  });

  it("真ん中（WL − 0.5）は 127.5、途中は直線", () => {
    expect(applyWindow(39.5, 400, 40)).toBeCloseTo(127.5, 6);
    // ((x − 39.5) / 399 + 0.5) × 255
    expect(applyWindow(100, 400, 40)).toBeCloseTo(((100 - 39.5) / 399 + 0.5) * 255, 6);
    expect(applyWindow(100, 400, 40)).toBeGreaterThan(applyWindow(50, 400, 40));
  });

  it("肺野の条件では、肺（−850 HU 前後）は暗めの灰、骨は白", () => {
    const { ww, wl } = CT_PRESETS.lung;
    const lung = applyWindow(-850, ww, wl);
    expect(lung).toBeGreaterThan(20);
    expect(lung).toBeLessThan(100);
    expect(applyWindow(1000, ww, wl)).toBe(255);
    expect(applyWindow(-1000, ww, wl)).toBeLessThan(lung);
  });

  it("WW が 1 より小さくても 1 として扱い、WL を境に白黒に分かれる", () => {
    expect(applyWindow(10, 0, 10)).toBe(255);
    expect(applyWindow(9, -5, 10)).toBe(0);
  });

  it("早見表（LUT）は式と同じ値、反転は 255 から引いた値", () => {
    const lut = buildLut(-1024, 3071, 350, 40);
    expect(lut.length).toBe(4096);
    for (const v of [-1024, -200, 0, 40, 100, 3071]) expect(lut[v + 1024]).toBe(Math.round(applyWindow(v, 350, 40)));
    const inv = buildLut(-1024, 3071, 350, 40, true);
    expect(inv[40 + 1024]).toBe(255 - lut[40 + 1024]);
  });
});

describe("WW/WL のドラッグ", () => {
  it("右へ動かすと WW が広がり、下へ動かすと WL が上がる", () => {
    const next = dragWindow({ ww: 400, wl: 40 }, 10, -5, 2);
    expect(next).toEqual({ ww: 420, wl: 30 });
  });

  it("WW は下限より小さくならない", () => {
    expect(dragWindow({ ww: 10, wl: 0 }, -100, 0, 1).ww).toBe(MIN_WW);
  });

  it("値の範囲が広いほど 1 画素で大きく動く", () => {
    expect(dragStep([-1024, 3071])).toBeGreaterThan(dragStep([0, 255]));
    expect(dragStep([0, 10])).toBe(1);
  });
});

describe("画像から WW/WL を決める", () => {
  it("一番暗い値（空気）を除いた分布の幅になる", () => {
    const px = new Int16Array(1000);
    for (let i = 0; i < 1000; i++) px[i] = i < 300 ? 0 : 1000 + (i % 100) * 10;
    const w = autoWindow(px);
    expect(w.wl).toBeGreaterThan(1300);
    expect(w.wl).toBeLessThan(1700);
    expect(w.ww).toBeGreaterThan(800);
    expect(w.ww).toBeLessThan(1100);
  });

  it("全部同じ値のときは WW 1", () => {
    expect(autoWindow(new Int16Array(10).fill(7))).toEqual({ ww: 1, wl: 7 });
  });
});
