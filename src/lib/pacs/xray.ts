// X線の合成画像（架空）。体を楕円体・骨の管・空気の影の重ね合わせとして「透かした厚み」を足し合わせ、
// 厚いところほど白くなるように 0〜4095 の画素値にする。実在の患者の画像ではない。
// 座標は画像の中心が原点の mm（x は画像の右、y は画像の下）。

import { between, gaussian, makeRng, type Rng } from "./random";
import { addNoise, blur, capsule, dome, field, lerpTable, Raster, smoothstep, toInt16, tube, type TubePoint } from "./raster";
import type { PhantomHint, SeriesSpec } from "./types";

export const XRAY_MAX = 4095;

/** X線のシリーズの画素を作る。同じ spec なら毎回同じ。 */
export function renderXray(spec: SeriesSpec): Int16Array {
  const g = spec.gen;
  if (g.kind !== "xray") throw new Error("X線ではないシリーズです");
  const acq = makeRng(spec.acqSeed);
  const pose = { dx: between(acq, -6, 6), dy: between(acq, -5, 5), angle: between(acq, -0.02, 0.02) };
  const gain = between(acq, 0.96, 1.04);
  const r = new Raster(spec.width, spec.height, spec.spacing, pose);
  const ana = makeRng(spec.anatomySeed);
  const hint = spec.hint;
  const female = spec.sex === "女";
  switch (g.part) {
    case "chest":
    case "chest-abd":
      if (g.view === "LAT") chestLateral(r, ana, hint);
      else chestFrontal(r, ana, hint, female, g.view === "AP");
      break;
    case "abdomen":
    case "abd-pelvis":
      abdomen(r, ana, acq, g.view === "ERECT");
      break;
    case "leg":
      limb(r, ana, hint, g.view === "LAT", g.side ?? "R", 190);
      break;
    case "knee":
      limb(r, ana, hint, g.view === "LAT", g.side ?? "R", 0);
      break;
    case "head":
      head(r, ana, g.view === "LAT");
      break;
    case "c-spine":
      spine(r, ana, g.view === "LAT", "cervical");
      break;
    case "l-spine":
      spine(r, ana, g.view === "LAT", "lumbar");
      break;
    default:
      generic(r);
  }
  blur(r, 1, 1);
  addNoise(r, acq, 0.012);
  const k = g.view === "AP" ? 1.35 : 1.5;
  return toInt16(r, 0, XRAY_MAX, (a) => XRAY_MAX * (1 - Math.exp(-k * Math.max(0, a) * gain)));
}

// ---------------------------------------------------------------------------
// 共通の部品
// ---------------------------------------------------------------------------

/** 鉛の文字マーカー（R / L）。とても白く写る。 */
function marker(r: Raster, letter: "R" | "L", x: number, y: number, h = 14) {
  const s = (x0: number, y0: number, x1: number, y1: number) => capsule(r, x + x0, y + y0, x + x1, y + y1, 1.1, 3, "add", 0.8);
  s(0, 0, 0, h);
  if (letter === "L") {
    s(0, h, h * 0.6, h);
    return;
  }
  s(0, 0, h * 0.35, 0);
  s(h * 0.35, 0, h * 0.55, h * 0.18);
  s(h * 0.55, h * 0.18, h * 0.55, h * 0.32);
  s(h * 0.55, h * 0.32, h * 0.35, h * 0.5);
  s(h * 0.35, h * 0.5, 0, h * 0.5);
  s(h * 0.25, h * 0.5, h * 0.62, h);
}

/** 肺の血管の枝（中から外へ細くなる）。v に描き、あとで肺の形で切り抜く。 */
function vessels(v: Raster, rng: Rng, hx: number, hy: number, side: -1 | 1, count: number, upScale: number, reach: number) {
  for (let n = 0; n < count; n++) {
    const t = between(rng, -1.45, 1.4);
    const th = side < 0 ? Math.PI + t : -t;
    const up = Math.sin(th) < -0.3;
    const len = between(rng, 45, 115) * (up ? 0.8 : 1) * reach;
    const r0 = between(rng, 1.6, 2.6) * (up ? upScale : 1);
    // 肺門の 1 点から出すと星形になるので、肺門のまわりから少し外へずらして始める
    const start = between(rng, 8, 26);
    const x0 = hx + gaussian(rng) * 10 + Math.cos(th) * start;
    const y0 = hy + gaussian(rng) * 18 + Math.sin(th) * start;
    const mid = 0.55;
    const xm = x0 + Math.cos(th) * len * mid;
    const ym = y0 + Math.sin(th) * len * mid;
    const trunk: TubePoint[] = [
      { x: x0, y: y0, r: r0 },
      { x: xm, y: ym, r: r0 * 0.65 },
    ];
    tube(v, trunk, 1, 0.016, 0);
    for (const turn of [-0.32, 0.3]) {
      const a = th + turn + gaussian(rng) * 0.08;
      const l2 = len * (1 - mid) * between(rng, 0.9, 1.4);
      tube(
        v,
        [
          { x: xm, y: ym, r: r0 * 0.55 },
          { x: xm + Math.cos(a) * l2, y: ym + Math.sin(a) * l2, r: 0.5 },
        ],
        1,
        0.016,
        0,
      );
    }
  }
}

