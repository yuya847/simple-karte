"use client";

import { resizeColumns } from "@/lib/column-resize";
import { useEffect, useRef, useState, type HTMLAttributes } from "react";

/** Keep the existing responsive grid, exposing its internal column boundaries. */
export function ResizableChart({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<number[] | null>(null);
  const [columns, setColumns] = useState<number[]>([]);
  const start = useRef<{ x: number; widths: number[]; index: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(getComputedStyle(el).gridTemplateColumns.split(" ").map(Number.parseFloat));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [widths]);
  useEffect(() => {
    const reset = () => setWidths(null);
    window.addEventListener("resize", reset);
    return () => window.removeEventListener("resize", reset);
  }, []);
  return <div {...props} ref={ref} style={{ ...props.style, position: "relative", gridTemplateColumns: widths?.map(w => `${w}px`).join(" ") }}>
    {children}
    {columns.slice(0, -2).map((_, index) => <div key={index} role="separator" aria-orientation="vertical" aria-valuenow={Math.round(columns[index])} aria-label={index === 0 && columns.length === 4 ? "日付欄の幅" : "経過と記事の幅"} tabIndex={0}
      className="absolute inset-y-0 z-20 w-2 -translate-x-1/2 cursor-ew-resize touch-none hover:bg-ai/20 focus-visible:bg-ai/20"
      style={{ left: columns.slice(0, index + 1).reduce((a, b) => a + b, 0) }}
      onDoubleClick={() => setWidths(null)}
      onKeyDown={e => {
        if (e.key === "Home") { setWidths(null); return; }
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        setWidths(resizeColumns(columns, index, e.key === "ArrowLeft" ? -16 : 16));
      }}
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, widths: columns, index };
      }}
      onPointerMove={e => {
        const s = start.current;
        if (!s || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        setWidths(resizeColumns(s.widths, s.index, e.clientX - s.x));
      }}
      onPointerUp={e => { start.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { start.current = null; }}
    />)}
  </div>;
}
