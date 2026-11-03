// 院内登録レジメン（架空の病院）と、その量の計算。
//
// 決めるのは医師：レジメン・コース・日・減量率は医師が選び、最初から選ばれているものはない。
// コードは計算と確認だけをして、式と出典を返す。量・上限・式・制吐薬は公開の出典（添付文書・
// ピボタル試験・日本のガイドライン）を持つ。投与順・時刻・溶媒の量・まるめは架空の病院の取り決め。

import { cockcroftGault } from "./clinical";
import type { InjectionDraft } from "./drafts";
import { findDrug } from "./master";
import type { DayOffset, InjectionRoute } from "./types";

export interface Source {
  label: string;
  url: string;
}

/** Public sources of the numbers and rules below (checked 2026-11-03). */
export const SOURCES = {
  ptxInsert: { label: "パクリタキセル注射液「NP」添付文書（2026年9月改訂 第5版）", url: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/530100_4240406A1082_3_13" },
  cbdcaInsert: { label: "カルボプラチン点滴静注液「サンド」添付文書（2026年7月改訂 第4版）", url: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/270428_4291403A1061_1_20" },
  etpInsert: { label: "エトポシド点滴静注液100mg「SN」添付文書（2023年9月改訂 第1版）", url: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/340409_4240403A2093_1_08" },
  paloInsert: { label: "パロノセトロン静注0.75mg/5mL「タイホウ」添付文書（2026年10月改訂 第4版）", url: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/340264_2391404A1038_1_06" },
  faprInsert: { label: "ホスアプレピタント点滴静注用150mg「NK」添付文書（2021年8月作成 第1版）", url: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/530191_2391405D1039_1_01" },
  dexInsert: { label: "デキサート注射液 添付文書（2026年4月改訂 第3版）", url: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/670109_2454405H1032_1_09" },
  antiemetic: {
    label: "日本癌治療学会「制吐薬適正使用ガイドライン 2023年10月改訂 第3版」（英語の要約：Iihara H, et al. Int J Clin Oncol 2024;29:873-888、Fig. 1・CQ3・CQ6・CQ9）",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11196343/",
  },
  e4599: { label: "Sandler A, et al. Paclitaxel-carboplatin alone or with bevacizumab for non-small-cell lung cancer. N Engl J Med 2006;355:2542-50（ECOG 4599 の化学療法のみの群）", url: "https://doi.org/10.1056/NEJMoa061884" },
  jcog9702: { label: "Okamoto H, et al. Carboplatin plus etoposide vs split doses of cisplatin plus etoposide in elderly or poor-risk patients with extensive disease small-cell lung cancer: JCOG 9702. Br J Cancer 2007;97:162-9", url: "https://doi.org/10.1038/sj.bjc.6603810" },
  calvert: { label: "Calvert AH, et al. Carboplatin dosage: prospective evaluation of a simple formula based on renal function. J Clin Oncol 1989;7:1748-56", url: "https://doi.org/10.1200/JCO.1989.7.11.1748" },
  cg: { label: "Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum creatinine. Nephron 1976;16:31-41", url: "https://doi.org/10.1159/000180580" },
  dubois: { label: "Du Bois D, Du Bois EF. A formula to estimate the approximate surface area if height and weight be known. Arch Intern Med 1916;17:863-71（Nutrition 1989;5:303-11 に再掲）", url: "https://pubmed.ncbi.nlm.nih.gov/2520314/" },
  fdaGfr: {
    label: "FDA「Carboplatin dosing」（GFR は 125mL/分を上限に。最大量 = AUC × 150。FDA のアーカイブ、2015年11月更新）",
    url: "https://wayback.archive-it.org/7993/20170113081146/http://www.fda.gov/AboutFDA/CentersOffices/OfficeofMedicalProductsandTobacco/CDER/ucm228974.htm",
  },
} satisfies Record<string, Source>;

/** The rules of the fictional hospital itself (not a public source). */
export const HOSPITAL_RULE = "架空の病院の取り決め";

export type DoseBasis = "mg/m²" | "mg/kg" | "AUC" | "固定";

export interface RegimenDrug {
  /** Unique within the regimen; the doctor's 減量率 is kept by this key (one choice for all days). */
  key: string;
  drugCode: string;
  /** 略号 shown in the table (PTX, CBDCA, DEX …). */
  short: string;
  basis: DoseBasis;
  value: number;
  /** 抗がん薬: the doctor chooses the 減量率. 前投薬: a fixed dose, never reduced here. */
  reducible: boolean;
  /** Per-dose cap in mg, only when a public source gives one. */
  capMg?: { mg: number; source: Source };
  /** まるめ: the dose is rounded to the nearest multiple of this many mg. */
  roundMg: number;
  roundNote: string;
  source: Source[];
  note?: string;
}

/** How a drug is given, from its package insert. Checked in code against the dose and the solvent. */
export interface AdminRule {
  text: string;
  source: Source;
  solvents?: string[];
  exactMl?: number;
  minMl?: number;
  maxMl?: number;
  /** 溶媒は薬 100mg あたり何 mL 以上（エトポシド）. */
  minMlPer100mg?: number;
  minMinutes?: number;
  maxMinutes?: number;
}

/** When a premedication must be given, relative to another Rp of the same day. */
export interface TimingRule {
  text: string;
  source: Source;
  /** Rp key, or "first-chemo" (the first 抗がん薬 of the day). */
  target: string;
  /** Must end at least this many minutes before the target starts. */
  endsBeforeMin?: number;
  /** Must start this many minutes before the target starts. */
  startsBeforeMin?: number;
}

/** One bag or push: the drugs, the solvent they are mixed in, the route, the time and when it starts. */
export interface RegimenRp {
  key: string;
  role: "前投薬" | "抗がん薬";
  drugs: RegimenDrug[];
  solvent: { drugCode: string; ml: number } | null;
  route: InjectionRoute;
  /** 点滴の時間（分）. null for an IV push. */
  minutes: number | null;
  /** Start, in minutes after the time the doctor chose (投与順と時刻は架空の病院の取り決め). */
  at: number;
  days: number[];
  admin?: AdminRule;
  timing?: TimingRule;
}

export interface Regimen {
  code: string;
  name: string;
  disease: string;
  cycle: string;
  maxCourses: number;
  days: number[];
  rps: RegimenRp[];
  /** Oral premedication: listed, not drafted here (it is a prescription). */
  oral: { day: number; name: string; dose: string; text: string; source: Source }[];
  /** What the doctor should know: differences from the package insert, what the trial did. */
  notes: { text: string; source: Source }[];
  /** The regimen's pivotal reference(s). */
  sources: Source[];
}

// ---------------------------------------------------------------------------
// The hospital's registered regimens (架空)
// ---------------------------------------------------------------------------

const S = SOURCES;
const ROUND_10 = `10mg 単位（${HOSPITAL_RULE}）`;
const ROUND_DEX = `1.65mg（0.5mL）単位：デキサート 6.6mg/2mL を量る単位（${HOSPITAL_RULE}）`;

const fixed = (key: string, drugCode: string, short: string, mg: number, source: Source[], roundMg = 0, roundNote = "まるめなし（固定量）", note?: string): RegimenDrug => ({
  key,
  drugCode,
  short,
  basis: "固定",
  value: mg,
  reducible: false,
  roundMg,
  roundNote,
  source,
  note,
});

const NS100 = { drugCode: "INJ-NS100", ml: 100 };
const FAPR_ADMIN: AdminRule = {
  text: "生理食塩液で最終 100〜250mL（0.6〜1.5mg/mL）にし、30分かけて点滴静注",
  source: S.faprInsert,
  solvents: ["INJ-NS100"],
  minMl: 100,
  maxMl: 250,
  minMinutes: 30,
  maxMinutes: 30,
};
const FAPR_TIMING: TimingRule = { text: "抗がん薬の投与の1時間前に始める", source: S.faprInsert, target: "first-chemo", startsBeforeMin: 60 };
const PALO_TIMING: TimingRule = { text: "抗がん薬の投与の前に終える", source: S.paloInsert, target: "first-chemo", endsBeforeMin: 0 };
const PALO = fixed("PALO", "INJ-PALO", "パロノセトロン", 0.75, [S.antiemetic, S.paloInsert]);
const FAPR = fixed("FAPR", "INJ-FAPR", "ホスアプレピタント", 150, [S.antiemetic, S.faprInsert]);
const CBDCA_ADMIN: AdminRule = {
  text: "投与量に応じて 250mL 以上のブドウ糖注射液又は生理食塩液に混和し、30分以上かけて点滴静注",
  source: S.cbdcaInsert,
  solvents: ["INJ-GLU5-250", "INJ-GLU5-500", "INJ-NS500"],
  minMl: 250,
  minMinutes: 30,
};

export const REGIMENS: Regimen[] = [
  {
    code: "REG-TC-Q3W",
    name: "CBDCA+PTX（3週ごと）",
    disease: "非小細胞肺癌",
    cycle: "21日で1コース、6コースまで",
    maxCourses: 6,
    days: [1],
    rps: [
      {
        key: "famo",
        role: "前投薬",
        drugs: [fixed("FAMO", "INJ-FAMO20", "ファモチジン", 20, [S.ptxInsert])],
        solvent: null,
        route: "静注",
        minutes: null,
        at: 0,
        days: [1],
        timing: { text: "パクリタキセルの約30分前までに投与を終える", source: S.ptxInsert, target: "ptx", endsBeforeMin: 30 },
      },
      { key: "palo", role: "前投薬", drugs: [PALO], solvent: null, route: "静注", minutes: null, at: 5, days: [1], timing: PALO_TIMING },
      {
        key: "dex",
        role: "前投薬",
        drugs: [
          fixed("DEX", "INJ-DEX66", "デキサメタゾン", 20, [S.ptxInsert], 1.65, ROUND_DEX, "パクリタキセルの過敏症を防ぐ前投薬（添付文書の「デキサメタゾンとして20mg」）。制吐の DEX を兼ねます。"),
        ],
        solvent: NS100,
        route: "点滴静注",
        minutes: 15,
        at: 10,
        days: [1],
        timing: { text: "パクリタキセルの約30分前までに投与を終える", source: S.ptxInsert, target: "ptx", endsBeforeMin: 30 },
      },
      { key: "fapr", role: "前投薬", drugs: [FAPR], solvent: NS100, route: "点滴静注", minutes: 30, at: 25, days: [1], admin: FAPR_ADMIN, timing: FAPR_TIMING },
      {
        key: "ptx",
        role: "抗がん薬",
        drugs: [{ key: "PTX", drugCode: "INJ-PTX", short: "PTX", basis: "mg/m²", value: 200, reducible: true, roundMg: 10, roundNote: ROUND_10, source: [S.e4599, S.ptxInsert] }],
        solvent: { drugCode: "INJ-NS500", ml: 500 },
        route: "点滴静注",
        minutes: 180,
        at: 85,
        days: [1],
        admin: {
          text: "A法：500mL の5%ブドウ糖注射液又は生理食塩液に混和し、3時間かけて点滴静注。0.22μm 以下のインラインフィルターを通し、DEHP を含む点滴セットは使わない",
          source: S.ptxInsert,
          solvents: ["INJ-NS500", "INJ-GLU5-500"],
          exactMl: 500,
          minMinutes: 180,
          maxMinutes: 180,
        },
      },
      {
        key: "cbdca",
        role: "抗がん薬",
        drugs: [{ key: "CBDCA", drugCode: "INJ-CBDCA", short: "CBDCA", basis: "AUC", value: 6, reducible: true, roundMg: 10, roundNote: ROUND_10, source: [S.e4599, S.calvert] }],
        solvent: { drugCode: "INJ-GLU5-250", ml: 250 },
        route: "点滴静注",
        minutes: 60,
        at: 265,
        days: [1],
        admin: CBDCA_ADMIN,
      },
    ],
    oral: [{ day: 1, name: "ジフェンヒドラミン塩酸塩錠", dose: "50mg", text: "パクリタキセルの約30分前までに経口投与", source: S.ptxInsert }],
    notes: [
      { text: "量は E4599（パクリタキセル 200mg/m² ＋ カルボプラチン AUC 6、3週ごと6コース）によります。", source: S.e4599 },
      { text: "パクリタキセル添付文書の A法は 210mg/m²（3時間、少なくとも3週間休薬）。200mg/m² はその範囲の中です。", source: S.ptxInsert },
      { text: "カルボプラチン添付文書の用量は 1日1回 300〜400mg/m²（少なくとも4週間休薬）で、AUC での量は載っていません。AUC 6 と3週ごとは E4599 によります。", source: S.cbdcaInsert },
      { text: "カルボプラチン（AUC≥4）を含むレジメンは、NK1受容体拮抗薬＋5-HT3受容体拮抗薬＋デキサメタゾンの3剤（CQ3、推奨の強さ1）。ガイドラインのこの場合の DEX は day1 4.95mg 静注です。", source: S.antiemetic },
      { text: "ホスアプレピタントと併用するコルチコステロイドは、相互作用を考えて適宜減量とされています（添付文書 7.1）。このレジメンの DEX は、パクリタキセルの過敏症予防の 20mg のままです。", source: S.faprInsert },
      { text: "デキサメタゾンの前投薬は、約12〜14時間前と約6〜7時間前の2回でもよいとされています。このレジメンは約30分前までに1回です。", source: S.ptxInsert },
    ],
    sources: [S.e4599],
  },
  {
    code: "REG-CE",
    name: "CBDCA+ETP（3〜4週ごと）",
    disease: "小細胞肺癌（高齢・PS 不良の進展型）",
    cycle: "3〜4週で1コース、4コースまで",
    maxCourses: 4,
    days: [1, 2, 3],
    rps: [
      { key: "palo", role: "前投薬", drugs: [PALO], solvent: null, route: "静注", minutes: null, at: 0, days: [1], timing: PALO_TIMING },
      {
        key: "dex1",
        role: "前投薬",
        drugs: [fixed("DEX1", "INJ-DEX66", "デキサメタゾン", 4.95, [S.antiemetic], 1.65, ROUND_DEX, "カルボプラチン（AUC≥4）に NK1受容体拮抗薬を併用するときの day1 の量（ガイドライン Fig. 1：経口 6mg ＝ 静注 4.95mg）。")],
        solvent: NS100,
        route: "点滴静注",
        minutes: 15,
        at: 5,
        days: [1],
      },
      { key: "fapr", role: "前投薬", drugs: [FAPR], solvent: NS100, route: "点滴静注", minutes: 30, at: 20, days: [1], admin: FAPR_ADMIN, timing: FAPR_TIMING },
      {
        key: "cbdca",
        role: "抗がん薬",
        drugs: [{ key: "CBDCA", drugCode: "INJ-CBDCA", short: "CBDCA", basis: "AUC", value: 5, reducible: true, roundMg: 10, roundNote: ROUND_10, source: [S.jcog9702, S.calvert] }],
        solvent: { drugCode: "INJ-GLU5-250", ml: 250 },
        route: "点滴静注",
        minutes: 60,
        at: 80,
        days: [1],
        admin: CBDCA_ADMIN,
      },
      ...([
        { key: "etp1", at: 140, days: [1] },
        { key: "etp23", at: 15, days: [2, 3] },
      ] as const).map(
        (x): RegimenRp => ({
          key: x.key,
          role: "抗がん薬",
          drugs: [{ key: "ETP", drugCode: "INJ-ETP", short: "ETP", basis: "mg/m²", value: 80, reducible: true, roundMg: 10, roundNote: ROUND_10, source: [S.jcog9702, S.etpInsert] }],
          solvent: { drugCode: "INJ-NS500", ml: 500 },
          route: "点滴静注",
          minutes: 60,
          at: x.at,
          days: [...x.days],
          admin: {
            text: "100mg あたり 250mL 以上の生理食塩液等の輸液に溶かし、30〜60分かけてゆっくり点滴静注。DEHP を含むポリ塩化ビニル製の点滴セットは使わない",
            source: S.etpInsert,
            solvents: ["INJ-NS500"],
            minMlPer100mg: 250,
            minMinutes: 30,
            maxMinutes: 60,
          },
        }),
      ),
      {
        key: "dex23",
        role: "前投薬",
        drugs: [
          fixed("DEX23", "INJ-DEX66", "デキサメタゾン", 3.3, [S.antiemetic], 1.65, ROUND_DEX, "day2・3 の DEX（ガイドライン Fig. 1：経口 4mg ＝ 静注 3.3mg、任意）。エトポシドを連日投与するので、連日の制吐（CQ9、推奨の強さ1）として入れています。"),
        ],
        solvent: NS100,
        route: "点滴静注",
        minutes: 15,
        at: 0,
        days: [2, 3],
      },
    ],
    oral: [],
    notes: [
      { text: "量は JCOG 9702（カルボプラチン AUC 5 day1 ＋ エトポシド 80mg/m² day1〜3、3〜4週ごと4コースまで）によります。", source: S.jcog9702 },
      { text: "JCOG 9702 は 24時間 Ccr を Calvert 式の GFR として使っています。この病院（架空）は Cockcroft-Gault 式の推定値を使います。", source: S.jcog9702 },
      { text: "JCOG 9702 では day4 以降の G-CSF の予防投与が推奨されていました（使ったかは主治医の判断）。この欄の下書きには入りません。", source: S.jcog9702 },
      { text: "エトポシド添付文書（肺小細胞癌）は 1日量 60〜100mg/m² を5日間連続、3週間休薬。day1〜3 の 80mg/m² は JCOG 9702 によります。", source: S.etpInsert },
      { text: "カルボプラチン添付文書の用量は 1日1回 300〜400mg/m²（少なくとも4週間休薬）で、AUC での量は載っていません。", source: S.cbdcaInsert },
      { text: "カルボプラチン（AUC≥4）を含むレジメンは、NK1受容体拮抗薬＋5-HT3受容体拮抗薬＋デキサメタゾンの3剤（CQ3、推奨の強さ1）。", source: S.antiemetic },
    ],
    sources: [S.jcog9702],
  },
];

export function findRegimen(code: string): Regimen | undefined {
  return REGIMENS.find((r) => r.code === code);
}

/** 減量率 the doctor can choose for a 抗がん薬 (%). */
export const REDUCTIONS = [0, 10, 20, 25] as const;

// ---------------------------------------------------------------------------
// Calculations (each returns the formula it used)
// ---------------------------------------------------------------------------

export interface Body {
  sex: "男" | "女";
  age: number;
  heightCm?: number;
  weightKg?: number;
  /** Latest serum creatinine (mg/dL) from the chart. */
  cre: number | null;
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const num = (n: number) => String(round(n, 2));
const mg = (n: number) => `${num(n)}mg`;

/** The fictional hospital uses the DuBois formula, rounded to 0.01 m². */
export const BSA_RULE = {
  name: "DuBois 式",
  text: "体表面積（m²）= 0.007184 × 体重（kg）^0.425 × 身長（cm）^0.725。小数第2位に四捨五入して使う",
  source: SOURCES.dubois,
  rounding: HOSPITAL_RULE,
};

export function bsaDuBois(heightCm: number, weightKg: number): { bsa: number; formula: string } {
  const bsa = round(0.007184 * weightKg ** 0.425 * heightCm ** 0.725, 2);
  return { bsa, formula: `0.007184 × ${num(weightKg)}kg^0.425 × ${num(heightCm)}cm^0.725 = ${bsa.toFixed(2)}m²` };
}

/** GFR for the Calvert formula: Cockcroft-Gault (actual weight, Cre as measured), capped at 125 mL/min (FDA). */
export const GFR_RULE = {
  text: "Calvert 式の GFR には Cockcroft-Gault 式の推定 CCr（実体重、Cre は測った値のまま、小数第1位）を使う",
  source: SOURCES.cg,
  capMlMin: 125,
  capText: "GFR は 125mL/分を上限にする（最大量 = AUC × 150）",
  capSource: SOURCES.fdaGfr,
};

export interface GfrCalc {
  /** Estimated CCr (mL/min, 0.1). */
  value: number;
  /** What goes into the Calvert formula (capped). */
  used: number;
  capped: boolean;
  formula: string;
}

export function gfrForCalvert(b: Body): GfrCalc | null {
  if (!b.weightKg || b.cre === null || !(b.cre > 0)) return null;
  const value = round(cockcroftGault(b.age, b.weightKg, b.cre, b.sex), 1);
  const used = Math.min(value, GFR_RULE.capMlMin);
  return {
    value,
    used,
    capped: value > GFR_RULE.capMlMin,
    formula: `(140 − ${b.age}歳) × ${num(b.weightKg)}kg ÷ (72 × Cre ${num(b.cre)})${b.sex === "女" ? " × 0.85" : ""} = ${value}mL/分`,
  };
}

/** Calvert: dose (mg) = AUC × (GFR + 25). */
export function calvertDose(auc: number, gfr: number): { dose: number; formula: string } {
  const dose = round(auc * (gfr + 25), 1);
  return { dose, formula: `AUC ${num(auc)} × (GFR ${num(gfr)} + 25) = ${mg(dose)}` };
}

/** Round to the nearest multiple of the unit (0 = no rounding). */
export function roundToUnit(x: number, unit: number): number {
  if (!unit) return round(x, 2);
  return round(Math.round(round(x / unit, 6)) * unit, 2);
}

export type WarnLevel = "stop" | "warn" | "info";
export interface Warn {
  level: WarnLevel;
  text: string;
  source?: Source;
}

export interface DoseLine {
  rp: RegimenRp;
  drug: RegimenDrug;
  /** "200mg/m²", "AUC 6", "20mg（固定）". */
  base: string;
  /** The main formula (base × body = raw), for the order's comment. */
  calc: string | null;
  /** Calculated before any reduction. */
  raw: number | null;
  reduction: number | null;
  reduced: number | null;
  rounded: number | null;
  final: number | null;
  /** The formulas, in order. */
  steps: string[];
  warnings: Warn[];
}

function baseText(d: RegimenDrug): string {
  if (d.basis === "AUC") return `AUC ${num(d.value)}`;
  if (d.basis === "固定") return `${mg(d.value)}（固定）`;
  return `${num(d.value)}${d.basis}`;
}

/** One drug of one day: base × body → raw → 減量 → まるめ → 上限 → final, with every formula. */
export function doseLine(rp: RegimenRp, drug: RegimenDrug, body: Body, reduction: number | null | undefined): DoseLine {
  const line: DoseLine = { rp, drug, base: baseText(drug), calc: null, raw: null, reduction: null, reduced: null, rounded: null, final: null, steps: [], warnings: [] };
  const w = line.warnings;
  if (drug.basis === "mg/m²") {
    const miss = [!body.heightCm && "身長", !body.weightKg && "体重"].filter(Boolean);
    if (miss.length) {
      w.push({ level: "stop", text: `${miss.join("と")}がカルテにないため、体表面積を計算できません（${drug.short} は計算しません）。` });
      return line;
    }
    const b = bsaDuBois(body.heightCm!, body.weightKg!);
    line.raw = round(drug.value * b.bsa, 1);
    line.calc = `${num(drug.value)}mg/m² × ${b.bsa.toFixed(2)}m² = ${mg(line.raw)}`;
    line.steps.push(`体表面積（DuBois）${b.formula}`, line.calc);
  } else if (drug.basis === "mg/kg") {
    if (!body.weightKg) {
      w.push({ level: "stop", text: `体重がカルテにないため、${drug.short} を計算できません。` });
      return line;
    }
    line.raw = round(drug.value * body.weightKg, 1);
    line.calc = `${num(drug.value)}mg/kg × ${num(body.weightKg)}kg = ${mg(line.raw)}`;
    line.steps.push(line.calc);
  } else if (drug.basis === "AUC") {
    const g = gfrForCalvert(body);
    if (!g) {
      const miss = [!body.weightKg && "体重", !(body.cre !== null && body.cre > 0) && "Cre"].filter(Boolean);
      w.push({ level: "stop", text: `${miss.join("と")}がカルテにないため、GFR を推定できず、${drug.short} を計算できません。` });
      return line;
    }
    const c = calvertDose(drug.value, g.used);
    line.raw = c.dose;
    line.steps.push(`CCr（Cockcroft-Gault）${g.formula}`);
    if (g.capped) {
      line.steps.push(`GFR ${g.value} → 上限 ${GFR_RULE.capMlMin}mL/分`);
      w.push({ level: "warn", text: `推定 GFR ${g.value}mL/分を上限の ${GFR_RULE.capMlMin}mL/分にして計算しました（最大量 AUC ${num(drug.value)} × 150 = ${mg(drug.value * 150)}）。`, source: GFR_RULE.capSource });
    }
    line.calc = c.formula;
    line.steps.push(`Calvert：${c.formula}`);
  } else {
    line.raw = drug.value;
    line.calc = `${mg(drug.value)}（固定量）`;
    line.steps.push(line.calc);
  }

  const raw = line.raw!;
  if (drug.reducible) {
    if (reduction === null || reduction === undefined) {
      w.push({ level: "stop", text: `${drug.short} の減量率を選んでください（0% も選びます）。` });
      return line;
    }
    line.reduction = reduction;
    line.reduced = round((raw * (100 - reduction)) / 100, 1);
    line.steps.push(reduction ? `減量 ${reduction}%：${mg(raw)} × ${100 - reduction}% = ${mg(line.reduced)}` : "減量なし（0%）");
  } else {
    line.reduced = raw;
  }

  line.rounded = roundToUnit(line.reduced, drug.roundMg);
  if (drug.roundMg) line.steps.push(`まるめ（${num(drug.roundMg)}mg 単位）：${mg(line.reduced)} → ${mg(line.rounded)}`);

  line.final = line.rounded;
  if (drug.capMg && line.rounded > drug.capMg.mg) {
    line.final = drug.capMg.mg;
    line.steps.push(`上限 ${mg(drug.capMg.mg)}：${mg(line.rounded)} → ${mg(line.final)}`);
    w.push({ level: "warn", text: `1回の上限 ${mg(drug.capMg.mg)} にしました（計算値 ${mg(line.rounded)}）。`, source: drug.capMg.source });
  }

  // The final dose should differ from the calculated one only by the rounding; say why when it does not.
  const off = Math.abs(line.final - raw);
  if (off > drug.roundMg / 2 + 0.005) {
    const why = [line.reduction ? `減量 ${line.reduction}%` : "", line.final !== line.rounded ? "上限" : ""].filter(Boolean).join("・");
    w.push({ level: line.final !== line.rounded ? "warn" : "info", text: `最終量 ${mg(line.final)} は計算値 ${mg(raw)} とまるめの幅を超えて違います（${why || "理由不明"}）。` });
  }
  return line;
}

export interface RpCheck {
  rpKey: string;
  warn: Warn;
}

export interface RegimenPlan {
  regimen: Regimen;
  day: number;
  /** The Rps of the day, in order of administration. */
  rps: RegimenRp[];
  lines: DoseLine[];
  checks: RpCheck[];
  bsa: { bsa: number; formula: string } | null;
  gfr: GfrCalc | null;
  /** What keeps the plan from becoming drafts. */
  missing: string[];
  ready: boolean;
}

/** Rps of one day, in order of administration. */
export function rpsOfDay(r: Regimen, day: number): RegimenRp[] {
  return r.rps.filter((x) => x.days.includes(day)).sort((a, b) => a.at - b.at);
}

function targetOf(rps: RegimenRp[], key: string): RegimenRp | undefined {
  return key === "first-chemo" ? rps.find((x) => x.role === "抗がん薬") : rps.find((x) => x.key === key);
}

const label = (rp: RegimenRp) => rp.drugs.map((d) => d.short).join("・");

/** The insert's rules for solvent, time and timing, checked against this day's doses. */
function rpChecks(rps: RegimenRp[], lines: DoseLine[]): RpCheck[] {
  const out: RpCheck[] = [];
  for (const rp of rps) {
    const a = rp.admin;
    if (a) {
      const ml = rp.solvent?.ml ?? 0;
      const bad: string[] = [];
      if (a.solvents && (!rp.solvent || !a.solvents.includes(rp.solvent.drugCode))) bad.push("溶媒の種類");
      if (a.exactMl !== undefined && ml !== a.exactMl) bad.push(`溶媒 ${ml}mL（${a.exactMl}mL）`);
      if (a.minMl !== undefined && ml < a.minMl) bad.push(`溶媒 ${ml}mL（${a.minMl}mL 以上）`);
      if (a.maxMl !== undefined && ml > a.maxMl) bad.push(`溶媒 ${ml}mL（${a.maxMl}mL 以下）`);
      if (a.minMlPer100mg !== undefined) {
        const dose = lines.find((l) => l.rp === rp)?.final;
        if (dose !== null && dose !== undefined) {
          const need = round((dose / 100) * a.minMlPer100mg, 1);
          if (ml < need) bad.push(`溶媒 ${ml}mL（${mg(dose)} には ${dose} ÷ 100 × ${a.minMlPer100mg} = ${num(need)}mL 以上）`);
        }
      }
      const min = rp.minutes ?? 0;
      if (a.minMinutes !== undefined && min < a.minMinutes) bad.push(`時間 ${min}分（${a.minMinutes}分以上）`);
      if (a.maxMinutes !== undefined && min > a.maxMinutes) bad.push(`時間 ${min}分（${a.maxMinutes}分以下）`);
      out.push(
        bad.length
          ? { rpKey: rp.key, warn: { level: "warn", text: `${label(rp)}：添付文書の投与方法と合いません：${bad.join("、")}。添付文書：${a.text}`, source: a.source } }
          : { rpKey: rp.key, warn: { level: "info", text: `${label(rp)}：${a.text}`, source: a.source } },
      );
    }
    const t = rp.timing;
    const target = t ? targetOf(rps, t.target) : undefined;
    if (t && target) {
      const end = rp.at + (rp.minutes ?? 0);
      const ok =
        (t.endsBeforeMin === undefined || end <= target.at - t.endsBeforeMin) && (t.startsBeforeMin === undefined || target.at - rp.at === t.startsBeforeMin);
      out.push({
        rpKey: rp.key,
        warn: { level: ok ? "info" : "warn", text: `${label(rp)}：${t.text}（${label(target)}の ${target.at - rp.at}分前に開始${rp.minutes ? `・${target.at - end}分前に終了` : ""}）${ok ? "" : "。添付文書の時刻と合いません"}`, source: t.source },
      });
    }
  }
  return out;
}

/**
 * Work out one day of a regimen for this patient. `reductions` holds the doctor's 減量率 by drug key
 * (nothing is assumed: a 抗がん薬 without a chosen rate is not calculated to the end).
 */
export function planRegimen(regimen: Regimen, day: number, body: Body, reductions: Record<string, number | null | undefined>): RegimenPlan {
  const rps = rpsOfDay(regimen, day);
  const lines = rps.flatMap((rp) => rp.drugs.map((d) => doseLine(rp, d, body, reductions[d.key])));
  const missing = [...new Set(lines.flatMap((l) => l.warnings.filter((w) => w.level === "stop").map((w) => w.text)))];
  if (!rps.length) missing.push(`day${day} はこのレジメンにありません。`);
  return {
    regimen,
    day,
    rps,
    lines,
    checks: rpChecks(rps, lines),
    bsa: body.heightCm && body.weightKg ? bsaDuBois(body.heightCm, body.weightKg) : null,
    gfr: gfrForCalvert(body),
    missing,
    ready: missing.length === 0 && lines.every((l) => l.final !== null),
  };
}

/** One line per drug for the order's comment: the formula to the final dose. */
export function doseSummary(l: DoseLine): string {
  if (l.final === null || l.calc === null) return `${l.drug.short} 未計算`;
  const red = l.drug.reducible ? (l.reduction ? ` → 減量${l.reduction}%` : " → 減量なし") : "";
  const cap = l.final !== l.rounded ? ` → 上限` : "";
  return `${l.drug.short} ${l.calc}${red}${cap} → ${mg(l.final)}`;
}

/** Clock time after a number of minutes, carried into the next day when it passes midnight. */
export function addMinutes(start: { day: DayOffset; time: string }, minutes: number): { day: DayOffset; time: string } {
  const [h, m] = start.time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const day = start.day + Math.floor(total / 1440);
  const t = ((total % 1440) + 1440) % 1440;
  return { day, time: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` };
}

/**
 * One day of a cycle as injection drafts, one per Rp in order of administration: the drugs at their
 * final dose, the solvent as the next item (混注), given once at the time worked out from the start.
 * Empty when the plan is not ready. The drafts then go through the same checks as any other.
 */
export function regimenDrafts(plan: RegimenPlan, opts: { course: number; start: { day: DayOffset; time: string }; newId: () => string }): InjectionDraft[] {
  if (!plan.ready) return [];
  const head = `レジメン ${plan.regimen.name} ${opts.course}コース目 day${plan.day}`;
  return plan.rps.map((rp) => {
    const lines = plan.lines.filter((l) => l.rp === rp);
    const items = lines.map((l) => {
      const d = findDrug(l.drug.drugCode)!;
      return { drugCode: l.drug.drugCode, said: d.aliases[0] ?? d.name, amount: l.final!, unit: "mg" };
    });
    if (rp.solvent) {
      const s = findDrug(rp.solvent.drugCode)!;
      items.push({ drugCode: rp.solvent.drugCode, said: s.aliases[0] ?? s.name, amount: rp.solvent.ml, unit: "mL" });
    }
    const drip = rp.route === "点滴静注";
    return {
      id: opts.newId(),
      origin: "manual",
      sourceText: `（${head}）`,
      comment: `${head}　${rp.role}　計算：${lines.map(doseSummary).join("／")}`,
      kind: "injection",
      items,
      route: rp.route,
      schedule: { kind: "once" },
      infusionMinutes: drip ? rp.minutes : null,
      infusionScope: drip ? "per_dose" : null,
      rateMlPerH: null,
      prefer: null,
      start: addMinutes(opts.start, rp.at),
      days: null,
      duplicate: null,
    };
  });
}
