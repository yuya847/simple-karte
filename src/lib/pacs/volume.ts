// CT・MRI の断面の合成画像。体を「組織ごとの楕円・楕円体・管」の重ね塗りで作り、
// 組織の値を CT なら HU（ハウンスフィールド単位）、MRI なら T1・T2 強調の信号値に置きかえる。
// 実在の患者の画像ではない。座標は mm：x は画像の右（患者の左）、y は画像の下（患者の背中側）、z は頭の向きが +。

import { between, gaussian, makeRng, type Rng } from "./random";
import { capsule, capsule3d, ellipse, lerpTable, Raster, roundRect, sliceOf, smoothstep, type EllipseShape, type P3 } from "./raster";
import type { PhantomHint, SeriesSpec } from "./types";

export type Tissue =
  | "air"
  | "lung"
  | "fat"
  | "skin"
  | "muscle"
  | "blood"
  | "heart"
  | "liver"
  | "spleen"
  | "kidney"
  | "medulla"
  | "pancreas"
  | "bowel"
  | "water"
  | "urine"
  | "bile"
  | "csf"
  | "gray"
  | "white"
  | "cortex"
  | "marrow"
  | "disc"
  | "cartilage"
  | "table"
  | "stool"
  | "lens"
  | "cord"
  | "tendon"
  | "thyroid";

export type Look = "ct" | "ctc" | "t1" | "t2";

// [CT 単純, CT 造影, MRI T1, MRI T2]（CT は HU、MRI は 0〜2000 くらいの信号値。どれも架空の目安）
const TISSUE: Record<Tissue, [number, number, number, number]> = {
  air: [-1000, -1000, 0, 0],
  lung: [-860, -850, 15, 25],
  fat: [-100, -100, 950, 700],
  skin: [30, 40, 400, 300],
  muscle: [50, 60, 380, 220],
  blood: [42, 180, 120, 80],
  heart: [45, 110, 400, 230],
  liver: [60, 115, 520, 280],
  spleen: [50, 120, 380, 600],
  kidney: [32, 175, 420, 700],
  medulla: [30, 110, 350, 820],
  pancreas: [42, 100, 480, 380],
  bowel: [40, 85, 380, 300],
  water: [5, 8, 150, 1500],
  urine: [8, 10, 120, 1700],
  bile: [10, 12, 140, 1600],
  csf: [8, 8, 130, 1700],
  gray: [40, 42, 430, 800],
  white: [28, 30, 600, 500],
  cortex: [1000, 1000, 20, 20],
  marrow: [260, 270, 720, 560],
  disc: [85, 90, 300, 1100],
  cartilage: [110, 115, 350, 700],
  table: [-350, -350, 0, 0],
  stool: [-50, -50, 300, 400],
  lens: [120, 120, 500, 300],
  cord: [35, 38, 480, 600],
  tendon: [90, 95, 40, 40],
  thyroid: [100, 150, 400, 400],
};

const LOOK_INDEX: Record<Look, number> = { ct: 0, ctc: 1, t1: 2, t2: 3 };

/** 組織の値（CT は HU、MRI は信号値）。 */
export function tissueValue(t: Tissue, look: Look): number {
  return TISSUE[t][LOOK_INDEX[look]];
}

type Paint = (t: Tissue) => number;

// ---------------------------------------------------------------------------
// 体（胸・腹・骨盤）の形。患者ごとの種から 1 回だけ作り、同じ患者なら同じ体つきにする。
// ---------------------------------------------------------------------------

interface Seg {
  a: P3;
  b: P3;
  r: number;
}

interface BodyAnatomy {
  sx: number;
  sy: number;
  fat: number;
  ribPhase: number;
  vessels: Seg[];
  bowel: { x: number; y: number; z: number; r: number; air: boolean }[];
  colon: P3[];
  stool: { x: number; y: number; z: number; r: number }[];
}

const anatomyCache = new Map<number, BodyAnatomy>();

function bodyAnatomy(seed: number): BodyAnatomy {
  const hit = anatomyCache.get(seed);
  if (hit) return hit;
  const g = makeRng(seed ^ 0x5bd1e995);
  const sx = between(g, 0.93, 1.06);
  const sy = between(g, 0.92, 1.08);
  const fat = between(g, 12, 26);
  const ribPhase = between(g, 0, 23);
  const vessels: Seg[] = [];
  for (const s of [-1, 1]) {
    const hilum = { x: s * 42 * sx, y: 2, z: 100 };
    for (let n = 0; n < 10; n++) {
      const dir = norm({ x: s * between(g, 0.25, 1), y: between(g, -0.8, 0.8), z: (n % 2 === 0 ? 1 : -1) * between(g, 0.3, 1.3) });
      branch(g, vessels, hilum, dir, 34, 4.2, 0);
    }
  }
  const bowel = Array.from({ length: 46 }, () => ({
    x: between(g, -85, 85) * sx,
    y: between(g, -75, 35) * sy,
    z: between(g, -265, -95),
    r: between(g, 12, 19),
    air: g() < 0.25,
  }));
  const colon: P3[] = [
    [-85, 5, -235],
    [-95, 15, -170],
    [-95, 10, -120],
    [-80, -35, -95],
    [-30, -75, -112],
    [30, -75, -112],
    [90, -20, -70],
    [100, 25, -130],
    [95, 25, -200],
    [50, -10, -250],
    [10, 30, -280],
    [0, 72, -300],
    [0, 68, -345],
  ].map(([x, y, z]) => ({ x: x * sx, y: y * sy, z }));
  const stool: BodyAnatomy["stool"] = [];
  for (let n = 0; n < 30; n++) {
    const i = Math.floor(between(g, 0, colon.length - 1.001));
    const f = g();
    const a = colon[i];
    const b = colon[i + 1];
    stool.push({ x: a.x + (b.x - a.x) * f + gaussian(g) * 5, y: a.y + (b.y - a.y) * f + gaussian(g) * 5, z: a.z + (b.z - a.z) * f + gaussian(g) * 5, r: between(g, 6, 12) });
  }
  const out = { sx, sy, fat, ribPhase, vessels, bowel, colon, stool };
  anatomyCache.set(seed, out);
  return out;
}

