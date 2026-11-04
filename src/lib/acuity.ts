// 一般病棟用の重症度、医療・看護必要度（令和8年度改定、令和8年6月1日適用）. The fictional ward uses
// 必要度Ⅰ for 急性期一般入院料４. A and C items are judged by code from the orders (the "records");
// B items are entered by the nurse. Item points, days and the 該当 rule follow the 告示・通知・評価の
// 手引き (see docs/decisions.md and ~/hackathon/research). Nothing here is decided by AI.

import { abs, orderInterval } from "./flowsheet";
import { DRUGS } from "./master";
import { procEvents, procInterval } from "./proc-timing";
import type { InjectionOrder, OrderEntry, PrescriptionOrder, ProcedureOrder } from "./types";

// ---------- B items (nurse) ----------
export type BKey = "b8" | "b9" | "b10" | "b11" | "b12" | "b13" | "b14";
export interface BItem {
  key: BKey;
  no: string;
  name: string;
  /** Labels of the patient's state, with their points. */
  states: { label: string; points: number }[];
  /** 状態 × 介助の実施 (B9–B12 only). */
  assist: boolean;
}
export const B_ITEMS: BItem[] = [
  { key: "b8", no: "B8", name: "寝返り", states: [{ label: "できる", points: 0 }, { label: "何かにつかまればできる", points: 1 }, { label: "できない", points: 2 }], assist: false },
  { key: "b9", no: "B9", name: "移乗", states: [{ label: "自立", points: 0 }, { label: "一部介助", points: 1 }, { label: "全介助", points: 2 }], assist: true },
  { key: "b10", no: "B10", name: "口腔清潔", states: [{ label: "自立", points: 0 }, { label: "要介助", points: 1 }], assist: true },
  { key: "b11", no: "B11", name: "食事摂取", states: [{ label: "自立", points: 0 }, { label: "一部介助", points: 1 }, { label: "全介助", points: 2 }], assist: true },
  { key: "b12", no: "B12", name: "衣服の着脱", states: [{ label: "自立", points: 0 }, { label: "一部介助", points: 1 }, { label: "全介助", points: 2 }], assist: true },
  { key: "b13", no: "B13", name: "診療・療養上の指示が通じる", states: [{ label: "はい", points: 0 }, { label: "いいえ", points: 1 }], assist: false },
  { key: "b14", no: "B14", name: "危険行動（過去1週間）", states: [{ label: "ない", points: 0 }, { label: "ある", points: 2 }], assist: false },
];

/** One B evaluation: state points per item, and for B9–B12 whether help was given (1) or not (0). */
export interface BRecord {
  patientId: string;
  day: number;
  state: Record<BKey, number>;
  assist: Partial<Record<BKey, 0 | 1>>;
  by: string;
}

export function bScore(r: Pick<BRecord, "state" | "assist"> | undefined): number {
  if (!r) return 0;
  return B_ITEMS.reduce((s, it) => s + (it.assist ? r.state[it.key] * (r.assist[it.key] ?? 0) : r.state[it.key]), 0);
}

/** The B evaluation for a day: that day's, else the latest before it (R8: 測定しない日は直近の評価), else none (最も自立度の高い評価 = 0). */
export const bFor = (records: BRecord[], patientId: string, day: number) =>
  records.filter((r) => r.patientId === patientId && r.day <= day).sort((a, b) => a.day - b.day).at(-1);

/** R8: days that need a B measurement — hospital days 1–4, then at least once in every 7 days. */
export function bNeeded(records: BRecord[], patientId: string, admittedOn: number, day: number): boolean {
  if (day - admittedOn + 1 <= 4) return true;
  return !records.some((r) => r.patientId === patientId && r.day <= day && r.day > day - 7);
}

// ---------- A and C items (code, from the orders) ----------
export interface Hit {
  no: string;
  name: string;
  points: number;
  why: string;
}

/** Injection drugs excluded from A3 (別表2: 生理食塩液・輸液 など) — here, the master's 輸液. */
const a3Counts = (code: string) => DRUGS.find((d) => d.code === code)?.kind !== "輸液";