/** 0〜1 の範囲で、肺のマスクの浅い・深いを表す。 */
const depthOf = (m: number) => Math.sqrt(Math.min(1, Math.max(0, m / 45)));

// ---------------------------------------------------------------------------
// 胸部 正面（PA・AP）
// ---------------------------------------------------------------------------

function chestFrontal(r: Raster, ana: Rng, hint: PhantomHint, female: boolean, ap: boolean) {
  const sx = between(ana, 0.94, 1.05);
  const sy = between(ana, 0.95, 1.04);
  const rx = 140 * sx;
  const ry = 178 * sy;
  const cy = 10;
  const lift = ap ? -14 : 0;
  const domeAt = (x: number) =>
    x < 0 ? (95 + lift) * sy + 38 * ((x + 65 * sx) / (75 * sx)) ** 2 : (108 + lift) * sy + 38 * ((x - 65 * sx) / (75 * sx)) ** 2;
  const medW = (y: number) => 19 + 12 * smoothstep(-110, -30, y);
  const margin = (x: number, y: number) => {
    const q = Math.sqrt((x / rx) ** 2 + ((y - cy) / ry) ** 2);
    return Math.min((1 - q) * Math.min(rx, ry), domeAt(x) - y, Math.abs(x) - medW(y));
  };
  const eff = hint.effusion ?? { right: 0, left: 0 };
  // 胸水：外側が高い弧（メニスカス）。肺の空気が液に置きかわり、肋骨横隔膜角が鈍る
  const fluidAt = (x: number, y: number) => {
    const h = x < 0 ? eff.right : eff.left;
    if (h <= 0) return 0;
    const surface = domeAt(x) - h - 0.6 * h * smoothstep(30, 120, Math.abs(x));
    return smoothstep(surface - 6, surface + 10, y);
  };

  // 体と首・肩・乳房の軟部
  dome(r, { x: 0, y: 40, rx: 178 * sx, ry: 300 }, 1.0);
  dome(r, { x: 0, y: -205, rx: 58, ry: 70 }, 0.5);
  for (const s of [-1, 1]) {
    dome(r, { x: s * 160 * sx, y: -168, rx: 50, ry: 46 }, 0.35);
    if (female) dome(r, { x: s * 85 * sx, y: 110 * sy, rx: 72, ry: 52 }, 0.18);
  }

  // 心臓（心胸郭比は hint.ctr）。心臓のあるところは肺の空気が押しのけられる
  const cw = (hint.ctr ?? 0.47) * 2 * rx * (ap ? 1.1 : 1);
  const heart = { x: 0.14 * cw, y: (62 + lift * 0.4) * sy, rx: cw / 2, ry: 75 * sy, angle: -0.1 };
  const hc = Math.cos(heart.angle);
  const hs = Math.sin(heart.angle);
  const heartCover = (x: number, y: number) => {
    const u = hc * (x - heart.x) + hs * (y - heart.y);
    const w = -hs * (x - heart.x) + hc * (y - heart.y);
    const q = Math.sqrt((u / heart.rx) ** 2 + (w / heart.ry) ** 2);
    return smoothstep(0, 0.12, 1 - q);
  };

  // 肺（空気で暗くなる）と血管
  const mask = new Float32Array(r.width * r.height);
  const air = new Float32Array(r.width * r.height);
  r.each((x, y, k) => {
    const m = margin(x, y);
    const inside = smoothstep(0, 5, m) * (1 - 0.85 * heartCover(x, y));
    mask[k] = inside;
    air[k] = inside * (0.3 + 0.7 * depthOf(m)) * (1 - fluidAt(x, y));
  });
  const v = r.blank();
  const cong = hint.congestion ?? 0;
  vessels(v, ana, -50 * sx, -25 * sy, -1, 34, 1 + 0.7 * cong, sx);
  vessels(v, ana, 48 * sx, -20 * sy, 1, 32, 1 + 0.7 * cong, sx);
  for (let k = 0; k < r.data.length; k++) r.data[k] += -0.62 * air[k] + v.data[k] * mask[k];

  // 気管・気管支・肺門・大動脈
  capsule(r, 0, -216, 0, -58 * sy, 8, -0.16, "add", 2);
  capsule(r, 0, -58 * sy, -28 * sx, -28 * sy, 6, -0.1, "add", 2);
  capsule(r, 0, -58 * sy, 26 * sx, -20 * sy, 6, -0.1, "add", 2);
  dome(r, { x: -52 * sx, y: -28 * sy, rx: 18, ry: 26 }, 0.12);
  dome(r, { x: 50 * sx, y: -20 * sy, rx: 16, ry: 24 }, 0.12);
  dome(r, { x: 28 * sx, y: -88 * sy, rx: 17, ry: 15 }, 0.14);
  capsule(r, 26 * sx, -80 * sy, 22 * sx, 90 * sy, 12, 0.04, "add", 4);

  dome(r, heart, 0.22);

  // うっ血：肺門のまわりのかすみと、外側下の短い線
  if (cong > 0) {
    field(r, -180, -140, 180, 140, (x, y) => {
      const hx = x < 0 ? -52 * sx : 50 * sx;
      const g = Math.exp(-((x - hx) ** 2 + (y + 20) ** 2) / (2 * 55 * 55));
      return 0.2 * cong * g * smoothstep(0, 5, margin(x, y));
    });
    for (const s of [-1, 1]) {
      for (let n = 0; n < 7; n++) {
        const y = between(ana, 30, 100) * sy;
        const xe = s * (rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) - 3);
        capsule(r, xe, y, xe - s * between(ana, 10, 18), y + gaussian(ana), 0.7, 0.06 * cong, "add", 0.8);
      }
    }
  }

  // 浸潤影：まだらな白い影
  if (hint.consolidation) {
    const s = hint.consolidation.side === "R" ? -1 : 1;
    const [y0, y1] = hint.consolidation.zone === "lower" ? [25, 95] : [-120, -50];
    const blobs = Array.from({ length: 16 }, () => ({
      x: s * between(ana, 45, 112) * sx,
      y: between(ana, y0, y1) * sy,
      sg: between(ana, 8, 20),
      a: between(ana, 0.14, 0.28),
    }));
    field(r, s < 0 ? -170 : 20, y0 - 60, s < 0 ? -20 : 170, y1 + 60, (x, y) => {
      let sum = 0;
      for (const b of blobs) sum += b.a * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.sg * b.sg));
      return Math.min(0.5, sum) * smoothstep(0, 5, margin(x, y));
    });
  }

  // 胃泡
  dome(r, { x: 72 * sx, y: domeAt(72 * sx) + 24, rx: 28, ry: 15 }, -0.3);

  // 脊椎
  for (let n = 0; n < 15; n++) {
    const yv = (-188 + n * 25) * sy;
    dome(r, { x: 0, y: yv, rx: 17, ry: 10.5 }, 0.1);
    for (const s of [-1, 1]) dome(r, { x: s * 11, y: yv - 3, rx: 3.5, ry: 4.5 }, 0.05);
    dome(r, { x: 0, y: yv + 7, rx: 3, ry: 6 }, 0.05);
  }

  // 肋骨（後ろの肋骨は太く外へ下がる、前の肋骨は内へ下がる）・鎖骨・肩甲骨
  const ellX = (y: number) => rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
  for (let k = 0; k < 10; k++) {
    const y0 = (-160 + k * 23.5) * sy;
    for (const s of [-1, 1]) {
      const pts: TubePoint[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const y = y0 - 4 + (34 + 4 * k) * t ** 1.6;
        pts.push({ x: s * (16 + t * (ellX(y) - 12)), y, r: k < 2 ? 4.8 : 5.6 });
      }
      const end = pts[pts.length - 1];
      pts.push({ x: s * (ellX(end.y + 16) + 2), y: end.y + 16, r: 5 });
      tube(r, pts, 0.35, 0.012, 0.004);
      if (k < 9) {
        tube(
          r,
          [
            { x: s * (ellX(end.y + 10) - 2), y: end.y + 10, r: 4.2 },
            { x: s * (ellX(end.y + 30) * 0.62), y: end.y + 34 + k, r: 4 },
            { x: s * (38 + k * 2), y: end.y + 48 + k * 2, r: 3.8 },
          ],
          0.35,
          0.009,
          0.003,
        );
      }
    }
  }
  for (const s of [-1, 1]) {
    const cy0 = ap ? -132 : -140;
    tube(
      r,
      [
        { x: s * 14, y: cy0, r: 7 },
        { x: s * 55, y: cy0 - 10 + (ap ? 6 : 0), r: 7 },
        { x: s * 100, y: cy0 - 18 + (ap ? 8 : 0), r: 6.5 },
        { x: s * 128 * sx, y: cy0 - 30 + (ap ? 10 : 0), r: 7.5 },
      ],
      0.4,
      0.022,
      0.008,
    );
    dome(r, { x: s * (ap ? 120 : 150) * sx, y: -95, rx: 38, ry: 72, angle: s * 0.25 }, ap ? 0.1 : 0.07);
    dome(r, { x: s * 172 * sx, y: -160, rx: 22, ry: 24 }, 0.12);
  }

  marker(r, "R", -160, -192);
  if (ap) marker(r, "L", 150, -192, 10);
}