function norm(p: P3): P3 {
  const l = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / l, y: p.y / l, z: p.z / l };
}

function branch(g: Rng, out: Seg[], from: P3, dir: P3, len: number, r: number, depth: number) {
  const to = { x: from.x + dir.x * len, y: from.y + dir.y * len, z: from.z + dir.z * len };
  out.push({ a: from, b: to, r });
  if (depth >= 5) return;
  for (let k = 0; k < 2; k++) {
    const d = norm({ x: dir.x + gaussian(g) * 0.35, y: dir.y + gaussian(g) * 0.35, z: dir.z + gaussian(g) * 0.35 });
    branch(g, out, to, d, len * 0.75, r * 0.7, depth + 1);
  }
}

/** 体の外形（z ごと）：[z, 横の半径, 前後の半径] */
const OUTLINE_RX: [number, number][] = [
  [-340, 165],
  [-260, 168],
  [-200, 158],
  [-100, 150],
  [0, 155],
  [100, 158],
  [200, 155],
  [245, 140],
  [262, 64],
  [330, 60],
];
const OUTLINE_RY: [number, number][] = [
  [-340, 105],
  [-260, 110],
  [-200, 112],
  [-100, 118],
  [0, 115],
  [100, 112],
  [200, 105],
  [245, 95],
  [262, 60],
  [330, 58],
];

/** 椎骨の高さ（胸椎は 23 mm、腰椎は 34 mm ごと）。 */
function vertebraAt(z: number): { lumbar: boolean; disc: boolean; sacrum: boolean } {
  if (z > -41) {
    const u = (((235 - z) % 23) + 23) % 23;
    return { lumbar: false, disc: u < 4, sacrum: false };
  }
  if (z > -211) {
    const u = (-41 - z) % 34;
    return { lumbar: true, disc: u < 8, sacrum: false };
  }
  return { lumbar: true, disc: false, sacrum: true };
}

/** 胸・腹・骨盤の断面を 1 枚描く。 */
function bodySlice(r: Raster, z: number, paint: Paint, an: BodyAnatomy, hint: PhantomHint, female: boolean, contrast: boolean) {
  const { sx, sy, fat } = an;
  const rx = lerpTable(OUTLINE_RX, z) * sx;
  const ry = lerpTable(OUTLINE_RY, z) * sy;
  const neck = z > 255;
  const cy = 0;
  const T = paint;

  // 寝台
  const yt = cy + ry + 14;
  capsule(r, -175, yt, 175, yt, 5, T("table"), "set", 1);
  capsule(r, -175, yt - 5, 175, yt - 5, 0.8, 200, "set", 0.8);

  // 皮膚・皮下脂肪・筋肉の壁・中（脂肪）
  const f = neck ? 6 : fat;
  ellipse(r, { x: 0, y: cy, rx, ry }, T("skin"));
  ellipse(r, { x: 0, y: cy, rx: rx - 2, ry: ry - 2 }, T("fat"));
  ellipse(r, { x: 0, y: cy + f * 0.2, rx: rx - f, ry: ry - f }, T("muscle"));
  const cav = { x: 0, y: cy - 4, rx: rx - f - 14, ry: ry - f - 18 };
  if (!neck) ellipse(r, cav, T("fat"));

  // 背中の筋肉
  const yBody = cy + ry * 0.5;
  const lumbar = z < -41;
  for (const s of [-1, 1]) ellipse(r, { x: s * 36, y: yBody + 40, rx: 30, ry: 22 }, T("muscle"));

  if (neck) {
    neckSlice(r, z, T, contrast);
  } else {
    if (z > -50) chest(r, z, T, an, cav, hint);
    if (z < 15) abdomen(r, z, T, an, cav, yBody, female);
    vessels(r, z, T, yBody);
    ribs(r, z, T, an, cav, yBody);
    if (z < -195) pelvis(r, z, T, yBody);
  }
  vertebra(r, z, T, yBody, lumbar);
  if (!neck && z > 110 && z < 250) {
    for (const s of [-1, 1]) {
      const a = s * 0.55;
      ellipse(r, { x: s * 88 * sx, y: yBody + 14, rx: 42, ry: 14, angle: a }, T("muscle"));
      ellipse(r, { x: s * 88 * sx, y: yBody + 14, rx: 32, ry: 3, angle: a }, T("cortex"));
    }
  }
  if (z > 225 && z < 262) {
    for (const s of [-1, 1]) {
      capsule(r, s * 14, cy - ry + 20, s * 110 * sx, cy - ry + 36, 8, T("cortex"));
      capsule(r, s * 14, cy - ry + 20, s * 110 * sx, cy - ry + 36, 5, T("marrow"));
    }
  }
}

