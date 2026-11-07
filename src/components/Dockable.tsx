"use client";

import { GripHorizontal, Minus, X } from "lucide-react";
import { useTrayWindow } from "./WindowTray";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fitWin, keptWin } from "@/lib/win-prefs";
import { resizeWin, restoredWin, snapArea, snapAt, snappedAs, snapWin, type ResizeEdge, type Snap } from "@/lib/window-resize";
import { FlowCellMenu, type CellAction } from "./FlowCellMenu";

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

/** A window of about 80% of the screen, centred (for panels that open as a window first). */
export function bigWin(): Win {
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const w = Math.max(320, Math.round(vw * 0.8));
  const h = Math.max(200, Math.round(vh * 0.8));
  return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
}

/** Keep the whole window on screen, so its title bar and resize corner can always be reached. */
export function clampWin(w: Win): Win {
  const fitted = fitWin(w, window.innerWidth, window.innerHeight);
  return { ...fitted, x: Math.max(0, Math.min(w.x, window.innerWidth - fitted.w)), y: Math.max(0, Math.min(w.y, window.innerHeight - fitted.h)) };
}

/**
 * Pointer handlers that move a window by its title bar or resize it from a corner (finger or mouse).
 * Shared by the right-side tabs (Dockable) and the panels (Drawer) so both behave the same.
 * With `snap`: the title dragged to the top edge fills the screen, to the left or right edge takes that half
 * (`hint` is the place it would take, while dragging); the title's double-click fills the screen or goes back;
 * its right-click (a long press with a finger) offers the same. `titleProps` and `extras` carry these.
 */
export function useWinDrag(win: Win | null | undefined, onMove: (w: Win) => void, onFront?: () => void, snap?: { onSnap?: () => void }) {
  const start = useRef<{ px: number; py: number; win: Win; mode: "move" | "size" | ResizeEdge; snapped: boolean; moved: boolean } | null>(null);
  // The window before it was snapped, to go back to (this page only; a window kept snapped goes back to the middle).
  const before = useRef<Win | null>(null);
  const [hint, setHint] = useState<Snap | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopHold = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  useEffect(() => stopHold, []);
  const screen = () => [window.innerWidth, window.innerHeight] as const;
  const snapTo = (to: Snap) => {
    if (!win) return;
    if (!snappedAs(win, areaNow())) before.current = win;
    snap?.onSnap?.();
    onMove(snapWin(to, areaNow()));
  };
  const restore = () => {
    if (!win) return;
    const back = before.current ?? restoredWin(...screen());
    before.current = null;
    onMove(clampWin(back));
  };
  const snappedNow = win && typeof window !== "undefined" ? snappedAs(win, areaNow()) : null;
  const toggleMax = () => (snappedNow === "max" ? restore() : snapTo("max"));
  const down = (mode: "move" | "size" | ResizeEdge, baseline = win) => (e: React.PointerEvent) => {
    if (!win || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, py: e.clientY, win: baseline ?? win, mode, snapped: mode === "move" && !!snap && !!snappedAs(win, areaNow()), moved: false };
    onFront?.();
    if (snap && mode === "move" && e.pointerType !== "mouse") {
      stopHold();
      const at = { x: e.clientX, y: e.clientY };
      hold.current = setTimeout(() => setMenuAt(at), 600);
    }
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    // A title pressed without moving (a click, a double-click) does not move the window.
    if (!s.moved && snap && s.mode === "move" && Math.hypot(dx, dy) < 6) return;
    if (!s.moved) {
      s.moved = true;
      stopHold();
      // A snapped window pulled away gets its size back, held at the same place of its title.
      if (s.snapped) {
        const back = before.current ?? restoredWin(...screen());
        before.current = null;
        s.win = { ...back, x: Math.round(s.px - ((s.px - s.win.x) / s.win.w) * back.w), y: s.win.y };
      }
    }
    if (s.mode === "move" && snap) setHint(snapAt(e.clientX, e.clientY, ...screen()));
    onMove(clampWin(s.mode === "move" ? { ...s.win, x: s.win.x + dx, y: s.win.y + dy } : resizeWin(s.win, s.mode === "size" ? "se" : s.mode, dx, dy, window.innerWidth, window.innerHeight)));
  };
  const up = (e: React.PointerEvent) => {
    stopHold();
    const s = start.current;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    start.current = null;
    setHint(null);
    const to = s?.mode === "move" && s.moved && snap ? snapAt(e.clientX, e.clientY, ...screen()) : null;
    if (s && to) {
      before.current = s.win;
      snap?.onSnap?.();
      onMove(snapWin(to, areaNow()));
    }
  };
  const actions: CellAction[] = [
    ...(snappedNow !== "max" ? [{ label: "画面いっぱい", onClick: () => snapTo("max") }] : []),
    ...(snappedNow !== "left" ? [{ label: "左半分", onClick: () => snapTo("left") }] : []),
    ...(snappedNow !== "right" ? [{ label: "右半分", onClick: () => snapTo("right") }] : []),
    ...(snappedNow ? [{ label: "元の大きさに戻す", onClick: restore }] : []),
  ];
  const titleProps = snap
    ? {
        onDoubleClick: (e: React.MouseEvent) => {
          if (!(e.target as Element).closest("button")) toggleMax();
        },
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        },
      }
    : {};
  const extras = snap ? (
    <>
      {hint && <SnapPreview to={hint} />}
      {menuAt && <FlowCellMenu at={menuAt} title="ウインドウ" actions={actions} onClose={() => setMenuAt(null)} />}
    </>
  ) : null;
  return { down, move, up, toggleMax, snapTo, titleProps, extras };
}

