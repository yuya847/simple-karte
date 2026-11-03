"use client";

import { GripHorizontal, PanelRightClose, X } from "lucide-react";
import { useRef } from "react";

export interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a tab's own window opens first: a large window over the middle of the screen. */
export function defaultWin(i = 0): Win {
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const w = Math.min(760, vw - 40);
  const h = Math.min(Math.round(vh * 0.72), vh - 80);
  return { x: Math.max(20, Math.round((vw - w) / 2) + i * 28), y: 64 + i * 28, w, h };
}

/**
 * A right-side tab that can be shown in its own window (別ウインドウ) over the chart and docked back.
 * The same element stays in the page either way, so what is being written in it is kept.
 * Move the window by its title bar, resize it from the corner (finger or mouse).
 */
export function Dockable({
  tab,
  title,
  active,
  win,
  z,
  dockedClass,
  onMove,
  onDock,
  onFront,
  children,
}: {
  tab: string;
  title: string;
  active: boolean;
  win?: Win;
  z: number;
  dockedClass: string;
  onMove: (w: Win) => void;
  onDock: () => void;
  onFront: () => void;
  children: React.ReactNode;
}) {
  const start = useRef<{ px: number; py: number; win: Win; mode: "move" | "size" } | null>(null);
  const clamp = (w: Win): Win => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.max(320, Math.min(w.w, vw - 8));
    const height = Math.max(200, Math.min(w.h, vh - 8));
    // Keep the whole window on screen, so its title bar and resize corner can always be reached.
    return { w: width, h: height, x: Math.max(0, Math.min(w.x, vw - width)), y: Math.max(0, Math.min(w.y, vh - height)) };
  };
  const down = (mode: "move" | "size") => (e: React.PointerEvent) => {
    if (!win) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, py: e.clientY, win, mode };
    onFront();
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    onMove(clamp(s.mode === "move" ? { ...s.win, x: s.win.x + dx, y: s.win.y + dy } : { ...s.win, w: s.win.w + dx, h: s.win.h + dy }));
  };
  const up = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    start.current = null;
  };

  const floating = !!win;
  return (
    <div
      data-dock={tab}
      role={floating ? "dialog" : undefined}
      aria-label={floating ? `${title}（別ウインドウ）` : undefined}
      onPointerDownCapture={floating ? onFront : undefined}
      className={
        floating
          ? "fixed flex min-h-0 flex-col overflow-hidden rounded-lg border border-rule bg-sheet shadow-[0_12px_40px_-8px_rgba(38,34,28,0.45)]"
          : active
            ? dockedClass
            : "hidden"
      }
      style={floating ? { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: 40 + z } : undefined}
    >
      {/* Always rendered (hidden when docked) so the content below keeps its place and its state. */}
      <div
        className={floating ? "flex shrink-0 cursor-move select-none items-center gap-2 border-b border-rule bg-tab px-3 py-1.5 text-sm" : "hidden"}
        style={{ touchAction: "none" }}
        onPointerDown={down("move")}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <GripHorizontal size={14} className="text-ink-faint" />
        <b className="truncate">{title}</b>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDock}
          title="右の欄に戻す"
          className="ml-auto flex items-center gap-1 rounded border border-rule bg-sheet px-2 py-0.5 text-xs text-ink-soft hover:text-ink pointer-coarse:py-1.5"
        >
          <PanelRightClose size={13} />
          右の欄に戻す
        </button>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onDock} aria-label="閉じて右の欄に戻す" className="rounded p-0.5 text-ink-faint hover:text-ink pointer-coarse:p-1.5">
          <X size={14} />
        </button>
      </div>
      {children}
      <div
        aria-hidden
        className={floating ? "absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize pointer-coarse:h-8 pointer-coarse:w-8" : "hidden"}
        style={{ touchAction: "none", background: "linear-gradient(135deg, transparent 50%, rgba(140,132,115,0.55) 50%)" }}
        onPointerDown={down("size")}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
    </div>
  );
}
