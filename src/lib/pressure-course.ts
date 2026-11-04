// 褥瘡の経過: each pressure injury of a patient (部位・いつから・院内発生か持ち込みか) with its DESIGN-R®2020
// assessments over time, the measured size, and a photo taken in (downsized in the browser and kept in the
// record). People choose every score; code adds up the total (深さは加えない), checks the size bin against
// what was measured, and says when the next assessment is due. Nothing here is decided by AI. Data is fictional.
//
// What may be reproduced: the item names and points below are those printed in the government form 別紙3
// 「褥瘡対策に関する診療計画書」 of the 厚生労働省 notice (a 通知 of a government office). The longer
// definitions of the 日本褥瘡学会 (©日本褥瘡学会; the consensus document says its publisher 照林社 holds the
// rights to copy, reprint and put it into a database) are not copied: the screen links to the society's sheet.

import { PRESSURE_ITEMS, type PressureRecord } from "./admit-eval";
import { DEPTH_LABEL, DEPTHS, type UlcerDepth } from "./procedures";
import type { DayOffset } from "./types";

export const PRESSURE_SOURCES = {
  form: {
    label: "厚生労働省保険局医療課長通知「基本診療料の施設基準等及びその届出に関する手続きの取扱いについて」（令和8年3月5日 保医発0305第7号）別添6 別紙3「褥瘡対策に関する診療計画書」（褥瘡の状態の評価の項目と点数。合計点に深さの点数は加えない。「3C」と「3」はどちらも3点）",
    url: "https://www.mhlw.go.jp/content/12400000/001757361.pdf",
  },
  rule: {
    label: "同 通知 別添2 第1の4 褥瘡対策の基準 (3)〜(5)（日常生活の自立度が低い入院患者の危険因子の評価。危険因子のある患者と既に褥瘡を有する患者は、褥瘡対策チームの専任の医師と専任の看護職員が診療計画を作成・実施・評価する。薬学的管理と栄養管理の事項は患者の状態に応じて記載。栄養管理は栄養管理計画書で省略できる）",
    url: "https://www.mhlw.go.jp/content/12400000/001757361.pdf",
  },
  scale: {
    label: "日本褥瘡学会「DESIGN-R®2020 褥瘡経過評価用」（各項目の定義の詳しい文言はこちら。©日本褥瘡学会。DESIGN-R® は日本褥瘡学会の登録商標）",
    url: "https://www.jspu.org/medical/design-r/docs/design-r2020.pdf",
  },
};

/** What the sources do not say: the fictional hospital's own rules. */
export const PRESSURE_RULES = {
  interval: "DESIGN-R®2020 の評価は7日ごと（変化があればその都度）。架空の病院の取り決め（通知に評価の間隔の定めはありません）",
  photo: "写真は評価と同じ日に撮り、端末で縮小して記録に入れます（長い辺 480px）。架空の病院の取り決め。このデモの写真は図形で描いた架空の見本で、実際の創の写真ではありません",
};

/** Days between assessments (架空の病院の取り決め). */
export const REASSESS_DAYS = 7;

/** 部位 as listed on 別紙3. */
export const SITES = ["仙骨部", "坐骨部", "尾骨部", "腸骨部", "大転子部", "踵部", "その他"] as const;
export type Site = (typeof SITES)[number];

export type ItemKey = "e" | "s" | "i" | "g" | "n" | "p";

export interface Grade {
  code: string;
  points: number;
  /** The words of 別紙3. */
  label: string;
}

export interface DesignItem {
  key: ItemKey;
  name: string;
  en: string;
  /** How it is measured, as 別紙3 says. */
  how?: string;
  grades: Grade[];
}

const g = (code: string, points: number, label: string): Grade => ({ code, points, label });