/** The area windows snap into (under the patient bar of the chart open, else the screen). */
function areaNow() {
  const chart = document.querySelector("[data-drawer-bounds]")?.getBoundingClientRect();
  return snapArea(window.innerWidth, window.innerHeight, chart && chart.height > 0 ? chart.top : null);
}

/** Where the window will go if let go now: a faint frame under the window being dragged. */
function SnapPreview({ to }: { to: Snap }) {
  const r = snapWin(to, areaNow());
  return createPortal(<div aria-hidden data-snap-preview={to} className="pointer-events-none fixed z-[39] rounded-lg border-2 border-ai bg-ai/10" style={{ left: r.x + 4, top: r.y + 4, width: r.w - 8, height: r.h - 8 }} />, document.body);
}

/** Shared pointer targets for every floating window. Corners take priority over edges. */
export function WindowResizeHandles({ drag, baseline }: { drag: ReturnType<typeof useWinDrag>; baseline?: () => Win }) {
  const edges: [ResizeEdge, string][] = [
    ["n", "inset-x-3 top-0 h-1.5 cursor-ns-resize pointer-coarse:h-2.5"], ["s", "inset-x-3 bottom-0 h-1.5 cursor-ns-resize pointer-coarse:h-2.5"],
    ["w", "inset-y-3 left-0 w-1.5 cursor-ew-resize pointer-coarse:w-2.5"], ["e", "inset-y-3 right-0 w-1.5 cursor-ew-resize pointer-coarse:w-2.5"],
    ["nw", "left-0 top-0 h-3 w-3 cursor-nwse-resize pointer-coarse:h-5 pointer-coarse:w-5"], ["ne", "right-0 top-0 h-3 w-3 cursor-nesw-resize pointer-coarse:h-5 pointer-coarse:w-5"],
    ["sw", "left-0 bottom-0 h-3 w-3 cursor-nesw-resize pointer-coarse:h-5 pointer-coarse:w-5"], ["se", "right-0 bottom-0 h-3 w-3 cursor-nwse-resize pointer-coarse:h-5 pointer-coarse:w-5"],
  ];
  return edges.map(([edge, position]) => <div key={edge} aria-hidden data-resize-edge={edge}
    className={`absolute z-20 touch-none ${position}`}
    onPointerDown={(e) => { if (e.button === 0) drag.down(edge, baseline?.())(e); }}
    onPointerMove={drag.move} onPointerUp={drag.up} onPointerCancel={drag.up} />);
}