function neckSlice(r: Raster, z: number, T: Paint, contrast: boolean) {
  ellipse(r, { x: 0, y: -22, rx: 10, ry: 9 }, T("cartilage"));
  ellipse(r, { x: 0, y: -22, rx: 7.5, ry: 7 }, T("air"));
  ellipse(r, { x: 2, y: -6, rx: 7, ry: 5 }, T("muscle"));
  if (z < 300) for (const s of [-1, 1]) ellipse(r, { x: s * 18, y: -20, rx: 9, ry: 13 }, T("thyroid"));
  for (const s of [-1, 1]) {
    ellipse(r, { x: s * 25, y: -8, rx: 5, ry: 5 }, T("blood"));
    ellipse(r, { x: s * 34, y: -10, rx: 7, ry: 6 }, contrast ? T("blood") - 40 : T("blood"));
    ellipse(r, { x: s * 38, y: -22, rx: 9, ry: 22, angle: s * 0.6 }, T("muscle"));
  }
}

function chest(r: Raster, z: number, T: Paint, an: BodyAnatomy, cav: EllipseShape, hint: PhantomHint) {
  const { sx } = an;
  // 肺：頭の先（z 235）から横隔膜の下の奥（z −45）まで。下では肝臓・脾臓に押される
  if (z < 236 && z > -46) {
    const f = z > 60 ? Math.sqrt(Math.max(0, 1 - ((z - 60) / 176) ** 2)) : 1 - 0.25 * smoothstep(20, -45, z);
    const back = z < 20 ? (20 - z) * 0.5 : 0;
    for (const s of [-1, 1]) {
      const lung = { x: s * (cav.rx * 0.5 + 2), y: cav.y + 6 + back, rx: cav.rx * 0.5 * f, ry: cav.ry * 0.9 * f };
      if (lung.rx > 2 && lung.ry > 2) ellipse(r, lung, T("lung"), "set", 1.2);
    }
    for (const v of an.vessels) capsule3d(r, v.a, v.b, v.r, z, T("blood"), (cur) => cur < -400);
    // 胸水（背中側にたまる）
    const eff = hint.effusion;
    if (eff && z < 60) {
      for (const s of [-1, 1] as const) {
        const h = s < 0 ? eff.right : eff.left;
        if (h <= 0) continue;
        const depth = h * 1.2 * smoothstep(60, 0, z);
        r.scan(s < 0 ? -cav.rx : 0, cav.y, s < 0 ? 0 : cav.rx, cav.y + cav.ry + 10, (x, y, k) => {
          if (r.data[k] < -400 && y > cav.y + cav.ry * 0.95 - depth) r.data[k] = T("water");
        });
      }
    }
  }
  // 心臓（心胸郭比に合わせて大きさを変える）
  const scale = (hint.ctr ?? 0.47) / 0.47;
  const heart = sliceOf({ x: 22 * sx, y: -25, z: 40, rx: 62 * scale, ry: 50 * scale, rz: 58 }, z);
  if (heart) {
    ellipse(r, { ...heart, rx: heart.rx + 3, ry: heart.ry + 3 }, T("fat"));
    ellipse(r, heart, T("heart"), "set", 1.2);
    const lv = sliceOf({ x: 40 * sx, y: -20, z: 35, rx: 22 * scale, ry: 20 * scale, rz: 40 }, z);
    const rv = sliceOf({ x: 5 * sx, y: -50, z: 38, rx: 26 * scale, ry: 13 * scale, rz: 40 }, z);
    const la = sliceOf({ x: 18 * sx, y: 10, z: 78, rx: 24, ry: 16, rz: 20 }, z);
    const ra = sliceOf({ x: -32 * sx, y: -18, z: 62, rx: 20, ry: 20, rz: 28 }, z);
    for (const c of [lv, rv, la, ra]) if (c) ellipse(r, c, T("blood"));
  }
  // 気管・気管支・食道
  if (z > 125) {
    ellipse(r, { x: 0, y: -18, rx: 11, ry: 10 }, T("cartilage"));
    ellipse(r, { x: 0, y: -18, rx: 8.5, ry: 8 }, T("air"));
  } else if (z > 100) {
    for (const s of [-1, 1]) {
      ellipse(r, { x: s * 20, y: -6, rx: 8, ry: 7 }, T("cartilage"));
      ellipse(r, { x: s * 20, y: -6, rx: 6, ry: 5.5 }, T("air"));
    }
  }
  if (z > -20) ellipse(r, { x: z > 0 ? 8 : 18, y: z > 0 ? 30 : 12, rx: 7, ry: 6 }, T("muscle"));
}

