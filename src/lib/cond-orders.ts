// 条件付き指示: an order the doctor writes in the 指示簿 that applies only when a value meets a condition
// (「K 4.0 未満なら医師へ連絡」「SBP 90 未満なら次のフロセミドを見合わせて医師へ連絡」). The doctor writes the
// condition and what to do in their own words; code compares the latest lab or vital value with it and,
// when it is met, shows it to the nurse and in やること. Nothing is given or ordered by code: the nurse
// does what the doctor wrote and records it. All data is fictional.

import { ANALYTES } from "./master";
import type { DayOffset, Patient, VitalSign } from "./types";

export type CondOp = "<" | "≤" | "≥" | ">";
export const COND_OPS: { op: CondOp; label: string }[] = [
  { op: "<", label: "未満" },
  { op: "≤", label: "以下" },
  { op: "≥", label: "以上" },
  { op: ">", label: "を超える" },
];

export type VitalKey = "sbp" | "dbp" | "hr" | "bt" | "spo2" | "rr";
export const COND_VITALS: { key: VitalKey; label: string; unit: string; of: (v: VitalSign) => number | undefined }[] = [
  { key: "sbp", label: "収縮期血圧", unit: "mmHg", of: (v) => v.sbp },
  { key: "dbp", label: "拡張期血圧", unit: "mmHg", of: (v) => v.dbp },
  { key: "hr", label: "脈拍", unit: "/分", of: (v) => v.hr },
  { key: "bt", label: "体温", unit: "℃", of: (v) => v.bt },
  { key: "spo2", label: "SpO2", unit: "%", of: (v) => v.spo2 },
  { key: "rr", label: "呼吸数", unit: "/分", of: (v) => v.rr },
];

/** Lab items offered first (any analyte of the master can be chosen). */
export const COND_LABS = ["K", "Na", "Glu", "Cre", "BUN", "Hb", "Plt", "PT-INR", "Mg", "Ca", "CRP", "BNP"];

export interface CondRule {
  id: string;
  source: "lab" | "vital";
  /** lab: an analyte code of the master (K, Glu …); vital: a VitalKey. */
  item: string;
  op: CondOp;
  value: number;
  /** What the nurse does when it is met, in the doctor's words (code never changes it). */
  action: string;
  /** Call the doctor when it is met (shown first). */
  callDoctor: boolean;
}

export const emptyCond = (id: string): CondRule => ({ id, source: "lab", item: "", op: "<", value: Number.NaN, action: "", callDoctor: false });

export function itemLabel(r: Pick<CondRule, "source" | "item">): { name: string; unit: string } {
  if (r.source === "vital") {
    const v = COND_VITALS.find((x) => x.key === r.item);
    return { name: v?.label ?? r.item, unit: v?.unit ?? "" };
  }
  const a = ANALYTES.find((x) => x.code === r.item);
  return { name: a?.name ?? r.item, unit: a?.unit ?? "" };
}

const opWord = (op: CondOp) => COND_OPS.find((o) => o.op === op)!.label;

/** 「K 4 mmol/L 未満」 */
export const condText = (r: CondRule) => {
  const { name, unit } = itemLabel(r);
  return `${name} ${r.value}${unit ? ` ${unit}` : ""} ${opWord(r.op)}`;
};

/** 「K 4 mmol/L 未満なら：医師へ連絡。…」 */
export const ruleText = (r: CondRule) => `${condText(r)}なら：${[r.callDoctor ? "医師へ連絡" : "", r.action.trim()].filter(Boolean).join("。")}`;

/** What is missing before the doctor can confirm the rule (empty when complete). */
export function condMissing(r: CondRule): string[] {
  const out: string[] = [];
  if (!r.item) out.push("項目");
  else if (r.source === "lab" ? !ANALYTES.some((a) => a.code === r.item) : !COND_VITALS.some((v) => v.key === r.item)) out.push("項目（マスターにない）");
  if (!Number.isFinite(r.value)) out.push("値");
  if (!r.callDoctor && !r.action.trim()) out.push("当たったときにすること");
  return out;
}

export const meets = (x: number, op: CondOp, v: number) => (op === "<" ? x < v : op === "≤" ? x <= v : op === "≥" ? x >= v : x > v);

export interface CondHit {
  rule: CondRule;
  value: number;
  unit: string;
  /** When the value was measured (or reported). */
  at: { day: DayOffset; time: string };
  /** One hit per rule and measurement: what a nurse's record answers. */
  key: string;
  /** 「K 3.6 mmol/L（基準 4 mmol/L 未満）」 */
  text: string;
}

const absOf = (day: number, time: string) => day * 1440 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** The latest measurement of the rule's item: lab results by time measured, vitals by time taken. */
export function latestOf(r: CondRule, p: Pick<Patient, "labs" | "vitals">): { value: number; at: { day: DayOffset; time: string } } | null {
  if (r.source === "lab") {
    const rows = p.labs.filter((l) => l.values[r.item] !== undefined).sort((a, b) => absOf(b.day, b.time) - absOf(a.day, a.time));
    return rows[0] ? { value: rows[0].values[r.item], at: { day: rows[0].day, time: rows[0].time } } : null;
  }
  const of = COND_VITALS.find((v) => v.key === r.item)?.of;
  if (!of) return null;
  const rows = p.vitals.filter((v) => of(v) !== undefined).sort((a, b) => absOf(b.day, b.time) - absOf(a.day, a.time));
  return rows[0] ? { value: of(rows[0])!, at: { day: rows[0].day, time: rows[0].time } } : null;
}

export const hitKey = (patientId: string, ruleId: string, at: { day: DayOffset; time: string }) => `${patientId}|${ruleId}|${at.day}|${at.time}`;

/** The rules the latest values meet now (code compares; the nurse acts as the doctor wrote). */
export function condHits(patientId: string, rules: CondRule[] | undefined, p: Pick<Patient, "labs" | "vitals">): CondHit[] {
  return (rules ?? []).flatMap((rule) => {
    if (condMissing(rule).length) return [];
    const last = latestOf(rule, p);
    if (!last || !meets(last.value, rule.op, rule.value)) return [];
    const { name, unit } = itemLabel(rule);
    return [{ rule, value: last.value, unit, at: last.at, key: hitKey(patientId, rule.id, last.at), text: `${name} ${last.value}${unit ? ` ${unit}` : ""}（基準 ${rule.value}${unit ? ` ${unit}` : ""} ${opWord(rule.op)}）` }];
  });
}

/** The nurse's record of what was done for one hit (it goes into the chart and the audit log). */
export interface CondAck {
  key: string;
  by: string;
  at: { day: DayOffset; time: string };
  /** What was done (「医師に連絡し、指示を受けた」など), in the nurse's words. */
  note: string;
}

/** Hits no one has recorded an answer to yet. */
export const openHits = (hits: CondHit[], acks: Record<string, CondAck>) => hits.filter((h) => !acks[h.key]);

/** The line written into the chart when a nurse records it. */
export const ackLine = (h: CondHit, note: string, time: string) => `・条件付き指示（${ruleText(h.rule)}）に当たる：${h.text}（${h.at.time} の値）。${time} 対応：${note}`;