/**
 * A right-side tab that can be shown in its own window (別ウインドウ) over the chart and minimized.
 * The same element stays in the page either way, so what is being written in it is kept.
 * Move the window by its title bar, resize it from the corner (finger or mouse).
 */
export function Dockable({
  tab,
  compact = false,
  title,
  active,
  win,
  z,
  dockedClass,
  onMove,
  onClose,
  onFront,
  children,
}: {
  tab: string;
  compact?: boolean;
  title: string;
  active: boolean;
  win?: Win;
  z: number;
  dockedClass: string;
  onMove: (w: Win) => void;
  onClose: () => void;
  onFront: () => void;
  children: React.ReactNode;
}) {
  const tray = useTrayWindow(`tab:${tab}`, title.split("：")[0], !!win, onClose);
  const front = () => { onFront(); tray.front(); };
  const [adjusted, setAdjusted] = useState(() => tab !== "injcal" && typeof window !== "undefined" && !!keptWin(tab, window.innerWidth, window.innerHeight));
  const floating = !!win;
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentSize, setContentSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (tab !== "injcal" || !floating) return;
    const table = contentRef.current?.querySelector("table");
    if (!table) return;
    const measure = () => setContentSize({ w: Math.min(table.scrollWidth + 2, window.innerWidth * 0.85), h: Math.min(table.offsetHeight + 90, window.innerHeight * 0.85) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [tab, floating]);
  const shownWin = win && tab === "injcal" && contentSize && !adjusted
    ? { ...win, ...contentSize, x: Math.max(0, (window.innerWidth - contentSize.w) / 2), y: Math.max(20, Math.min(win.y, window.innerHeight - contentSize.h)) }
    : win && compact && !adjusted
    ? { ...win, x: Math.max(0, ((typeof window === "undefined" ? 1200 : window.innerWidth) - Math.min(480, win.w)) / 2), w: Math.min(480, win.w), h: 240 }
    : win;
  const drag = useWinDrag(shownWin, w => { setAdjusted(true); onMove(w); }, front, {});
  const { down, move, up } = drag;
  useEffect(() => {
    if (!win) return;
    const fit = () => onMove(clampWin(win));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [win, onMove]);

  return (
    <div
      data-dock={tab}
      ref={contentRef}
      data-help-section={`panel:${tab}`}
      role={floating ? "dialog" : undefined}
      aria-label={floating ? `${title}（別ウインドウ）` : undefined}
      onPointerDownCapture={floating ? front : undefined}
      className={
        floating
          ? "fixed flex min-h-0 flex-col overflow-hidden rounded-lg border border-rule bg-sheet shadow-[0_12px_40px_-8px_rgba(38,34,28,0.45)]"
          : active
            ? dockedClass
            : "hidden"
      }
      style={floating ? { left: shownWin!.x, top: shownWin!.y, width: shownWin!.w, height: shownWin!.h, zIndex: tray.z ?? 40 + z, display: tray.minimized ? "none" : undefined } : undefined}
    >
      {/* Always rendered (hidden when docked) so the content below keeps its place and its state. */}
      <div
        className={floating ? "flex shrink-0 cursor-move select-none items-center gap-2 border-b border-rule bg-tab px-3 py-1.5 text-sm" : "hidden"}
        style={{ touchAction: "none" }}
        onPointerDown={down("move")}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        {...(floating ? drag.titleProps : {})}
      >
        <GripHorizontal size={14} className="text-ink-faint" />
        <b className="truncate">{title}</b>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={tray.minimize}
          aria-label="最小化"
          className="ml-auto flex items-center gap-1 rounded border border-rule bg-sheet px-2 py-0.5 text-xs text-ink-soft hover:text-ink pointer-coarse:py-1.5"
        >
          <Minus size={13} />
        </button>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label="閉じる" className="rounded p-0.5 text-ink-faint hover:text-ink pointer-coarse:p-1.5">
          <X size={14} />
        </button>
      </div>
      {children}
      {floating && <WindowResizeHandles drag={drag} />}
      {floating && drag.extras}
    </div>
  );
}
