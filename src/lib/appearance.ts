// 設定：見た目と字の大きさ。人ごとに、この端末（ブラウザ）だけに覚える（無くてもカルテは使える）。
// <html> に data-theme・data-font を付け、色と拡大は globals.css が受け持つ（部品の色クラスはそのまま）。

import { FONT_ZOOM } from "./page-zoom";

export const THEMES = [
  { key: "paper", label: "紙" },
  { key: "white", label: "白" },
  { key: "dark", label: "ダーク" },
  { key: "contrast", label: "くっきり" },
] as const;
export type Theme = (typeof THEMES)[number]["key"];

export const FONT_SIZES = [
  { key: "sm", label: "小" },
  { key: "md", label: "標準" },
  { key: "lg", label: "大" },
  { key: "xl", label: "特大" },
] as const;
export type FontSize = (typeof FONT_SIZES)[number]["key"];

export interface Appearance {
  theme: Theme;
  font: FontSize;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: "paper", font: "md" };

/** The colours of each look for its button in 設定 (and the browser's bar): background, sheet, letters. Same as globals.css. */
export const THEME_SWATCH: Record<Theme, { paper: string; sheet: string; ink: string }> = {
  paper: { paper: "#f5f1e6", sheet: "#fffdf7", ink: "#26221c" },
  white: { paper: "#f4f4f2", sheet: "#ffffff", ink: "#1d1d1b" },
  dark: { paper: "#1c1a16", sheet: "#24211c", ink: "#ece5d6" },
  contrast: { paper: "#ffffff", sheet: "#ffffff", ink: "#000000" },
};

/** The zoom of a 字の大きさ (1 for 標準). */
export const fontZoom = (f: FontSize) => FONT_ZOOM[f] ?? 1;

const THEME_KEYS = new Set<string>(THEMES.map((t) => t.key));
const FONT_KEYS = new Set<string>(FONT_SIZES.map((f) => f.key));

/** Saved (or broken) data → a valid choice; anything unknown is the default. */
export function normalizeAppearance(raw: unknown): Appearance {
  if (!raw || typeof raw !== "object") return DEFAULT_APPEARANCE;
  const o = raw as { theme?: unknown; font?: unknown };
  return {
    theme: typeof o.theme === "string" && THEME_KEYS.has(o.theme) ? (o.theme as Theme) : DEFAULT_APPEARANCE.theme,
    font: typeof o.font === "string" && FONT_KEYS.has(o.font) ? (o.font as FontSize) : DEFAULT_APPEARANCE.font,
  };
}

const KEY = "simple-karte:appearance";
const keyOf = (person: string) => `${KEY}:${person}`;
/** What this browser showed last, read before the first paint (the person is known only after that). */
export const LAST_APPEARANCE_KEY = `${KEY}:last`;

type Store = Pick<Storage, "getItem" | "setItem">;
const browserStore = (): Store | null => (typeof window === "undefined" ? null : window.localStorage);

/** This person's choice in this browser; the default when nothing is saved or it cannot be read. */
export function loadAppearance(person: string, store: Store | null = browserStore()): Appearance {
  try {
    const raw = store?.getItem(keyOf(person));
    return raw ? normalizeAppearance(JSON.parse(raw)) : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Keep the choice for this person, and as the look to show first when the page opens next. */
export function saveAppearance(person: string, v: Appearance, store: Store | null = browserStore()) {
  try {
    store?.setItem(keyOf(person), JSON.stringify(v));
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
  rememberShown(v, store);
}

/** The look on the screen now, for the next page load (before the person is known). */
export function rememberShown(v: Appearance, store: Store | null = browserStore()) {
  try {
    store?.setItem(LAST_APPEARANCE_KEY, JSON.stringify(v));
  } catch {
    // Not remembered; the page opens in 紙・標準 and then takes the person's choice.
  }
}

/**
 * Put the choice on <html> (data-theme / data-font; nothing for 紙・標準) and the browser's bar colour.
 * Windows placed in px fit themselves to the screen again when the zoom changes (a resize event).
 */
export function applyAppearance(v: Appearance, doc: Document | null = typeof document === "undefined" ? null : document) {
  const root = doc?.documentElement;
  if (!root) return;
  const before = root.getAttribute("data-font");
  if (v.theme === DEFAULT_APPEARANCE.theme) root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", v.theme);
  if (v.font === DEFAULT_APPEARANCE.font) root.removeAttribute("data-font");
  else root.setAttribute("data-font", v.font);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_SWATCH[v.theme].paper);
  if ((before ?? "md") !== v.font && typeof window !== "undefined" && typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("resize"));
}

/**
 * The script in <head> (layout.tsx) that puts the last look on <html> before anything is painted, so the page
 * does not flash 紙・標準 first. Only known values are set; a broken or blocked storage leaves the default.
 */
export function appearanceBootScript(): string {
  const themes = JSON.stringify(THEMES.map((t) => t.key).filter((k) => k !== DEFAULT_APPEARANCE.theme));
  const fonts = JSON.stringify(FONT_SIZES.map((f) => f.key).filter((k) => k !== DEFAULT_APPEARANCE.font));
  return `(function(){try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(LAST_APPEARANCE_KEY)})||"null");if(!v)return;var d=document.documentElement;if(${themes}.indexOf(v.theme)>=0)d.setAttribute("data-theme",v.theme);if(${fonts}.indexOf(v.font)>=0)d.setAttribute("data-font",v.font)}catch(e){}})()`;
}
