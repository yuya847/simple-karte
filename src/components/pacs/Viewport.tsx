"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { getFrame, valueRange } from "@/lib/pacs/frames";
import { angle, distance, finishMeasurement, roiStats, type MeasureKind, type Measurement, type Pt } from "@/lib/pacs/measure";
import { positionLabel } from "@/lib/pacs/studies";
import type { PacsStudy, SeriesSpec } from "@/lib/pacs/types";
import { applyMatrix, invertMatrix, orientationLabels, stepSlice, viewMatrix, zoomAt, type ViewState } from "@/lib/pacs/viewport";
import { buildLut, dragStep, dragWindow } from "@/lib/pacs/window";
import type { Patient } from "@/lib/types";
import { corner, drawMeasurement, FICTION, MEASURE, OVERLAY, paintPixels, scaleBar, text } from "./draw";

export type Tool = "window" | "pan" | "zoom" | "distance" | "angle" | "roi";

/** 描いている途中の計測。points は決まった点、hover はマウスの位置。 */
export interface Draft {
  kind: MeasureKind;
  points: Pt[];
  hover: Pt | null;
}

interface Drag {
  mode: "window" | "pan" | "zoom" | "measure";
  sx: number;
  sy: number;
  view: ViewState;
  /** 距離・ROI の始めの点（描き終わりまで覚えておく） */
  start?: Pt;
  kind?: MeasureKind;
}

const FONT = "12px ui-sans-serif, system-ui, 'Hiragino Sans', 'Yu Gothic UI', sans-serif";

