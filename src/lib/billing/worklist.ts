// 医事課の仕事: per patient, what the 医事課 still has to do — 保険の未登録, 退院して会計がまだ,
// 算定で人が確かめること（今月分）, 未コード化の病名. Collected from the records by code; nothing is decided here.

import { UNCODED, type Diagnosis } from "../diagnoses";
import type { DayOffset } from "../types";
import { ASSUMED_INSURANCE_ISSUE } from "./insurance";
import type { ClaimIssue } from "./model";
import { currentRecord, INITIAL_INSURANCE_BOOK, withRecord, type InsuranceBook, type InsuranceRecord } from "./registration";

/** 退院時の会計 the window recorded: for which month, the amount shown then, who and when. */
export interface Settlement {
  month: string;
  yen: number | null;
  by: string;
  at: { day: DayOffset; time: string };
}

/** What 医事課 keeps per patient: the insurance registered (every version) and the bill settled at discharge. */
export interface IjiDesk {
  insurance: InsuranceBook;
  settled: Record<string, Settlement>;
}

export const INITIAL_DESK: IjiDesk = { insurance: INITIAL_INSURANCE_BOOK, settled: {} };

export const withInsurance = (desk: IjiDesk, id: string, r: InsuranceRecord): IjiDesk => ({ ...desk, insurance: withRecord(desk.insurance, id, r) });
export const withSettlement = (desk: IjiDesk, id: string, s: Settlement): IjiDesk => ({ ...desk, settled: { ...desk.settled, [id]: s } });

/** The claim's issues a person must look at (確かめる・人が選ぶ). The insurance note is its own item. */
export const reviewIssues = (issues: ClaimIssue[]): ClaimIssue[] => issues.filter((i) => (i.level === "review" || i.level === "choose") && i.text !== ASSUMED_INSURANCE_ISSUE);

export type IjiKind = "保険の未登録" | "会計がまだ" | "算定の要確認" | "病名の未コード化";
export const IJI_KINDS: IjiKind[] = ["保険の未登録", "会計がまだ", "算定の要確認", "病名の未コード化"];

export interface IjiRow {
  patientId: string;
  insurance: InsuranceRecord | null;
  discharge: { day: DayOffset; time: string } | null;
  settled: Settlement | null;
  /** The claim's issues for a person (今月分); null while not computed. */
  review: ClaimIssue[] | null;
  uncoded: Diagnosis[];
  todo: IjiKind[];
}

export function ijiRows(
  patients: { id: string; dischargedAt?: { day: DayOffset; time: string } }[],
  desk: IjiDesk,
  diagnoses: Record<string, Diagnosis[]>,
  checks: Record<string, ClaimIssue[]> | null,
): IjiRow[] {
  const rows = patients.map((p): IjiRow => {
    const insurance = currentRecord(desk.insurance, p.id) ?? null;
    const discharge = p.dischargedAt ? { day: p.dischargedAt.day, time: p.dischargedAt.time } : null;
    const settled = desk.settled[p.id] ?? null;
    const review = checks ? (checks[p.id] ?? null) : null;
    const uncoded = (diagnoses[p.id] ?? []).filter((d) => d.code === UNCODED);
    const todo: IjiKind[] = [];
    if (!insurance) todo.push("保険の未登録");
    if (discharge && !settled) todo.push("会計がまだ");
    if (review?.length) todo.push("算定の要確認");
    if (uncoded.length) todo.push("病名の未コード化");
    return { patientId: p.id, insurance, discharge, settled, review, uncoded, todo };
  });
  // Patients with something to do first (most first); otherwise in the order given.
  return rows.map((r, i) => ({ r, i })).sort((a, b) => b.r.todo.length - a.r.todo.length || a.i - b.i).map((x) => x.r);
}

export function ijiCounts(rows: IjiRow[]): Record<IjiKind, number> {
  return Object.fromEntries(IJI_KINDS.map((k) => [k, rows.filter((r) => r.todo.includes(k)).length])) as Record<IjiKind, number>;
}