// ---------------------------------------------------------------------------
// 胸部 側面（左側面。前が画像の左）
// ---------------------------------------------------------------------------

function chestLateral(r: Raster, ana: Rng, hint: PhantomHint) {
  const sx = between(ana, 0.94, 1.05);
  const sy = between(ana, 0.95, 1.04);
  const rx = 108 * sx;
  const ry = 176 * sy;
  const cx = 12;
  const cy = 8;
  const dome1 = (x: number) => 88 * sy + 0.0035 * (x + 30) ** 2;
  const dome2 = (x: number) => 100 * sy + 0.0035 * (x + 25) ** 2;
  const margin = (x: number, y: number, d: (x: number) => number) => {
    const q = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
    return Math.min((1 - q) * Math.min(rx, ry), d(x) - y);
  };
  const eff = hint.effusion ?? { right: 0, left: 0 };
  const h = Math.max(eff.right, eff.left);
  const fluidAt = (x: number, y: number) => {
    if (h <= 0) return 0;
    const surface = dome2(x) - h * (0.4 + 1.1 * smoothstep(-40, 100, x));
    return smoothstep(surface - 6, surface + 10, y) * smoothstep(-80, 20, x);
  };

  dome(r, { x: 5, y: 40, rx: 130 * sx, ry: 300 }, 1.2);
  dome(r, { x: -20, y: -160, rx: 75, ry: 60 }, 0.18);

  const ctr = hint.ctr ?? 0.47;
  const heart = { x: -40 * sx - (ctr - 0.5) * 60, y: 62 * sy, rx: 60 + (ctr - 0.5) * 120, ry: 70 * sy };
  const heartCover = (x: number, y: number) => smoothstep(0, 0.12, 1 - Math.sqrt(((x - heart.x) / heart.rx) ** 2 + ((y - heart.y) / heart.ry) ** 2));

  const mask = new Float32Array(r.width * r.height);
  const air = new Float32Array(r.width * r.height);
  r.each((x, y, k) => {
    const m1 = margin(x, y, dome1);
    const m2 = margin(x, y, dome2);
    const inside = 0.5 * (smoothstep(0, 5, m1) + smoothstep(0, 5, m2)) * (1 - 0.7 * heartCover(x, y));
    mask[k] = inside;
    air[k] = inside * (0.3 + 0.7 * depthOf(Math.max(m1, m2))) * (1 - fluidAt(x, y));
  });
  const v = r.blank();
  const cong = hint.congestion ?? 0;
  vessels(v, ana, 18, -22 * sy, -1, 26, 1 + 0.7 * cong, 0.9);
  vessels(v, ana, 22, -18 * sy, 1, 26, 1 + 0.7 * cong, 0.9);
  for (let k = 0; k < r.data.length; k++) r.data[k] += -0.8 * air[k] + v.data[k] * mask[k];

  capsule(r, 2, -216, 22, -50 * sy, 9, -0.2, "add", 2);
  dome(r, { x: 12, y: -95 * sy, rx: 38, ry: 18, angle: 0.2 }, 0.12);
  capsule(r, 40, -85 * sy, 70, 120 * sy, 12, 0.05, "add", 4);
  dome(r, { x: 18, y: -22 * sy, rx: 32, ry: 30 }, 0.18);

  dome(r, heart, 0.2);
  if (cong > 0) {
    field(r, -150, -150, 150, 150, (x, y) => 0.18 * cong * Math.exp(-((x - 15) ** 2 + (y + 20) ** 2) / (2 * 50 * 50)) * smoothstep(0, 5, margin(x, y, dome1)));
  }

  dome(r, { x: -20, y: dome1(-20) + 26, rx: 25, ry: 13 }, -0.25);

  // 脊椎（後ろ＝画像の右）と肋骨・胸骨
  const xc = (y: number) => 100 * sx + 14 * (1 - (y / 220) ** 2);
  for (let n = 0; n < 16; n++) {
    const yv = (-192 + n * 25) * sy;
    capsule(r, xc(yv) - 9, yv, xc(yv) + 9, yv, 9, 0.2, "add", 1.5);
    capsule(r, xc(yv) + 20, yv + 3, xc(yv) + 40, yv + 10, 4, 0.05, "add", 1.5);
  }
  for (let k = 0; k < 10; k++) {
    const y0 = (-150 + k * 24) * sy;
    for (const off of [0, 8]) {
      tube(
        r,
        [
          { x: xc(y0) + 6, y: y0 + off, r: 5 },
          { x: xc(y0) - 60, y: y0 + 40 + off, r: 4.5 },
        ],
        0.35,
        0.012,
        0.004,
      );
    }
  }
  tube(
    r,
    [
      { x: -102 * sx, y: -130 * sy, r: 7 },
      { x: -100 * sx, y: -40 * sy, r: 6 },
      { x: -95 * sx, y: 55 * sy, r: 6 },
    ],
    0.4,
    0.03,
    0.012,
  );
  marker(r, "L", 150, -192);
}

