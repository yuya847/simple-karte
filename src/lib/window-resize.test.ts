import { describe, expect, it } from "vitest";
import { resizeWin, type ResizeEdge } from "./window-resize";
import { fitWin } from "./win-prefs";

describe("四辺と四隅のリサイズ", () => {
  const win = { x: 100, y: 100, w: 500, h: 400 };
  it.each(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as ResizeEdge[])("%s は反対の辺を動かさない", edge => {
    const next = resizeWin(win, edge, 20, 30, 1000, 800);
    if (edge.includes("w")) expect(next.x + next.w).toBe(600);
    else expect(next.x).toBe(100);
    if (edge.includes("n")) expect(next.y + next.h).toBe(500);
    else expect(next.y).toBe(100);
    expect(next.w).toBe(edge.includes("w") ? 480 : edge.includes("e") ? 520 : 500);
    expect(next.h).toBe(edge.includes("n") ? 370 : edge.includes("s") ? 430 : 400);
  });
  it("最小サイズでも反対側の位置を保つ", () => {
    expect(resizeWin(win, "nw", 999, 999, 1000, 800)).toEqual({ x: 280, y: 300, w: 320, h: 200 });
  });
  it("どの方向でも画面端で止まる", () => {
    expect(resizeWin(win, "nw", -999, -999, 1000, 800)).toEqual({ x: 0, y: 0, w: 600, h: 500 });
    expect(resizeWin(win, "se", 999, 999, 1000, 800)).toEqual({ x: 100, y: 100, w: 900, h: 700 });
  });
  it("最小サイズより狭い画面でもはみ出さない", () => {
    expect(fitWin(win, 280, 180)).toEqual({ x: 0, y: 0, w: 280, h: 180 });
  });
});
