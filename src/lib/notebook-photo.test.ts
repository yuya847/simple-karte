import { describe, expect, it } from "vitest";
import { boxFrom, boxPixels, jpegData, photoFileProblem, photoScans, PHOTO_LIMITS, sendProblem, sendSize } from "./notebook-photo";
import { SCAN_LIMITS } from "./scans";

const jpeg = (n: number) => `/9j/${"A".repeat(Math.max(0, n - 4))}`;

describe("お薬手帳の写真：囲んだ部分だけを送る", () => {
  it("2点の間の四角を、どちら向きに引いても写真の中に収める", () => {
    expect(boxFrom({ x: 0.8, y: 0.6 }, { x: 0.2, y: 0.3 })).toEqual({ x: 0.2, y: 0.3, w: expect.closeTo(0.6, 9), h: expect.closeTo(0.3, 9) });
    expect(boxFrom({ x: -0.2, y: 0.5 }, { x: 1.4, y: 1.2 })).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 });
  });

  it("四角を写真の画素にし、小さすぎる四角は読めないとする", () => {
    expect(boxPixels({ x: 0.1, y: 0.25, w: 0.8, h: 0.5 }, { w: 1200, h: 1600 })).toEqual({ x: 120, y: 400, w: 960, h: 800 });
    expect(boxPixels({ x: 0.5, y: 0.5, w: 0.01, h: 0.4 }, { w: 1200, h: 1600 })).toBeNull();
    // Never past the edge of the photo.
    expect(boxPixels({ x: 0.9, y: 0.9, w: 0.2, h: 0.2 }, { w: 1000, h: 1000 })).toEqual({ x: 900, y: 900, w: 100, h: 100 });
  });

  it("送る大きさは長い辺1600まで、元より大きくしない", () => {
    expect(sendSize(3000, 1500)).toEqual({ w: 1600, h: 800 });
    expect(sendSize(900, 400)).toEqual({ w: 900, h: 400 });
  });

  it("何も囲んでいない・多すぎる・大きすぎる・JPEG でないものは送らない", () => {
    expect(sendProblem([])).toContain("囲んで");
    expect(sendProblem([jpeg(1000)])).toBeNull();
    expect(sendProblem(Array.from({ length: PHOTO_LIMITS.pages + 1 }, () => jpeg(100)))).toContain(`${PHOTO_LIMITS.pages}ページ`);
    expect(sendProblem([jpeg(PHOTO_LIMITS.perImage + 4)])).toContain("大きすぎ");
    expect(sendProblem([jpeg(1_000_000), jpeg(1_000_000), jpeg(1_000_000), jpeg(1_000_000)])).toContain("合わせて");
    expect(sendProblem(["iVBORw0KGgo="])).toContain("読めません");
    expect(jpegData("data:image/jpeg;base64,/9j/AAAA")).toBe("/9j/AAAA");
  });

  it("写真は画像だけ。PDF は囲めないと言う", () => {
    expect(photoFileProblem({ type: "image/jpeg", size: 5_000_000, name: "a.jpg" })).toBeNull();
    expect(photoFileProblem({ type: "", size: 100, name: "IMG_0001.HEIC" })).toBeNull();
    expect(photoFileProblem({ type: "application/pdf", size: 100, name: "a.pdf" })).toContain("PDF");
    expect(photoFileProblem({ type: "text/plain", size: 100, name: "a.txt" })).toContain("画像");
    expect(photoFileProblem({ type: "image/png", size: PHOTO_LIMITS.original + 1, name: "a.png" })).toContain("大きすぎ");
  });

  it("撮った写真は患者の文書（お薬手帳）に残し、今日の取込の上限を超える分は残さない", () => {
    let n = 0;
    const ctx = { patientId: "p1", by: "看護師 佐藤", role: "看護師", at: { day: 0, time: "09:10" }, docDate: "2026-11-07", newId: () => `s${++n}` };
    const page = (chars: number) => ({ dataUrl: `data:image/jpeg;base64,${"A".repeat(chars)}`, width: 1200, height: 1600, name: "見本.jpg", bytes: 1000, sample: true });
    const docs = photoScans([page(1000), page(2000)], [], ctx);
    expect(docs.map((d) => [d.id, d.type, d.docDate, d.sample, d.patientId])).toEqual([["s1", "お薬手帳", "2026-11-07", true, "p1"], ["s2", "お薬手帳", "2026-11-07", true, "p1"]]);
    expect(photoScans([page(SCAN_LIMITS.perFile + 1)], [], ctx)).toEqual([]);
    expect(photoScans([{ ...page(10), dataUrl: "data:image/png;base64,AAAA" }], [], ctx)).toEqual([]);
  });
});