// ---------------------------------------------------------------------------
// 腹部（臥位・立位）
// ---------------------------------------------------------------------------

function abdomen(r: Raster, ana: Rng, acq: Rng, erect: boolean) {
  const sx = between(ana, 0.94, 1.06);
  dome(r, { x: 0, y: 10, rx: 172 * sx, ry: 330 }, 0.8);
  for (const s of [-1, 1]) dome(r, { x: s * 85 * sx, y: -250, rx: 75, ry: 65 }, -0.55);
  dome(r, { x: -75 * sx, y: -130, rx: 90, ry: 80 }, 0.14);
  dome(r, { x: 95 * sx, y: -135, rx: 38, ry: 55, angle: -0.3 }, 0.06);
  for (const s of [-1, 1]) {
    dome(r, { x: s * 62, y: -55 + (s > 0 ? -10 : 0), rx: 26, ry: 48, angle: s * 0.18 }, 0.07);
    capsule(r, s * 28, -60, s * 78 * sx, 115, 16, 0.04, "add", 6);
  }
  // 腰椎・肋骨・骨盤・大腿骨頭
  for (let n = 0; n < 5; n++) {
    const yv = -128 + n * 39;
    capsule(r, -14, yv, 14, yv, 13, 0.2, "add", 1.5);
    dome(r, { x: 0, y: yv + 8, rx: 3, ry: 7 }, 0.05);
    for (const s of [-1, 1]) {
      dome(r, { x: s * 13, y: yv - 5, rx: 4, ry: 5 }, 0.06);
      capsule(r, s * 20, yv, s * 48, yv - 3, 4, 0.07, "add", 1.5);
    }
  }
  for (const s of [-1, 1]) {
    for (const [ya, yb] of [
      [-205, -150],
      [-185, -112],
    ]) {
      tube(
        r,
        [
          { x: s * 30, y: ya, r: 5 },
          { x: s * 95 * sx, y: (ya + yb) / 2 - 8, r: 5 },
          { x: s * 140 * sx, y: yb, r: 4.5 },
        ],
        0.35,
        0.025,
        0.008,
      );
    }
    dome(r, { x: s * 98 * sx, y: 82, rx: 72, ry: 55, angle: s * 0.45 }, 0.2);
    tube(
      r,
      [
        { x: s * 45, y: 55, r: 5 },
        { x: s * 80 * sx, y: 32, r: 5 },
        { x: s * 120 * sx, y: 30, r: 5 },
        { x: s * 155 * sx, y: 52, r: 5 },
      ],
      0.35,
      0.03,
      0.01,
    );
    dome(r, { x: s * 108 * sx, y: 210, rx: 26, ry: 26 }, 0.32);
    tube(
      r,
      [
        { x: s * 80 * sx, y: 182, r: 4 },
        { x: s * 108 * sx, y: 176, r: 4 },
        { x: s * 135 * sx, y: 186, r: 4 },
      ],
      0.35,
      0.03,
      0.01,
    );
    capsule(r, s * 15, 222, s * 70, 205, 9, 0.12, "add", 2);
  }
  dome(r, { x: 0, y: 128, rx: 46, ry: 42 }, 0.2);
  for (const s of [-1, 1]) for (let n = 0; n < 3; n++) dome(r, { x: s * 18, y: 108 + n * 16, rx: 4, ry: 4 }, -0.04);

  // 腸管のガス（結腸の道すじに沿って）
  const path = [
    [-112, 120],
    [-118, 40],
    [-112, -50],
    [-95, -95],
    [-40, -60],
    [20, -75],
    [90, -95],
    [118, -110],
    [122, -30],
    [118, 60],
    [95, 120],
    [50, 150],
    [10, 160],
    [0, 190],
  ].map(([x, y]) => [x * sx, y]);
  const gas: { x: number; y: number; r: number; a: number }[] = [];
  for (let n = 0; n < 28; n++) {
    const t = between(acq, 0, path.length - 1.001);
    const i = Math.floor(t);
    const f = t - i;
    gas.push({
      x: path[i][0] + (path[i + 1][0] - path[i][0]) * f + gaussian(acq) * 6,
      y: path[i][1] + (path[i + 1][1] - path[i][1]) * f + gaussian(acq) * 6,
      r: between(acq, 9, 20),
      a: between(acq, 0.08, 0.18),
    });
  }
  for (let n = 0; n < 8; n++) gas.push({ x: between(acq, -60, 60), y: between(acq, -20, 80), r: between(acq, 7, 13), a: between(acq, 0.05, 0.1) });
  for (const g of gas) {
    if (!erect) dome(r, { x: g.x, y: g.y, rx: g.r, ry: g.r * 0.85 }, -g.a);
    else field(r, g.x - g.r, g.y - g.r, g.x + g.r, g.y + g.r, (x, y) => (Math.hypot(x - g.x, y - g.y) < g.r && y < g.y + g.r * 0.15 ? -g.a * 0.8 : 0));
  }
  // 胃（立位は空気と液の境が水平になる）
  if (!erect) dome(r, { x: 55 * sx, y: -150, rx: 42, ry: 30 }, -0.2);
  else {
    const level = -150;
    field(r, 55 * sx - 45, -190, 55 * sx + 45, -110, (x, y) => {
      const q = ((x - 55 * sx) / 42) ** 2 + ((y + 150) / 34) ** 2;
      if (q >= 1) return 0;
      return y < level ? -0.24 * Math.sqrt(1 - q) : 0.02;
    });
  }
  marker(r, "R", -160, -192);
}

