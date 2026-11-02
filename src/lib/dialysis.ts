// The dialysis unit (透析室) of the FICTIONAL hospital: patients, their dialysis conditions
// (項目は厚生労働科学研究「透析情報標準項目」に沿う), today's sessions, and the arithmetic and
// fee rules (J038 人工腎臓、令和8年度) worked out in code.

import type { Sex } from "./types";

export type Course = "午前" | "午後";
export type Weekdays = "月水金" | "火木土";

export interface HdConditions {
  method: "HD" | "オンラインHDF";
  minutes: number;
  /** 血流量 mL/分 */
  qb: number;
  dialyzer: string;
  /** ドライウェイト kg */
  dw: number;
  dialysate: string;
  heparin: { initial: number; hourly: number };
  /** 除水速度の上限 mL/kg/時、除水量の上限 kg（医師の指示） */
  ufRateMax: number;
  ufMax: number;
  /** 透析で使う薬（ESA など）. */
  drugs: string[];
  access: string;
  needle: string;
}

export interface HdChange {
  at: string;
  by: string;
  text: string;
}

export interface HdPatient {
  id: string;
  name: string;
  sex: Sex;
  age: number;
  /** 外来 or the ward the patient is in. */
  status: "外来" | "入院";
  weekdays: Weekdays;
  course: Course;
  bed: number;
  /** Day the patient started dialysis (offset from today). */
  startedOn: number;
  /** Sessions already done this month before today (fictional). */
  doneThisMonth: number;
  conditions: HdConditions;
  history: HdChange[];
}

export interface HdSession {
  preWeight?: number;
  /** 開始（血液を回路に導き入れた時刻）and 終了（返血を終えた時刻）, "HH:MM". */
  start?: string;
  end?: string;
  /** ESA etc. given in this session. */
  drugsGiven: string[];
}

const base = (o: Partial<HdConditions>): HdConditions => ({
  method: "HD",
  minutes: 240,
  qb: 200,
  dialyzer: "PES-15（架空の規格）",
  dw: 50,
  dialysate: "重炭酸透析液",
  heparin: { initial: 1000, hourly: 500 },
  ufRateMax: 15,
  ufMax: 3.5,
  drugs: [],
  access: "左前腕 AVF",
  needle: "16G",
  ...o,
});

/** FICTIONAL dialysis patients. Today (in the demo) is a 火木土 day. */
export const HD_PATIENTS: HdPatient[] = [
  {
    id: "hd-1",
    name: "井上 正",
    sex: "男",
    age: 67,
    status: "外来",
    weekdays: "火木土",
    course: "午前",
    bed: 1,
    startedOn: -1460,
    doneThisMonth: 0,
    conditions: base({ dw: 58.5, qb: 220, drugs: ["ダルベポエチン アルファ 20μg（火）"] }),
    history: [{ at: "10/27", by: "山本（専攻医）", text: "DW 59.0 → 58.5kg" }],
  },
  {
    id: "hd-2",
    name: "石井 久子",
    sex: "女",
    age: 72,
    status: "外来",
    weekdays: "火木土",
    course: "午前",
    bed: 2,
    startedOn: -2900,
    doneThisMonth: 0,
    conditions: base({ dw: 44.0, qb: 180, ufMax: 2.5, access: "右前腕 AVF", needle: "17G" }),
    history: [],
  },
  {
    id: "hd-3",
    name: "山口 隆",
    sex: "男",
    age: 59,
    status: "外来",
    weekdays: "火木土",
    course: "午前",
    bed: 3,
    startedOn: -900,
    doneThisMonth: 0,
    conditions: base({ method: "オンラインHDF", minutes: 270, dw: 66.0, qb: 250, dialyzer: "ABH-21（架空の規格）" }),
    history: [],
  },
  {
    id: "hd-4",
    name: "斎藤 和夫",
    sex: "男",
    age: 81,
    status: "外来",
    weekdays: "火木土",
    course: "午後",
    bed: 1,
    // 導入して2週間（導入期）
    startedOn: -14,
    doneThisMonth: 0,
    conditions: base({ minutes: 210, qb: 150, dw: 52.0, ufMax: 2.0, ufRateMax: 12, access: "左前腕 AVF（作成1か月）", needle: "17G" }),
    history: [{ at: "10/20", by: "山本（専攻医）", text: "導入。時間 3.5時間、血流量 150 から" }],
  },
  {
    id: "hd-5",
    name: "岡田 幸子",
    sex: "女",
    age: 64,
    status: "外来",
    weekdays: "火木土",
    course: "午後",
    bed: 2,
    startedOn: -2200,
    doneThisMonth: 0,
    conditions: base({ dw: 48.5, drugs: ["ダルベポエチン アルファ 10μg（火）"] }),
    history: [],
  },
  {
    id: "hd-6",
    name: "清水 健",
    sex: "男",
    age: 70,
    status: "外来",
    weekdays: "月水金",
    course: "午前",
    bed: 1,
    startedOn: -1800,
    doneThisMonth: 1,
    conditions: base({ dw: 61.0 }),
    history: [],
  },
];

