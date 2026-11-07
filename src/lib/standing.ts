// 指示簿（約束指示）: what the doctor allows the nurses to do without asking each time — rest, bathing,
// what to measure, when to call the doctor, and as-needed drugs (発熱時・疼痛時…). The doctor sets
// every item; the code checks the arithmetic (1日量・間隔) and compares the latest vitals with the
// call criteria. Each change is a new version that a nurse takes (指示受け). All data is fictional.

import { effectiveFields } from "./standing-field-end";
import type { CondRule } from "./cond-orders";
import { DRUGS, ORAL_DRUGS, findOralDrug } from "./master";
import type { VitalSign } from "./types";

export const RESTS = ["ベッド上", "室内", "病棟内", "院内フリー", "ベッド上安静", "ベッド上（頭を上げてよい）", "車いす", "病棟内歩行", "院内歩行"] as const;
export const BATHS = ["シャワー", "清拭", "シャワー浴", "入浴"] as const;
export const VITAL_FREQS = ["1日1回", "1日3回", "4時間ごと", "2時間ごと", "1時間ごと"] as const;
export const WEIGHTS = ["毎朝", "週2回", "なし"] as const;
export const IO = ["水分出納（IN/OUT）を測る", "尿量だけ測る", "測らない"] as const;
export const PRN_WHEN = ["発熱時", "疼痛時", "不眠時", "便秘時", "嘔気時", "血圧上昇時"] as const;

export type CallKey = "sbpHigh" | "sbpLow" | "hrHigh" | "hrLow" | "bt" | "spo2" | "rr";

/** Call criteria the doctor can set, with the values offered (the doctor may type another). */
export const CALL_ITEMS: { key: CallKey; label: string; op: "≥" | "≤" | "<"; unit: string; choices: number[]; of: (v: VitalSign) => number | undefined }[] = [
  { key: "sbpHigh", label: "収縮期血圧", op: "≥", unit: "mmHg", choices: [160, 180, 200], of: (v) => v.sbp },
  { key: "sbpLow", label: "収縮期血圧", op: "≤", unit: "mmHg", choices: [80, 90, 100], of: (v) => v.sbp },
  { key: "hrHigh", label: "脈拍", op: "≥", unit: "/分", choices: [120, 130, 140], of: (v) => v.hr },
  { key: "hrLow", label: "脈拍", op: "≤", unit: "/分", choices: [40, 50], of: (v) => v.hr },
  { key: "bt", label: "体温", op: "≥", unit: "℃", choices: [38, 38.5, 39], of: (v) => v.bt },
  { key: "spo2", label: "SpO2", op: "<", unit: "%", choices: [88, 90, 92, 94], of: (v) => v.spo2 },
  { key: "rr", label: "呼吸数", op: "≥", unit: "/分", choices: [25, 30], of: (v) => v.rr },
];

export interface PrnRule {
  id: string;
  when: (typeof PRN_WHEN)[number];
  /** The condition in words, e.g. 「38.5℃以上」. */
  detail: string;
  /** An oral drug (ORAL-…, amount in its unit: 錠) or an injection (INJ-…, amount in mg or mL). */
  drug: { code: string; amount: number; unit: string };
  /** Hours to wait before the next dose. */
  intervalH: number;
  maxPerDay: number;
}

export interface StandingOrders {
  /** Read-only text carried from active blocks for summaries; never inferred as drug doses. */
  blockCallTexts?: string[];
  blockPrnTexts?: string[];
  reason?: string;
  fieldEnds?: Record<string, { day: number; time: string; by: string; reason?: string; kind: "終了" }>;
  /** Last valid day (inclusive). Absent = continues until changed. */
  until?: number;
  rest: (typeof RESTS)[number] | null;
  bath: (typeof BATHS)[number] | null;
  vitals: (typeof VITAL_FREQS)[number] | null;
  weight: (typeof WEIGHTS)[number] | null;
  io: (typeof IO)[number] | null;
  calls: { key: CallKey; value: number }[];
  /** Call when the level of consciousness drops. */
  callConscious: boolean;
  prn: PrnRule[];
  /** 条件付き指示 (cond-orders.ts): applies when a lab or vital value meets the doctor's condition. */
  conds?: CondRule[];
  other: string;
  by: string;
  at: { day: number; time: string };
  /** 指示受け by a nurse. */
  taken?: { by: string; time: string };
}

export const emptyStanding = (by: string, at: { day: number; time: string }): StandingOrders => ({ rest: null, bath: null, vitals: null, weight: null, io: null, calls: [], callConscious: false, prn: [], conds: [], other: "", by, at });

