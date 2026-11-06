"use client";

import { useEffect, useRef } from "react";
import { cycleMs, sampleOf, TRACE_RANGE, type TraceKind } from "@/lib/monitor";

export interface Trace {
  kind: TraceKind;
  /** The rate now (/分): beats for ecg and pleth, breaths for resp. Changing it changes the spacing from the next cycle on. */
  rate: number;
  color: string;
  label: string;
}

interface Props {
  traces: Trace[];
  /** Height in CSS px (the lanes share it). */
  height?: number;
  /** Sweep speed in px per second (a bedside monitor runs 25 mm/s; here about 100 px/s). */
  speed?: number;
  className?: string;
}

const BG = "#0b1512";

/**
 * The sweeping traces of a monitor, drawn in the browser on a canvas: the pen moves right at a fixed speed,
 * clears a bar ahead of itself and starts again from the left edge. The phase of each trace is carried
 * forward frame by frame, so a change of rate just changes the spacing of the next beats. Drawing stops
 * while the tab is hidden and starts again when it is shown. On the server nothing is drawn (the labels
 * and the note beside the canvas still are). 模擬: the shapes are textbook shapes, not a recording.
 */
export function MonitorCanvas({ traces, height = 240, speed = 100, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The loop reads the rates from a ref, so a new rate does not restart the sweep.
  const tracesRef = useRef(traces);
  useEffect(() => {
    tracesRef.current = traces;
  }, [traces]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let width = 0;
    let dpr = 1;
    let x = 0;
    let last: number | null = null;
    const phases: number[] = [];
    let raf = 0;
    let running = false;

    const fit = () => {
      dpr = window.devicePixelRatio || 1;
      width = Math.max(100, canvas.clientWidth);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);
      x = 0;
      // 開いた直後・幅を変えた直後にも、全幅に直近の周期を表示する。
      const ts = tracesRef.current;
      ts.forEach((t, i) => {
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let px = 0; px <= width; px++) {
          const phase = (px - width) / speed * 1000 / cycleMs(t.kind, t.rate);
          const y = laneY(i, ts.length, t.kind, sampleOf(t.kind, phase - Math.floor(phase)));
          if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
        }
        ctx.stroke();
      });
    };

    const laneY = (i: number, n: number, kind: TraceKind, v: number) => {
      const laneH = height / n;
      const [lo, hi] = TRACE_RANGE[kind];
      const t = (v - lo) / (hi - lo);
      return i * laneH + laneH * (1 - t) * 0.86 + laneH * 0.07;
    };

    const frame = (now: number) => {
      if (!running) return;
      const ts = tracesRef.current;
      const n = ts.length;
      while (phases.length < n) phases.push(0);
      if (last === null) last = now;
      // After a pause the pen does not jump: at most 100 ms of trace per frame.
      const dt = Math.min(100, now - last);
      last = now;
      const dx = (dt / 1000) * speed;
      const x0 = x;
      let x1 = x + dx;
      if (x1 >= width) {
        x1 = 0;
        x = 0;
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, 14, height);
        for (let i = 0; i < n; i++) phases[i] += dt / cycleMs(ts[i].kind, ts[i].rate);
        raf = window.requestAnimationFrame(frame);
        return;
      }
      // Clear the bar ahead of the pen.
      ctx.fillStyle = BG;
      ctx.fillRect(x0, 0, Math.min(14, width - x0), height);
      // Thin separators between the lanes.
      ctx.fillStyle = "#1d2b26";
      for (let i = 1; i < n; i++) ctx.fillRect(x0, Math.round((height / n) * i), Math.min(14, width - x0), 1);
      const steps = Math.max(1, Math.ceil(dx));
      for (let i = 0; i < n; i++) {
        const t = ts[i];
        const per = dt / steps / cycleMs(t.kind, t.rate);
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(x0, laneY(i, n, t.kind, sampleOf(t.kind, phases[i])));
        for (let s = 1; s <= steps; s++) {
          phases[i] += per;
          ctx.lineTo(x0 + (dx * s) / steps, laneY(i, n, t.kind, sampleOf(t.kind, phases[i])));
        }
        ctx.stroke();
      }
      x = x1;
      raf = window.requestAnimationFrame(frame);
    };

    const start = () => {
      if (running) return;
      running = true;
      last = null;
      raf = window.requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      window.cancelAnimationFrame(raf);
    };
    const onVisible = () => (document.hidden ? stop() : start());

    fit();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => fit());
    ro?.observe(canvas);
    document.addEventListener("visibilitychange", onVisible);
    if (!document.hidden) start();
    return () => {
      stop();
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [height, speed]);

  const n = traces.length;
  return (
    <div className={`relative overflow-hidden rounded-md ${className}`} style={{ height, background: BG }}>
      <canvas ref={canvasRef} aria-hidden className="block h-full w-full" style={{ height }} />
      {traces.map((t, i) => (
        <span key={`${t.kind}-${i}`} className="pointer-events-none absolute left-1.5 text-[11px] font-bold" style={{ top: (height / n) * i + 4, color: t.color }}>
          {t.label}
        </span>
      ))}
    </div>
  );
}