function vessels(r: Raster, z: number, T: Paint, yBody: number) {
  const B = T("blood");
  // 下行大動脈（胸の左後ろ → 腹で真ん中へ）、上行大動脈と弓、肺動脈、上大静脈・下大静脈
  if (z < 132 && z > -190) {
    const x = z > 0 ? 22 : 22 - 14 * smoothstep(0, -60, z);
    ellipse(r, { x, y: yBody - 26, rx: 12, ry: 12 }, B);
  }
  if (z <= -190 && z > -280) for (const s of [-1, 1]) ellipse(r, { x: s * (12 + (-190 - z) * 0.45), y: yBody - 28 - (-190 - z) * 0.15, rx: 7, ry: 7 }, B);
  if (z > 70 && z < 132) ellipse(r, { x: 6, y: -28, rx: 15, ry: 15 }, B);
  if (z >= 132 && z < 146) capsule(r, 6, -30, 22, yBody - 26, 12, B);
  if (z >= 146 && z < 215) {
    ellipse(r, { x: -10, y: -28, rx: 8, ry: 8 }, B);
    ellipse(r, { x: 6, y: -24, rx: 5, ry: 5 }, B);
    ellipse(r, { x: 20, y: -14, rx: 6, ry: 6 }, B);
  }
  if (z > 92 && z < 115) {
    ellipse(r, { x: 20, y: -42, rx: 14, ry: 14 }, B);
    if (z < 106) capsule(r, 20, -40, -42, -6, 8, B);
    else capsule(r, 20, -40, 52, -4, 8, B);
  }
  if (z > 70 && z < 150) ellipse(r, { x: -26, y: -20, rx: 10, ry: 10 }, B);
  if (z < 20 && z > -200) ellipse(r, { x: -22, y: yBody - 30, rx: 12, ry: 10 }, B);
}

function ribs(r: Raster, z: number, T: Paint, an: BodyAnatomy, cav: EllipseShape, yBody: number) {
  if (z > 240 || z < -78) return;
  const pts: { x: number; y: number; cart: boolean }[] = [];
  const Rx = cav.rx + 8;
  const Ry = cav.ry + 9;
  for (let th = 0; th < Math.PI * 2; th += Math.PI / 72) {
    const sn = Math.sin(th);
    if (Math.abs(th - Math.PI / 2) < 0.28) continue;
    const front = Math.abs(th - (3 * Math.PI) / 2);
    if (front < 0.14 && z > 10) continue;
    const u = (z - an.ribPhase + 32 * (1 - sn)) / 23;
    if (u - Math.floor(u) > 0.36) continue;
    pts.push({ x: cav.x + Rx * Math.cos(th), y: cav.y + Ry * sn, cart: front < 0.5 });
  }
  for (const p of pts) ellipse(r, { x: p.x, y: p.y, rx: 4.8, ry: 4.8 }, p.cart ? T("cartilage") : T("cortex"));
  for (const p of pts) if (!p.cart) ellipse(r, { x: p.x, y: p.y, rx: 2.8, ry: 2.8 }, T("marrow"));
  // 胸骨
  if (z > 15 && z < 215) {
    const sw = z > 170 ? 22 : 15;
    ellipse(r, { x: cav.x, y: cav.y - cav.ry - 6, rx: sw, ry: 7 }, T("cortex"));
    ellipse(r, { x: cav.x, y: cav.y - cav.ry - 6, rx: sw - 2.5, ry: 4.5 }, T("marrow"));
  }
  void yBody;
}

function abdomen(r: Raster, z: number, T: Paint, an: BodyAnatomy, cav: EllipseShape, yBody: number, female: boolean) {
  const { sx, sy } = an;
  const E = (x: number, y: number, ez: number, rx: number, ry: number, rz: number, angle = 0) => sliceOf({ x: x * sx, y: y * sy, z: ez, rx, ry, rz, angle }, z);
  const put = (e: EllipseShape | null, t: Tissue | number) => {
    if (e) ellipse(r, e, typeof t === "number" ? t : T(t), "set", 1.2);
  };
  // 腸腰筋
  if (z < -80 && z > -300) {
    const g = smoothstep(-80, -200, z);
    for (const s of [-1, 1]) ellipse(r, { x: s * (30 + g * 25), y: yBody - 4 + g * 6, rx: 8 + g * 16, ry: 10 + g * 10 }, T("muscle"));
  }
  // 腎臓（皮質・髄質・腎洞の脂肪）
  for (const s of [-1, 1]) {
    const k = E(s * 72, 48, s < 0 ? -125 : -115, 28, 32, 55, s * 0.5);
    if (k) {
      put(k, "kidney");
      put({ ...k, rx: k.rx * 0.62, ry: k.ry * 0.62 }, "medulla");
      if (Math.abs(z - (s < 0 ? -125 : -115)) < 20) put({ x: k.x - s * 8, y: k.y - 4, rx: k.rx * 0.3, ry: k.ry * 0.35 }, "fat");
    }
  }
  // 肝臓・胆嚢・脾臓・胃・膵臓
  put(E(-48, -5, -55, 78, 82, 68), "liver");
  put(E(20, -48, -35, 55, 30, 35, -0.2), "liver");
  if (z < 10 && z > -110) {
    const hv = E(-30, 10, -20, 6, 6, 25);
    put(hv, "blood");
    const pv = E(-25, 0, -80, 9, 7, 14);
    put(pv, "blood");
  }
  put(E(-55, -55, -95, 15, 17, 28), "bile");
  put(E(92, 40, -55, 30, 46, 50, 0.3), "spleen");
  const st = E(58, -28, -38, 46, 38, 50);
  if (st) {
    put(st, "bowel");
    const lumen = { ...st, rx: st.rx - 4, ry: st.ry - 4 };
    put(lumen, "water");
    const level = st.y - st.ry * 0.25;
    r.scan(lumen.x - lumen.rx, lumen.y - lumen.ry, lumen.x + lumen.rx, level, (x, y, k) => {
      if (y < level && ((x - lumen.x) / lumen.rx) ** 2 + ((y - lumen.y) / lumen.ry) ** 2 < 1) r.data[k] = T("air");
    });
  }
  if (z < -78 && z > -112) ellipse(r, { x: 12 * sx, y: 2, rx: 58, ry: 11, angle: -0.25 }, T("pancreas"));
  // 小腸と大腸
  for (const b of an.bowel) {
    const s = sliceOf({ x: b.x, y: b.y, z: b.z, rx: b.r, ry: b.r, rz: b.r }, z);
    if (!s) continue;
    put(s, "bowel");
    if (s.rx > 3) put({ ...s, rx: s.rx - 2.5, ry: s.ry - 2.5 }, b.air ? "air" : "water");
  }
  for (let i = 0; i < an.colon.length - 1; i++) {
    const rad = i < 2 ? 26 : 22;
    capsule3d(r, an.colon[i], an.colon[i + 1], rad, z, T("bowel"));
  }
  for (let i = 0; i < an.colon.length - 1; i++) {
    const rad = i < 2 ? 26 : 22;
    capsule3d(r, an.colon[i], an.colon[i + 1], rad - 2.5, z, T("air"));
  }
  for (const s of an.stool) put(sliceOf({ x: s.x, y: s.y, z: s.z, rx: s.r, ry: s.r, rz: s.r }, z), "stool");
  // 膀胱・子宮または前立腺
  const bl = E(0, -35, -310, 45, 38, 35);
  if (bl) {
    put(bl, "muscle");
    put({ ...bl, rx: bl.rx - 2.5, ry: bl.ry - 2.5 }, "urine");
  }
  put(female ? E(0, 15, -282, 30, 22, 40) : E(0, 15, -338, 18, 16, 16), "muscle");
  void cav;
}

