// 表示の状態（拡大・移動・回転・反転・WW/WL・スライス）と、画像の座標 ↔ 画面の座標の変換。
// 画像の座標：画素 (i, j) は [i, i+1) × [j, j+1) をしめる（中心は i + 0.5）。

import type { Dir } from "./types";

export type Rotation = 0 | 90 | 180 | 270;

export interface ViewState {
  /** 1 = 画面に収まる大きさ */
  zoom: number;
  /** 画面の画素での移動 */
  panX: number;
  panY: number;
  /** 時計回りの回転（度） */
  rotation: Rotation;
  /** 画面の左右・上下の反転（回転のあとにかける） */
  flipH: boolean;
  flipV: boolean;
  ww: number;
  wl: number;
  invert: boolean;
  /** スライス番号（0 から） */
  slice: number;
}

/** canvas の setTransform と同じ並び：x' = a·x + c·y + e、y' = b·x + d·y + f */
export type Matrix = [number, number, number, number, number, number];

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 20;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** 回転のあとの画像の幅・高さに対して、画面に収まる倍率。 */
export function fitScale(imgW: number, imgH: number, canvasW: number, canvasH: number, rotation: Rotation): number {
  const [w, h] = rotation % 180 === 0 ? [imgW, imgH] : [imgH, imgW];
  if (w <= 0 || h <= 0 || canvasW <= 0 || canvasH <= 0) return 1;
  return Math.min(canvasW / w, canvasH / h);
}

function multiply(m: Matrix, n: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
}

/**
 * 画像 → 画面の変換。中心へ寄せる → 回転 → 画面での反転 → 拡大 → 画面の中心＋移動。
 */
export function viewMatrix(v: Pick<ViewState, "zoom" | "panX" | "panY" | "rotation" | "flipH" | "flipV">, imgW: number, imgH: number, canvasW: number, canvasH: number): Matrix {
  const s = fitScale(imgW, imgH, canvasW, canvasH, v.rotation) * v.zoom;
  const th = (v.rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(th));
  const sin = Math.round(Math.sin(th));
  const center: Matrix = [1, 0, 0, 1, -imgW / 2, -imgH / 2];
  const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
  const flip: Matrix = [v.flipH ? -1 : 1, 0, 0, v.flipV ? -1 : 1, 0, 0];
  const scale: Matrix = [s, 0, 0, s, 0, 0];
  const move: Matrix = [1, 0, 0, 1, canvasW / 2 + v.panX, canvasH / 2 + v.panY];
  return multiply(move, multiply(scale, multiply(flip, multiply(rot, center))));
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invertMatrix(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c || 1e-12;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** 画面の点 (sx, sy) を動かさずに拡大する（マウスのある所を中心に拡大）。 */
export function zoomAt(v: ViewState, factor: number, sx: number, sy: number, canvasW: number, canvasH: number): ViewState {
  const zoom = clampZoom(v.zoom * factor);
  const f = zoom / v.zoom;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  return { ...v, zoom, panX: sx - cx - f * (sx - cx - v.panX), panY: sy - cy - f * (sy - cy - v.panY) };
}

/** 90 度ずつ回す（dir = 1 で時計回り）。 */
export function rotate(r: Rotation, dir: 1 | -1): Rotation {
  return ((((r + dir * 90) % 360) + 360) % 360) as Rotation;
}

// ---------------------------------------------------------------------------
// スライス送り・シネ再生・同期
// ---------------------------------------------------------------------------

/** スライスを delta 枚送る。端で止まる（回りこまない）。 */
export function stepSlice(i: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, i + delta));
}

/**
 * シネ再生の次の 1 枚。loop は最後の次が最初、bounce は端で向きを変える。
 */
export function cineNext(i: number, count: number, dir: 1 | -1, mode: "loop" | "bounce"): { index: number; dir: 1 | -1 } {
  if (count <= 1) return { index: 0, dir };
  if (mode === "loop") return { index: (((i + dir) % count) + count) % count, dir };
  const next = i + dir;
  if (next < 0 || next >= count) return { index: i - dir, dir: dir === 1 ? -1 : 1 };
  return { index: next, dir };
}

/** 位置（mm）がいちばん近いスライス。比較表示でスライスをそろえるのに使う。 */
export function nearestSlice(position: number, positions: number[]): number {
  let best = 0;
  let gap = Infinity;
  positions.forEach((p, i) => {
    const d = Math.abs(p - position);
    if (d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// 向きの表示（画面の上下左右が、患者のどちら向きか）
// ---------------------------------------------------------------------------

export const OPPOSITE: Record<Dir, Dir> = { R: "L", L: "R", A: "P", P: "A", H: "F", F: "H" };

export const DIR_LABEL: Record<Dir, string> = { R: "右", L: "左", A: "前", P: "後", H: "頭", F: "足" };

/** 回転・反転のあとで、画面の右と下が患者のどちら向きか。左と上はその反対。 */
export function orientationLabels(orient: { right: Dir; down: Dir }, v: Pick<ViewState, "rotation" | "flipH" | "flipV">): { left: Dir; right: Dir; top: Dir; bottom: Dir } {
  const m = viewMatrix({ ...v, zoom: 1, panX: 0, panY: 0 }, 2, 2, 2, 2);
  // 画像の +x・+y が画面でどちらを向くか（拡大は向きに関係しない）
  const ax: [number, number] = [Math.sign(Math.round(m[0])), Math.sign(Math.round(m[1]))];
  const ay: [number, number] = [Math.sign(Math.round(m[2])), Math.sign(Math.round(m[3]))];
  const toward = (sx: number, sy: number): Dir => {
    if (ax[0] === sx && ax[1] === sy) return orient.right;
    if (ax[0] === -sx && ax[1] === -sy) return OPPOSITE[orient.right];
    if (ay[0] === sx && ay[1] === sy) return orient.down;
    return OPPOSITE[orient.down];
  };
  const right = toward(1, 0);
  const bottom = toward(0, 1);
  return { left: OPPOSITE[right], right, top: OPPOSITE[bottom], bottom };
}
