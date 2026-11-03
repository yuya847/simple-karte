"use client";

import { Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  label: string;
  /** Called with a PNG data URL after each stroke, or null when cleared. */
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

/**
 * A signature box for a finger or Apple Pencil (also a mouse). Pointer events with touch-action: none,
 * so the page does not scroll while signing. Drawn at the device's pixel ratio so the line stays sharp.
 */
export function SignaturePad({ label, onChange, height = 150 }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const inked = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width } = c.getBoundingClientRect();
      c.width = Math.round(width * ratio);
      c.height = Math.round(height * ratio);
      const ctx = c.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1f2430";
      inked.current = false;
      setEmpty(true);
      onChange(null);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    // Pencil pressure makes the line a little thicker; a finger or mouse reports 0.5.
    ctx.lineWidth = 1.6 + (e.pressure || 0.5) * 2.2;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!inked.current) {
      inked.current = true;
      setEmpty(false);
    }
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (inked.current) onChange(canvas.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    inked.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-bold">{label}</span>
        <button type="button" onClick={clear} className="flex items-center gap-1 rounded border border-rule px-3 py-1.5 text-sm">
          <Eraser size={14} />
          書き直す
        </button>
      </div>
      <div className="relative">
        <canvas
          ref={canvas}
          aria-label={`${label}の署名欄`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ height, touchAction: "none" }}
          className="block w-full rounded-lg border-2 border-ink/40 bg-white"
        />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-faint">ここに指かペンで署名してください</span>}
        <span className="pointer-events-none absolute bottom-3 left-4 right-4 border-b border-dashed border-ink/30" />
      </div>
    </div>
  );
}