// ---------------------------------------------------------------------------
// 下腿・膝（off：膝の関節を画像のどこに置くか。下腿は 190 mm 上、膝は中央）
// ---------------------------------------------------------------------------

function limb(r: Raster, ana: Rng, hint: PhantomHint, lateral: boolean, side: "R" | "L", off: number) {
  const s = between(ana, 0.95, 1.05);
  const m = side === "R" ? 1 : -1; // 右脚の正面：外側（腓骨）が画像の左
  const X = (x: number) => (lateral ? x : m * x) * s;
  const Y = (yl: number) => yl * s - off;
  const swell = hint.swelling ?? 0;
  const radius: [number, number][] = [
    [-420, 82],
    [-200, 72],
    [-40, 56],
    [10, 54],
    [110, 62],
    [250, 48],
    [380, 36],
    [430, 44],
  ];
  const swellAt = (yl: number) => swell * smoothstep(40, 110, yl) * (1 - smoothstep(280, 340, yl));
  // 軟部組織（楕円柱を透かした厚み）
  field(r, -130, -260, 130, 260, (x, y) => {
    const yl = (y + off) / s;
    const R = lerpTable(radius, yl) * s;
    const xc = lateral ? 4 * s : -3 * s * m;
    let ra = R;
    let rp = R;
    let depth = R;
    if (lateral) {
      ra = R * 0.78 + swellAt(yl);
      rp = R * 1.12;
      depth = R * 0.9;
    } else {
      ra = rp = R + 0.6 * swellAt(yl);
    }
    const rr = x < xc ? ra : rp;
    const q = (x - xc) / rr;
    if (Math.abs(q) >= 1) return 0;
    const edema = swellAt(yl) > 0 && (lateral ? x < xc - ra * 0.6 : Math.abs(q) > 0.75) ? 0.05 * (swellAt(yl) / Math.max(swell, 1)) : 0;
    return 0.0042 * 2 * depth * Math.sqrt(1 - q * q) + edema;
  });

  const bone = (pts: [number, number, number][], wall = 0.3, cortex = 0.045, marrow = 0.006) =>
    tube(
      r,
      pts.map(([x, y, rad]) => ({ x: X(x), y: Y(y), r: rad * s })),
      wall,
      cortex,
      marrow,
    );
  const knob = (x: number, y: number, rx: number, ry: number, v: number, angle = 0) => dome(r, { x: X(x), y: Y(y), rx: rx * s, ry: ry * s, angle }, v);

  if (!lateral) {
    bone([
      [-2, -440, 15],
      [0, -200, 15],
      [2, -90, 19],
      [3, -50, 24],
    ]);
    knob(-20, -22, 27, 22, 0.4);
    knob(24, -22, 29, 22, 0.4);
    knob(2, -14, 9, 12, -0.08);
    knob(2, -45, 22, 27, 0.12);
    knob(4, 20, 42, 16, 0.26);
    bone([
      [4, 28, 26],
      [5, 70, 17],
      [6, 200, 13],
      [6, 330, 15],
      [7, 372, 24],
    ]);
    knob(26, 392, 11, 17, 0.24);
    knob(-38, 42, 12, 12, 0.24);
    bone(
      [
        [-38, 50, 8],
        [-34, 150, 6.5],
        [-31, 300, 7],
        [-33, 370, 9.5],
      ],
      0.45,
    );
    knob(-34, 395, 11, 18, 0.25);
    knob(3, 418, 30, 17, 0.28);
  } else {
    bone([
      [10, -440, 15],
      [6, -200, 15],
      [8, -60, 22],
    ]);
    knob(12, -22, 34, 22, 0.4);
    knob(-42, -40, 11, 24, 0.22, 0.15);
    knob(8, 20, 36, 14, 0.3);
    knob(-24, 48, 10, 14, 0.1);
    bone([
      [4, 28, 24],
      [-6, 80, 16],
      [-8, 200, 13],
      [-4, 330, 14],
      [0, 372, 22],
    ]);
    knob(22, 42, 11, 11, 0.22);
    bone(
      [
        [22, 48, 8],
        [16, 200, 6.5],
        [10, 370, 9],
      ],
      0.45,
    );
    knob(6, 415, 32, 16, 0.28);
    knob(30, 450, 40, 22, 0.25);
  }
  marker(r, side, -r.width * r.spacing * 0.5 + 14, -r.height * r.spacing * 0.5 + 14);
}