function pelvis(r: Raster, z: number, T: Paint, yBody: number) {
  const d = -200 - z;
  for (const s of [-1, 1]) {
    if (z < -210) ellipse(r, { x: s * 92, y: yBody + 10, rx: 58, ry: 34, angle: s * 0.2 }, T("muscle"));
    if (z > -285) {
      const wing = { x: s * (100 - d * 0.35), y: yBody - 20 + d * 0.25, rx: 52 - d * 0.2, ry: 10 + d * 0.06, angle: s * -0.65 };
      ellipse(r, { ...wing, rx: wing.rx + 14, ry: wing.ry + 14 }, T("muscle"));
      ellipse(r, wing, T("cortex"));
      ellipse(r, { ...wing, rx: wing.rx - 3, ry: Math.max(1, wing.ry - 3) }, T("marrow"));
    } else {
      ellipse(r, { x: s * 82, y: yBody - 50, rx: 32, ry: 34 }, T("cortex"));
      ellipse(r, { x: s * 82, y: yBody - 50, rx: 28, ry: 30 }, T("cartilage"));
      ellipse(r, { x: s * 86, y: yBody - 50, rx: 23, ry: 23 }, T("cortex"));
      ellipse(r, { x: s * 86, y: yBody - 50, rx: 20, ry: 20 }, T("marrow"));
      if (z < -322) {
        ellipse(r, { x: s * 62, y: yBody, rx: 14, ry: 14 }, T("cortex"));
        ellipse(r, { x: s * 62, y: yBody, rx: 10, ry: 10 }, T("marrow"));
        capsule(r, s * 12, yBody - 105, s * 58, yBody - 85, 9, T("cortex"));
        capsule(r, s * 12, yBody - 105, s * 58, yBody - 85, 6, T("marrow"));
      }
    }
  }
}

function vertebra(r: Raster, z: number, T: Paint, yBody: number, lumbarZone: boolean) {
  const v = vertebraAt(z);
  if (v.sacrum) {
    const d = -211 - z;
    if (d > 95) return;
    const w = 48 * (1 - d / 140);
    const y = yBody + 12 + d * 0.3;
    ellipse(r, { x: 0, y, rx: w, ry: 18 }, T("cortex"));
    ellipse(r, { x: 0, y, rx: w - 3, ry: 15 }, T("marrow"));
    ellipse(r, { x: 0, y: y + 4, rx: 10, ry: 5 }, T("csf"));
    return;
  }
  const lumbar = v.lumbar || lumbarZone;
  const bx = lumbar ? 24 : 18;
  const by = lumbar ? 18 : 15;
  ellipse(r, { x: 0, y: yBody, rx: bx, ry: by }, v.disc ? T("disc") : T("cortex"));
  if (!v.disc) ellipse(r, { x: 0, y: yBody, rx: bx - 2.5, ry: by - 2.5 }, T("marrow"));
  const yc = yBody + by + 12;
  ellipse(r, { x: 0, y: yc, rx: 13, ry: 11 }, T("cortex"));
  for (const s of [-1, 1]) capsule(r, s * 8, yc - 3, s * (lumbar ? 42 : 28), yc - 6, 4, T("cortex"));
  capsule(r, 0, yc + 8, 0, yc + 24, 3.5, T("cortex"));
  ellipse(r, { x: 0, y: yc, rx: 8, ry: 7.5 }, T("csf"));
  if (z > -60) ellipse(r, { x: 0, y: yc, rx: 4.5, ry: 4 }, T("cord"));
}

// ---------------------------------------------------------------------------
// 頭部（CT・MRI の横断）z は眼窩耳孔線のあたりを 0 とする
// ---------------------------------------------------------------------------

