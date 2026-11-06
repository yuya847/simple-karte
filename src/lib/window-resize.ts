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