/** 1 枚の表示枠。canvas に画像・計測・四隅の文字を描き、マウスで操作する。 */
export function Viewport({
  patient,
  today,
  pacs,
  series,
  view,
  onView,
  tool,
  measurements,
  onMeasure,
  draft,
  onDraft,
  active,
  onActivate,
  tag,
  newId,
}: {
  patient: Patient;
  today: CalendarDate;
  pacs: PacsStudy | null;
  series: SeriesSpec | null;
  view: ViewState;
  /** 新しい表示（関数なら、最新の表示から作る） */
  onView: (next: ViewState | ((v: ViewState) => ViewState)) => void;
  tool: Tool;
  measurements: Measurement[];
  onMeasure: (m: Measurement) => void;
  draft: Draft | null;
  onDraft: (d: Draft | null) => void;
  active: boolean;
  onActivate: () => void;
  tag?: string;
  newId: () => string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const wheelRef = useRef(0);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const range = useMemo<[number, number]>(() => (series ? valueRange(series) : [0, 1]), [series]);
  const frame = useMemo(() => (series ? getFrame(series, view.slice) : null), [series, view.slice]);
  const lut = useMemo(() => buildLut(range[0], range[1], view.ww, view.wl, view.invert), [range, view.ww, view.wl, view.invert]);
  const m = useMemo(() => (series ? viewMatrix(view, series.width, series.height, size.w, size.h) : null), [series, view, size]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 描く
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || size.w === 0 || size.h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(size.w * dpr);
    const H = Math.round(size.h * dpr);
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT;
    ctx.textBaseline = "alphabetic";

    if (!pacs || !series || !frame || !m) {
      text(ctx, pacs?.status === "未実施" ? "まだ撮影していません（予約中）。画像はありません。" : "画像がありません", size.w / 2, size.h / 2, OVERLAY, "center");
      text(ctx, "架空の合成画像を表示する枠です", size.w / 2, size.h / 2 + 18, FICTION, "center");
      return;
    }

    // 画像
    const off = offRef.current ?? document.createElement("canvas");
    offRef.current = off;
    paintPixels(off, frame, series.width, series.height, lut, range[0]);
    ctx.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
    const scale = Math.hypot(m[0], m[1]);
    ctx.imageSmoothingEnabled = scale < 2.5;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(off, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT;

    // 計測
    for (const mm of measurements) drawMeasurement(ctx, m, mm.kind, mm.points, mm.kind === "roi" ? mm.value.split("（")[0] : mm.value);
    if (draft) {
      const pts = draft.hover ? [...draft.points, draft.hover] : draft.points;
      drawMeasurement(ctx, m, draft.kind, pts, liveLabel(draft.kind, pts, series, frame), MEASURE);
    }

    // 四隅の文字（DICOM ビューアの四隅表示の考え方）
    const s = pacs.study;
    corner(ctx, [`${patient.name}（${patient.kana}）`, `ID ${patient.id}`, `${patient.sex}・${patient.age}歳`], "tl", size.w, size.h);
    corner(
      ctx,
      [`${tag ? `${tag}　` : ""}${formatShort(addDays(today, s.day))}${s.time ? ` ${s.time}` : ""}`, `${s.modality}　${s.region}`, `Se ${series.number}：${series.description}`],
      "tr",
      size.w,
      size.h,
    );
    const turn = [view.rotation ? `回転 ${view.rotation}°` : "", view.flipH ? "左右反転" : "", view.flipV ? "上下反転" : ""].filter(Boolean).join("・");
    corner(ctx, [`WW ${view.ww} / WL ${view.wl}${view.invert ? "（白黒反転）" : ""}`, `表示 ${Math.round(scale * 100)}%${turn ? `　${turn}` : ""}`], "bl", size.w, size.h);
    const n = series.positions.length;
    corner(
      ctx,
      n > 1
        ? [`スライス ${view.slice + 1} / ${n}`, `${positionLabel(series, view.slice)}　厚さ ${series.thickness ?? "-"} mm`, `画素 ${series.spacing.toFixed(2)} mm`]
        : [`画像 1 / 1`, `画素 ${series.spacing.toFixed(2)} mm`],
      "br",
      size.w,
      size.h,
    );
    // 架空の合成画像であることを、画像の上に必ず出す
    text(ctx, "架空の合成画像（実在の患者の画像ではありません）", size.w / 2, 18, FICTION, "center");

    // 向きの文字（画面の上下左右が患者のどちら向きか）
    const o = orientationLabels(series.orient, view);
    text(ctx, o.left, 10, size.h / 2 + 4, OVERLAY);
    text(ctx, o.right, size.w - 10, size.h / 2 + 4, OVERLAY, "right");
    text(ctx, o.top, size.w / 2, 36, OVERLAY, "center");
    text(ctx, o.bottom, size.w / 2, size.h - 26, OVERLAY, "center");

    // 物差し
    const bar = scaleBar(series.spacing / scale);
    const bx = size.w / 2 - bar.px / 2;
    const by = size.h - 12;
    ctx.strokeStyle = OVERLAY;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx, by - 4);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + bar.px, by);
    ctx.lineTo(bx + bar.px, by - 4);
    ctx.stroke();
    text(ctx, bar.mm >= 10 ? `${bar.mm / 10} cm` : `${bar.mm} mm`, bx + bar.px + 6, by + 3, OVERLAY);

    if (active) {
      ctx.strokeStyle = "rgba(242,193,78,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, size.w - 2, size.h - 2);
    }
  }, [size, pacs, series, frame, lut, m, range, measurements, draft, patient, today, view, tag, active]);

  const locate = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const [x, y] = m ? applyMatrix(invertMatrix(m), sx, sy) : [0, 0];
    return { sx, sy, p: { x, y } };
  };

  const finish = (kind: MeasureKind, points: Pt[]) => {
    if (!series || !frame) return;
    const done = finishMeasurement(newId(), kind, points, { spacing: series.spacing, pixels: frame, width: series.width, height: series.height, unit: series.unit });
    if (done) onMeasure(done);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    onActivate();
    if (!series || !m) return;
    const { sx, sy, p } = locate(e.clientX, e.clientY);
    const mode: Drag["mode"] | Tool = e.button === 1 || e.shiftKey ? "pan" : e.button === 2 || e.ctrlKey || e.metaKey ? "zoom" : tool;
    if (mode === "angle") {
      const pts = draft?.kind === "angle" ? [...draft.points, p] : [p];
      if (pts.length === 3) {
        finish("angle", pts);
        onDraft(null);
      } else onDraft({ kind: "angle", points: pts, hover: p });
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ポインタが取れなくても、canvas の上でのドラッグは続けられる
    }
    if (mode === "distance" || mode === "roi") {
      onDraft({ kind: mode, points: [p], hover: p });
      dragRef.current = { mode: "measure", sx, sy, view, start: p, kind: mode };
      return;
    }
    dragRef.current = { mode, sx, sy, view };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!series) return;
    const { sx, sy, p } = locate(e.clientX, e.clientY);
    const d = dragRef.current;
    if (d?.mode === "measure" && d.start && d.kind) {
      onDraft({ kind: d.kind, points: [d.start], hover: p });
      return;
    }
    if (draft) onDraft({ ...draft, hover: p });
    if (!d) return;
    const dx = sx - d.sx;
    const dy = sy - d.sy;
    if (d.mode === "window") onView({ ...d.view, ...dragWindow(d.view, dx, dy, dragStep(range)) });
    else if (d.mode === "pan") onView({ ...d.view, panX: d.view.panX + dx, panY: d.view.panY + dy });
    else onView(zoomAt(d.view, Math.exp(-dy * 0.01), d.sx, d.sy, size.w, size.h));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.mode === "measure" && d.start && d.kind) {
      const { p } = locate(e.clientX, e.clientY);
      finish(d.kind, [d.start, p]);
      onDraft(null);
    }
  };

  // ホイール：断面はスライス送り、1 枚の画像と ⌘/Ctrl＋ホイールは拡大縮小
  const onWheel = useEffectEvent((e: WheelEvent) => {
    if (!series) return;
    e.preventDefault();
    onActivate();
    const { sx, sy } = locate(e.clientX, e.clientY);
    if (e.ctrlKey || e.metaKey || series.positions.length <= 1) {
      onView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.0015), sx, sy, size.w, size.h));
      return;
    }
    const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    let steps = 0;
    if (Math.abs(delta) >= 50) {
      steps = Math.sign(delta);
      wheelRef.current = 0;
    } else {
      wheelRef.current += delta;
      if (Math.abs(wheelRef.current) >= 50) {
        steps = Math.sign(wheelRef.current);
        wheelRef.current = 0;
      }
    }
    const n = series.positions.length;
    if (steps) onView((v) => ({ ...v, slice: stepSlice(v.slice, steps, n) }));
  });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const h = (e: WheelEvent) => onWheel(e);
    c.addEventListener("wheel", h, { passive: false });
    return () => c.removeEventListener("wheel", h);
  }, []);

  const cursor = tool === "pan" ? "cursor-grab" : tool === "zoom" ? "cursor-zoom-in" : tool === "window" ? "cursor-ns-resize" : "cursor-crosshair";

  return (
    <div ref={boxRef} className="relative h-full min-h-0 w-full overflow-hidden rounded-md bg-black">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full touch-none select-none ${cursor}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
        role="img"
        aria-label={pacs ? `${pacs.study.modality} ${pacs.study.region}（架空の合成画像）` : "画像なし"}
      />
    </div>
  );
}

/** 描いている途中の計測の値（画面に出すだけ。決まるのは離したとき）。 */
function liveLabel(kind: MeasureKind, pts: Pt[], series: SeriesSpec, frame: Int16Array): string | null {
  if (kind === "distance" && pts.length >= 2) return `${distance(pts[0], pts[1], series.spacing).mm.toFixed(1)} mm`;
  if (kind === "angle" && pts.length >= 3) {
    const a = angle(pts[0], pts[1], pts[2], series.spacing);
    return a ? `${a.deg.toFixed(1)}°` : null;
  }
  if (kind === "roi" && pts.length >= 2) {
    const s = roiStats(frame, series.width, series.height, pts[0], pts[1], series.spacing, series.unit);
    return s ? `平均 ${s.mean.toFixed(1)} ± ${s.sd.toFixed(1)} ${series.unit}` : null;
  }
  return null;
}
