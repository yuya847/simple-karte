// 検査の一覧と、検査ごとのシリーズ（どんな合成画像を何枚作るか）。
// 既存の架空の検査（patient.imaging）と、このアプリで出した画像検査オーダー（時刻を過ぎたもの）の両方に画像を付ける。

import { examAt, findRegion, REGIONS } from "../exams";
import { findCredit } from "../image-credits";
import { studyStateOf, type RisDesk } from "../ris";
import type { HistoryEntry, ImagingOrder, ImagingStudy, Patient } from "../types";
import { photoSeriesFor, type PhotoSeries } from "./photos";
import { seedFrom } from "./random";
import type { BodyPart, Dir, Generator, PacsStudy, PhantomHint, SeriesSpec, WindowPreset, XrayView } from "./types";
import { CT_PRESETS } from "./window";

// ---------------------------------------------------------------------------
// 検査を集める
// ---------------------------------------------------------------------------

/**
 * 患者の検査（架空の記録＋オーダーから）を新しい順に並べる。
 * 放射線部の記録（ris）を渡すと、画像は「画像を送った」あとに出て、読影レポートも放射線部のものになる。渡さないときは時刻を過ぎたら撮影済みとみなす。
 */
export function collectStudies(patient: Patient, entries: HistoryEntry[], nowAbs: number, ris?: RisDesk): ImagingStudy[] {
  const ordered: ImagingStudy[] = entries.flatMap((e) => {
    if (e.kind !== "order" || e.order.type !== "imaging" || e.status === "中止") return [];
    const o = e.order as ImagingOrder;
    const state = ris ? studyStateOf(o, ris[e.id]) : null;
    const at = state?.at ? state.at.day * 1440 + Number(state.at.time.slice(0, 2)) * 60 + Number(state.at.time.slice(3)) : examAt(o, e.day * 1440 + Number(e.time.slice(0, 2)) * 60 + Number(e.time.slice(3)));
    const done = state ? !state.pending : at <= nowAbs;
    const minute = ((at % 1440) + 1440) % 1440;
    return [
      {
        id: e.id,
        day: Math.floor(at / 1440),
        modality: o.modality === "ポータブルX線" ? "X線" : o.modality,
        region: `${findRegion(o.region)?.name ?? o.region}${o.contrast ? `（${o.contrast}）` : ""}`,
        report: state ? state.report : done ? "撮影済み。読影をお待ちください（この試作では読影レポートは架空の記録だけです）。" : `予約：${o.when.priority === "至急" ? "至急" : `${o.when.time ?? ""}`}　目的：${o.purpose}`,
        reader: state ? state.reader : done ? "（読影待ち）" : "（未実施）",
        regionCode: o.region,
        views: o.views,
        contrast: o.contrast,
        time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
        pending: !done,
      },
    ];
  });
  return [...patient.imaging, ...ordered].sort((a, b) => b.day - a.day || (b.time ?? "").localeCompare(a.time ?? ""));
}

// ---------------------------------------------------------------------------
// 部位・方向を読む
// ---------------------------------------------------------------------------

const PART_OF: Record<string, BodyPart> = {
  "R-CHEST": "chest",
  "R-ABD": "abdomen",
  "R-CHEST-ABD": "chest-abd",
  "R-ABD-PELVIS": "abd-pelvis",
  "R-HEAD": "head",
  "R-CSPINE": "c-spine",
  "R-LSPINE": "l-spine",
  "R-KNEE": "knee",
  "R-LEG": "leg",
};

const WORDS = REGIONS.flatMap((r) => [r.name, ...r.aliases].map((w) => ({ w, code: r.code }))).sort((a, b) => b.w.length - a.w.length);

/** 検査の部位のコード。オーダーから来たものはそのまま、架空の記録は部位の言葉から（長い言葉から先に当てる）。 */
export function regionKeyOf(study: ImagingStudy): string {
  if (study.regionCode) return study.regionCode;
  return WORDS.find(({ w }) => study.region.includes(w))?.code ?? "R-OTHER";
}

export function partOf(regionKey: string): BodyPart {
  return PART_OF[regionKey] ?? "other";
}

function sideOf(study: ImagingStudy): "R" | "L" {
  return study.region.includes("左") ? "L" : "R";
}

const VIEW_LABEL: Record<XrayView, string> = {
  PA: "立位正面（PA）",
  AP: "臥位正面（AP）",
  LAT: "側面",
  FRONT: "正面",
  SUPINE: "臥位",
  ERECT: "立位",
};