/** The six items that are added up (別紙3 の文言のまま). 深さ is separate (DEPTH_LABEL in procedures.ts). */
export const DESIGN_ITEMS: DesignItem[] = [
  { key: "e", name: "滲出液", en: "Exudate", grades: [g("e0", 0, "なし"), g("e1", 1, "少量：毎日の交換を要しない"), g("e3", 3, "中等量：1日1回の交換"), g("E6", 6, "多量：1日2回以上の交換")] },
  {
    key: "s",
    name: "大きさ（cm²）",
    en: "Size",
    how: "長径×長径に直交する最大径（持続する発赤の範囲も含む）",
    grades: [g("s0", 0, "皮膚損傷なし"), g("s3", 3, "4未満"), g("s6", 6, "4以上16未満"), g("s8", 8, "16以上36未満"), g("s9", 9, "36以上64未満"), g("s12", 12, "64以上100未満"), g("S15", 15, "100以上")],
  },
  {
    key: "i",
    name: "炎症・感染",
    en: "Inflammation/Infection",
    grades: [
      g("i0", 0, "局所の炎症徴候なし"),
      g("i1", 1, "局所の炎症徴候あり（創周辺の発赤、腫脹、熱感、疼痛）"),
      g("I3C", 3, "臨界的定着疑い（創面にぬめりがあり、滲出液が多い。肉芽があれば、浮腫性で脆弱など）"),
      g("I3", 3, "局所の明らかな感染徴候あり（炎症徴候、膿、悪臭）"),
      g("I9", 9, "全身的影響あり（発熱など）"),
    ],
  },
  {
    key: "g",
    name: "肉芽形成（良性肉芽が占める割合）",
    en: "Granulation",
    grades: [g("g0", 0, "創が治癒した場合、創が浅い場合、深部損傷褥瘡（DTI）疑い"), g("g1", 1, "創面の90%以上を占める"), g("g3", 3, "創面の50%以上90%未満を占める"), g("G4", 4, "創面の10%以上50%未満を占める"), g("G5", 5, "創面の10%未満を占める"), g("G6", 6, "全く形成されていない")],
  },
  { key: "n", name: "壊死組織", en: "Necrotic tissue", grades: [g("n0", 0, "なし"), g("N3", 3, "柔らかい壊死組織あり"), g("N6", 6, "硬く厚い密着した壊死組織あり")] },
  {
    key: "p",
    name: "ポケット（cm²）",
    en: "Pocket",
    how: "潰瘍面も含めたポケット全周（ポケットの長径×長径に直交する最大径）－潰瘍面積",
    grades: [g("p0", 0, "なし"), g("P6", 6, "4未満"), g("P9", 9, "4以上16未満"), g("P12", 12, "16以上36未満"), g("P24", 24, "36以上")],
  },
];

export { DEPTH_LABEL, DEPTHS, type UlcerDepth };

export type DesignScore = { depth: UlcerDepth } & Record<ItemKey, string>;

export interface Measure {
  lengthCm: number;
  widthCm: number;
}

export interface UlcerPhoto {
  dataUrl: string;
  width: number;
  height: number;
  /** A drawn sample (fictional shapes), not a photo of a wound. */
  sample?: boolean;
  name?: string;
}

export interface UlcerAssessment {
  id: string;
  at: { day: DayOffset; time: string };
  by: string;
  score: DesignScore;
  /** 長径 × 長径に直交する最大径 (cm). */
  size?: Measure;
  /** The pocket's 長径 × 直交する最大径 (cm), the ulcer included. */
  pocket?: Measure;
  photo?: UlcerPhoto;
  note: string;
}

export interface PressureUlcer {
  id: string;
  patientId: string;
  site: Site;
  /** The words for その他, or the side (右・左). */
  siteNote?: string;
  /** 褥瘡発生日 (or the day it was found on admission). */
  foundOn: DayOffset;
  origin: "院内発生" | "持ち込み";
  by: string;
  assessments: UlcerAssessment[];
  healed?: { day: DayOffset; time: string; by: string };
}

export const itemOf = (k: ItemKey) => DESIGN_ITEMS.find((x) => x.key === k)!;
export const gradeOf = (k: ItemKey, code: string): Grade | undefined => itemOf(k).grades.find((x) => x.code === code);

/** 合計点: the six items; 深さの点数は加えない (別紙3 ※1). */
export function designTotal(s: DesignScore): number {
  return DESIGN_ITEMS.reduce((sum, it) => sum + (gradeOf(it.key, s[it.key])?.points ?? 0), 0);
}

/** "D3-e3s6i1g3N3p0" (深さ, then the six codes). */
export const designText = (s: DesignScore) => `${s.depth}-${DESIGN_ITEMS.map((it) => s[it.key]).join("")}`;

