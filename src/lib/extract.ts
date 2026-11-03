// データ抽出: find patients by conditions across the record — diagnosis, a drug in use, the latest lab
// value, age, ward — and give the rows as CSV (for quality work and conference slides). Only the
// fictional patients of this prototype are searched.

import { diagnosisLabel, type Diagnosis } from "./diagnoses";
import { kanaMatch } from "./kana";
import { anyDrugName, ANALYTES } from "./master";
import type { OrderEntry, Patient } from "./types";

export interface ExtractQuery {
  diagnosis: string;
  drug: string;
  lab: { code: string; op: "≥" | "≤"; value: number } | null;
  ageMin: number | null;
  ageMax: number | null;
  ward: string;
}

export const emptyQuery = (): ExtractQuery => ({ diagnosis: "", drug: "", lab: null, ageMin: null, ageMax: null, ward: "" });

export interface ExtractRow {
  id: string;
  name: string;
  age: number;
  sex: string;
  where: string;
  day: number;
  diagnoses: string;
  drugs: string;
  lab: string;
}

const latest = (p: Patient, code: string) => [...p.labs].sort((a, b) => b.day - a.day).find((r) => code in r.values);

/** Patients that meet every condition given (empty conditions are ignored). */
export function runExtract(q: ExtractQuery, patients: Patient[], entriesOf: (p: Patient) => OrderEntry[], diagnosesOf: (p: Patient) => Diagnosis[], whereOf: (p: Patient) => string): ExtractRow[] {
  return patients.flatMap((p) => {
    const dx = [p.admissionDiagnosis, ...diagnosesOf(p).map(diagnosisLabel)];
    if (q.diagnosis.trim() && !dx.some((d) => kanaMatch(d, q.diagnosis.trim()))) return [];
    const active = entriesOf(p).filter((e) => e.status === "有効");
    const drugs = [...new Set(active.flatMap((e) => (e.order.type === "injection" ? e.order.items.map((i) => i.drugCode) : e.order.type === "prescription" ? [e.order.drugCode] : [])))].map(anyDrugName).filter((d, i, all) => all.indexOf(d) === i);
    if (q.drug.trim() && !drugs.some((d) => kanaMatch(d, q.drug.trim()))) return [];
    if (q.ageMin !== null && p.age < q.ageMin) return [];
    if (q.ageMax !== null && p.age > q.ageMax) return [];
    const where = whereOf(p);
    if (q.ward && !where.startsWith(q.ward)) return [];
    let lab = "";
    if (q.lab) {
      const r = latest(p, q.lab.code);
      if (!r) return [];
      const v = r.values[q.lab.code];
      if (q.lab.op === "≥" ? v < q.lab.value : v > q.lab.value) return [];
      lab = `${q.lab.code} ${v}（${r.day === 0 ? "今日" : `${-r.day}日前`}）`;
    }
    return [{ id: p.id, name: p.name, age: p.age, sex: p.sex, where, day: 1 - p.admittedOn, diagnoses: [...new Set(dx)].join("、"), drugs: drugs.join("、"), lab }];
  });
}

export const LAB_CHOICES = ANALYTES.map((a) => ({ code: a.code, label: `${a.name}${a.unit ? `（${a.unit}）` : ""}` }));

const COLUMNS: { key: keyof ExtractRow; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "name", label: "氏名" },
  { key: "age", label: "年齢" },
  { key: "sex", label: "性別" },
  { key: "where", label: "病棟・部屋" },
  { key: "day", label: "入院日数" },
  { key: "diagnoses", label: "病名" },
  { key: "drugs", label: "使用中の薬" },
  { key: "lab", label: "検査値" },
];
export const EXTRACT_COLUMNS = COLUMNS;

/** CSV for Excel: a BOM so Japanese opens correctly, every field quoted, quotes doubled. */
export function toCsv(rows: ExtractRow[]): string {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return "﻿" + [COLUMNS.map((c) => cell(c.label)).join(","), ...rows.map((r) => COLUMNS.map((c) => cell(r[c.key])).join(","))].join("\r\n") + "\r\n";
}
