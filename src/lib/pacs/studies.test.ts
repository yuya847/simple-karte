import { describe, expect, it } from "vitest";
import type { ImagingOrder } from "../exams";
import { PATIENTS } from "../patients";
import type { OrderEntry } from "../types";
import { buildPacsStudies, collectStudies, findPrior, positionLabel, regionKeyOf, xrayViews } from "./studies";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const oura = PATIENTS.find((p) => p.id === "90010244")!;
const kitamura = PATIENTS.find((p) => p.id === "90010198")!;

const order = (id: string, o: Partial<ImagingOrder>, day = 0, time = "09:00"): OrderEntry => ({
  kind: "order",
  id,
  day,
  time,
  author: "テスト",
  status: "有効",
  order: { type: "imaging", modality: "X線", region: "R-CHEST", purpose: "経過", when: { day, time: "10:00", priority: "予約" }, transport: "車椅子", ...o } as ImagingOrder,
});

describe("部位の読み取り", () => {
  it("架空の記録の部位の言葉から部位マスターのコード", () => {
    expect(regionKeyOf(sakura.imaging[0])).toBe("R-CHEST");
    expect(regionKeyOf(sakura.imaging[1])).toBe("R-LEG");
    expect(regionKeyOf({ ...sakura.imaging[0], region: "胸腹部" })).toBe("R-CHEST-ABD");
    expect(regionKeyOf({ ...sakura.imaging[0], region: "腹部・骨盤" })).toBe("R-ABD-PELVIS");
    expect(regionKeyOf({ ...sakura.imaging[0], region: "眼窩" })).toBe("R-OTHER");
  });

  it("撮影方向：2方向は正面と側面、胸部は PA、オーダーの方向はそのまま", () => {
    expect(xrayViews(sakura.imaging[1], "leg").map((v) => v.view)).toEqual(["FRONT", "LAT"]);
    expect(xrayViews(sakura.imaging[0], "chest").map((v) => v.view)).toEqual(["PA"]);
    expect(xrayViews({ ...sakura.imaging[0], views: ["立位正面（PA）", "側面"] }, "chest").map((v) => v.view)).toEqual(["PA", "LAT"]);
    expect(xrayViews({ ...sakura.imaging[0], views: ["臥位正面（AP）"] }, "chest").map((v) => v.view)).toEqual(["AP"]);
    expect(xrayViews({ ...sakura.imaging[0], region: "腹部", views: ["臥位", "立位"] }, "abdomen").map((v) => v.view)).toEqual(["SUPINE", "ERECT"]);
  });
});

describe("検査を集める", () => {
  it("架空の記録はそのままのレポートで、全部に画像（シリーズ）がある", () => {
    for (const p of [sakura, oura, kitamura]) {
      const studies = buildPacsStudies(p, collectStudies(p, [], 0));
      expect(studies.length).toBe(p.imaging.length);
      for (const s of studies) {
        expect(s.series.length).toBeGreaterThan(0);
        expect(s.status).toBe("読影済み");
        expect(s.study.report).toBe(p.imaging.find((x) => x.id === s.study.id)!.report);
      }
    }
  });

  it("時刻を過ぎたオーダーは「読影待ち」で画像あり、まだのものは「未実施」で画像なし", () => {
    const now = 0 * 1440 + 11 * 60;
    const entries = [order("o-done", { views: ["立位正面（PA）", "側面"] }), order("o-later", { when: { day: 0, time: "15:00", priority: "予約" } }), { ...order("o-stop", {}), status: "中止" as const }];
    const list = collectStudies(kitamura, entries, now);
    expect(list.map((s) => s.id)).toEqual(["o-later", "o-done", "img-kita-2", "img-kita-1"]);
    const built = buildPacsStudies(kitamura, list);
    const done = built.find((s) => s.study.id === "o-done")!;
    expect(done.status).toBe("読影待ち");
    expect(done.study.reader).toBe("（読影待ち）");
    expect(done.series.map((s) => s.description)).toEqual(["立位正面（PA）", "側面"]);
    const later = built.find((s) => s.study.id === "o-later")!;
    expect(later.status).toBe("未実施");
    expect(later.series).toEqual([]);
  });

  it("至急の CT（単純＋造影）は 2 シリーズ、ポータブルは X線の臥位正面", () => {
    const now = 600;
    const entries = [
      order("o-ct", { modality: "CT", region: "R-CHEST", contrast: "単純＋造影", when: { day: 0, priority: "至急" } }, 0, "09:00"),
      order("o-port", { modality: "ポータブルX線", views: ["臥位正面（AP）"], when: { day: 0, priority: "至急" } }, 0, "09:10"),
    ];
    // 合成画像の作り方のテスト（公開データの画像を使うかは photos.test.ts）
    const built = buildPacsStudies(sakura, collectStudies(sakura, entries, now), { photos: false });
    const ct = built.find((s) => s.study.id === "o-ct")!;
    expect(ct.study.modality).toBe("CT");
    expect(ct.series.map((s) => s.description)).toEqual(["単純 5mm", "造影 5mm"]);
    expect(positionLabel(ct.series[0], 0)).toBe("z +245.0 mm");
    const port = built.find((s) => s.study.id === "o-port")!;
    expect(port.study.modality).toBe("X線");
    expect(port.series[0].gen).toMatchObject({ kind: "xray", view: "AP" });
  });
});

describe("比較表示の前回", () => {
  it("北村さん：今回（1日前）の前回は 5日前の胸部X線", () => {
    expect(findPrior(kitamura.imaging, kitamura.imaging[1])?.id).toBe("img-kita-1");
    expect(findPrior(kitamura.imaging, kitamura.imaging[0])).toBeUndefined();
  });

  it("部位が違えば前回にしない（佐倉さんの胸部と下腿）", () => {
    expect(findPrior(sakura.imaging, sakura.imaging[1])).toBeUndefined();
  });

  it("新しいオーダーの胸部X線は、前回の描き方（CTR など）を引きつぐ", () => {
    const list = collectStudies(kitamura, [order("o-new", {})], 1440);
    const built = buildPacsStudies(kitamura, list);
    const fresh = built.find((s) => s.study.id === "o-new")!;
    const prev = built.find((s) => s.study.id === "img-kita-2")!;
    expect(findPrior(list, fresh.study)?.id).toBe("img-kita-2");
    expect(fresh.series[0].hint).toEqual(prev.series[0].hint);
  });
});
