// 合成画像を描くための小さな道具。形（楕円・帯・骨の管）を、体の座標（mm）で浮動小数の画素に描く。
// 座標：画像の中心が原点、x は画像の右、y は画像の下。撮影ごとの「ずれ」（Pose）は体の側を動かす。

import { gaussian, type Rng } from "./random";

/** 撮影ごとの体のずれ（mm と ラジアン）。比較表示で前回と少しずれて見えるように使う。 */
export interface Pose {
  dx: number;
  dy: number;
  angle: number;
}

export const NO_POSE: Pose = { dx: 0, dy: 0, angle: 0 };

export class Raster {
  readonly data: Float32Array;
  private readonly cos: number;
  private readonly sin: number;

  constructor(
    readonly width: number,
    readonly height: number,
    /** 1 画素の大きさ（mm）。縦横同じ。 */
    readonly spacing: number,
    private readonly pose: Pose = NO_POSE,
    fill = 0,
  ) {
    this.data = new Float32Array(width * height).fill(fill);
    this.cos = Math.cos(pose.angle);
    this.sin = Math.sin(pose.angle);
  }

  /** 同じ大きさ・同じずれの、空の画像。 */
  blank(fill = 0): Raster {
    return new Raster(this.width, this.height, this.spacing, this.pose, fill);
  }

  /** 体の座標の箱（mm）に重なる画素を順に渡す。x, y は画素の中心の体の座標。 */
  scan(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number, k: number) => void): void {
    const { width: w, height: h, spacing: s, cos: c, sin: sn, pose } = this;
    let i0 = Infinity;
    let i1 = -Infinity;
    let j0 = Infinity;
    let j1 = -Infinity;
    for (const [px, py] of [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ]) {
      // 体 → 画像：X = R(angle)·p + d
      const X = c * px - sn * py + pose.dx;
      const Y = sn * px + c * py + pose.dy;
      const i = X / s + w / 2 - 0.5;
      const j = Y / s + h / 2 - 0.5;
      i0 = Math.min(i0, i);
      i1 = Math.max(i1, i);
      j0 = Math.min(j0, j);
      j1 = Math.max(j1, j);
    }
    const ia = Math.max(0, Math.floor(i0) - 1);
    const ib = Math.min(w - 1, Math.ceil(i1) + 1);
    const ja = Math.max(0, Math.floor(j0) - 1);
    const jb = Math.min(h - 1, Math.ceil(j1) + 1);
    for (let j = ja; j <= jb; j++) {
      const Y = (j + 0.5 - h / 2) * s - pose.dy;
      for (let i = ia; i <= ib; i++) {
        const X = (i + 0.5 - w / 2) * s - pose.dx;
        // 画像 → 体：p = R(-angle)·(X - d)
        fn(c * X + sn * Y, -sn * X + c * Y, j * w + i);
      }
    }
  }

  /** 全部の画素に関数を当てる（体の座標つき）。 */
  each(fn: (x: number, y: number, k: number) => void): void {
    const hw = (this.width * this.spacing) / 2 + Math.abs(this.pose.dx) + 2;
    const hh = (this.height * this.spacing) / 2 + Math.abs(this.pose.dy) + 2;
    const r = Math.hypot(hw, hh);
    this.scan(-r, -r, r, r, fn);
  }
}

export type PaintMode = "set" | "add";

export interface EllipseShape {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** 傾き（ラジアン） */
  angle?: number;
}

function apply(data: Float32Array, k: number, value: number, cover: number, mode: PaintMode) {
  if (cover <= 0) return;
  if (mode === "add") data[k] += value * cover;
  else data[k] = data[k] * (1 - cover) + value * cover;
}

/** 楕円の中を塗る（set）か足す（add）。縁は edge mm の幅でなめらかにする。 */
export function ellipse(r: Raster, e: EllipseShape, value: number, mode: PaintMode = "set", edge = 1): void {
  const a = e.angle ?? 0;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = Math.max(e.rx, e.ry) + edge;
  r.scan(e.x - m, e.y - m, e.x + m, e.y + m, (x, y, k) => {
    const u = c * (x - e.x) + s * (y - e.y);
    const v = -s * (x - e.x) + c * (y - e.y);
    const q = Math.sqrt((u / e.rx) ** 2 + (v / e.ry) ** 2);
    const rho = Math.hypot(u, v);
    // 縁までの距離（中心から見た向きでの近似）
    const dist = q > 0 ? (rho * (q - 1)) / q : -Math.min(e.rx, e.ry);
    apply(r.data, k, value, Math.min(1, Math.max(0, 0.5 - dist / edge)), mode);
  });
}