/** X線の撮影方向（説明の文字と、合成画像の作り方）。 */
export function xrayViews(study: ImagingStudy, part: BodyPart): { view: XrayView; label: string }[] {
  const toView = (text: string): XrayView => {
    if (text.includes("側面")) return "LAT";
    if (text.includes("AP") || text.includes("臥位正面")) return "AP";
    if (part === "abdomen" || part === "abd-pelvis") return text.includes("立位") ? "ERECT" : "SUPINE";
    if (part === "chest" || part === "chest-abd") return "PA";
    return "FRONT";
  };
  if (study.views?.length) return study.views.map((t) => ({ view: toView(t), label: t }));
  const text = study.region;
  let views: XrayView[];
  if (text.includes("2方向")) views = [toView("正面"), "LAT"];
  else if (text.includes("側面")) views = ["LAT"];
  else if (text.includes("正面")) views = [toView("正面")];
  else if (part === "chest" || part === "chest-abd") views = ["PA"];
  else if (part === "abdomen" || part === "abd-pelvis") views = ["SUPINE"];
  else views = [toView("正面"), "LAT"];
  return views.map((v) => ({ view: v, label: VIEW_LABEL[v] }));
}

// ---------------------------------------------------------------------------
// 合成画像の形の指定（架空）
// ---------------------------------------------------------------------------

/**
 * 架空の読影レポートに合わせた描き方（架空）。たとえば北村さんの 2 回の胸部X線は、レポートの CTR と胸水に合わせて描く。
 * 所見を判定するものではない。新しいオーダーの検査は、同じ部位の前回の描き方を引きつぐ（体つきが急に変わらないように）。
 */
export const FICTIONAL_HINTS: Record<string, PhantomHint> = {
  "img-sakura-1": { ctr: 0.48 },
  "img-sakura-2": { swelling: 9 },
  "img-oura-1": { ctr: 0.5, consolidation: { side: "R", zone: "lower" } },
  "img-kita-1": { ctr: 0.62, effusion: { right: 28, left: 22 }, congestion: 0.9 },
  "img-kita-2": { ctr: 0.58, effusion: { right: 10, left: 6 }, congestion: 0.35 },
};

/** 同じ部位で、この検査より前の撮影済みの検査（いちばん新しいもの）。比較表示の「前回」。 */
export function findPrior(studies: ImagingStudy[], current: ImagingStudy): ImagingStudy | undefined {
  const key = regionKeyOf(current);
  const order = (s: ImagingStudy) => s.day * 1440 + (s.time ? Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3)) : 0);
  return studies
    .filter((s) => s.id !== current.id && !s.pending && s.modality === current.modality && regionKeyOf(s) === key && (order(s) < order(current) || (order(s) === order(current) && s.id < current.id)))
    .sort((a, b) => order(b) - order(a))[0];
}

function hintFor(study: ImagingStudy, all: ImagingStudy[], depth = 0): PhantomHint {
  const own = FICTIONAL_HINTS[study.id];
  if (own) return own;
  if (depth > 8) return {};
  const prior = findPrior(all, study);
  return prior ? hintFor(prior, all, depth + 1) : {};
}

// ---------------------------------------------------------------------------
// シリーズを作る
// ---------------------------------------------------------------------------

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  const n = Math.floor(Math.abs(to - from) / step + 1e-9);
  const dir = to < from ? -1 : 1;
  for (let i = 0; i <= n; i++) out.push(Math.round((from + dir * i * step) * 10) / 10);
  return out;
}

const XRAY_SIZE: Record<BodyPart, [number, number, number]> = {
  chest: [400, 480, 0.9],
  "chest-abd": [400, 480, 0.9],
  abdomen: [400, 480, 0.9],
  "abd-pelvis": [400, 480, 0.9],
  leg: [280, 560, 0.8],
  knee: [300, 360, 0.6],
  head: [320, 400, 0.75],
  "c-spine": [240, 360, 0.6],
  "l-spine": [300, 450, 0.8],
  other: [300, 400, 0.8],
};