// ---------------------------------------------------------------------------
// 頭部（正面・側面）
// ---------------------------------------------------------------------------

function head(r: Raster, ana: Rng, lateral: boolean) {
  const s = between(ana, 0.95, 1.04);
  const bone = 0.018;
  const soft = 0.003;
  // 頭蓋（外側の楕円体 − 内側の楕円体）、中は脳（軟部）
  const [ox, oy] = lateral ? [96 * s, 82 * s] : [76 * s, 94 * s];
  const cy = -20;
  dome(r, { x: 0, y: cy, rx: ox + 5, ry: oy + 5 }, soft * 2 * 95);
  dome(r, { x: 0, y: cy, rx: ox, ry: oy }, (bone - soft) * 2 * 90);
  dome(r, { x: 0, y: cy, rx: ox - 7, ry: oy - 7 }, -(bone - soft) * 2 * 83);
  if (!lateral) {
    for (const sg of [-1, 1]) {
      dome(r, { x: sg * 32 * s, y: 18, rx: 18, ry: 16 }, -0.15);
      dome(r, { x: sg * 30 * s, y: 52, rx: 18, ry: 15 }, -0.12);
      capsule(r, sg * 22 * s, 25, sg * 62 * s, 38, 8, 0.12, "add", 3);
    }
    dome(r, { x: 0, y: 45, rx: 14, ry: 24 }, -0.1);
    tube(
      r,
      Array.from({ length: 13 }, (_, i) => {
        const t = (i - 6) / 6;
        return { x: t * 58 * s, y: 122 - 80 * t ** 4 - 6 * t * t, r: 7 };
      }),
      0.4,
      0.025,
      0.01,
    );
    for (let n = -6; n <= 6; n++) {
      dome(r, { x: n * 7 * s, y: 75 + Math.abs(n) * 1.2, rx: 3.2, ry: 6 }, 0.12);
      dome(r, { x: n * 7 * s, y: 92 + Math.abs(n) * 1.5, rx: 3.2, ry: 6 }, 0.12);
    }
    for (let n = 0; n < 4; n++) dome(r, { x: 0, y: 140 + n * 22, rx: 17, ry: 9 }, 0.18);
  } else {
    dome(r, { x: -75 * s, y: 40, rx: 30, ry: 45 }, 0.25);
    dome(r, { x: -60 * s, y: 20, rx: 16, ry: 14 }, -0.08);
    dome(r, { x: -70 * s, y: -45, rx: 12, ry: 10 }, -0.08);
    dome(r, { x: -5, y: 10, rx: 9, ry: 6 }, -0.05);
    tube(
      r,
      [
        { x: 30 * s, y: 30, r: 9 },
        { x: 25 * s, y: 90, r: 8 },
        { x: -40 * s, y: 115, r: 8 },
        { x: -72 * s, y: 100, r: 7 },
      ],
      0.4,
      0.04,
      0.015,
    );
    for (let n = 0; n < 5; n++) capsule(r, 10 - n * 3, 135 + n * 20, 30 - n * 3, 135 + n * 20, 8, 0.2, "add", 1.2);
    dome(r, { x: 30 * s, y: 28, rx: 9, ry: 9 }, -0.06);
  }
}