function headSlice(r: Raster, z: number, T: Paint, g: Rng) {
  const f = Math.sqrt(Math.max(0, 1 - ((z - 25) / 100) ** 2));
  if (f <= 0) return;
  const lower = z < 5;
  const ox = 80 * f;
  const oy = (lower ? 92 : 98) * f;
  const cy = lower ? 8 : 0;
  ellipse(r, { x: 0, y: cy, rx: ox + 5, ry: oy + 5 }, T("skin"));
  ellipse(r, { x: 0, y: cy, rx: ox + 1.5, ry: oy + 1.5 }, T("fat"));
  ellipse(r, { x: 0, y: cy, rx: ox, ry: oy }, T("cortex"));
  ellipse(r, { x: 0, y: cy, rx: ox - 2, ry: oy - 2 }, T("marrow"));
  ellipse(r, { x: 0, y: cy, rx: ox - 4.5, ry: oy - 4.5 }, T("cortex"));
  const ix = ox - 6.5;
  const iy = oy - 6.5;
  if (ix < 3) return;
  ellipse(r, { x: 0, y: cy, rx: ix, ry: iy }, T("csf"));
  ellipse(r, { x: 0, y: cy, rx: ix - 2, ry: iy - 2 }, T("gray"));
  if (z > 8 && z < 95) ellipse(r, { x: 0, y: cy, rx: (ix - 2) * 0.72, ry: (iy - 2) * 0.76 }, T("white"));
  // 脳溝・大脳鎌
  if (z > 15) {
    for (let n = 0; n < 34; n++) {
      const th = (n / 34) * Math.PI * 2 + gaussian(g) * 0.04;
      const len = between(g, 8, 16);
      const x0 = (ix - 1.5) * Math.cos(th);
      const y0 = cy + (iy - 1.5) * Math.sin(th);
      capsule(r, x0, y0, x0 * (1 - len / ix), cy + (y0 - cy) * (1 - len / iy), 0.9, T("csf"), "set", 0.8);
    }
    capsule(r, 0, cy - iy + 2, 0, cy - 22, 1, T("csf"), "set", 0.8);
    capsule(r, 0, cy + 25, 0, cy + iy - 2, 1, T("csf"), "set", 0.8);
  }
  // 基底核・視床
  if (z > 10 && z < 36) {
    for (const s of [-1, 1]) {
      ellipse(r, { x: s * 20, y: cy - 8, rx: 9, ry: 14, angle: s * 0.2 }, T("gray"));
      ellipse(r, { x: s * 11, y: cy + 14, rx: 9, ry: 11 }, T("gray"));
    }
  }
  // 脳室
  if (z > 25 && z < 62) {
    for (const s of [-1, 1]) ellipse(r, { x: s * 9, y: cy - 2, rx: 5, ry: 28, angle: s * 0.12 }, T("csf"));
  } else if (z > 18 && z <= 25) {
    for (const s of [-1, 1]) ellipse(r, { x: s * 11, y: cy - 26, rx: 6, ry: 10, angle: s * 0.3 }, T("csf"));
    ellipse(r, { x: 0, y: cy + 2, rx: 2.5, ry: 10 }, T("csf"));
  } else if (z > -15 && z < 0) {
    ellipse(r, { x: 0, y: cy + 32, rx: 7, ry: 5 }, T("csf"));
  }
  // 後頭蓋窩（小脳・脳幹）と側頭葉、錐体骨・乳突蜂巣
  if (lower) {
    ellipse(r, { x: 0, y: cy + 48, rx: 52 * f, ry: 32 * f }, T("gray"));
    ellipse(r, { x: 0, y: cy + 48, rx: 30 * f, ry: 16 * f }, T("white"));
    ellipse(r, { x: 0, y: cy + 14, rx: 14, ry: 12 }, T("white"));
    if (z > -15 && z < 0) ellipse(r, { x: 0, y: cy + 32, rx: 7, ry: 5 }, T("csf"));
    if (z < -5 && z > -30) {
      for (const s of [-1, 1]) {
        capsule(r, s * 22, cy + 12, s * 58, cy + 30, 9, T("cortex"));
        for (let n = 0; n < 6; n++) ellipse(r, { x: s * (58 + (n % 3) * 5), y: cy + 34 + Math.floor(n / 3) * 6, rx: 2, ry: 2 }, T("air"));
      }
      ellipse(r, { x: 0, y: cy - 2, rx: 12, ry: 14 }, T("cortex"));
    }
  }
  // 眼窩・副鼻腔
  if (z < 8 && z > -32) {
    for (const s of [-1, 1]) {
      ellipse(r, { x: s * 32, y: cy - oy + 18, rx: 20, ry: 20 }, T("fat"));
      ellipse(r, { x: s * 32, y: cy - oy + 16, rx: 12, ry: 12 }, T("water"));
      ellipse(r, { x: s * 32, y: cy - oy + 5, rx: 4, ry: 2 }, T("lens"));
      capsule(r, s * 50, cy - oy + 8, s * 46, cy - oy + 38, 2, T("cortex"));
    }
    for (let n = 0; n < 8; n++) ellipse(r, { x: (n % 2 ? 1 : -1) * (6 + Math.floor(n / 2) * 2), y: cy - oy + 20 + Math.floor(n / 2) * 6, rx: 3, ry: 3 }, T("air"));
  }
  if (z <= -25) {
    for (const s of [-1, 1]) {
      ellipse(r, { x: s * 28, y: cy - oy + 30, rx: 18, ry: 16 }, T("cortex"));
      ellipse(r, { x: s * 28, y: cy - oy + 30, rx: 16, ry: 14 }, T("air"));
    }
  }
  if (z > 10 && z < 30) for (const s of [-1, 1]) ellipse(r, { x: s * 12, y: cy - iy + 2, rx: 8, ry: 6 }, T("air"));
}