/** CT の範囲（z mm、上から下へ）と既定の WW/WL。 */
const CT_RANGE: Record<BodyPart, { from: number; to: number; window: WindowPreset; presets: WindowPreset[] }> = {
  chest: { from: 245, to: -40, window: CT_PRESETS.lung, presets: [CT_PRESETS.lung, CT_PRESETS.mediastinum, CT_PRESETS.bone, CT_PRESETS.abdomen] },
  "chest-abd": { from: 245, to: -230, window: CT_PRESETS.mediastinum, presets: [CT_PRESETS.lung, CT_PRESETS.mediastinum, CT_PRESETS.bone, CT_PRESETS.abdomen] },
  abdomen: { from: 20, to: -220, window: CT_PRESETS.abdomen, presets: [CT_PRESETS.abdomen, CT_PRESETS.lung, CT_PRESETS.mediastinum, CT_PRESETS.bone] },
  "abd-pelvis": { from: 20, to: -345, window: CT_PRESETS.abdomen, presets: [CT_PRESETS.abdomen, CT_PRESETS.lung, CT_PRESETS.mediastinum, CT_PRESETS.bone] },
  "l-spine": { from: -30, to: -250, window: CT_PRESETS.bone, presets: [CT_PRESETS.bone, CT_PRESETS.abdomen, CT_PRESETS.mediastinum, CT_PRESETS.lung] },
  head: { from: -40, to: 120, window: CT_PRESETS.brain, presets: [CT_PRESETS.brain, CT_PRESETS.bone] },
  "c-spine": { from: -30, to: -250, window: CT_PRESETS.bone, presets: [CT_PRESETS.bone, CT_PRESETS.abdomen] },
  knee: { from: 20, to: -220, window: CT_PRESETS.abdomen, presets: [CT_PRESETS.abdomen, CT_PRESETS.bone] },
  leg: { from: 20, to: -220, window: CT_PRESETS.abdomen, presets: [CT_PRESETS.abdomen, CT_PRESETS.bone] },
  other: { from: 20, to: -220, window: CT_PRESETS.abdomen, presets: [CT_PRESETS.abdomen, CT_PRESETS.lung, CT_PRESETS.mediastinum, CT_PRESETS.bone] },
};

const MR_WINDOW = { T1: { ww: 1000, wl: 500 }, T2: { ww: 1800, wl: 900 } };
/** 公開画像（0〜255 の灰色）を開いたときの WW/WL：そのまま。 */
export const PHOTO_WINDOW = { ww: 256, wl: 128 };

/** 公開画像のシリーズ（1 枚＝1 スライス。画素の大きさは分からないので 1）。 */
function photoSpec(base: Omit<SeriesSpec, "width" | "height" | "spacing" | "positions" | "unit" | "window" | "presets" | "orient">, p: PhotoSeries, modality: ImagingStudy["modality"]): SeriesSpec {
  const c = findCredit(p.images[0]);
  const lateral = /側面/.test(p.description);
  const orient: { right: Dir; down: Dir } = modality === "X線" ? (lateral ? { right: "P", down: "F" } : { right: "L", down: "F" }) : { right: "L", down: "P" };
  return { ...base, width: c?.width ?? 512, height: c?.height ?? 512, spacing: 1, positions: p.images.map((_, i) => i), unit: "画素値", window: PHOTO_WINDOW, presets: [], orient };
}

export interface BuildOptions {
  /** false なら公開画像を使わず、すべて合成画像にする（合成画像のテスト用）。既定は true。 */
  photos?: boolean;
}

