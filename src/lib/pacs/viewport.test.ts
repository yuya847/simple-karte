import { describe, expect, it } from "vitest";
import { applyMatrix, cineNext, fitScale, invertMatrix, nearestSlice, orientationLabels, rotate, stepSlice, viewMatrix, zoomAt, ZOOM_MAX, type ViewState } from "./viewport";

const view = (over: Partial<ViewState> = {}): ViewState => ({ zoom: 1, panX: 0, panY: 0, rotation: 0, flipH: false, flipV: false, ww: 400, wl: 40, invert: false, slice: 0, ...over });

describe("スライス送り", () => {
  it("端で止まる（回りこまない）", () => {
    expect(stepSlice(0, -1, 30)).toBe(0);
    expect(stepSlice(29, 1, 30)).toBe(29);
    expect(stepSlice(27, 5, 30)).toBe(29);
    expect(stepSlice(3, -10, 30)).toBe(0);
    expect(stepSlice(10, 1, 30)).toBe(11);
  });
  it("1 枚だけ・0 枚のシリーズでは 0", () => {
    expect(stepSlice(0, 1, 1)).toBe(0);
    expect(stepSlice(5, 1, 0)).toBe(0);
  });
});

describe("シネ再生", () => {
  it("loop：最後の次は最初、最初の前は最後", () => {
    expect(cineNext(29, 30, 1, "loop")).toEqual({ index: 0, dir: 1 });
    expect(cineNext(0, 30, -1, "loop")).toEqual({ index: 29, dir: -1 });
    expect(cineNext(4, 30, 1, "loop")).toEqual({ index: 5, dir: 1 });
  });
  it("bounce：端で向きを変える", () => {
    expect(cineNext(29, 30, 1, "bounce")).toEqual({ index: 28, dir: -1 });
    expect(cineNext(0, 30, -1, "bounce")).toEqual({ index: 1, dir: 1 });
  });
  it("1 枚なら動かない", () => {
    expect(cineNext(0, 1, 1, "loop").index).toBe(0);
  });
});

describe("比較表示のスライスをそろえる", () => {
  it("位置がいちばん近いスライス", () => {
    const pos = [100, 95, 90, 85, 80];
    expect(nearestSlice(91, pos)).toBe(2);
    expect(nearestSlice(200, pos)).toBe(0);
    expect(nearestSlice(-50, pos)).toBe(4);
  });
});

describe("画像 → 画面の変換", () => {
  it("画面に収まる倍率（回転すると縦横が入れかわる）", () => {
    expect(fitScale(400, 200, 800, 800, 0)).toBe(2);
    expect(fitScale(400, 200, 800, 800, 90)).toBe(2);
    expect(fitScale(400, 200, 400, 800, 90)).toBe(2);
    expect(fitScale(400, 200, 400, 800, 0)).toBe(1);
  });

  it("画像の中心は画面の中心（＋移動）へ", () => {
    const m = viewMatrix(view({ panX: 10, panY: -5 }), 200, 100, 400, 400);
    expect(applyMatrix(m, 100, 50)).toEqual([210, 195]);
  });

  it("逆変換で元に戻る（回転・反転・拡大つき）", () => {
    const m = viewMatrix(view({ zoom: 2.5, panX: 13, panY: -7, rotation: 90, flipH: true }), 320, 240, 600, 500);
    const inv = invertMatrix(m);
    const [sx, sy] = applyMatrix(m, 37.5, 201.25);
    const [x, y] = applyMatrix(inv, sx, sy);
    expect(x).toBeCloseTo(37.5, 9);
    expect(y).toBeCloseTo(201.25, 9);
  });

  it("時計回りに 90° 回すと、画像の右は画面の下へ", () => {
    const m = viewMatrix(view({ rotation: 90 }), 100, 100, 100, 100);
    const [cx, cy] = applyMatrix(m, 50, 50);
    const [rx, ry] = applyMatrix(m, 60, 50);
    expect(rx - cx).toBeCloseTo(0, 9);
    expect(ry - cy).toBeGreaterThan(0);
  });

  it("マウスの所を中心に拡大すると、その点は動かない", () => {
    const v = view({ panX: 20, panY: 10 });
    const before = viewMatrix(v, 300, 300, 600, 600);
    const pt = applyMatrix(invertMatrix(before), 420, 180);
    const after = viewMatrix(zoomAt(v, 2, 420, 180, 600, 600), 300, 300, 600, 600);
    const [sx, sy] = applyMatrix(after, pt[0], pt[1]);
    expect(sx).toBeCloseTo(420, 9);
    expect(sy).toBeCloseTo(180, 9);
  });

  it("拡大には上限がある", () => {
    expect(zoomAt(view({ zoom: 15 }), 10, 0, 0, 100, 100).zoom).toBe(ZOOM_MAX);
  });

  it("回転は 90° ずつ", () => {
    expect(rotate(0, 1)).toBe(90);
    expect(rotate(270, 1)).toBe(0);
    expect(rotate(0, -1)).toBe(270);
  });
});

describe("向きの表示", () => {
  const axial = { right: "L", down: "P" } as const;
  it("そのまま：右は患者の左、上は前", () => {
    expect(orientationLabels(axial, view())).toEqual({ left: "R", right: "L", top: "A", bottom: "P" });
  });
  it("左右反転", () => {
    expect(orientationLabels(axial, view({ flipH: true }))).toEqual({ left: "L", right: "R", top: "A", bottom: "P" });
  });
  it("時計回りに 90°：画像の右（患者の左）が下へ", () => {
    expect(orientationLabels(axial, view({ rotation: 90 }))).toEqual({ left: "P", right: "A", top: "R", bottom: "L" });
  });
  it("180° は上下左右が入れかわる", () => {
    expect(orientationLabels({ right: "L", down: "F" }, view({ rotation: 180 }))).toEqual({ left: "L", right: "R", top: "F", bottom: "H" });
  });
});