const item = (k: CallKey) => CALL_ITEMS.find((c) => c.key === k)!;
export const callText = (c: { key: CallKey; value: number }) => `${item(c.key).label} ${c.value}${item(c.key).unit}${c.key === "spo2" ? "未満" : c.key.endsWith("Low") ? "以下" : "以上"}`;

export function drugLabel(code: string): string {
  return findOralDrug(code) ? `${findOralDrug(code)!.name}${findOralDrug(code)!.strength}` : (DRUGS.find((d) => d.code === code)?.name ?? code);
}

export const prnText = (r: PrnRule) => `${r.when}${r.detail ? `（${r.detail}）` : ""}：${drugLabel(r.drug.code)} ${r.drug.amount}${r.drug.unit}　${r.intervalH}時間あけて1日${r.maxPerDay}回まで`;

/** The criteria the vital sign meets (code compares; the nurse calls the doctor). */
export function callHits(s: StandingOrders | undefined, v: VitalSign | undefined): string[] {
  if (!s || !v) return [];
  return s.calls.flatMap((c) => {
    const it = item(c.key);
    const x = it.of(v);
    if (x === undefined) return [];
    const hit = it.op === "≥" ? x >= c.value : it.op === "≤" ? x <= c.value : x < c.value;
    return hit ? [`${it.label} ${x}${it.unit}（基準 ${it.op}${c.value}）`] : [];
  });
}

/** Compare only the doctor's numeric call thresholds; absent measurements never match. */
export function drCallMatches(v: VitalSign, s?: StandingOrders): string[] {
  return (s?.calls ?? []).filter((c) => {
    const it = item(c.key), x = it.of(v);
    return x !== undefined && Number.isFinite(x) && (it.op === "≥" ? x >= c.value : it.op === "≤" ? x <= c.value : x < c.value);
  }).map((c) => `指示簿：${callText(c)}で Dr.call`);
}

export interface PrnIssue {
  level: "stop" | "ask" | "info";
  message: string;
  formula?: string;
}

/** Checks of one as-needed rule: the day's total against the package insert, the interval, allergies. */
export function checkPrn(r: PrnRule, allergies: string[]): PrnIssue[] {
  const out: PrnIssue[] = [];
  if (r.intervalH * (r.maxPerDay - 1) >= 24) out.push({ level: "ask", message: `${r.intervalH}時間あけて1日${r.maxPerDay}回は、24時間の中に入りません。`, formula: `${r.intervalH}時間 × (${r.maxPerDay} − 1) = ${r.intervalH * (r.maxPerDay - 1)}時間` });
  const oral = ORAL_DRUGS.find((d) => d.code === r.drug.code);
  if (oral?.mg && oral.maxDailyMg) {
    const day = r.drug.amount * oral.mg * r.maxPerDay;
    const f = `${r.drug.amount}${oral.unit} × ${oral.mg}mg × ${r.maxPerDay}回 = ${day.toLocaleString("ja-JP")}mg`;
    if (day > oral.maxDailyMg.mg) out.push({ level: "ask", message: `1日の最大で ${day.toLocaleString("ja-JP")}mg になり、上限 ${oral.maxDailyMg.mg.toLocaleString("ja-JP")}mg（${oral.maxDailyMg.source}）を超えます。`, formula: f });
    else out.push({ level: "info", message: `1日の最大 ${day.toLocaleString("ja-JP")}mg（上限 ${oral.maxDailyMg.mg.toLocaleString("ja-JP")}mg、${oral.maxDailyMg.source}）`, formula: f });
  }
  const inj = DRUGS.find((d) => d.code === r.drug.code);
  if (inj && r.drug.unit === "mg") out.push({ level: "info", message: `1日の最大 ${(r.drug.amount * r.maxPerDay).toLocaleString("ja-JP")}mg`, formula: `${r.drug.amount}mg × ${r.maxPerDay}回` });
  const words = [drugLabel(r.drug.code), ...(oral?.classes ?? []), ...(oral?.aliases ?? []), ...(inj?.aliases ?? [])];
  const hit = allergies.find((a) => words.some((w) => w && a.includes(w)));
  if (hit) out.push({ level: "stop", message: `アレルギー「${hit}」に当たります。` });
  return out;
}

/** Initial orders live in title/body blocks; optional field entry starts empty. */
export function initialStanding(): Record<string, StandingOrders[]> {
  return { "90010231": [], "90010198": [], "90010260": [], "90010244": [] };
}

export const standingEffective = (s: StandingOrders | undefined, day = 0): StandingOrders | undefined => s && s.at.day <= day && (s.until === undefined || day <= s.until) ? effectiveFields(s, day) : undefined;

/** A new version belongs to the person confirming it, never to the previous author. */
export function confirmStanding(draft: StandingOrders, by: string, at: StandingOrders["at"]): StandingOrders {
  return { ...draft, by, at, taken: undefined };
}
