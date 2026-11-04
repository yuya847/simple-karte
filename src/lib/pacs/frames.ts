// シリーズの i 枚目の画素を作る。作ったものは少しのあいだ覚えておく（スライス送りやシネ再生を速くするため）。

import { photoFrame } from "./photos";
import type { SeriesSpec } from "./types";
import { renderUltrasound } from "./ultrasound";
import { renderSlice } from "./volume";
import { renderXray } from "./xray";

/** 合成画像の画素を、覚えておかずに作る。同じ spec・同じ index なら毎回同じ。公開画像は読めていなければ黒。 */
export function renderFrame(spec: SeriesSpec, index: number): Int16Array {
  switch (spec.gen.kind) {
    case "xray":
      return renderXray(spec);
    case "us":
      return renderUltrasound(spec);
    case "photo":
      return photoFrame(spec.gen.images[clampIndex(index, spec.gen.images.length)]) ?? blank(spec);
    default:
      return renderSlice(spec, clampIndex(index, spec.positions.length));
  }
}

/** 公開画像がまだ読めていないか（読めたら subscribePhotos で知らせが来る）。 */
export function frameLoading(spec: SeriesSpec, index: number): boolean {
  return spec.gen.kind === "photo" && photoFrame(spec.gen.images[clampIndex(index, spec.gen.images.length)]) === null;
}

const blanks = new Map<string, Int16Array>();
function blank(spec: SeriesSpec): Int16Array {
  const k = `${spec.width}x${spec.height}`;
  let b = blanks.get(k);
  if (!b) {
    b = new Int16Array(spec.width * spec.height);
    blanks.set(k, b);
  }
  return b;
}

const LIMIT = 240;
const cache = new Map<string, Int16Array>();

function keyOf(spec: SeriesSpec, index: number): string {
  return `${spec.uid}|${spec.anatomySeed}|${spec.acqSeed}|${spec.width}x${spec.height}|${index}`;
}

/** 画素を返す（覚えているものがあればそれを使う。古いものから忘れる）。 */
export function getFrame(spec: SeriesSpec, index: number): Int16Array {
  const i = clampIndex(index, spec.positions.length);
  // 公開画像は photos.ts が覚えている（読めるまでは黒なので、ここには入れない）
  if (spec.gen.kind === "photo") return renderFrame(spec, i);
  const key = keyOf(spec, i);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const px = renderFrame(spec, i);
  cache.set(key, px);
  while (cache.size > LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return px;
}

/** スライス番号を 0〜count−1 に収める。 */
export function clampIndex(i: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(i)));
}

/** 画素の値の範囲（LUT を作るのに使う）。 */
export function valueRange(spec: SeriesSpec): [number, number] {
  if (spec.unit === "HU") return [-1024, 3071];
  if (spec.unit === "信号値") return [0, 4095];
  return spec.gen.kind === "us" || spec.gen.kind === "photo" ? [0, 255] : [0, 4095];
}