/** A6 drugs by item (①③⑦⑧⑨ = 3 points; ②④⑥ = 2): the fictional master's 抗がん薬 (注射剤) under ①. */
export const A6_DRUGS: Record<string, { no: string; points: 2 | 3; name: string }> = {
  ...Object.fromEntries(DRUGS.filter((d) => d.chemo).map((d) => [d.code, { no: "①", points: 3 as const, name: "抗悪性腫瘍剤の使用（注射剤のみ）" }])),
  // 保医発0305第7号 別紙7 別表1: モルヒネ塩酸塩注射液１０ｍｇ「シオノギ」（620009277）は ③.
  "INJ-MOR10": { no: "③", points: 3, name: "麻薬の使用（注射剤のみ）" },
};

/** Oral 麻薬 under ④ (2 points): 別紙7 別表1 lists オキシコンチンＴＲ錠５ｍｇ（622576301）. Counted on the days the order runs. */
export const A6_ORAL: Record<string, { no: string; points: 2 | 3; name: string }> = {
  "ORAL-OXC5": { no: "④", points: 2, name: "麻薬の内服・貼付、坐剤の管理" },
};

const overlaps = (iv: { from: number; to: number | null }, day: number) => iv.from < (day + 1) * 1440 && (iv.to ?? Infinity) > day * 1440;

function injectionDrugsOn(entries: OrderEntry[], day: number, nowAbs: number): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.order.type !== "injection") continue;
    const o = e.order as InjectionOrder;
    if (!overlaps(orderInterval(e, nowAbs), day)) continue;
    for (const it of o.items) if (a3Counts(it.drugCode)) out.add(it.drugCode);
  }
  return out;
}

export interface DayEval {
  day: number;
  a: Hit[];
  c: Hit[];
  aScore: number;
  bScore: number;
  cScore: number;
  /** 急性期一般入院料４（別表7）: A2点以上かつB3点以上／A3点以上／C1点以上. */
  meets: boolean;
  bMeasured: boolean;
}

export interface AcuityContext {
  admittedOn: number;
  /** Arrived by ambulance (A7 必要度Ⅰ: 救急搬送後の入院). */
  ambulance: boolean;
  nowAbs: number;
}

export function evaluateDay(entries: OrderEntry[], records: BRecord[], patientId: string, day: number, ctx: AcuityContext): DayEval {
  const a: Hit[] = [];
  const c: Hit[] = [];
  const procs = entries.filter((e) => e.order.type === "procedure");
  const has = (code: string, f: (e: OrderEntry) => boolean) => procs.some((e) => (e.order as ProcedureOrder).code === code && f(e));
  const onDay = (e: OrderEntry) => {
    const pr = e.order as ProcedureOrder;
    if (pr.schedule.kind === "continuous") return overlaps(procInterval(e, ctx.nowAbs), day);
    if (pr.schedule.kind === "prn") return false;
    return procEvents(e, day * 1440, (day + 1) * 1440, ctx.nowAbs).length > 0;
  };
  // A1 創傷処置（褥瘡の処置を除く）
  if (has("PROC-WOUND", onDay)) a.push({ no: "A1", name: "創傷処置", points: 1, why: "創傷処置のオーダ（その日に実施）" });
  // A2 呼吸ケア（喀痰吸引のみを除く）
  if (has("PROC-O2", onDay)) a.push({ no: "A2", name: "呼吸ケア", points: 1, why: "酸素吸入（喀痰吸引だけの日は含めない）" });
  // A3 注射薬剤3種類以上の管理: first day met in this admission, up to 7 days.
  let firstA3: number | null = null;
  for (let d = ctx.admittedOn; d <= day; d++) if (injectionDrugsOn(entries, d, ctx.nowAbs).size >= 3) {
    firstA3 = d;
    break;
  }
  const drugs = injectionDrugsOn(entries, day, ctx.nowAbs);
  if (firstA3 !== null && day < firstA3 + 7 && drugs.size >= 3)
    a.push({ no: "A3", name: "注射薬剤3種類以上の管理", points: 1, why: `${drugs.size}種類（輸液・生理食塩液は数えない）。初めて該当した日から7日間` });
  // A6 専門的な治療・処置: not added up — 3 points if any of ①③⑦⑧⑨⑪, else 2.
  const oralA6 = entries.filter((e) => e.order.type === "prescription" && A6_ORAL[e.order.drugCode] && overlaps(orderInterval(e, ctx.nowAbs), day)).map((e) => A6_ORAL[(e.order as PrescriptionOrder).drugCode]);
  const a6 = [...new Set([...[...drugs].map((code) => A6_DRUGS[code]), ...oralA6].filter(Boolean))];
  if (a6.length) {
    const pts = a6.some((x) => x.points === 3) ? 3 : 2;
    a.push({ no: "A6", name: "専門的な治療・処置", points: pts, why: a6.map((x) => `${x.no}${x.name}`).join("、") });
  }
  // A7（必要度Ⅰ）救急搬送後の入院: the admission day and the next (2 days).
  if (ctx.ambulance && day >= ctx.admittedOn && day <= ctx.admittedOn + 1) a.push({ no: "A7", name: "救急搬送後の入院", points: 2, why: "救急車で来院して入院（入院日を含めて2日間）" });
  // C21 救命等に係る内科的治療: 中心静脈注射用カテーテル挿入（令和8年追加）, 4 days from the day it was done.
  for (const e of procs) {
    const pr = e.order as ProcedureOrder;
    if (pr.code !== "PROC-CVC" || /PICC/.test(pr.site ?? "")) continue;
    const doneDay = Math.floor(procInterval(e, ctx.nowAbs).from / 1440);
    if (doneDay <= ctx.nowAbs / 1440 && day >= doneDay && day < doneDay + 4) c.push({ no: "C21", name: "救命等に係る内科的治療", points: 1, why: "中心静脈注射用カテーテル挿入（実施日を含めて4日間）" });
  }
  const b = bFor(records, patientId, day);
  const aScore = a.reduce((s, x) => s + x.points, 0);
  const bs = bScore(b);
  const cScore = c.length;
  return { day, a, c, aScore, bScore: bs, cScore, meets: (aScore >= 2 && bs >= 3) || aScore >= 3 || cScore >= 1, bMeasured: !!records.find((r) => r.patientId === patientId && r.day === day) };
}