// ---------------------------------------------------------------------------
// 膝・下腿（MRI の横断）z は膝の関節面を 0、足の向きが −
// ---------------------------------------------------------------------------

function limbSlice(r: Raster, z: number, T: Paint, side: "R" | "L") {
  const m = side === "R" ? 1 : -1; // 右脚：内側（脛骨）が画像の右
  const R = lerpTable(
    [
      [-380, 34],
      [-250, 44],
      [-110, 58],
      [0, 52],
      [80, 62],
    ],
    z,
  );
  ellipse(r, { x: 0, y: 0, rx: R + 2, ry: R * 0.92 + 2 }, T("skin"));
  ellipse(r, { x: 0, y: 0, rx: R, ry: R * 0.92 }, T("fat"));
  ellipse(r, { x: 0, y: 4, rx: R - 7, ry: R * 0.92 - 8 }, T("muscle"));
  const bone = (x: number, y: number, rx: number, ry: number, wall = 3) => {
    ellipse(r, { x: m * x, y, rx, ry }, T("cortex"));
    ellipse(r, { x: m * x, y, rx: rx - wall, ry: ry - wall }, T("marrow"));
  };
  if (z > 0) {
    // 大腿骨（顆部 → 骨幹）・膝蓋骨・大腿四頭筋腱
    if (z < 35) {
      for (const s of [-1, 1]) bone(s * 20, 8, 22, 24, 1.5);
      ellipse(r, { x: 0, y: 18, rx: 8, ry: 10 }, T("fat"));
      ellipse(r, { x: 0, y: 0, rx: 44, ry: 3 }, T("cartilage"));
    } else {
      bone(0, 0, 16 + 10 * smoothstep(80, 35, z), 15 + 8 * smoothstep(80, 35, z), 3.5);
    }
    if (z > 8 && z < 55) {
      ellipse(r, { x: 0, y: -40, rx: 22, ry: 11 }, T("cortex"));
      ellipse(r, { x: 0, y: -40, rx: 19.5, ry: 8.5 }, T("marrow"));
      ellipse(r, { x: 0, y: -29, rx: 20, ry: 2 }, T("cartilage"));
    } else if (z >= 55) {
      ellipse(r, { x: 0, y: -42, rx: 18, ry: 5 }, T("tendon"));
    }
    for (const s of [-1, 1]) ellipse(r, { x: s * 8, y: 40, rx: 4, ry: 4 }, T("blood"));
  } else if (z > -40) {
    // 脛骨の上端・半月板・腓骨頭・膝蓋腱
    bone(4, 4, 40 - Math.abs(z) * 0.2, 28, 1.5);
    if (z > -6) for (const s of [-1, 1]) ellipse(r, { x: s * 24, y: 6, rx: 14, ry: 18 }, T("tendon"));
    if (z < -12) bone(-34, 18, 10, 10, 2);
    ellipse(r, { x: 0, y: -42, rx: 14, ry: 4 }, T("tendon"));
    for (const s of [-1, 1]) ellipse(r, { x: s * 6, y: 38, rx: 4, ry: 4 }, T("blood"));
  } else {
    // 下腿：脛骨（前内側）と腓骨（後外側）、筋の区画の間の脂肪
    const t = smoothstep(-40, -120, z) * (1 - smoothstep(-300, -380, z));
    ellipse(r, { x: m * 10, y: 8, rx: 30, ry: 1.5, angle: m * 0.6 }, T("fat"));
    bone(14, -18 + 6 * t, 24 - 10 * t, 22 - 9 * t, 4.5);
    bone(-26, 10, 8 - t, 8 - t, 2.5);
    for (const s of [-1, 1]) ellipse(r, { x: s * 10, y: 14, rx: 3, ry: 3 }, T("blood"));
  }
}

// ---------------------------------------------------------------------------
// 脊椎（MRI の矢状断）。画像の x は前後（前が左）、y は頭足（下が足）、スライスは左右にずらす
// ---------------------------------------------------------------------------

