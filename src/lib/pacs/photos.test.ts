// 公開データの画像の割り当て：架空の検査の ID・部位の見本・読み込みの覚え方。
import { describe, expect, it } from "vitest";
import type { ImagingOrder } from "../exams";
import { IMAGE_CREDITS } from "../image-credits";
import { PATIENTS } from "../patients";
import { demoRisOrders, initialRisDesk } from "../ris";
import type { OrderEntry } from "../types";
import { getFrame, valueRange } from "./frames";
import { _setPhotoFrame, creditsOf, PHOTO_ASSIGNMENTS, photoFrame, photoVersion, subscribePhotos } from "./photos";
import { buildPacsStudies, collectStudies, positionLabel } from "./studies";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const oura = PATIENTS.find((p) => p.id === "90010244")!;
const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
const mori = PATIENTS.find((p) => p.id === "90010260")!;

const order = (id: string, o: Partial<ImagingOrder>, time = "09:00"): OrderEntry => ({
  kind: "order",
  id,
  day: 0,
  time,
  author: "テスト",
  status: "有効",
  order: { type: "imaging", modality: "X線", region: "R-CHEST", purpose: "経過", when: { day: 0, time: "10:00", priority: "予約" }, transport: "車椅子", ...o } as ImagingOrder,
});

const imagesOf = (s: { series: { gen: { kind: string; images?: string[] } }[] }) => s.series.map((x) => (x.gen.kind === "photo" ? x.gen.images : null));

describe("割り当て", () => {
  it("割り当てた画像は全部に出典があり、割り当て先の検査は架空の記録かデモのオーダーにある", () => {
    const known = new Set([...PATIENTS.flatMap((p) => p.imaging.map((s) => s.id)), ...Object.values(demoRisOrders(600)).flat().map((e) => e.id)]);
    for (const [id, list] of Object.entries(PHOTO_ASSIGNMENTS)) {
      expect(known.has(id), id).toBe(true);
      for (const s of list) for (const img of s.images) expect(IMAGE_CREDITS[img], `${id} → ${img}`).toBeDefined();
    }
  });

  it("佐倉さん：胸部X線は正常の PA、下肢エコーは蜂窩織炎の皮下組織、下腿X線は合成画像のまま", () => {
    const built = buildPacsStudies(sakura, collectStudies(sakura, [], 0));
    const byId = Object.fromEntries(built.map((s) => [s.study.id, s]));
    expect(imagesOf(byId["img-sakura-1"])).toEqual([["chest-pa-normal"]]);
    expect(imagesOf(byId["img-sakura-3"])).toEqual([["us-cellulitis"]]);
    expect(imagesOf(byId["img-sakura-2"])).toEqual([null, null]);
    const s = byId["img-sakura-1"].series[0];
    expect([s.width, s.height]).toEqual([1049, 1200]);
    expect(s.window).toEqual({ ww: 256, wl: 128 });
    expect(valueRange(s)).toEqual([0, 255]);
    expect(s.orient).toEqual({ right: "L", down: "F" });
  });

  it("大浦さん：胸部X線は肺炎の画像、入院時 CT は合う画像がないので合成画像", () => {
    const built = buildPacsStudies(oura, collectStudies(oura, [], 0));
    const byId = Object.fromEntries(built.map((s) => [s.study.id, s]));
    expect(imagesOf(byId["img-oura-1"])).toEqual([["chest-lobar-pneumonia"]]);
    expect(imagesOf(byId["img-oura-2"])).toEqual([null]);
  });

  it("北村さん：入院時は心不全の重い画像、1日前は Kerley B 線、今朝のポータブル（放射線部の記録）も同じ画像で「著変なし」", () => {
    const ris = initialRisDesk(600);
    const built = buildPacsStudies(kitamura, collectStudies(kitamura, demoRisOrders(600)["90010198"], 600, ris));
    const byId = Object.fromEntries(built.map((s) => [s.study.id, s]));
    expect(imagesOf(byId["img-kita-1"])).toEqual([["chest-chf-film"]]);
    expect(imagesOf(byId["img-kita-2"])).toEqual([["chest-kerley-b"]]);
    expect(byId["o-ris-demo1"].status).toBe("読影済み");
    expect(imagesOf(byId["o-ris-demo1"])).toEqual([["chest-kerley-b"]]);
    expect(byId["o-ris-demo1"].series[0].description).toBe("臥位正面（AP）");
  });

  it("森さん：入院時の単純 CT は腎盂腎炎の単純 CT。今日の造影 CT はまだなので画像なし", () => {
    const built = buildPacsStudies(mori, collectStudies(mori, demoRisOrders(600)["90010260"], 600, {}));
    const byId = Object.fromEntries(built.map((s) => [s.study.id, s]));
    expect(imagesOf(byId["img-mori-1"])).toEqual([["abdomen-ct-pyelonephritis-plain"]]);
    expect(byId["o-ris-demo2"].status).toBe("未実施");
    expect(byId["o-ris-demo2"].series).toEqual([]);
    expect(PHOTO_ASSIGNMENTS["o-ris-demo2"][0].images).toEqual(["abdomen-ct-pyelonephritis-contrast"]);
  });
});

