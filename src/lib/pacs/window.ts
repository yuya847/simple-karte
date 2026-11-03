// ウィンドウ幅・レベル（WW/WL）。画素の値を画面の明るさ（0〜255）に変える。
// 式は DICOM の線形の VOI LUT（PS3.3 C.11.2.1.2）と同じ：
//   x ≦ WL − 0.5 − (WW − 1)/2 → 0
//   x ＞ WL − 0.5 + (WW − 1)/2 → 255
//   それ以外 → ((x − (WL − 0.5)) / (WW − 1) + 0.5) × 255

import type { WindowPreset } from "./types";

export interface WindowLevel {
  ww: number;
  wl: number;
}

/** WW の下限（1 より小さいと式が成り立たない）。 */
export const MIN_WW = 1;

/** 1 つの値を 0〜255 にする。 */
export function applyWindow(x: number, ww: number, wl: number): number {
  const w = Math.max(MIN_WW, ww);
  const lo = wl - 0.5 - (w - 1) / 2;
  const hi = wl - 0.5 + (w - 1) / 2;
  if (x <= lo) return 0;
  if (x > hi) return 255;
  return ((x - (wl - 0.5)) / (w - 1) + 0.5) * 255;
}

/**
 * 値の範囲 [min, max] の早見表（LUT）。画素ごとに式を計算しないで済む。
 * invert で白黒を反転する。
 */
export function buildLut(min: number, max: number, ww: number, wl: number, invert = false): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(max - min + 1);
  for (let v = min; v <= max; v++) {
    const y = Math.round(applyWindow(v, ww, wl));
    lut[v - min] = invert ? 255 - y : y;
  }
  return lut;
}

/**
 * ドラッグで WW/WL を変える：右へ動かすと WW が広がり、下へ動かすと WL が上がる。
 * step は 1 画素あたりの変化（画素値の範囲に合わせて呼ぶ側が決める）。
 */
export function dragWindow(start: WindowLevel, dx: number, dy: number, step: number): WindowLevel {
  return {
    ww: Math.max(MIN_WW, Math.round(start.ww + dx * step)),
    wl: Math.round(start.wl + dy * step),
  };
}

/** ドラッグ 1 画素あたりの WW/WL の変化。値の範囲が広いほど大きく動く。 */
export function dragStep(range: [number, number]): number {
  return Math.max(1, (range[1] - range[0]) / 400);
}

/** 画像の値の分布から WW/WL を決める（下から 1% と上から 0.5% の値の間）。空気（最小値）は数えない。 */
export function autoWindow(pixels: ArrayLike<number>): WindowLevel {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || min === max) return { ww: 1, wl: Number.isFinite(min) ? min : 0 };
  const bins = 1024;
  const hist = new Uint32Array(bins);
  const scale = (bins - 1) / (max - min);
  let n = 0;
  const floor = min + (max - min) * 0.02;
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    if (v <= floor) continue;
    hist[Math.round((v - min) * scale)]++;
    n++;
  }
  if (n === 0) return { ww: max - min, wl: (max + min) / 2 };
  const at = (p: number) => {
    const target = n * p;
    let acc = 0;
    for (let b = 0; b < bins; b++) {
      acc += hist[b];
      if (acc >= target) return min + b / scale;
    }
    return max;
  };
  const lo = at(0.01);
  const hi = at(0.995);
  const ww = Math.max(MIN_WW, Math.round(hi - lo));
  return { ww, wl: Math.round((hi + lo) / 2) };
}

/** CT のプリセット（WW/WL は一般的な目安）。 */
export const CT_PRESETS: Record<"lung" | "mediastinum" | "abdomen" | "bone" | "brain", WindowPreset> = {
  lung: { key: "lung", label: "肺野", ww: 1500, wl: -600 },
  mediastinum: { key: "mediastinum", label: "縦隔", ww: 350, wl: 40 },
  abdomen: { key: "abdomen", label: "腹部", ww: 400, wl: 50 },
  bone: { key: "bone", label: "骨", ww: 2000, wl: 400 },
  brain: { key: "brain", label: "脳", ww: 80, wl: 40 },
};