/** The score fully chosen (every item has one of its codes). */
export const designComplete = (s: Partial<DesignScore>): s is DesignScore => !!s.depth && DEPTHS.includes(s.depth) && DESIGN_ITEMS.every((it) => !!s[it.key] && !!gradeOf(it.key, s[it.key]!));

/** cm², to one decimal place. */
export const areaOf = (m: Measure) => Math.round(m.lengthCm * m.widthCm * 10) / 10;

/** The 大きさ code for an area (cm²); 0 = 皮膚損傷なし. */
export function sizeCodeOf(area: number): string {
  if (area <= 0) return "s0";
  return area < 4 ? "s3" : area < 16 ? "s6" : area < 36 ? "s8" : area < 64 ? "s9" : area < 100 ? "s12" : "S15";
}

/** The ポケット code: the pocket's area minus the ulcer's (cm²); none = p0. */
export function pocketCodeOf(pocketArea: number, ulcerArea: number): string {
  const a = Math.round((pocketArea - ulcerArea) * 10) / 10;
  if (a <= 0) return "p0";
  return a < 4 ? "P6" : a < 16 ? "P9" : a < 36 ? "P12" : "P24";
}

/** Where the chosen codes and the measured sizes disagree (code checks; the nurse decides which is right). */
export function scoreProblems(s: Partial<DesignScore>, size?: Measure, pocket?: Measure): string[] {
  const out: string[] = [];
  if (size && size.lengthCm > 0 && size.widthCm > 0) {
    if (size.widthCm > size.lengthCm) out.push("短径（長径に直交する最大径）が長径より長くなっています。");
    const want = sizeCodeOf(areaOf(size));
    if (s.s && s.s !== want) out.push(`測った大きさ ${areaOf(size)}cm² は ${want}（${gradeOf("s", want)?.label}）です。選んだのは ${s.s} です。`);
    if (pocket && pocket.lengthCm > 0 && pocket.widthCm > 0) {
      const pw = pocketCodeOf(areaOf(pocket), areaOf(size));
      if (s.p && s.p !== pw) out.push(`測ったポケット（${areaOf(pocket)}cm² − 潰瘍面 ${areaOf(size)}cm²）は ${pw} です。選んだのは ${s.p} です。`);
    }
  }
  return out;
}

export const latestOf = (u: PressureUlcer): UlcerAssessment | undefined => [...u.assessments].sort((a, b) => a.at.day - b.at.day || a.at.time.localeCompare(b.at.time)).at(-1);

/** Assessments oldest first. */
export const courseOf = (u: PressureUlcer): UlcerAssessment[] => [...u.assessments].sort((a, b) => a.at.day - b.at.day || a.at.time.localeCompare(b.at.time));

export interface UlcerDue {
  /** The day the next assessment is due (offset from today). */
  dueOn: DayOffset;
  state: "期限内" | "今日まで" | "期限切れ" | "治癒";
}

/** When the next DESIGN-R® assessment is due: REASSESS_DAYS after the last one (or after it was found). */
export function ulcerDue(u: PressureUlcer): UlcerDue {
  const last = latestOf(u);
  const dueOn = (last?.at.day ?? u.foundOn) + (last ? REASSESS_DAYS : 0);
  if (u.healed) return { dueOn, state: "治癒" };
  return { dueOn, state: dueOn < 0 ? "期限切れ" : dueOn === 0 ? "今日まで" : "期限内" };
}

export const siteLabel = (u: Pick<PressureUlcer, "site" | "siteNote">) => (u.siteNote ? `${u.site}（${u.siteNote}）` : u.site);

export interface UlcerRow {
  ulcer: PressureUlcer;
  name: string;
  room: string;
  latest?: UlcerAssessment;
  total?: number;
  /** The total minus the one before (negative = smaller = better on this scale). */
  change?: number;
  due: UlcerDue;
}

