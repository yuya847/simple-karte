// 画像の注記・出典は共通ヘルプに集約し、画像の上には重ねない。
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { screenHelp } from "@/lib/help/content";
import { PUBLIC_IMAGE_NOTE } from "@/lib/image-credits";
import { PATIENTS } from "@/lib/patients";
import { demoRisOrders, initialRisDesk } from "@/lib/ris";
import { ImagingPanel } from "./panels/ImagingPanel";

const sakura = PATIENTS.find((p) => p.id === "90010231")!;
const kitamura = PATIENTS.find((p) => p.id === "90010198")!;
const today = { y: 2026, m: 11, d: 4 };

describe("放射線画像の引き出し", () => {
  it("佐倉さん：検査の一覧・サムネイル（公開データ）・注記と出典はヘルプ", () => {
    const html = renderToStaticMarkup(<ImagingPanel patient={sakura} today={today} focus="img-sakura-1" />);
    expect(html).toContain("検査の一覧");
    expect(html).toContain("X線 胸部正面");
    expect(html).toContain("超音波 右下肢静脈");
    expect(html).not.toContain(PUBLIC_IMAGE_NOTE);
    expect(screenHelp.find((s) => s.id === "PacsViewer")?.bullets).toContain(PUBLIC_IMAGE_NOTE);
    expect(html).toContain("公開データの教材用の画像");
    expect(html).not.toMatch(/class="hint[^"]*"[^>]*>画像の出典：Wikimedia Commons「File:Normal posteroanterior \(PA\) chest radiograph \(X-ray\)\.jpg」Mikael Häggström, M\.D\.（CC0 1\.0）/);
    expect(html).not.toContain('href="https://commons.wikimedia.org/wiki/File:Normal_posteroanterior_(PA)_chest_radiograph_(X-ray).jpg"');
    expect(html).toContain("明るさ");
    expect(html).toContain("コントラスト");
  });

  it("合成画像の検査（佐倉さんの下腿X線）を開くと、公開データの注記は出ない", () => {
    const html = renderToStaticMarkup(<ImagingPanel patient={sakura} today={today} focus="img-sakura-2" />);
    expect(html).not.toContain(PUBLIC_IMAGE_NOTE);
    expect(html).not.toContain("画像の出典");
    expect(html).toContain("X線 右下腿 2方向");
  });

  it("北村さん：今朝のポータブル（放射線部の記録）が一覧に出て、画像を送る欄は 1 枚なので出ない", () => {
    const html = renderToStaticMarkup(<ImagingPanel patient={kitamura} today={today} entries={demoRisOrders(600)["90010198"]} nowAbs={600} ris={initialRisDesk(600)} focus="o-ris-demo1" />);
    expect(html).toContain("読影済み");
    expect(html).toContain("臥位正面（AP）");
    expect(html).not.toContain(PUBLIC_IMAGE_NOTE);
    expect(screenHelp.find((s) => s.id === "PacsViewer")?.bullets).toContain(PUBLIC_IMAGE_NOTE);
    expect(html).not.toContain("Kerley B lines");
    expect(html).not.toContain('aria-label="画像"');
  });

  it("検査がない患者は「検査なし」", () => {
    const html = renderToStaticMarkup(<ImagingPanel patient={{ ...sakura, imaging: [] }} today={today} />);
    expect(html).toContain("検査なし");
  });
});
