"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { InjectionChange } from "@/lib/injection-change";

export function InjectionOrderMenu({ children, nowTime, onRate, onStop, onExtend, onDo, text }: { children: ReactNode; nowTime: string; onRate?: (c: InjectionChange) => void; onStop?: (time: string) => void; onExtend?: (days: number) => void; onDo?: () => void; text: string }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<"rate" | "stop" | "extend" | null>(null);
  const [time, setTime] = useState(nowTime);
  const [rate, setRate] = useState("");
  const [days, setDays] = useState("1");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => () => cancel(), []);
  useEffect(() => {
    if (!point) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setPoint(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [point]);
  const open = (x: number, y: number) => { setTime(nowTime); setMode(null); setError(""); setPoint({ x, y }); };
  const btn = "block w-full rounded px-3 py-2 text-left hover:bg-ai-soft disabled:opacity-40";
  return <div tabIndex={0} aria-label="注射の操作（右クリック・長押し）" onKeyDown={e => { if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); open(r.left, r.bottom); } }} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); open(e.clientX, e.clientY); }}
    onPointerDown={e => { if (point || e.pointerType === "mouse") return; origin.current = { x: e.clientX, y: e.clientY }; cancel(); timer.current = setTimeout(() => open(e.clientX, e.clientY), 600); }}
    onPointerMove={e => { if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 10) cancel(); }} onPointerUp={cancel} onPointerCancel={cancel}
    onClickCapture={e => { if (point && !(e.target as Element).closest('[role="dialog"]')) { e.preventDefault(); e.stopPropagation(); } }}>
    {children}
    {point && createPortal(<div className="fixed inset-0 z-[200]" onClick={e => e.stopPropagation()} onPointerDown={e => { if (e.target === e.currentTarget) setPoint(null); }}>
      <div role="dialog" aria-label="注射の操作" style={{ left: Math.max(8, Math.min(point.x, window.innerWidth - 280)), top: Math.max(8, Math.min(point.y, window.innerHeight - 360)) }} className="fixed w-[264px] rounded border border-rule bg-sheet p-2 text-[13px] shadow-xl" onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
        <button type="button" className={btn} disabled={!onRate} onClick={() => setMode("rate")}>速度を変える</button>
        <button type="button" className={btn} disabled={!onStop} onClick={() => setMode("stop")}>中止</button>
        <button type="button" className={btn} disabled={!onExtend} onClick={() => setMode("extend")}>延長</button>
        <button type="button" className={btn} disabled={!onDo} onClick={() => { onDo?.(); setPoint(null); }}>Do</button>
        {onDo && !onStop && <button type="button" className={btn} onClick={() => { onDo(); setPoint(null); }}>再開（同じ内容で新しく）</button>}
        <button type="button" className={btn} onClick={async () => { try { await navigator.clipboard.writeText(text); setPoint(null); } catch { setError("コピーできませんでした"); } }}>テキストとしてコピー</button>
        {mode && <form className="space-y-2 border-t border-rule pt-2" onSubmit={e => { e.preventDefault(); if (mode === "rate") onRate?.({ time, rate: Number(rate) }); else if (mode === "stop") onStop?.(time); else onExtend?.(Number(days)); setPoint(null); }}>
          {mode !== "extend" && <label className="flex items-center gap-2">時刻<input aria-label="変更時刻" type="time" required value={time} onChange={e => setTime(e.target.value)} className="rounded border border-rule p-1" /></label>}
          {mode === "rate" && <label className="flex items-center gap-2">mL/時<input aria-label="新しい速度" className="w-24 rounded border border-rule p-1" type="number" min="0.1" step="any" required value={rate} onChange={e => setRate(e.target.value)} /></label>}
          {mode === "extend" && <label>日数<input aria-label="延長日数" className="ml-2 w-20 rounded border border-rule p-1" type="number" min="1" max="56" required value={days} onChange={e => setDays(e.target.value)} /></label>}
          {mode === "stop" && <button type="button" className={btn} onClick={() => { onStop?.(nowTime); setPoint(null); }}>今から中止</button>}
          <button className="rounded bg-ai px-3 py-1 text-white" type="submit">下書きにする</button>
        </form>}
        {error && <p role="status">{error}</p>}
        <button type="button" className={btn} onClick={() => setPoint(null)}>閉じる</button>
      </div>
    </div>, document.body)}
  </div>;
}