describe("部位の見本（新しいオーダー）", () => {
  it("頭部 CT は 5 枚の横断像、腹部 CT は 2 枚、胸部 CT は見本がないので合成画像", () => {
    const entries = [order("o-head", { modality: "CT", region: "R-HEAD", contrast: "単純" }), order("o-abd", { modality: "CT", region: "R-ABD-PELVIS", contrast: "造影" }, "09:01"), order("o-chest", { modality: "CT", region: "R-CHEST", contrast: "単純" }, "09:02")];
    const built = buildPacsStudies(sakura, collectStudies(sakura, entries, 1000));
    const byId = Object.fromEntries(built.map((s) => [s.study.id, s]));
    expect(imagesOf(byId["o-head"])).toEqual([["head-ct-08", "head-ct-13", "head-ct-18", "head-ct-23", "head-ct-28"]]);
    const head = byId["o-head"].series[0];
    expect(head.positions).toEqual([0, 1, 2, 3, 4]);
    expect(positionLabel(head, 2)).toBe("");
    expect(imagesOf(byId["o-abd"])).toEqual([["abdomen-ct-normal-20", "abdomen-ct-normal-33"]]);
    expect(imagesOf(byId["o-chest"])).toEqual([null]);
  });

  it("X線：膝の正面・側面は 2 シリーズ、股関節の正面、胸部の PA＋側面は側面の見本がないので検査ごと合成画像", () => {
    const entries = [
      order("o-knee", { region: "R-KNEE", views: ["正面", "側面"] }),
      order("o-hip", { region: "R-HIP", views: ["正面"] }, "09:01"),
      order("o-chest2", { region: "R-CHEST", views: ["立位正面（PA）", "側面"] }, "09:02"),
      order("o-abd", { region: "R-ABD", views: ["臥位"] }, "09:03"),
    ];
    const built = buildPacsStudies(sakura, collectStudies(sakura, entries, 1000));
    const byId = Object.fromEntries(built.map((s) => [s.study.id, s]));
    expect(imagesOf(byId["o-knee"])).toEqual([["knee-ap"], ["knee-lat"]]);
    expect(byId["o-knee"].series.map((s) => s.description)).toEqual(["正面", "側面"]);
    expect(byId["o-knee"].series[1].orient).toEqual({ right: "P", down: "F" });
    expect(imagesOf(byId["o-hip"])).toEqual([["pelvis-ap"]]);
    expect(imagesOf(byId["o-chest2"])).toEqual([null, null]);
    expect(imagesOf(byId["o-abd"])).toEqual([["abdomen-supine"]]);
  });

  it("超音波は「心」が付く部位だけ心エコーの見本、MRI は見本なし", () => {
    const study = { id: "t-us", day: 0, modality: "超音波" as const, region: "心臓", report: "", reader: "" };
    const built = buildPacsStudies(sakura, [study, { ...study, id: "t-us2", region: "腹部" }, { ...study, id: "t-mr", modality: "MRI", region: "頭部" }]);
    expect(imagesOf(built[0])).toEqual([["echo-4ch"]]);
    expect(imagesOf(built[1])).toEqual([null]);
    expect(imagesOf(built[2])).toEqual([null, null]);
  });

  it("出典は同じ画像を 1 回だけ", () => {
    expect(creditsOf(["knee-ap", "knee-ap", "knee-lat", "nothing"]).map((c) => c.id)).toEqual(["knee-ap", "knee-lat"]);
  });
});

describe("読み込み", () => {
  it("ブラウザでないときは読めず、画素は黒。読めたら知らせが来て、その画素になる", () => {
    const built = buildPacsStudies(sakura, collectStudies(sakura, [], 0));
    const s = built.find((x) => x.study.id === "img-sakura-1")!.series[0];
    expect(photoFrame("chest-pa-normal")).toBeNull();
    const black = getFrame(s, 0);
    expect(black.length).toBe(1049 * 1200);
    expect(black.every((v) => v === 0)).toBe(true);
    let told = 0;
    const off = subscribePhotos(() => told++);
    const before = photoVersion();
    const px = new Int16Array(1049 * 1200).fill(200);
    _setPhotoFrame("chest-pa-normal", px);
    expect(told).toBe(1);
    expect(photoVersion()).toBe(before + 1);
    expect(getFrame(s, 0)).toBe(px);
    _setPhotoFrame("chest-pa-normal", null);
    off();
    expect(getFrame(s, 0).every((v) => v === 0)).toBe(true);
  });
});
