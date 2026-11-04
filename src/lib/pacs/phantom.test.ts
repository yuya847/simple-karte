import { describe, expect, it } from "vitest";
import { PATIENTS } from "../patients";
import { clampIndex, getFrame, renderFrame, valueRange } from "./frames";
import { makeRng, seedFrom } from "./random";
import { buildPacsStudy } from "./studies";
import type { SeriesSpec } from "./types";
import { tissueValue } from "./volume";

const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
const sakura = PATIENTS.find((p) => p.id === "90010231")!;

function seriesOf(patient = kitamura, over: Partial<(typeof kitamura.imaging)[number]>) {
  const study = { id: "test-1", day: 0, modality: "X線" as const, region: "胸部正面", report: "", reader: "", ...over };
  // 合成画像のテストなので、公開データの画像は使わない
  return buildPacsStudy(patient, study, [study], { photos: false }).series;
}

const lowest = (px: Int16Array) => px.reduce((m, v) => Math.min(m, v), Infinity);
const highest = (px: Int16Array) => px.reduce((m, v) => Math.max(m, v), -Infinity);
const same = (a: Int16Array, b: Int16Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const at = (spec: SeriesSpec, px: Int16Array, xMm: number, yMm: number) => {
  const i = Math.floor(xMm / spec.spacing + spec.width / 2);
  const j = Math.floor(yMm / spec.spacing + spec.height / 2);
  return px[j * spec.width + i];
};
const mean = (spec: SeriesSpec, px: Int16Array, xMm: number, yMm: number, r = 3) => {
  let s = 0;
  let n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++, n++) s += at(spec, px, xMm + dx * spec.spacing, yMm + dy * spec.spacing);
  return s / n;
};

