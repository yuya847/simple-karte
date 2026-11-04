// バイタルの一括入力: several patients' vital signs typed in one table for the shift, saved to the same record as
// the chart's バイタル (one measurement per patient, who and when added by code). The warnings come only from
// rules already in this app: the doctor's call criteria of the 指示簿 (standing.ts) and the NEWS2 bands of the
// Royal College of Physicians (news2.ts). Nothing here is decided by AI; the nurse calls the doctor.

import { news2, type Acvpu } from "./news2";
import { callHits, type StandingOrders } from "./standing";
import type { VitalSign } from "./types";

export const BULK_SOURCES = {
  calls: "指示簿の「医師への連絡の基準」（医師が患者ごとに決めたもの）",
  news2: "NEWS2（英国 Royal College of Physicians, 2017）の点数表：1項目で3点、または合計5点以上（観察の目安の区切り）。SpO2 は Scale 1",
};

export type BulkField = "bt" | "hr" | "sbp" | "dbp" | "rr" | "spo2";
export const BULK_FIELDS: { key: BulkField; label: string; unit: string }[] = [
  { key: "bt", label: "体温", unit: "℃" },
  { key: "hr", label: "脈拍", unit: "/分" },
  { key: "sbp", label: "血圧 上", unit: "mmHg" },
  { key: "dbp", label: "血圧 下", unit: "mmHg" },
  { key: "rr", label: "呼吸数", unit: "/分" },
  { key: "spo2", label: "SpO2", unit: "%" },
];

export interface BulkRow {
  values: Partial<Record<BulkField, string>>;
  o2: string;
  avpu: Acvpu | "";
  /** 測った時刻 when not the table's. */
  time?: string;
}

export interface ParsedRow {
  /** Something was typed in the row. */
  filled: boolean;
  errors: string[];
  vital?: Omit<VitalSign, "day" | "time" | "by">;
}

const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Numbers only, none below zero, SpO2 up to 100 and 拡張期 not above 収縮期 (to catch a slip of the keys). */
export function parseRow(r: BulkRow): ParsedRow {
  const typed = BULK_FIELDS.filter((f) => (r.values[f.key] ?? "").trim() !== "");
  const filled = typed.length > 0 || r.avpu !== "";
  if (!filled) return { filled, errors: [] };
  const errors: string[] = [];
  const v: Partial<Record<BulkField, number>> = {};
  for (const f of typed) {
    const n = Number(r.values[f.key]!.trim());
    if (!Number.isFinite(n) || n < 0) errors.push(`${f.label}は数で入れてください`);
    else v[f.key] = n;
  }
  if (v.spo2 !== undefined && v.spo2 > 100) errors.push("SpO2 は100までです");
  if (v.sbp !== undefined && v.dbp !== undefined && v.dbp > v.sbp) errors.push("血圧の下が上より高くなっています");
  if ((v.sbp === undefined) !== (v.dbp === undefined)) errors.push("血圧は上と下を両方入れてください");
  if (r.time !== undefined && r.time !== "" && !isTime(r.time)) errors.push("時刻は「14:20」のように入れてください");
  return errors.length ? { filled, errors } : { filled, errors, vital: { ...v, o2: r.o2.trim() || "室内気", avpu: r.avpu || undefined } };
}

export interface BulkWarning {
  text: string;
  basis: "指示簿" | "NEWS2";
}

/** The doctor's call criteria the values meet, and NEWS2 parameters that score 3 or a total of 5 or more. */
export function rowWarnings(v: Omit<VitalSign, "day" | "time" | "by">, standing?: StandingOrders): BulkWarning[] {
  const out: BulkWarning[] = callHits(standing, { day: 0, time: "00:00", ...v }).map((t) => ({ text: `医師への連絡の基準：${t}`, basis: "指示簿" as const }));
  const s = news2(v);
  for (const p of s.parts.filter((x) => x.score === 3)) out.push({ text: `NEWS2 で3点：${p.name} ${p.value}`, basis: "NEWS2" });
  if (s.total >= 5) out.push({ text: `NEWS2 合計 ${s.total}点（観察の目安：${s.monitoring}）${s.missing.length ? `・未入力 ${s.missing.join("・")}` : ""}`, basis: "NEWS2" });
  return out;
}

/** The measurements to save: rows typed without errors, each at its own time or the table's. */
export function toSave(rows: Record<string, BulkRow>, tableTime: string, by: string): { patientId: string; vital: VitalSign }[] {
  return Object.entries(rows).flatMap(([patientId, r]) => {
    const p = parseRow(r);
    if (!p.filled || !p.vital) return [];
    return [{ patientId, vital: { day: 0, time: r.time && isTime(r.time) ? r.time : tableTime, ...p.vital, by } }];
  });
}

/** Rows typed but not savable (they block the save, so that nothing is dropped without a word). */
export const rowsWithErrors = (rows: Record<string, BulkRow>) => Object.entries(rows).filter(([, r]) => parseRow(r).errors.length > 0).map(([id]) => id);