/** 楕円体を透かしたときの厚み（X線用）：value × √(1 − ρ²) を足す。 */
export function dome(r: Raster, e: EllipseShape, value: number): void {
  const a = e.angle ?? 0;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = Math.max(e.rx, e.ry);
  r.scan(e.x - m, e.y - m, e.x + m, e.y + m, (x, y, k) => {
    const u = c * (x - e.x) + s * (y - e.y);
    const v = -s * (x - e.x) + c * (y - e.y);
    const q2 = (u / e.rx) ** 2 + (v / e.ry) ** 2;
    if (q2 < 1) r.data[k] += value * Math.sqrt(1 - q2);
  });
}

/** 角の丸い長方形（中心 x, y、半分の幅 hw・高さ hh、角の半径 round）。 */
export function roundRect(r: Raster, x: number, y: number, hw: number, hh: number, round: number, value: number, mode: PaintMode = "set", edge = 1): void {
  const rr = Math.min(round, hw, hh);
  r.scan(x - hw - edge, y - hh - edge, x + hw + edge, y + hh + edge, (px, py, k) => {
    const qx = Math.abs(px - x) - hw + rr;
    const qy = Math.abs(py - y) - hh + rr;
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
    apply(r.data, k, value, Math.min(1, Math.max(0, 0.5 - d / edge)), mode);
  });
}

/** 線分のまわり radius mm の帯（両端は丸い）。 */
export function capsule(r: Raster, x0: number, y0: number, x1: number, y1: number, radius: number, value: number, mode: PaintMode = "set", edge = 1): void {
  const m = radius + edge;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1e-9;
  r.scan(Math.min(x0, x1) - m, Math.min(y0, y1) - m, Math.max(x0, x1) + m, Math.max(y0, y1) + m, (x, y, k) => {
    const t = Math.min(1, Math.max(0, ((x - x0) * dx + (y - y0) * dy) / len2));
    const d = Math.hypot(x - x0 - t * dx, y - y0 - t * dy) - radius;
    apply(r.data, k, value, Math.min(1, Math.max(0, 0.5 - d / edge)), mode);
  });
}

/** 骨の管の 1 点（中心と太さ mm）。 */
export interface TubePoint {
  x: number;
  y: number;
  r: number;
}

/**
 * 中空の骨（皮質と髄）を透かした厚み（X線用）。折れ線に沿って、皮質は外側の弦 − 内側の弦、髄は内側の弦。
 * 骨の縁が白く、中が少し暗く見える。wall は皮質の厚さの割合（0〜1）。
 */
export function tube(r: Raster, pts: TubePoint[], wall: number, cortex: number, marrow: number): void {
  if (pts.length < 2) return;
  const maxR = Math.max(...pts.map((p) => p.r));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  r.scan(Math.min(...xs) - maxR, Math.min(...ys) - maxR, Math.max(...xs) + maxR, Math.max(...ys) + maxR, (x, y, k) => {
    let best = Infinity;
    let rad = 0;
    for (let n = 0; n < pts.length - 1; n++) {
      const a = pts[n];
      const b = pts[n + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1e-9;
      const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / len2));
      const d = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
      if (d < best) {
        best = d;
        rad = a.r + (b.r - a.r) * t;
      }
    }
    if (best >= rad) return;
    const inner = rad * (1 - wall);
    const outer = 2 * Math.sqrt(rad * rad - best * best);
    const inn = best < inner ? 2 * Math.sqrt(inner * inner - best * best) : 0;
    r.data[k] += cortex * (outer - inn) + marrow * inn;
  });
}

/** 3 次元の点（mm）。z は頭の向きが +。 */
export interface P3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 3 次元の線分のまわり radius mm の管を、高さ z の断面で切った形を塗る（CT・MRI 用）。
 * only を渡すと、いまの値がその条件に合う画素だけ塗る（例：肺の中だけに血管を描く）。
 */
