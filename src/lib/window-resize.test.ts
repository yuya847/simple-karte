import { describe, expect, it } from "vitest";
import { resizeWin, restoredWin, SNAP_EDGE, snapArea, snapAt, snappedAs, snapWin, type ResizeEdge } from "./window-resize";
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

describe("寄せる・最大化", () => {
  it("上の端は画面いっぱい、左右の端はその側の半分、それ以外は寄せない", () => {
    expect(snapAt(500, 0, 1440, 900)).toBe("max");
    expect(snapAt(0, 400, 1440, 900)).toBe("left");
    expect(snapAt(1439, 400, 1440, 900)).toBe("right");
    expect(snapAt(700, 400, 1440, 900)).toBeNull();
    expect(snapAt(9 + SNAP_EDGE, 400, 1440, 900)).toBeNull();
  });
  it("カルテを開いているときは患者バーの下に、ほかは画面全体に収める", () => {
    expect(snapArea(1440, 900, 257)).toEqual({ x: 0, y: 257, w: 1440, h: 643 });
    expect(snapArea(1440, 900)).toEqual({ x: 0, y: 0, w: 1440, h: 900 });
    // Too little left under the bar (a short screen): the whole screen.
    expect(snapArea(1440, 400, 257)).toEqual({ x: 0, y: 0, w: 1440, h: 400 });
  });
  it("半分はその場所の高さいっぱいで、左右で幅を分け合う", () => {
    const screen = snapArea(1441, 900);
    expect(snapWin("left", screen)).toEqual({ x: 0, y: 0, w: 721, h: 900 });
    expect(snapWin("right", screen)).toEqual({ x: 721, y: 0, w: 720, h: 900 });
    expect(snapWin("max", snapArea(1440, 900, 257))).toEqual({ x: 0, y: 257, w: 1440, h: 643 });
    expect(snapWin("right", snapArea(1440, 900, 257))).toEqual({ x: 720, y: 257, w: 720, h: 643 });
  });
  it("覚えた形が画面に合わせて少し小さく戻っても、寄せた形と分かる", () => {
    const screen = snapArea(1440, 900);
    expect(snappedAs(fitWin(snapWin("max", screen), 1440, 900), screen)).toBe("max");
    expect(snappedAs(snapWin("right", screen), screen)).toBe("right");
    expect(snappedAs({ x: 100, y: 80, w: 700, h: 500 }, screen)).toBeNull();
  });
  it("戻す形がないときは画面の真ん中に、画面に収まる大きさで", () => {
    const w = restoredWin(1440, 900);
    expect(w).toEqual({ x: 288, y: 68, w: 864, h: 630 });
    expect(snappedAs(w, snapArea(1440, 900))).toBeNull();
  });
});
