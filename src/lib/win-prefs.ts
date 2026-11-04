// 別ウインドウ (a right-side tab shown in its own window over the chart): where a large one opens, how a
// window is kept inside the screen, and remembering a window's place and size in this browser only.
// The screens work the same without the storage (blocked, a private window): the window opens at its default.

export interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_W = 320;
const MIN_H = 200;

/** Keep the whole window on the screen (at least 320 × 200), so its title bar and resize corner can be reached. */
export function fitWin(win: Win, vw: number, vh: number): Win {
  const w = Math.max(MIN_W, Math.min(Math.round(win.w), vw - 8));
  const h = Math.max(MIN_H, Math.min(Math.round(win.h), vh - 8));
  return { w, h, x: Math.max(0, Math.min(Math.round(win.x), vw - w)), y: Math.max(0, Math.min(Math.round(win.y), vh - h)) };
}

/** A large window over the middle of the screen: 85% of its width and 80% of its height (the injection calendar). */
export function bigWin(vw: number, vh: number): Win {
  const w = Math.round(vw * 0.85);
  const h = Math.round(vh * 0.8);
  return fitWin({ x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h }, vw, vh);
}

/** A window for entering an order, over the right part of a large window (so both stay in view). */
export function besideWin(parent: Win, vw: number, vh: number): Win {
  const w = Math.max(MIN_W, Math.min(560, Math.round(parent.w * 0.45)));
  const h = Math.max(MIN_H, parent.h - 48);
  return fitWin({ x: parent.x + parent.w - w - 12, y: parent.y + 40, w, h }, vw, vh);
}

const keyOf = (name: string) => `simple-karte:win:${name}`;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Read a window kept earlier (JSON text); anything missing or broken gives null. */
export function parseWin(raw: string | null): Win | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    return num(v.x) && num(v.y) && num(v.w) && num(v.h) ? { x: v.x, y: v.y, w: v.w, h: v.h } : null;
  } catch {
    return null;
  }
}

/** The window kept in this browser for this name, fitted to the current screen; null when none. */
export function keptWin(name: string, vw: number, vh: number, store: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage): Win | null {
  let raw: string | null = null;
  try {
    raw = store?.getItem(keyOf(name)) ?? null;
  } catch {
    // Storage blocked: the default place.
  }
  const w = parseWin(raw);
  return w ? fitWin(w, vw, vh) : null;
}

/** Remember the window in this browser (this device only). Returns false when it could not be kept. */
export function keepWin(name: string, win: Win, store: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : window.localStorage): boolean {
  try {
    store?.setItem(keyOf(name), JSON.stringify(win));
    return !!store;
  } catch {
    return false;
  }
}