function spineSagittal(r: Raster, lat: number, T: Paint, cervical: boolean) {
  const n = cervical ? 7 : 5;
  const bodyH = cervical ? 14 : 27;
  const disc = cervical ? 5 : 10;
  const bodyD = cervical ? 17 : 34;
  const step = bodyH + disc;
  const top = -((n - 1) * step) / 2;
  const half = cervical ? 11 : 22;
  const a = Math.abs(lat);
  const curve = (y: number) => (cervical ? -10 : -14) * Math.cos((y / ((n + 1) * step * 0.5)) * (Math.PI / 2));
  const canal = (y: number) => curve(y) + bodyD / 2 + 8;
  // 首・腰の前後の厚み（皮膚・皮下脂肪・筋肉）と、脊柱管（髄液）・脊髄（腰椎では馬尾）
  const front = cervical ? -45 : -110;
  const back = cervical ? 70 : 90;
  const fatT = cervical ? 8 : 22;
  const coneEnd = top - step * 0.8;
  r.each((x, y, k) => {
    if (x <= front || x >= back) return;
    const e = Math.min(x - front, back - x);
    r.data[k] = e < 2 ? T("skin") : e < fatT ? T("fat") : T("muscle");
  });
  if (cervical) capsule(r, -30, -200, -26, 200, 7, T("air"));
  else ellipse(r, { x: -88, y: 0, rx: 22, ry: 220 }, T("fat"));
  // 椎体・椎間板
  const w = a < half ? Math.sqrt(1 - (a / half) ** 2) : 0;
  for (let i = -1; i <= n; i++) {
    const yv = top + i * step;
    const xv = curve(yv);
    if (w > 0) {
      const hd = (bodyD * (0.6 + 0.4 * w)) / 2;
      roundRect(r, xv, yv, hd, bodyH / 2, 3, T("cortex"));
      roundRect(r, xv, yv, hd - 1.8, bodyH / 2 - 1.8, 2, T("marrow"));
      const yd = yv + step / 2;
      roundRect(r, xv, yd, hd - 0.5, disc / 2, disc / 2, T("disc"));
      roundRect(r, xv, yd, hd * 0.55, disc / 2 - 1, disc / 2 - 1, T("water"));
    } else {
      // 外側：椎弓根・椎間関節
      ellipse(r, { x: xv + bodyD * 0.7, y: yv, rx: 7, ry: bodyH * 0.45 }, T("cortex"));
      ellipse(r, { x: xv + bodyD * 0.7, y: yv, rx: 5, ry: bodyH * 0.45 - 2 }, T("marrow"));
    }
    // 棘突起
    if (a < 6) {
      capsule(r, canal(yv) + 9, yv, canal(yv) + bodyD * 0.9, yv + bodyH * 0.5, 4, T("cortex"));
      capsule(r, canal(yv) + 9, yv, canal(yv) + bodyD * 0.9, yv + bodyH * 0.5, 2.2, T("marrow"));
    }
  }
  if (a < 8) {
    const wc = 6.5 * Math.sqrt(1 - (a / 8) ** 2);
    const cord = a < 4.5 ? 3.8 * Math.sqrt(1 - (a / 4.5) ** 2) : 0;
    r.each((x, y, k) => {
      const d = Math.abs(x - canal(y));
      if (d >= wc + 0.5) return;
      const inCord = cervical || y < coneEnd ? d < cord : a < 4 && [-2.5, 0, 2.5].some((o) => Math.abs(d - Math.abs(o)) < 0.6);
      r.data[k] = inCord ? T("cord") : T("csf");
    });
  }
}

// ---------------------------------------------------------------------------
// 1 枚を作る
// ---------------------------------------------------------------------------

/** 断面のシリーズの i 枚目の画素を作る。同じ spec・同じ i なら毎回同じ。 */
export function renderSlice(spec: SeriesSpec, index: number): Int16Array {
  const g = spec.gen;
  if (g.kind !== "ct" && g.kind !== "mr") throw new Error("断面のシリーズではありません");
  const look: Look = g.kind === "ct" ? (g.contrast ? "ctc" : "ct") : g.weighting === "T1" ? "t1" : "t2";
  const paint: Paint = (t) => tissueValue(t, look);
  const z = spec.positions[Math.min(spec.positions.length - 1, Math.max(0, index))];
  const acq = makeRng(spec.acqSeed);
  const pose = { dx: between(acq, -5, 5), dy: between(acq, -4, 4), angle: between(acq, -0.03, 0.03) };
  const noise = makeRng((spec.acqSeed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  const sliceRng = makeRng((spec.anatomySeed ^ Math.imul(Math.round(z * 10) + 7, 0x85ebca6b)) >>> 0);
  const r = new Raster(spec.width, spec.height, spec.spacing, pose, paint("air"));
  if (g.part === "head") headSlice(r, z, paint, sliceRng);
  else if (g.part === "knee" || g.part === "leg") limbSlice(r, z, paint, g.kind === "mr" ? (g.side ?? "R") : "R");
  else if (g.kind === "mr" && g.plane === "sagittal") spineSagittal(r, z, paint, g.part === "c-spine");
  else bodySlice(r, z, paint, bodyAnatomy(spec.anatomySeed), spec.hint, spec.sex === "女", look === "ctc");

  const d = r.data;
  if (g.kind === "ct") {
    const sigma = g.part === "head" ? 3.5 : 9;
    for (let k = 0; k < d.length; k++) d[k] += gaussian(noise) * (d[k] < -900 ? 3 : sigma);
    return clampInt(d, -1024, 3071);
  }
  // MRI：中心から外へ少し暗くなる（受信コイルのむら）と、ライス分布ふうの雑音
  const w = r.width;
  const h = r.height;
  for (let k = 0; k < d.length; k++) {
    const i = (k % w) / w - 0.5;
    const j = Math.floor(k / w) / h - 0.5;
    const bias = 1.08 - 0.5 * (i * i + j * j);
    const a = d[k] * bias + gaussian(noise) * 14;
    const b = gaussian(noise) * 14;
    d[k] = Math.hypot(a, b);
  }
  return clampInt(d, 0, 4095);
}

function clampInt(d: Float32Array, lo: number, hi: number): Int16Array {
  const out = new Int16Array(d.length);
  for (let k = 0; k < d.length; k++) out[k] = Math.round(Math.min(hi, Math.max(lo, d[k])));
  return out;
}