/** 褥瘡のある患者の一覧 (the ward's): open ones first, by how soon the next assessment is due, then the room. */
export function wardUlcerRows(ulcers: PressureUlcer[], where: (patientId: string) => { name: string; room: string } | undefined, opts: { healed?: boolean } = {}): UlcerRow[] {
  const rows: UlcerRow[] = [];
  for (const u of ulcers) {
    const w = where(u.patientId);
    if (!w || (u.healed && !opts.healed)) continue;
    const c = courseOf(u);
    const latest = c.at(-1);
    const prev = c.at(-2);
    rows.push({ ulcer: u, name: w.name, room: w.room, latest, total: latest ? designTotal(latest.score) : undefined, change: latest && prev ? designTotal(latest.score) - designTotal(prev.score) : undefined, due: ulcerDue(u) });
  }
  const rank = { 期限切れ: 0, 今日まで: 1, 期限内: 2, 治癒: 3 } as const;
  return rows.sort((a, b) => rank[a.due.state] - rank[b.due.state] || a.due.dueOn - b.due.dueOn || a.room.localeCompare(b.room));
}

/** Width and height that fit inside max × max, keeping the shape (an image is only made smaller). */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/** The longest side of a photo kept in the record (架空の病院の取り決め). */
export const PHOTO_MAX = 480;

// ---------------------------------------------------------------------------
// 架空の見本の画像: shapes drawn in SVG (a reddish oval on a skin-coloured ground, a scale in cm). Not a
// wound photo; used only for the fictional record and to try the screen.
// ---------------------------------------------------------------------------

export function samplePhoto(n: 1 | 2 | 3): UlcerPhoto {
  const shape = n === 1 ? { rx: 70, ry: 48, core: 26 } : n === 2 ? { rx: 56, ry: 38, core: 16 } : { rx: 34, ry: 28, core: 0 };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">` +
    `<rect width="320" height="240" fill="#e9c9ad"/>` +
    `<ellipse cx="160" cy="112" rx="${shape.rx + 14}" ry="${shape.ry + 12}" fill="#dc9b86"/>` +
    `<ellipse cx="160" cy="112" rx="${shape.rx}" ry="${shape.ry}" fill="#b5523f"/>` +
    (shape.core ? `<ellipse cx="166" cy="116" rx="${shape.core}" ry="${Math.round(shape.core * 0.7)}" fill="#e7d27a"/>` : "") +
    `<rect x="20" y="200" width="200" height="22" fill="#ffffff" stroke="#333"/>` +
    Array.from({ length: 11 }, (_, i) => `<line x1="${20 + i * 20}" y1="200" x2="${20 + i * 20}" y2="${i % 5 === 0 ? 214 : 208}" stroke="#333"/>`).join("") +
    `<text x="226" y="216" font-size="12" fill="#333">10cm</text>` +
    `<text x="12" y="22" font-size="13" fill="#333">架空の見本（図形）${n}</text>` +
    `</svg>`;
  return { dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: 320, height: 240, sample: true, name: `架空の見本${n}.svg` };
}

// ---------------------------------------------------------------------------
// 褥瘡対策に関する診療計画書 (別紙3): what the record already says, for the document.
// ---------------------------------------------------------------------------

export interface PlanAutoInput {
  ulcers: PressureUlcer[];
  /** 入院時の評価の褥瘡の危険因子 (admit-eval.ts), if made. */
  risk?: { adl: string; items: { label: string; yes: string; no: string; on?: boolean }[]; by: string; day: DayOffset };
  fmt: (d: DayOffset) => string;
}

/** 入院時の評価の褥瘡の危険因子 as the plan shows it (an item not asked stays 未評価). */
export const riskFromEval = (pr?: PressureRecord): PlanAutoInput["risk"] =>
  pr ? { adl: pr.adl, items: PRESSURE_ITEMS.map((x) => ({ label: x.label, yes: x.yes, no: x.no, on: pr.items[x.key] })), by: pr.by, day: pr.at.day } : undefined;