/** 1 検査のシリーズを作る（画素はまだ作らない）。 */
export function buildPacsStudy(patient: Patient, study: ImagingStudy, all: ImagingStudy[], opts: BuildOptions = {}): PacsStudy {
  const regionKey = regionKeyOf(study);
  const status: PacsStudy["status"] = study.pending ? "未実施" : study.reader.includes("読影待ち") ? "読影待ち" : "読影済み";
  if (study.pending) return { study, regionKey, status, series: [] };
  const part = partOf(regionKey);
  const hint = hintFor(study, all);
  const anatomySeed = seedFrom(`patient:${patient.id}`);
  const base = (n: number, description: string, gen: Generator) => ({
    uid: `${study.id}/${n}`,
    number: n,
    description,
    gen,
    hint,
    anatomySeed,
    acqSeed: seedFrom(`study:${study.id}#${n}`),
    sex: patient.sex,
  });
  const series: SeriesSpec[] = [];

  // 公開データの本物の画像が割り当ててあれば、それを出す（レポートの所見に合うものだけ。photos.ts）
  const photos = opts.photos === false ? null : photoSeriesFor(study, regionKey, part, study.modality === "X線" ? xrayViews(study, part) : []);
  if (photos) {
    return { study, regionKey, status, series: photos.map((p, i) => photoSpec(base(i + 1, p.description, { kind: "photo", images: p.images }), p, study.modality)) };
  }

  if (study.modality === "X線") {
    const [w, h, sp] = XRAY_SIZE[part];
    xrayViews(study, part).forEach(({ view, label }, i) => {
      const lateral = view === "LAT";
      const [ww, hh] = part === "head" && lateral ? [h, w] : [w, h];
      const orient: { right: Dir; down: Dir } = lateral ? { right: "P", down: "F" } : { right: "L", down: "F" };
      series.push({ ...base(i + 1, label, { kind: "xray", part, view, side: sideOf(study) }), width: ww, height: hh, spacing: sp, positions: [0], unit: "画素値", window: "auto", presets: [], orient });
    });
  } else if (study.modality === "CT") {
    const head = part === "head";
    const cfg = CT_RANGE[part];
    const phases = study.contrast === "造影" ? [true] : study.contrast === "単純＋造影" ? [false, true] : [false];
    phases.forEach((contrast, i) => {
      const n = 320;
      series.push({
        ...base(i + 1, `${contrast ? "造影" : "単純"} 5mm`, { kind: "ct", part, contrast }),
        width: head ? 256 : n,
        height: head ? 256 : n,
        spacing: head ? 240 / 256 : 380 / n,
        positions: range(cfg.from, cfg.to, 5),
        thickness: 5,
        unit: "HU",
        window: { ww: cfg.window.ww, wl: cfg.window.wl },
        presets: cfg.presets,
        orient: { right: "L", down: "P" },
      });
    });
  } else if (study.modality === "MRI") {
    const sag = part === "c-spine" || part === "l-spine";
    const geo: { size: number; fov: number; pos: number[]; thick: number } =
      part === "head"
        ? { size: 256, fov: 240, pos: range(-30, 110, 6), thick: 5 }
        : part === "knee"
          ? { size: 256, fov: 154, pos: range(80, -60, 4), thick: 3 }
          : part === "leg"
            ? { size: 256, fov: 154, pos: range(0, -380, 10), thick: 8 }
            : part === "c-spine"
              ? { size: 256, fov: 220, pos: range(-20, 20, 4), thick: 3 }
              : part === "l-spine"
                ? { size: 256, fov: 300, pos: range(-24, 24, 4), thick: 4 }
                : { size: 256, fov: 380, pos: range(20, -340, 8), thick: 6 };
    (["T1", "T2"] as const).forEach((weighting, i) => {
      series.push({
        ...base(i + 1, `${sag ? "矢状断" : "横断"} ${weighting}強調像`, { kind: "mr", part: part === "chest" || part === "chest-abd" ? "abd-pelvis" : part, weighting, plane: sag ? "sagittal" : "axial", side: sideOf(study) }),
        width: geo.size,
        height: geo.size,
        spacing: geo.fov / geo.size,
        positions: geo.pos,
        thickness: geo.thick,
        unit: "信号値",
        window: MR_WINDOW[weighting],
        presets: [{ key: "std", label: "標準", ...MR_WINDOW[weighting] }],
        orient: sag ? { right: "P", down: "F" } : { right: "L", down: "P" },
      });
    });
  } else {
    series.push({ ...base(1, "Bモード", { kind: "us", part }), width: 320, height: 280, spacing: 0.55, positions: [0], unit: "画素値", window: "auto", presets: [], orient: { right: "L", down: "P" } });
  }
  return { study, regionKey, status, series };
}

/** 患者の全部の検査を、シリーズ付きで。 */
export function buildPacsStudies(patient: Patient, studies: ImagingStudy[], opts: BuildOptions = {}): PacsStudy[] {
  return studies.map((s) => buildPacsStudy(patient, s, studies, opts));
}

/** スライスの位置の書き方（横断は z、矢状断は x）。 */
export function positionLabel(spec: SeriesSpec, index: number): string {
  if (spec.positions.length <= 1 || spec.gen.kind === "photo") return "";
  const v = spec.positions[Math.min(spec.positions.length - 1, Math.max(0, index))];
  const axis = spec.gen.kind === "mr" && spec.gen.plane === "sagittal" ? "x" : "z";
  return `${axis} ${v >= 0 ? "+" : ""}${v.toFixed(1)} mm`;
}
