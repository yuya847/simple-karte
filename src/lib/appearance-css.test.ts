// 設定の見た目と字の大きさは globals.css の中身。読めること（本文 4.5:1 以上）と、拡大の数が
// page-zoom.ts と同じことを、CSS を読んで確かめる。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEMES, THEME_SWATCH } from "./appearance";
import { FONT_ZOOM } from "./page-zoom";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

/** The tokens of a block, e.g. `:root[data-theme="dark"] {` … `}` (or `@theme {`). */
function tokens(open: string): Record<string, string> {
  const start = css.indexOf(open);
  expect(start, open).toBeGreaterThanOrEqual(0);
  const body = css.slice(start + open.length, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}
const base = tokens("@theme {");
const theme = (key: string) => (key === "paper" ? base : { ...base, white: "#ffffff", ...tokens(`:root[data-theme="${key}"] {`) });

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const LETTERS = ["ink", "ink-soft", "ink-faint", "ai", "shu", "yamabuki", "wakatake", "fuji", "mizu", "kuri"];
const ACCENTS = ["ai", "shu", "yamabuki", "wakatake", "fuji", "mizu", "kuri"];

describe("見た目（白・ダーク・くっきり）", () => {
  it.each(["white", "dark", "contrast"])("%s: letters are 4.5:1 or more on paper, sheet and tab, and on their own soft colour", (key) => {
    const t = theme(key);
    for (const fg of LETTERS) for (const bg of ["paper", "sheet", "tab"]) expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    for (const a of ACCENTS) expect(contrast(t[a], t[`${a}-soft`]), `${a} on ${a}-soft`).toBeGreaterThanOrEqual(4.5);
  });

  it("ダーク: the letters on a filled accent or on bg-ink (text-white) stay 4.5:1 or more", () => {
    const t = theme("dark");
    expect(lum(t.paper)).toBeLessThan(lum(t.ink));
    for (const fill of [...ACCENTS, "ink"]) expect(contrast(t.white, t[fill]), `white on ${fill}`).toBeGreaterThanOrEqual(4.5);
  });

  it("every look is drawn only on the screen (printing stays 紙), and the buttons in 設定 show the same colours", () => {
    const screen = css.slice(css.indexOf("@media screen"), css.indexOf("@media screen", css.indexOf("@media screen") + 1));
    for (const t of THEMES.filter((x) => x.key !== "paper")) expect(screen).toContain(`:root[data-theme="${t.key}"] {`);
    for (const t of THEMES) {
      const c = theme(t.key);
      expect(THEME_SWATCH[t.key]).toEqual({ paper: c.paper, sheet: c.sheet, ink: c.ink });
    }
  });

  it("ダーク: the flow sheet's fixed colours are redrawn (grid, halo, labels)", () => {
    for (const hex of ["#ebe4d4", "#fffdf7", "#26221c"]) expect(css).toMatch(new RegExp(`data-theme="dark"\\] svg \\[(stroke|fill)="${hex}"\\]`));
  });
});

describe("字の大きさ", () => {
  it("zoom on <html> with the same numbers as page-zoom.ts, and vh heights divided back", () => {
    for (const [key, z] of Object.entries(FONT_ZOOM)) {
      expect(css).toMatch(new RegExp(`:root\\[data-font="${key}"\\] \\{\\s*zoom: ${z};\\s*--page-zoom: ${z};`));
    }
    expect(css).toContain(":root[data-font] .h-screen { height: calc(100vh / var(--page-zoom)); }");
  });
});
