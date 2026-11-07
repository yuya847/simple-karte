import type { Win } from "./win-prefs";

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Resize against the opposite edge, stopping at the viewport and minimum size. */
export function resizeWin(win: Win, edge: ResizeEdge, dx: number, dy: number, vw: number, vh: number): Win {
  const minW = Math.min(320, vw);
  const minH = Math.min(200, vh);
  let { x, y, w, h } = win;
  const right = x + w;
  const bottom = y + h;
  if (edge.includes("w")) { x = Math.max(0, Math.min(x + dx, right - minW)); w = right - x; }
  if (edge.includes("n")) { y = Math.max(0, Math.min(y + dy, bottom - minH)); h = bottom - y; }
  if (edge.includes("e")) w = Math.max(minW, Math.min(w + dx, vw - x));
  if (edge.includes("s")) h = Math.max(minH, Math.min(h + dy, vh - y));
  return { x, y, w, h };
}

/** 寄せる: a window dragged by its title to the top edge fills the screen, to the left or right edge takes that half. */
export type Snap = "max" | "left" | "right";

/** How near an edge (px) the pointer must come. */
export const SNAP_EDGE = 8;

/** Where the pointer of a title drag would snap the window, or null away from the edges. */
export function snapAt(px: number, py: number, vw: number, vh: number): Snap | null {
  if (py <= SNAP_EDGE && py < vh) return "max";
  if (px <= SNAP_EDGE) return "left";
  if (px >= vw - 1 - SNAP_EDGE) return "right";
  return null;
}

/**
 * The area windows snap into: under the patient bar when a chart is open (its top given), so whose window it
 * is stays in view, as with the panels' 横いっぱい; else the whole screen.
 */
export function snapArea(vw: number, vh: number, chartTop?: number | null): Win {
  const top = chartTop != null && chartTop >= 0 && vh - chartTop >= 240 ? Math.round(chartTop) : 0;
  return { x: 0, y: top, w: vw, h: vh - top };
}

/** The place of a snapped window: the whole area, or its left or right half (full height). */
export function snapWin(snap: Snap, area: Win): Win {
  const half = Math.round(area.w / 2);
  if (snap === "left") return { ...area, w: half };
  if (snap === "right") return { ...area, x: area.x + half, w: area.w - half };
  return area;
}

/** Whether a window sits snapped (kept windows come back a few pixels smaller after fitting the screen). */
export function snappedAs(win: Win, area: Win): Snap | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= SNAP_EDGE;
  for (const s of ["max", "left", "right"] as const) {
    const t = snapWin(s, area);
    if (near(win.x, t.x) && near(win.y, t.y) && near(win.w, t.w) && near(win.h, t.h)) return s;
  }
  return null;
}

/** 元に戻す with nothing to go back to (a window that opened snapped): a window in the middle of the screen. */
export function restoredWin(vw: number, vh: number): Win {
  const w = Math.max(Math.min(320, vw), Math.round(vw * 0.6));
  const h = Math.max(Math.min(200, vh), Math.round(vh * 0.7));
  return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 4), w, h };
}