/** Today's sessions already under way in the fictional unit (relative to the demo morning). */
export const HD_SESSIONS_START: Record<string, HdSession> = {
  "hd-1": { preWeight: 61.2, start: "08:40", drugsGiven: [] },
  "hd-2": { preWeight: 46.1, drugsGiven: [] },
};

export function runsOn(p: HdPatient, dow: number): boolean {
  return p.weekdays === "月水金" ? [1, 3, 5].includes(dow) : [2, 4, 6].includes(dow);
}

// ---------------------------------------------------------------------------
// 除水の計算（式を画面に出す）
// ---------------------------------------------------------------------------

export interface UfPlan {
  /** kg (= L) to remove */
  uf: number;
  /** mL/kg/時 */
  rate: number;
  formula: string;
  rateFormula: string;
  problems: string[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function ufPlan(pre: number, c: HdConditions): UfPlan {
  const uf = r1(pre - c.dw);
  const hours = c.minutes / 60;
  const rate = r1((uf * 1000) / hours / c.dw);
  const problems: string[] = [];
  if (uf < 0) problems.push(`透析前の体重が DW より ${-uf}kg 少ないです。`);
  if (uf > c.ufMax) problems.push(`除水量 ${uf}kg が、指示の上限 ${c.ufMax}kg を超えます。`);
  if (rate > c.ufRateMax) problems.push(`除水速度 ${rate}mL/kg/時 が、指示の上限 ${c.ufRateMax}mL/kg/時 を超えます。`);
  return {
    uf,
    rate,
    formula: `${pre}kg − DW ${c.dw}kg = ${uf}kg`,
    rateFormula: `${Math.round(uf * 1000).toLocaleString("ja-JP")}mL ÷ ${r1(hours)}時間 ÷ ${c.dw}kg = ${rate}mL/kg/時`,
    problems,
  };
}

// ---------------------------------------------------------------------------
// J038 人工腎臓（令和8年度）. The fictional hospital (on the filings of the model hospital) has
// not filed for 慢性維持透析１・２ → 慢性維持透析３. It has filed 透析液水質確保加算・慢性維持透析濾過加算,
// 導入期加算１, 腎代替療法診療体制充実加算.
// ---------------------------------------------------------------------------

export interface HdFeeLine {
  code: string;
  name: string;
  points: number;
  why: string;
}

const minutesBetween = (a: string, b: string) => {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  let d = bh * 60 + bm - (ah * 60 + am);
  if (d < 0) d += 1440; // 夜間に始めて0時をまたいだ（注7：1日として算定）
  return d;
};

export function hdFee(p: HdPatient, s: HdSession, holiday: boolean): { lines: HdFeeLine[]; total: number; notes: string[]; minutes: number | null } {
  const notes: string[] = [];
  if (!s.start || !s.end) return { lines: [], total: 0, notes: ["開始と終了（返血を終えた時刻）が入ると計算します。"], minutes: null };
  const min = minutesBetween(s.start, s.end);
  const lines: HdFeeLine[] = [];
  const induction = p.startedOn > -31; // 導入後1月
  if (induction) {
    lines.push({ code: "140007710", name: "人工腎臓（その他）", points: 1560, why: "透析導入期（導入後1月）は「4 その他の場合」（通知 J038(8)イ）" });
    lines.push({ code: "140058770", name: "導入期加算１", points: 200, why: "導入期1月に限り1日につき（注2、届出あり）" });
  } else {
    const [code, pts, band] = min < 240 ? ["140058410", 1776, "4時間未満"] : min < 300 ? ["140058510", 1931, "4時間以上5時間未満"] : ["140058610", 2061, "5時間以上"];
    lines.push({ code, name: `人工腎臓（慢性維持透析３）（${band}）`, points: pts, why: `時間 ${Math.floor(min / 60)}時間${min % 60}分（${s.start}〜${s.end}。回路に血液を導き入れてから返し終えるまで：通知 J038(3)）` });
    if (p.conditions.method === "オンラインHDF") lines.push({ code: "140059170", name: "慢性維持透析濾過加算", points: 50, why: "慢性維持透析濾過（複雑なもの）（注13、届出あり）" });
  }
  lines.push({ code: "140058970", name: "透析液水質確保加算", points: 10, why: "注9（届出あり）" });
  lines.push({ code: "140927770", name: "腎代替療法診療体制充実加算", points: 20, why: "注15（届出あり）" });
  if (p.status === "外来") {
    const [sh] = s.start.split(":").map(Number);
    const [eh] = s.end.split(":").map(Number);
    if (holiday || sh >= 17 || eh >= 21) lines.push({ code: "140007910", name: "時間外・休日加算", points: 380, why: holiday ? "休日に行った（注1、入院中の患者以外）" : "午後5時以降の開始か午後9時以降の終了（注1）" });
  }
  if (min >= 360) notes.push("6時間以上：長時間加算（150点）は「通常の人工腎臓では管理が困難な兆候」がある患者だけ。医師が判断します（注11）。");
  if (s.drugsGiven.length || p.conditions.drugs.length) notes.push("ESA（ダルベポエチンなど）・透析液・血液凝固阻止剤・生理食塩水は所定点数に含まれ、別に算定しません（注6、通知 J038(7)ア）。");
  const count = p.doneThisMonth + 1;
  if (count > 14) notes.push(`今月 ${count}回目です。人工腎臓は月14回まで（注8）。`);
  else notes.push(`今月 ${count}回目（月14回まで、注8）。`);
  return { lines, total: lines.reduce((a, l) => a + l.points, 0), notes, minutes: min };
}

// ---------------------------------------------------------------------------
// 条件の変更（口述 → 項目 → 医師が確定）
// ---------------------------------------------------------------------------

export interface HdChangeRequest {
  dw?: number;
  minutes?: number;
  qb?: number;
  method?: "HD" | "オンラインHDF";
  dialyzer?: string;
  heparinInitial?: number;
  heparinHourly?: number;
  ufRateMax?: number;
  ufMax?: number;
  drugAdd?: string;
  drugStop?: string;
  comment?: string;
}

export interface HdDiff {
  label: string;
  before: string;
  after: string;
}

const hm = (m: number) => (m % 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m / 60}時間`);

/** What would change, item by item (only what was said). */
export function hdDiff(c: HdConditions, r: HdChangeRequest): HdDiff[] {
  const out: HdDiff[] = [];
  const push = (label: string, before: string, after: string) => before !== after && out.push({ label, before, after });
  if (r.dw !== undefined) push("DW", `${c.dw}kg`, `${r.dw}kg`);
  if (r.minutes !== undefined) push("時間", hm(c.minutes), hm(r.minutes));
  if (r.qb !== undefined) push("血流量", `${c.qb}mL/分`, `${r.qb}mL/分`);
  if (r.method) push("方法", c.method, r.method);
  if (r.dialyzer) push("ダイアライザ", c.dialyzer, r.dialyzer);
  if (r.heparinInitial !== undefined) push("ヘパリン初回", `${c.heparin.initial}単位`, `${r.heparinInitial}単位`);
  if (r.heparinHourly !== undefined) push("ヘパリン持続", `${c.heparin.hourly}単位/時`, `${r.heparinHourly}単位/時`);
  if (r.ufRateMax !== undefined) push("除水速度の上限", `${c.ufRateMax}mL/kg/時`, `${r.ufRateMax}mL/kg/時`);
  if (r.ufMax !== undefined) push("除水量の上限", `${c.ufMax}kg`, `${r.ufMax}kg`);
  if (r.drugAdd) push("透析で使う薬（追加）", c.drugs.join("、") || "なし", [...c.drugs, r.drugAdd].join("、"));
  if (r.drugStop) push("透析で使う薬（中止）", c.drugs.join("、") || "なし", c.drugs.filter((d) => !d.includes(r.drugStop!.replace(/\s/g, "").slice(0, 4))).join("、") || "なし");
  return out;
}

export function applyHdChange(c: HdConditions, r: HdChangeRequest): HdConditions {
  return {
    ...c,
    dw: r.dw ?? c.dw,
    minutes: r.minutes ?? c.minutes,
    qb: r.qb ?? c.qb,
    method: r.method ?? c.method,
    dialyzer: r.dialyzer ?? c.dialyzer,
    heparin: { initial: r.heparinInitial ?? c.heparin.initial, hourly: r.heparinHourly ?? c.heparin.hourly },
    ufRateMax: r.ufRateMax ?? c.ufRateMax,
    ufMax: r.ufMax ?? c.ufMax,
    drugs: [...c.drugs.filter((d) => !r.drugStop || !d.includes(r.drugStop.replace(/\s/g, "").slice(0, 4))), ...(r.drugAdd ? [r.drugAdd] : [])],
  };
}
