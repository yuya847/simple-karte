// canvas に描く道具（ブラウザだけで使う）。画素 → 灰色の画像、計測の線、四隅の文字。

import type { Measurement, Pt } from "@/lib/pacs/measure";
import { applyMatrix, type Matrix } from "@/lib/pacs/viewport";

/** 画面の文字の色（DICOM ビューアの四隅表示に合わせて、黒地に明るい灰）。 */
export const OVERLAY = "#e8e2d4";
export const OVERLAY_DIM = "#a8a090";
/** 計測の線の色（山吹） */
export const MEASURE = "#f2c14e";
/** 「架空の合成画像」の表示の色（朱を明るくしたもの） */
export const FICTION = "#f08a6c";

/** 画素を、早見表（LUT）で灰色にして canvas に置く。 */
export function paintPixels(target: HTMLCanvasElement, px: Int16Array, width: number, height: number, lut: Uint8ClampedArray, min: number): void {
  if (target.width !== width) target.width = width;
  if (target.height !== height) target.height = height;
  const ctx = target.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(width, height);
  const d = img.data;
  const top = lut.length - 1;
  for (let k = 0; k < px.length; k++) {
    const i = px[k] - min;
    const g = lut[i < 0 ? 0 : i > top ? top : i];
    const o = k * 4;
    d[o] = g;
    d[o + 1] = g;
    d[o + 2] = g;
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** 影つきの文字（明るい画像の上でも読めるように）。 */
export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = OVERLAY, align: CanvasTextAlign = "left") {
  ctx.textAlign = align;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/** 四隅に行を並べる。 */
export function corner(ctx: CanvasRenderingContext2D, lines: string[], where: "tl" | "tr" | "bl" | "br", w: number, h: number, lineH = 15) {
  const pad = 8;
  const right = where === "tr" || where === "br";
  const bottom = where === "bl" || where === "br";
  lines.forEach((s, i) => {
    const y = bottom ? h - pad - (lines.length - 1 - i) * lineH : pad + 11 + i * lineH;
    text(ctx, s, right ? w - pad : pad, y, i === 0 && !bottom ? OVERLAY : OVERLAY_DIM, right ? "right" : "left");
  });
}

/** 計測の線と値を、画面の座標で描く。 */
export function drawMeasurement(ctx: CanvasRenderingContext2D, m: Matrix, kind: Measurement["kind"], pts: Pt[], label: string | null, color = MEASURE) {
  const s = pts.map((p) => applyMatrix(m, p.x, p.y));
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  if (kind === "distance" && s.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(s[0][0], s[0][1]);
    ctx.lineTo(s[1][0], s[1][1]);
    ctx.stroke();
    for (const [x, y] of s.slice(0, 2)) tick(ctx, x, y);
  } else if (kind === "angle" && s.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(s[0][0], s[0][1]);
    for (const [x, y] of s.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
    for (const [x, y] of s) tick(ctx, x, y);
    if (s.length >= 3) {
      const [bx, by] = s[1];
      const a0 = Math.atan2(s[0][1] - by, s[0][0] - bx);
      const a1 = Math.atan2(s[2][1] - by, s[2][0] - bx);
      let d = a1 - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(bx, by, 18, a0, a0 + d, d < 0);
      ctx.stroke();
    }
  } else if (kind === "roi" && s.length >= 2) {
    // 楕円は画像の座標の箱で決まるので、4 隅を変換して中心と軸を出す（回転しても合う）
    const cx = (pts[0].x + pts[1].x) / 2;
    const cy = (pts[0].y + pts[1].y) / 2;
    const rx = Math.abs(pts[1].x - pts[0].x) / 2;
    const ry = Math.abs(pts[1].y - pts[0].y) / 2;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      const [x, y] = applyMatrix(m, cx + rx * Math.cos(t), cy + ry * Math.sin(t));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (label) {
    const anchor = kind === "angle" && s.length >= 2 ? s[1] : kind === "roi" ? applyMatrix(m, Math.max(pts[0].x, pts[1].x), Math.min(pts[0].y, pts[1].y)) : s[s.length - 1];
    text(ctx, label, anchor[0] + 8, anchor[1] - 6, color);
  }
}

function tick(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

/** 物差し：画面で 60〜160 px になる長さ（1 cm・2 cm・5 cm・10 cm から選ぶ）。 */
export function scaleBar(mmPerScreenPx: number): { mm: number; px: number } {
  for (const mm of [10, 20, 50, 100, 200]) {
    const px = mm / mmPerScreenPx;
    if (px >= 60) return { mm, px };
  }
  return { mm: 200, px: 200 / mmPerScreenPx };
}
