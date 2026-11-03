// 計測（距離・角度・ROI（関心領域））。値はコードで計算し、計算の式も文字で返す。所見の判定はしない。
// 点は画像の座標（画素）。画素 (i, j) は [i, i+1) × [j, j+1) をしめる。

export interface Pt {
  x: number;
  y: number;
}

export type MeasureKind = "distance" | "angle" | "roi";

export interface Measurement {
  id: string;
  kind: MeasureKind;
  /** 距離：2 点、角度：3 点（2 点目が頂点）、ROI：楕円を囲む箱の 2 隅 */
  points: Pt[];
  /** 画面に出す短い値（例：「42.3 mm」） */
  value: string;
  /** 計算の式 */
  formula: string[];
}

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** 2 点の距離（mm）。spacing は 1 画素の大きさ（mm）。 */
export function distance(a: Pt, b: Pt, spacing: number): { mm: number; formula: string[] } {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const mm = Math.hypot(dx * spacing, dy * spacing);
  return {
    mm,
    formula: [
      `距離 = √((Δx × 画素の大きさ)² + (Δy × 画素の大きさ)²)`,
      `= √((${f1(dx)} × ${f3(spacing)})² + (${f1(dy)} × ${f3(spacing)})²)`,
      `= √(${f1((dx * spacing) ** 2)} + ${f1((dy * spacing) ** 2)}) = ${f1(mm)} mm`,
    ],
  };
}

/** 3 点 A・B（頂点）・C の角度（度）。点が重なると null。 */
export function angle(a: Pt, b: Pt, c: Pt, spacing: number): { deg: number; formula: string[] } | null {
  const u = { x: (a.x - b.x) * spacing, y: (a.y - b.y) * spacing };
  const w = { x: (c.x - b.x) * spacing, y: (c.y - b.y) * spacing };
  const lu = Math.hypot(u.x, u.y);
  const lw = Math.hypot(w.x, w.y);
  if (lu === 0 || lw === 0) return null;
  const dot = u.x * w.x + u.y * w.y;
  const cos = Math.min(1, Math.max(-1, dot / (lu * lw)));
  const deg = (Math.acos(cos) * 180) / Math.PI;
  return {
    deg,
    formula: [`角度 = arccos(BA・BC ÷ (|BA| × |BC|))`, `= arccos(${f1(dot)} ÷ (${f1(lu)} × ${f1(lw)}))`, `= arccos(${f3(cos)}) = ${f1(deg)}°`],
  };
}

export interface RoiStats {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  areaMm2: number;
  formula: string[];
}

/**
 * 楕円の ROI の中の画素（画素の中心が楕円の中にあるもの）の平均・標準偏差など。
 * 標準偏差は標本の式（n − 1 で割る）。画像の外は数えない。
 */
export function roiStats(pixels: ArrayLike<number>, width: number, height: number, a: Pt, b: Pt, spacing: number, unit: string): RoiStats | null {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  if (rx <= 0 || ry <= 0) return null;
  const i0 = Math.max(0, Math.floor(cx - rx));
  const i1 = Math.min(width - 1, Math.ceil(cx + rx));
  const j0 = Math.max(0, Math.floor(cy - ry));
  const j1 = Math.min(height - 1, Math.ceil(cy + ry));
  let n = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  const vals: number[] = [];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const u = (i + 0.5 - cx) / rx;
      const v = (j + 0.5 - cy) / ry;
      if (u * u + v * v > 1) continue;
      const p = pixels[j * width + i];
      vals.push(p);
      sum += p;
      n++;
      if (p < min) min = p;
      if (p > max) max = p;
    }
  }
  if (n === 0) return null;
  const mean = sum / n;
  let ss = 0;
  for (const p of vals) ss += (p - mean) ** 2;
  const sd = n > 1 ? Math.sqrt(ss / (n - 1)) : 0;
  const areaMm2 = n * spacing * spacing;
  return {
    n,
    mean,
    sd,
    min,
    max,
    areaMm2,
    formula: [
      `平均 = Σ値 ÷ n = ${f1(sum)} ÷ ${n} = ${f1(mean)} ${unit}`,
      `SD = √(Σ(値 − 平均)² ÷ (n − 1)) = √(${f1(ss)} ÷ ${Math.max(1, n - 1)}) = ${f1(sd)} ${unit}`,
      `面積 = n × 画素の面積 = ${n} × ${f3(spacing)}² = ${f1(areaMm2)} mm²`,
    ],
  };
}

/** 計測の点から、表示用の値と式を作る。ROI は画素が要る。 */
export function finishMeasurement(
  id: string,
  kind: MeasureKind,
  points: Pt[],
  ctx: { spacing: number; pixels: ArrayLike<number>; width: number; height: number; unit: string },
): Measurement | null {
  if (kind === "distance" && points.length === 2) {
    const d = distance(points[0], points[1], ctx.spacing);
    if (d.mm === 0) return null;
    return { id, kind, points, value: `${f1(d.mm)} mm`, formula: d.formula };
  }
  if (kind === "angle" && points.length === 3) {
    const a = angle(points[0], points[1], points[2], ctx.spacing);
    if (!a) return null;
    return { id, kind, points, value: `${f1(a.deg)}°`, formula: a.formula };
  }
  if (kind === "roi" && points.length === 2) {
    const s = roiStats(ctx.pixels, ctx.width, ctx.height, points[0], points[1], ctx.spacing, ctx.unit);
    if (!s) return null;
    return { id, kind, points, value: `平均 ${f1(s.mean)} ± ${f1(s.sd)} ${ctx.unit}（n=${s.n}、${f1(s.areaMm2)} mm²）`, formula: s.formula };
  }
  return null;
}

/** 2 つの距離の比（例：心胸郭比 = 心臓の幅 ÷ 胸郭の幅）。判定はしない。 */
export function ratio(numMm: number, denMm: number): { value: number; formula: string } | null {
  if (denMm <= 0) return null;
  const value = numMm / denMm;
  return { value, formula: `${f1(numMm)} ÷ ${f1(denMm)} = ${f2(value)}（${f1(value * 100)}%）` };
}
