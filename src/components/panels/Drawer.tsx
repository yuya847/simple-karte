"use client";

import { AppWindow, GripHorizontal, Lock, Maximize2, Minimize2, PanelRightClose, X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { bigWin, clampWin, useWinDrag, type Win } from "../Dockable";

/**
 * What WardApp decides for the panels: which panel is open (its key) and which panels open in their
 * own window first. A Drawer reads this so WardApp does not have to pass props to each one.
 */
export const DrawerDefaults = createContext<{ panel: string | null; windowed: ReadonlySet<string> }>({ panel: null, windowed: new Set() });

/** How a panel was last shown on this device: as a window (and where) or as the drawer. */
interface Remembered {
  mode: "window" | "drawer";
  win?: Win;
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
    return { mode: v.mode, win };
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
 * Which way it opens first comes from WardApp (DrawerDefaults); the last choice and the window's
 * place are remembered for this panel on this device only.
 */
export function Drawer({ title, onClose, children, wide, locked, expandable, windowKey, initialWidth }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; locked?: string | null; expandable?: boolean; windowKey?: string; initialWidth?: number }) {
  const defaults = useContext(DrawerDefaults);
  const key = windowKey ?? defaults.panel ?? title;
  const windowedFirst = defaults.windowed.has(key);
  const initialWin = () => {
    const w = bigWin();
    return initialWidth ? { ...w, w: initialWidth, x: Math.max(0, (window.innerWidth - initialWidth) / 2) } : w;
  };
  // On the server (and in tests) there is no window: start as the drawer. In the browser the panel
  // opens only after a click, so the first render already knows the remembered place.
  const [win, setWin] = useState<Win | null>(() => {
    if (typeof window === "undefined") return null;
    const r = loadRemembered(key);
    // A panel listed as windowed always opens as a window (the remembered place is kept, not the mode).
    const mode = windowedFirst ? "window" : (r?.mode ?? "drawer");
    return mode === "window" ? clampWin(r?.win ?? initialWin()) : null;
  });
  const toWindow = () => setWin(clampWin(loadRemembered(key)?.win ?? initialWin()));
  const toDrawer = () => {
    saveRemembered(key, { mode: "drawer", win: win ?? loadRemembered(key)?.win });
    setWin(null);
  };
  const { down, move, up } = useWinDrag(win, setWin);
  // Remember the window's place a moment after it stops moving (not on every pointer move).
  useEffect(() => {
    if (!win) return;
    const t = window.setTimeout(() => saveRemembered(key, { mode: "window", win }), 300);
    return () => window.clearTimeout(t);
  }, [win, key]);

  // 横いっぱい: cover the whole chart (the area marked data-drawer-bounds), keeping the patient bar in view.
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
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
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
        aria-label={`${title}（別ウインドウ）`}
        data-drawer-window={key}
        className="fixed z-50 flex min-h-0 flex-col overflow-hidden rounded-lg border border-rule bg-sheet shadow-[0_12px_40px_-8px_rgba(38,34,28,0.45)]"
        style={{ left: win.x, top: win.y, width: win.w, height: win.h }}
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
            onClick={toDrawer}
            title="右から出る引き出しに戻す"
            className="ml-auto flex items-center gap-1 rounded border border-rule bg-sheet px-2 py-0.5 text-xs text-ink-soft hover:text-ink pointer-coarse:py-1.5"
          >
            <PanelRightClose size={13} />
            引き出しに戻す
          </button>
          <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label="閉じる" className="rounded p-0.5 text-ink-faint hover:text-ink pointer-coarse:p-1.5">
            <X size={16} />
          </button>
        </div>
        {lockedStrip}
        {body}
        <div
          aria-hidden
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize pointer-coarse:h-8 pointer-coarse:w-8"
          style={{ touchAction: "none", background: "linear-gradient(135deg, transparent 50%, rgba(140,132,115,0.55) 50%)" }}
          onPointerDown={down("size")}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      style={full ? { position: "fixed", left: full.left, top: full.top, width: full.width, height: full.height } : undefined}
      className={`absolute inset-y-0 right-0 z-30 flex flex-col border-l border-rule bg-sheet shadow-[-8px_0_24px_-12px_rgba(38,34,28,0.35)] ${
        wide ? "w-[min(760px,100%)]" : "w-[min(560px,100%)]"
      }`}
    >
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