describe("種と擬似乱数", () => {
  it("同じ文字列からは同じ種・同じ並び", () => {
    expect(seedFrom("img-kita-1")).toBe(seedFrom("img-kita-1"));
    expect(seedFrom("img-kita-1")).not.toBe(seedFrom("img-kita-2"));
    const a = makeRng(42);
    const b = makeRng(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("合成画像は同じ ID なら毎回同じ", () => {
  it("X線（北村さんの胸部X線）", () => {
    const study = kitamura.imaging[0];
    const a = buildPacsStudy(kitamura, study, kitamura.imaging).series[0];
    const b = buildPacsStudy(kitamura, { ...study }, kitamura.imaging).series[0];
    expect(a.uid).toBe(b.uid);
    expect(same(renderFrame(a, 0), renderFrame(b, 0))).toBe(true);
  });

  it("違う検査は違う画像（同じ患者・同じ部位でも、撮影のずれと雑音が違う）", () => {
    const [s1, s2] = kitamura.imaging.map((s) => buildPacsStudy(kitamura, s, kitamura.imaging).series[0]);
    expect(s1.anatomySeed).toBe(s2.anatomySeed);
    expect(same(renderFrame(s1, 0), renderFrame(s2, 0))).toBe(false);
  });

  it("CT の同じスライスは同じ、違うスライスは違う", () => {
    const ct = seriesOf(sakura, { modality: "CT", region: "胸部（単純）", regionCode: "R-CHEST", contrast: "単純" })[0];
    expect(same(renderFrame(ct, 20), renderFrame(ct, 20))).toBe(true);
    expect(same(renderFrame(ct, 20), renderFrame(ct, 21))).toBe(false);
  });

  it("覚えておいた画素も、作り直した画素と同じ", () => {
    const mr = seriesOf(sakura, { modality: "MRI", region: "頭部（単純）", regionCode: "R-HEAD", contrast: "単純" })[1];
    expect(same(getFrame(mr, 5), renderFrame(mr, 5))).toBe(true);
    expect(getFrame(mr, 5)).toBe(getFrame(mr, 5));
  });
});

describe("X線の合成画像", () => {
  const [pa] = seriesOf(kitamura, { region: "胸部正面" });
  const px = renderFrame(pa, 0);
  it("大きさ・値の範囲", () => {
    expect(px.length).toBe(pa.width * pa.height);
    const [lo, hi] = valueRange(pa);
    expect(lowest(px)).toBeGreaterThanOrEqual(lo);
    expect(highest(px)).toBeLessThanOrEqual(hi);
  });
  it("肺は腹より暗く、体の外（空気）はもっと暗い", () => {
    const lung = mean(pa, px, -80, -40);
    const abdomen = mean(pa, px, -60, 190);
    const air = mean(pa, px, -175, 200, 1);
    expect(lung).toBeLessThan(abdomen);
    expect(air).toBeLessThan(lung);
  });
  it("2方向の下腿は 2 枚（正面・側面）", () => {
    const leg = buildPacsStudy(sakura, sakura.imaging[1], sakura.imaging).series;
    expect(leg.map((s) => s.description)).toEqual(["正面", "側面"]);
    expect(leg[1].orient.right).toBe("P");
  });
});

describe("CT の合成画像（HU）", () => {
  const ct = seriesOf(sakura, { modality: "CT", region: "胸部（単純）", regionCode: "R-CHEST", contrast: "単純" })[0];
  it("スライスは 30〜60 枚、位置は上から下へ 5 mm ずつ", () => {
    expect(ct.positions.length).toBeGreaterThanOrEqual(30);
    expect(ct.positions.length).toBeLessThanOrEqual(60);
    expect(ct.positions[0] - ct.positions[1]).toBe(5);
  });
  it("体の外は空気（−1000 前後）、肺は −850 前後、椎体は骨の値", () => {
    const i = ct.positions.indexOf(60);
    const px = renderFrame(ct, i);
    expect(mean(ct, px, -170, -170)).toBeLessThan(-950);
    expect(mean(ct, px, -60, -10)).toBeGreaterThan(-920);
    expect(mean(ct, px, -60, -10)).toBeLessThan(-780);
    expect(mean(ct, px, 0, 55, 2)).toBeGreaterThan(150);
    expect(lowest(px)).toBeGreaterThanOrEqual(-1024);
    expect(highest(px)).toBeLessThanOrEqual(3071);
  });
  it("造影は血液の値が上がる", () => {
    expect(tissueValue("blood", "ctc")).toBeGreaterThan(tissueValue("blood", "ct") + 100);
    const both = seriesOf(sakura, { modality: "CT", region: "腹部（単純＋造影）", regionCode: "R-ABD", contrast: "単純＋造影" });
    expect(both.map((s) => s.description)).toEqual(["単純 5mm", "造影 5mm"]);
  });
});

describe("MRI の合成画像", () => {
  it("T2 では髄液が明るく、T1 では脂肪が明るい", () => {
    expect(tissueValue("csf", "t2")).toBeGreaterThan(tissueValue("white", "t2"));
    expect(tissueValue("csf", "t1")).toBeLessThan(tissueValue("white", "t1"));
    expect(tissueValue("fat", "t1")).toBeGreaterThan(tissueValue("muscle", "t1"));
  });
  it("腰椎は矢状断（右が後ろ、下が足）", () => {
    const [t1] = seriesOf(sakura, { modality: "MRI", region: "腰椎", regionCode: "R-LSPINE" });
    expect(t1.gen).toMatchObject({ kind: "mr", plane: "sagittal" });
    expect(t1.orient).toEqual({ right: "P", down: "F" });
    expect(renderFrame(t1, 0).length).toBe(t1.width * t1.height);
  });
});

describe("スライス番号の端", () => {
  it("0〜枚数−1 に収める", () => {
    expect(clampIndex(-3, 10)).toBe(0);
    expect(clampIndex(12, 10)).toBe(9);
    expect(clampIndex(4.4, 10)).toBe(4);
    expect(clampIndex(3, 0)).toBe(0);
  });
});