export function capsule3d(r: Raster, a: P3, b: P3, radius: number, z: number, value: number, only?: (v: number) => boolean, edge = 1): void {
  const dz = b.z - a.z;
  let t0 = 0;
  let t1 = 1;
  if (Math.abs(dz) < 1e-6) {
    if (Math.abs(z - a.z) > radius) return;
  } else {
    const ta = (z - radius - a.z) / dz;
    const tb = (z + radius - a.z) / dz;
    t0 = Math.max(0, Math.min(ta, tb));
    t1 = Math.min(1, Math.max(ta, tb));
    if (t0 > t1) return;
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy + dz * dz || 1e-9;
  const xs = [a.x + dx * t0, a.x + dx * t1];
  const ys = [a.y + dy * t0, a.y + dy * t1];
  const m = radius + edge;
  r.scan(Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m, (x, y, k) => {
    if (only && !only(r.data[k])) return;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / len2));
    const d = Math.hypot(x - a.x - t * dx, y - a.y - t * dy, z - a.z - t * dz) - radius;
    const c = Math.min(1, Math.max(0, 0.5 - d / edge));
    if (c > 0) r.data[k] = r.data[k] * (1 - c) + value * c;
  });
}

/** 楕円体を高さ z で切った楕円。切れないときは null。 */
export function sliceOf(e: { x: number; y: number; z: number; rx: number; ry: number; rz: number; angle?: number }, z: number, min = 0.5): EllipseShape | null {
  const f = 1 - ((z - e.z) / e.rz) ** 2;
  if (f <= 0) return null;
  const s = Math.sqrt(f);
  if (e.rx * s < min || e.ry * s < min) return null;
  return { x: e.x, y: e.y, rx: e.rx * s, ry: e.ry * s, angle: e.angle };
}

/** 折れ線の表で、y に対する値を直線でつなぐ。 */
export function lerpTable(table: [number, number][], y: number): number {
  if (y <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (y <= table[i][0]) {
      const [y0, v0] = table[i - 1];
      const [y1, v1] = table[i];
      return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
    }
  }
  return table[table.length - 1][1];
}

/** 箱の中の画素に、関数の値を足す。 */
export function field(r: Raster, x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => number): void {
  r.scan(x0, y0, x1, y1, (x, y, k) => {
    const v = fn(x, y);
    if (v) r.data[k] += v;
  });
}

/** 0〜1 になめらかにつなぐ（エルミート補間）。 */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 縦横に分けた箱ぼかし（radius 画素、passes 回）。 */
export function blur(r: Raster, radius: number, passes = 1): void {
  if (radius < 1) return;
  const { width: w, height: h } = r;
  const tmp = new Float32Array(w * h);
  const src = r.data;
  const win = 2 * radius + 1;
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < h; j++) {
      let acc = 0;
      for (let i = -radius; i <= radius; i++) acc += src[j * w + Math.min(w - 1, Math.max(0, i))];
      for (let i = 0; i < w; i++) {
        tmp[j * w + i] = acc / win;
        acc += src[j * w + Math.min(w - 1, i + radius + 1)] - src[j * w + Math.max(0, i - radius)];
      }
    }
    for (let i = 0; i < w; i++) {
      let acc = 0;
      for (let j = -radius; j <= radius; j++) acc += tmp[Math.min(h - 1, Math.max(0, j)) * w + i];
      for (let j = 0; j < h; j++) {
        src[j * w + i] = acc / win;
        acc += tmp[Math.min(h - 1, j + radius + 1) * w + i] - tmp[Math.max(0, j - radius) * w + i];
      }
    }
  }
}

/** 正規分布の雑音を足す。scale(v) で画素ごとに強さを変えられる。 */
export function addNoise(r: Raster, rng: Rng, sigma: number, scale?: (v: number) => number): void {
  const d = r.data;
  for (let k = 0; k < d.length; k++) d[k] += gaussian(rng) * sigma * (scale ? scale(d[k]) : 1);
}

/** 整数の画素（Int16Array）にする。lo〜hi に収める。 */
export function toInt16(r: Raster, lo: number, hi: number, map: (v: number) => number = (v) => v): Int16Array {
  const out = new Int16Array(r.data.length);
  for (let k = 0; k < out.length; k++) out[k] = Math.round(Math.min(hi, Math.max(lo, map(r.data[k]))));
  return out;
}
