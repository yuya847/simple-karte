"use client";

import { useTrayWindow } from "../WindowTray";
import { panelSize } from "@/lib/panel-size";
import { AppWindow, GripHorizontal, Lock, Maximize2, Minimize2, Minus, X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { clampWin, useWinDrag, WindowResizeHandles, type Win } from "../Dockable";

/**
 * What WardApp decides for the panels: which panel is open (its key) and which panels open in their
 * own window first. A Drawer reads this so WardApp does not have to pass props to each one.
 */
export const DrawerDefaults = createContext<{ panel: string | null; windowed: ReadonlySet<string> }>({ panel: null, windowed: new Set() });

/** How a panel was last shown on this device: as a window (and where) or as the drawer. */
interface Remembered {
  mode: "window" | "drawer";
  win?: Win;
  sized?: boolean;
}
const KEY = (k: string) => `simple-karte:drawer-win:${k}`;

function loadRemembered(key: string): Remembered | null {
  try {
    const raw = window.localStorage.getItem(KEY(key));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Remembered>;
    if (v.mode !== "window" && v.mode !== "drawer") return null;
    const w = v.win;
    const win = w && [w.x, w.y, w.w, w.h].every((n) => typeof n === "number" && Number.isFinite(n)) ? clampWin(w) : undefined;
    return { mode: v.mode, win, sized: v.sized !== false };
  } catch {
    // Storage blocked or unreadable: the panel opens the way WardApp says.
    return null;
  }
}
function saveRemembered(key: string, r: Remembered) {
  try {
    window.localStorage.setItem(KEY(key), JSON.stringify(r));
  } catch {
    // Not remembered on this device; the panel still works.
  }
}

/**
 * Panel that slides over the right side of the chart (the chart behind stays as it was), or — with
 * 別ウインドウ — a window over the chart that is moved by its title bar and resized from the corner.
 * WardApp (DrawerDefaults) が表示方法を決め、ウインドウの位置と大きさをこの端末に保存する。
 */
export function Drawer({ title, onClose, children, wide, locked, expandable, windowKey, initialWidth }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; locked?: string | null; expandable?: boolean; windowKey?: string; initialWidth?: number }) {
  const defaults = useContext(DrawerDefaults);
  const key = windowKey ?? defaults.panel ?? title;
  const windowedFirst = defaults.windowed.has(key);
  const initialWin = () => {
    return panelSize(key, !!wide, window.innerWidth, window.innerHeight, initialWidth);
  };
  // ウインドウ指定なら常にウインドウ。保存済みの表示方法は使わず、位置と大きさだけ戻す。
  const [win, setWin] = useState<Win | null>(() => {
    if (typeof window === "undefined") return windowedFirst ? panelSize(key, !!wide, 1200, 800, initialWidth) : null;
    const r = loadRemembered(key);
    // A panel listed as windowed always opens as a window (the remembered place is kept, not the mode).
    const mode = windowedFirst ? "window" : "drawer";
    const remembered = r?.win ?? initialWin();
    const position = key === "templates" ? { x: Math.max(0, (window.innerWidth - remembered.w) / 2), y: initialWin().y } : {};
    return mode === "window" ? clampWin({ ...remembered, ...position }) : null;
  });
  const [sized, setSized] = useState(() => typeof window !== "undefined" && !!loadRemembered(key)?.sized);
  const toWindow = () => setWin(clampWin(loadRemembered(key)?.win ?? initialWin()));
  const tray = useTrayWindow(`panel:${key}`, title, !!win, onClose);
  const drag = useWinDrag(win, setWin);
  const { down, move, up } = drag;
  // Remember the window's place a moment after it stops moving (not on every pointer move).
  useEffect(() => {
    if (!win) return;
    const t = window.setTimeout(() => saveRemembered(key, { mode: "window", win, sized }), 300);
    return () => window.clearTimeout(t);
  }, [win, key, sized]);

  // 横いっぱい: cover the whole chart (the area marked data-drawer-bounds), keeping the patient bar in view.
  const [drawerWidth, setDrawerWidth] = useState<number | null>(null);
  const drawerStart = useRef<{ x: number; width: number } | null>(null);
  const [full, setFull] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const bounds = () => ref.current?.parentElement?.closest("[data-drawer-bounds]")?.getBoundingClientRect() ?? null;
  useEffect(() => {
    if (!full) return;
    const onResize = () => setFull(bounds());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [full]);
  useEffect(() => {
    if (!win) return;
    const onResize = () => setWin((w) => (w ? clampWin(w) : w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [win]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !tray.minimized && (!win || tray.frontmost)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, tray.minimized, tray.frontmost, win]);

  const body = (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
      {locked ? (
        <fieldset disabled className="m-0 min-w-0 border-0 p-0">
          {children}
        </fieldset>
      ) : (
        children
      )}
    </div>
  );
  const lockedStrip = locked && (
    <p className="flex items-center gap-1.5 border-b border-rule bg-paper px-4 py-1.5 text-xs text-ink-soft">
      <Lock size={12} className="shrink-0" />
      見るだけです。{locked}
    </p>
  );

  if (win) {
    return (
      <div
        ref={ref}
        role="dialog"
      data-help-section={`panel:${key}`}
        aria-label={`${title}（別ウインドウ）`}
        data-drawer-window={key}
        className="fixed z-50 flex min-h-0 flex-col overflow-hidden rounded-lg border border-rule bg-sheet shadow-[0_12px_40px_-8px_rgba(38,34,28,0.45)]"
        onPointerDownCapture={tray.front}
        style={{ left: win.x, top: win.y, width: win.w, height: sized ? win.h : "auto", minHeight: sized ? "min(200px, 100vh)" : "min(240px, 85vh)", maxHeight: sized ? undefined : "85vh", display: tray.minimized ? "none" : undefined, zIndex: tray.z }}
      >
        <div
          className="flex shrink-0 cursor-move select-none items-center gap-2 border-b border-rule bg-tab px-3 py-1.5 text-sm"
          style={{ touchAction: "none" }}
          onPointerDown={down("move")}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <GripHorizontal size={14} className="text-ink-faint" />
          <h2 className="truncate font-bold">{title}</h2>
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
            <X size={16} />
          </button>
        </div>
        {lockedStrip}
        {body}
        <WindowResizeHandles drag={drag} baseline={() => {
          const actual = { ...win, h: ref.current?.getBoundingClientRect().height ?? win.h };
          setSized(true);
          return actual;
        }} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="dialog"
      data-help-section={`panel:${key}`}
      aria-label={title}
      style={full ? { position: "fixed", left: full.left, top: full.top, width: full.width, height: full.height } : drawerWidth ? { width: drawerWidth, maxWidth: "100%" } : undefined}
      className={`absolute inset-y-0 right-0 z-30 flex flex-col border-l border-rule bg-sheet shadow-[-8px_0_24px_-12px_rgba(38,34,28,0.35)] ${
        wide ? "w-[min(760px,100%)]" : "w-[min(560px,100%)]"
      }`}
    >
      {!full && <div role="separator" aria-orientation="vertical" aria-valuenow={Math.round(drawerWidth ?? (wide ? 760 : 560))} aria-label="パネルの幅" tabIndex={0}
        className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize touch-none hover:bg-ai/20"
        onDoubleClick={() => setDrawerWidth(null)}
        onKeyDown={e => {
          if (e.key === "Home") setDrawerWidth(null);
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setDrawerWidth(Math.max(320, Math.min((ref.current?.getBoundingClientRect().width ?? 560) + (e.key === "ArrowLeft" ? 16 : -16), bounds()?.width ?? window.innerWidth)));
        }}
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
          drawerStart.current = { x: e.clientX, width: ref.current?.getBoundingClientRect().width ?? 560 };
        }}
        onPointerMove={e => {
          const s = drawerStart.current;
          if (!s || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
          setDrawerWidth(Math.max(320, Math.min(s.width + s.x - e.clientX, bounds()?.width ?? window.innerWidth)));
        }}
        onPointerUp={e => { drawerStart.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { drawerStart.current = null; }}
      />}
      <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
        <h2 className="font-bold">{title}</h2>
        <button
          type="button"
          onClick={() => {
            setFull(null);
            toWindow();
          }}
          title="別のウインドウにして、動かしたり大きさを変えたりする"
          className="ml-auto mr-1 inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-ink-faint hover:bg-paper hover:text-ink"
        >
          <AppWindow size={14} />
          別ウインドウ
        </button>
        {expandable && (
          <button type="button" onClick={() => setFull((f) => (f ? null : bounds()))} aria-pressed={!!full} className="mr-1 inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-ink-faint hover:bg-paper hover:text-ink">
            {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {full ? "元の幅" : "横いっぱい"}
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="閉じる" className="rounded p-1 text-ink-faint hover:bg-paper hover:text-ink">
          <X size={16} />
        </button>
      </div>
      {lockedStrip}
      {body}
    </div>
  );
}