// ---------------------------------------------------------------------------
// 脊椎（頸椎・腰椎）
// ---------------------------------------------------------------------------

function spine(r: Raster, ana: Rng, lateral: boolean, level: "cervical" | "lumbar") {
  const s = between(ana, 0.95, 1.05);
  const c = level === "cervical";
  const n = c ? 7 : 5;
  const bodyH = (c ? 14 : 28) * s;
  const disc = (c ? 5 : 10) * s;
  const bodyW = (c ? 17 : 26) * s;
  const step = bodyH + disc;
  const top = -((n - 1) * step) / 2 - (c ? 10 : 25);
  const curve = (y: number) => (lateral ? (c ? -10 : -14) * Math.cos((y / ((n * step) / 2)) * (Math.PI / 2)) : 0);
  // 首・腰の軟部
  dome(r, { x: lateral ? 5 : 0, y: 0, rx: (c ? 62 : 150) * s, ry: 400 }, c ? 0.45 : 0.75);
  if (c && lateral) capsule(r, -32, -160, -26, 160, 8, -0.15, "add", 3);
  for (let i = 0; i < n; i++) {
    const yv = top + i * step;
    const xv = curve(yv);
    if (lateral) {
      capsule(r, xv - bodyW * 0.55, yv, xv + bodyW * 0.55, yv, bodyH / 2, 0.24, "add", 1.2);
      capsule(r, xv + bodyW * 0.9, yv - bodyH * 0.1, xv + bodyW * 2.1, yv + bodyH * 0.3, bodyH * 0.22, 0.12, "add", 1.2);
      capsule(r, xv + bodyW * 2.1, yv + bodyH * 0.3, xv + bodyW * 2.9, yv + bodyH * 0.8, bodyH * 0.16, 0.1, "add", 1.2);
    } else {
      capsule(r, -bodyW * 0.55, yv, bodyW * 0.55, yv, bodyH / 2, 0.22, "add", 1.2);
      dome(r, { x: 0, y: yv + bodyH * 0.25, rx: bodyW * 0.12, ry: bodyH * 0.35 }, 0.08);
      for (const sg of [-1, 1]) {
        dome(r, { x: sg * bodyW * 0.5, y: yv - bodyH * 0.15, rx: bodyW * 0.14, ry: bodyH * 0.22 }, 0.08);
        capsule(r, sg * bodyW * 0.7, yv, sg * bodyW * (c ? 1.3 : 2.1), yv - bodyH * 0.1, bodyH * 0.14, 0.07, "add", 1.2);
      }
    }
  }
  if (c) {
    // 頭蓋底と下顎（上の端）
    dome(r, { x: lateral ? -30 : 0, y: -150, rx: 90, ry: 40 }, 0.35);
  } else {
    // 仙骨と腸骨稜（下の端）
    dome(r, { x: lateral ? 30 : 0, y: top + n * step + 30, rx: lateral ? 40 : 48, ry: 45, angle: lateral ? -0.5 : 0 }, 0.22);
    if (!lateral) for (const sg of [-1, 1]) dome(r, { x: sg * 100 * s, y: top + n * step + 20, rx: 70, ry: 50, angle: sg * 0.45 }, 0.2);
  }
  marker(r, "R", -r.width * r.spacing * 0.5 + 12, -r.height * r.spacing * 0.5 + 12, 10);
}

/** 部位が分からないとき：軟部と骨の棒だけ。 */
function generic(r: Raster) {
  dome(r, { x: 0, y: 0, rx: 110, ry: 400 }, 1.0);
  tube(
    r,
    [
      { x: 0, y: -200, r: 16 },
      { x: 0, y: 200, r: 16 },
    ],
    0.33,
    0.03,
    0.009,
  );
}