/** 急性期一般入院料４ の基準（必要度Ⅰ 20%・Ⅱ 19%、割合指数 = 割合 ＋ 救急患者応需係数）. */
export const WARD_STANDARD = { base: "急性期一般入院料４", method: "必要度Ⅰ" as const, threshold: 0.2 };

/** 救急患者応需係数 = 許可病床1床あたりの年間救急搬送受入件数 × 0.005（上限 0.1）. */
export const responseCoefficient = (ambulancePerYear: number, beds: number) => Math.min(0.1, (ambulancePerYear / beds) * 0.005);

/** Fictional: the hospital took 1,340 ambulance patients in the last fiscal year (April–March). */
export const FICTIONAL_AMBULANCE_PER_YEAR = 1340;

/** FICTIONAL: who came by ambulance among the four demo patients. */
export const FICTIONAL_AMBULANCE: Record<string, boolean> = { "90010244": true, "90010260": true };

/** FICTIONAL B evaluations (nurse) from admission. */
const B = (patientId: string, day: number, s: number[], as: (0 | 1)[]): BRecord => ({
  patientId,
  day,
  state: { b8: s[0], b9: s[1], b10: s[2], b11: s[3], b12: s[4], b13: s[5], b14: s[6] },
  assist: { b9: as[0], b10: as[1], b11: as[2], b12: as[3] },
  by: "看護師（架空）",
});
export const INITIAL_B: BRecord[] = [
  // 佐倉：右下腿の痛みで移乗に一部介助
  B("90010231", -3, [0, 1, 0, 0, 1, 0, 0], [1, 0, 0, 1]),
  B("90010231", -1, [0, 1, 0, 0, 0, 0, 0], [1, 0, 0, 0]),
  // 大浦：86歳、誤嚥性肺炎、絶食
  B("90010244", -1, [1, 2, 1, 2, 2, 0, 0], [1, 1, 0, 1]),
  B("90010244", 0, [1, 2, 1, 2, 2, 0, 0], [1, 1, 0, 1]),
  // 北村：心不全、ベッド上安静から歩行へ
  B("90010198", -5, [1, 1, 0, 0, 1, 0, 0], [1, 0, 0, 1]),
  B("90010198", -2, [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0]),
  // 森：腎盂腎炎、自立
  B("90010260", -2, [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0]),
];