/** The fields of 褥瘡対策に関する診療計画書 that come from the record. */
export function pressurePlanAuto({ ulcers, risk, fmt }: PlanAutoInput): Record<string, string> {
  const now = ulcers.filter((u) => !u.healed);
  const past = ulcers.filter((u) => u.healed);
  return {
    ulcerNow: now.length ? `あり（${now.map(siteLabel).join("、")}）` : "なし",
    foundOn: now.length ? now.map((u) => `${siteLabel(u)} ${fmt(u.foundOn)}（${u.origin}）`).join("、") : "—",
    ulcerPast: past.length ? `あり（${past.map(siteLabel).join("、")}）` : "なし（この入院の記録で）",
    risk: risk
      ? [`日常生活自立度 ${risk.adl}`, ...risk.items.map((x) => `${x.label}：${x.on === undefined ? "（未評価）" : x.on ? x.yes : x.no}`), `（${fmt(risk.day)} ${risk.by}）`].join("\n")
      : "（入院時の評価で、褥瘡の危険因子の評価がまだです）",
    design: now.length
      ? now
          .map((u) => {
            const l = latestOf(u);
            return l ? `${siteLabel(u)}　${designText(l.score)}（合計${designTotal(l.score)}点）　${fmt(l.at.day)} ${l.by}` : `${siteLabel(u)}　（DESIGN-R®2020 の評価がまだ）`;
          })
          .join("\n")
      : "褥瘡なし",
  };
}

// ---------------------------------------------------------------------------
// FICTIONAL record before this session: three patients of the other teams on 5階東.
// ---------------------------------------------------------------------------

const sc = (text: string): DesignScore => {
  const m = /^(d0|d1|d2|D3|D4|D5|DDTI|DU)-(e\d|E\d)(s\d+|S15)(i\d|I3C|I3|I9)(g\d|G\d)(n0|N3|N6)(p0|P\d+)$/.exec(text);
  if (!m) throw new Error(`bad DESIGN-R text ${text}`);
  return { depth: m[1] as UlcerDepth, e: m[2], s: m[3], i: m[4], g: m[5], n: m[6], p: m[7] };
};

export function initialUlcers(): PressureUlcer[] {
  const a = (id: string, day: number, time: string, by: string, text: string, size: [number, number], note: string, photo?: 1 | 2 | 3, pocket?: [number, number]): UlcerAssessment => ({
    id,
    at: { day, time },
    by,
    score: sc(text),
    size: { lengthCm: size[0], widthCm: size[1] },
    ...(pocket ? { pocket: { lengthCm: pocket[0], widthCm: pocket[1] } } : {}),
    ...(photo ? { photo: samplePhoto(photo) } : {}),
    note,
  });
  return [
    {
      id: "pu-noguchi-1",
      patientId: "90035151", // 野口 ハル（515A、入院5日目）
      site: "仙骨部",
      foundOn: -4,
      origin: "持ち込み",
      by: "看護師 渡辺",
      assessments: [
        a("pu-noguchi-1-a1", -4, "16:00", "看護師 渡辺", "D3-e3s8i1G4N3p0", [6, 4], "入院時に確認。施設から持ち込み。黄色の柔らかい壊死組織あり", 1),
        a("pu-noguchi-1-a2", -1, "14:00", "看護師 渡辺", "D3-e3s6i1g3N3p0", [4.5, 3], "壊死組織が減り、肉芽が増えた", 2),
      ],
    },
    {
      id: "pu-ando-1",
      patientId: "90035164", // 安藤 キヨ（516D、入院5日目）
      site: "踵部",
      siteNote: "右",
      foundOn: -2,
      origin: "院内発生",
      by: "看護師 渡辺",
      assessments: [a("pu-ando-1-a1", -2, "10:30", "看護師 渡辺", "DDTI-e1s3i1g0n0p0", [1.8, 1.5], "紫色の変色。触れると硬い。深部損傷褥瘡（DTI）疑い", 3)],
    },
    {
      id: "pu-fujii-1",
      patientId: "90035162", // 藤井 さよ（516B、入院21日目）
      site: "仙骨部",
      foundOn: -20,
      origin: "持ち込み",
      by: "看護師 渡辺",
      assessments: [
        a("pu-fujii-1-a1", -20, "15:00", "看護師 渡辺", "d2-e1s6i0g1n0p0", [3, 2], "入院時に確認"),
        a("pu-fujii-1-a2", -13, "10:00", "看護師 渡辺", "d2-e1s3i0g1n0p0", [1.8, 1.2], ""),
        a("pu-fujii-1-a3", -8, "10:00", "看護師 渡辺", "d1-e0s3i0g0n0p0", [1.5, 1], "持続する発赤のみ"),
      ],
    },
  ];
}
