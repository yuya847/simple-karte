import { describe, expect, it } from "vitest";
import { besideWin, bigWin, fitWin, keepWin, keptWin, parseWin } from "./win-prefs";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
};

describe("別ウインドウの既定の大きさ", () => {
  it("注射カレンダーは幅1200px・高さ800pxを上限に で真ん中に開く", () => {
    const w = bigWin(1600, 1000);
    expect(w).toEqual({ x: 200, y: 100, w: 1200, h: 800 });
  });
  it("小さな画面でも画面からはみ出さず、320×200 より小さくならない", () => {
    const w = bigWin(360, 200);
    expect(w.w).toBe(320);
    expect(w.h).toBe(200);
    expect(w.x + w.w).toBeLessThanOrEqual(360);
    expect(w.y).toBe(0);
  });
  it("fitWin は画面の外に出た窓を中に戻す", () => {
    expect(fitWin({ x: 1500, y: -20, w: 400, h: 300 }, 1600, 900)).toEqual({ x: 1200, y: 0, w: 400, h: 300 });
  });
  it("注射の入力の窓はカレンダーの窓の右側に、両方が見えるように重なる", () => {
    const cal = bigWin(1600, 1000);
    const inj = besideWin(cal, 1600, 1000);
    expect(inj.w).toBe(540);
    expect(inj.x + inj.w).toBeLessThanOrEqual(cal.x + cal.w);
    expect(inj.y).toBe(cal.y + 40);
    expect(inj.h).toBe(cal.h - 48);
  });
});

describe("ウインドウの位置と大きさをこの端末に覚える", () => {
  it("覚えたものを読み戻し、いまの画面に収める", () => {
    const s = mem();
    expect(keepWin("injcal", { x: 100, y: 50, w: 900, h: 600 }, s)).toBe(true);
    expect(keptWin("injcal", 1600, 1000, s)).toEqual({ x: 100, y: 50, w: 900, h: 600 });
    expect(keptWin("injcal", 800, 500, s)).toEqual({ x: 8, y: 8, w: 792, h: 492 });
  });
  it("何もないとき・壊れているときは null（既定の大きさで開く）", () => {
    const s = mem();
    expect(keptWin("injcal", 1600, 1000, s)).toBeNull();
    s.setItem("simple-karte:win:injcal", "{broken");
    expect(keptWin("injcal", 1600, 1000, s)).toBeNull();
    expect(parseWin('{"x":1,"y":2,"w":"wide","h":4}')).toBeNull();
  });
  it("保存できない端末（ストレージが使えない）でも例外にならない", () => {
    const bad = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(keepWin("injcal", { x: 0, y: 0, w: 400, h: 300 }, bad)).toBe(false);
    expect(keptWin("injcal", 1600, 1000, bad)).toBeNull();
    expect(keptWin("injcal", 1600, 1000, null)).toBeNull();
  });
});
