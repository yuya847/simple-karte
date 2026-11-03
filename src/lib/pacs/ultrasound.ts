// 超音波の合成画像（架空）。扇形の中に、組織の明るさ × スペックル（粒状の模様）を描く。実在の患者の画像ではない。

import { between, gaussian, makeRng } from "./random";
import { blur, Raster, smoothstep } from "./raster";
import type { SeriesSpec } from "./types";

export function renderUltrasound(spec: SeriesSpec): Int16Array {
  const acq = makeRng(spec.acqSeed);
  const r = new Raster(spec.width, spec.height, spec.spacing);
  const top = -(spec.height * spec.spacing) / 2 + 4;
  const depth = spec.height * spec.spacing - 10;
  const spread = (35 * Math.PI) / 180;
  // スペックル：複素正規分布の絶対値を少しぼかす
  const speckle = r.blank();
  for (let k = 0; k < speckle.data.length; k++) speckle.data[k] = Math.hypot(gaussian(acq), gaussian(acq));
  blur(speckle, 1, 1);
  const vessels = Array.from({ length: 4 }, () => ({ x: between(acq, -40, 40), y: top + between(acq, 30, 90), r: between(acq, 4, 9) }));
  const diaphragm = top + between(acq, 105, 120);
  r.each((x, y, k) => {
    const dx = x;
    const dy = y - top;
    const rho = Math.hypot(dx, dy);
    const th = Math.atan2(dx, dy);
    if (dy <= 0 || rho > depth || Math.abs(th) > spread) return;
    let echo = 0.5;
    const curve = diaphragm + 0.004 * x * x;
    echo += 0.9 * Math.exp(-((y - curve) ** 2) / 8);
    if (y > curve + 3) echo = 0.25;
    for (const v of vessels) if (Math.hypot(x - v.x, y - v.y) < v.r) echo = 0.04;
    // 深いほど弱くなる（減衰）と、扇の縁で少し暗くなる
    const gain = (1 - 0.45 * (rho / depth)) * smoothstep(spread, spread * 0.9, Math.abs(th));
    r.data[k] = Math.min(255, 120 * echo * gain * speckle.data[k]);
  });
  const out = new Int16Array(r.data.length);
  for (let k = 0; k < out.length; k++) out[k] = Math.round(Math.max(0, Math.min(255, r.data[k])));
  return out;
}
