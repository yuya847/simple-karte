"use client";

import { useEffect, useRef } from "react";
import { getFrame, valueRange } from "@/lib/pacs/frames";
import type { SeriesSpec } from "@/lib/pacs/types";
import { autoWindow, buildLut } from "@/lib/pacs/window";
import { FICTION, paintPixels, text } from "./draw";

const SIZE = 76;

/** シリーズの代表の 1 枚（真ん中のスライス）を小さく描く。 */
export function Thumbnail({ series, selected, onSelect }: { series: SeriesSpec; selected: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = SIZE * dpr;
    c.height = SIZE * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const mid = Math.floor(series.positions.length / 2);
    const px = getFrame(series, mid);
    const [lo, hi] = valueRange(series);
    const w = series.window === "auto" ? autoWindow(px) : series.window;
    const off = document.createElement("canvas");
    paintPixels(off, px, series.width, series.height, buildLut(lo, hi, w.ww, w.wl), lo);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SIZE, SIZE);
    const s = Math.min(SIZE / series.width, SIZE / series.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(off, (SIZE - series.width * s) / 2, (SIZE - series.height * s) / 2, series.width * s, series.height * s);
    ctx.font = "10px ui-sans-serif, system-ui, 'Hiragino Sans', sans-serif";
    text(ctx, "架空", 4, 12, FICTION);
  }, [series]);

  const n = series.positions.length;
  return (
    <button
      type="button"
      onClick={onSelect}
      title={`Se ${series.number}：${series.description}（${n > 1 ? `${n} 枚` : "1 枚"}）`}
      className={`shrink-0 rounded-md border p-1 text-left ${selected ? "border-ai bg-ai-soft" : "border-rule bg-sheet hover:bg-paper"}`}
    >
      <canvas ref={ref} style={{ width: SIZE, height: SIZE }} className="block rounded-sm" aria-hidden />
      <div className="mt-0.5 w-[76px] truncate text-[11px] leading-tight">
        <span className="nums text-ink-faint">Se {series.number}</span> {series.description}
      </div>
      <div className="nums text-[10px] text-ink-faint">{n > 1 ? `${n} 枚` : "1 枚"}</div>
    </button>
  );
}
