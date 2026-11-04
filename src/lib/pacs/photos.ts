// 公開データの本物の医用画像（src/lib/image-credits.ts）を、架空の患者の検査に割り当てる。
// 割り当ては、架空の読影レポートの所見と矛盾しないものだけ（例：肺炎のレポートには肺炎のX線）。合うものがない検査は、
// これまでどおりコードで作る合成画像のまま。新しいオーダーの検査は、部位と種類から「部位の見本」の画像を使う。
// AI は使わない：どの画像を出すかはこの表で決まっていて、所見の判定や解釈はしない。

import { findCredit, type ImageCredit } from "../image-credits";
import type { ImagingStudy } from "../types";
import type { BodyPart, XrayView } from "./types";

/** 1 シリーズ分の公開画像（複数なら順にスライスとして送れる）。 */
export interface PhotoSeries {
  description: string;
  /** image-credits の ID */
  images: string[];
}

/**
 * 架空の検査 ID → 公開画像。レポートの所見と合うものだけ。
 * - 佐倉さん：入院時の胸部X線は正常、今朝の下肢エコーは「皮下の敷石状の浮腫（蜂窩織炎）、膿瘍なし」。
 * - 大浦さん：胸部X線は「右下肺野に浸潤影」（右中葉の大葉性肺炎のX線。今日の経過のX線も同じ画像）。
 *   入院時 CT（右下葉背側 S6・S10）は、合う公開画像がないので合成画像のまま。
 * - 北村さん：入院時（−5日）は心拡大と両側の肺水腫・胸水、−1日は改善して Kerley B 線、今朝のポータブルは「前回と著変なし」。
 * - 森さん：入院時の単純 CT は腎周囲の脂肪織の濃度上昇、今日の造影 CT は左の急性腎盂腎炎。
 */
export const PHOTO_ASSIGNMENTS: Record<string, PhotoSeries[]> = {
  "img-sakura-1": [{ description: "立位正面（PA）", images: ["chest-pa-normal"] }],
  "img-sakura-3": [{ description: "Bモード（皮下組織）", images: ["us-cellulitis"] }],
  "img-oura-1": [{ description: "立位正面（PA）", images: ["chest-lobar-pneumonia"] }],
  "o-ris-demo3": [{ description: "立位正面（PA）", images: ["chest-lobar-pneumonia"] }],
  "img-kita-1": [{ description: "立位正面（PA）", images: ["chest-chf-film"] }],
  "img-kita-2": [{ description: "立位正面（PA）", images: ["chest-kerley-b"] }],
  "o-ris-demo1": [{ description: "臥位正面（AP）", images: ["chest-kerley-b"] }],
  "img-mori-1": [{ description: "単純 横断", images: ["abdomen-ct-pyelonephritis-plain"] }],
  "o-ris-demo2": [{ description: "造影（動脈相・門脈相）", images: ["abdomen-ct-pyelonephritis-contrast"] }],
};

/** 部位の見本（新しいオーダーの検査に使う。どれも正常か、所見のない見本）。 */
const SAMPLE_XRAY: Partial<Record<BodyPart | "hip", Partial<Record<XrayView, string>>>> = {
  chest: { PA: "chest-pa-normal", AP: "chest-pa-normal" },
  "chest-abd": { PA: "chest-pa-normal", AP: "chest-pa-normal" },
  abdomen: { SUPINE: "abdomen-supine" },
  knee: { FRONT: "knee-ap", LAT: "knee-lat" },
  hip: { FRONT: "pelvis-ap" },
};

const SAMPLE_CT: Partial<Record<BodyPart, PhotoSeries>> = {
  head: { description: "横断（造影）", images: ["head-ct-08", "head-ct-13", "head-ct-18", "head-ct-23", "head-ct-28"] },
  abdomen: { description: "横断（造影）", images: ["abdomen-ct-normal-20", "abdomen-ct-normal-33"] },
  "abd-pelvis": { description: "横断（造影）", images: ["abdomen-ct-normal-20", "abdomen-ct-normal-33"] },
  "chest-abd": { description: "横断（造影）", images: ["abdomen-ct-normal-20", "abdomen-ct-normal-33"] },
};

/**
 * 検査に出す公開画像。架空の検査 ID の割り当てが先、なければ部位の見本。
 * X線は撮影方向ごとに 1 シリーズ（方向のどれかに見本がなければ、検査全体を合成画像にする）。
 */
export function photoSeriesFor(study: ImagingStudy, regionKey: string, part: BodyPart, views: { view: XrayView; label: string }[]): PhotoSeries[] | null {
  const own = PHOTO_ASSIGNMENTS[study.id];
  if (own) return own;
  if (study.modality === "X線") {
    const table = SAMPLE_XRAY[regionKey === "R-HIP" ? "hip" : part];
    if (!table || views.length === 0) return null;
    const out: PhotoSeries[] = [];
    for (const v of views) {
      const id = table[v.view];
      if (!id) return null;
      out.push({ description: v.label, images: [id] });
    }
    return out;
  }
  if (study.modality === "CT") {
    const s = SAMPLE_CT[part];
    return s ? [s] : null;
  }
  if (study.modality === "超音波") {
    return /心/.test(study.region) ? [{ description: "Bモード 心尖部四腔像", images: ["echo-4ch"] }] : null;
  }
  return null;
}

/** 検査の全部の出典（同じものは 1 回）。 */
export function creditsOf(images: string[]): ImageCredit[] {
  const seen = new Set<string>();
  const out: ImageCredit[] = [];
  for (const id of images) {
    const c = findCredit(id);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// ブラウザで画像を読み、灰色の画素（0〜255）にする。読めたら version が進み、subscribe した部品が描き直す。
// ---------------------------------------------------------------------------

const frames = new Map<string, Int16Array>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version++;
  for (const cb of listeners) cb();
}

/** 読めた画素（なければ null。ブラウザなら読み始める）。 */
export function photoFrame(id: string): Int16Array | null {
  const hit = frames.get(id);
  if (hit) return hit;
  const c = findCredit(id);
  if (!c || loading.has(id) || typeof window === "undefined" || typeof Image === "undefined") return null;
  loading.add(id);
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    try {
      frames.set(id, toGray(img, c.width, c.height));
    } finally {
      loading.delete(id);
      notify();
    }
  };
  img.onerror = () => {
    loading.delete(id);
    notify();
  };
  img.src = c.src;
  return null;
}

/** 画像を canvas に置き、輝度（ITU-R BT.601）を 0〜255 の整数にする。 */
function toGray(img: HTMLImageElement, width: number, height: number): Int16Array {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const out = new Int16Array(width * height);
  if (!ctx) return out;
  ctx.drawImage(img, 0, 0, width, height);
  const d = ctx.getImageData(0, 0, width, height).data;
  for (let i = 0, k = 0; k < out.length; i += 4, k++) out[k] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  return out;
}

export function subscribePhotos(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function photoVersion(): number {
  return version;
}

/** テスト用：読んだ画素を入れる・消す。 */
export function _setPhotoFrame(id: string, px: Int16Array | null) {
  if (px) frames.set(id, px);
  else frames.delete(id);
  notify();
}
