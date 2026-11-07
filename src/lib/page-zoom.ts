// 字の大きさ（設定）: the whole page is zoomed with CSS zoom on <html> (globals.css, data-font).
// Under zoom, pointer positions (clientX), getBoundingClientRect() and window.innerWidth stay in screen px,
// while a length written into style (left, top, width) is in the page's CSS px = screen px ÷ zoom.
// Code that places a window or a menu at the pointer converts with these.

/** The zoom of each 字の大きさ but 標準 (1). Same numbers as globals.css. */
export const FONT_ZOOM: Readonly<Record<string, number>> = { sm: 0.9, lg: 1.12, xl: 1.25 };

/** The page's zoom now (1 on the server and when 字の大きさ is 標準). */
export function pageZoom(): number {
  if (typeof document === "undefined" || !document.documentElement) return 1;
  return FONT_ZOOM[document.documentElement.getAttribute("data-font") ?? ""] ?? 1;
}

/** Screen px (a pointer, a rect) → the page's CSS px. */
export const cssPx = (n: number) => n / pageZoom();

/** The screen's width and height in the page's CSS px (what a window placed with style can fill). */
export const viewW = () => (typeof window === "undefined" ? 1200 : window.innerWidth) / pageZoom();
export const viewH = () => (typeof window === "undefined" ? 800 : window.innerHeight) / pageZoom();
