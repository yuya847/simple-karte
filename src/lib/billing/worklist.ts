import type { DiseaseCandidate } from "./disease-check";
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

/**
 * The desk read back from a save: the demo registrations are added for the patients the save has no
 * record for (a save from before an outpatient's registration existed, or an empty list), so the four
 * outpatients and the inpatients start registered. A record in the save always wins.
 */
export function withInitialInsurance(desk: Partial<IjiDesk> | undefined): IjiDesk {
  const saved = desk?.insurance ?? {};
  const insurance: InsuranceBook = { ...saved };
  for (const [id, records] of Object.entries(INITIAL_INSURANCE_BOOK)) if (!(saved[id]?.length > 0)) insurance[id] = records;
  return { insurance, settled: desk?.settled ?? {} };
}
export const withSettlement = (desk: IjiDesk, id: string, s: Settlement): IjiDesk => ({ ...desk, settled: { ...desk.settled, [id]: s } });

/** The claim's issues a person must look at (確かめる・人が選ぶ). The insurance note is its own item. */
export const reviewIssues = (issues: ClaimIssue[]): ClaimIssue[] => issues.filter((i) => (i.level === "review" || i.level === "choose") && i.text !== ASSUMED_INSURANCE_ISSUE);

export type IjiKind = "保険の未登録" | "会計がまだ" | "算定の要確認" | "病名の未コード化" | "病名漏れの候補";
export const IJI_KINDS: IjiKind[] = ["保険の未登録", "会計がまだ", "算定の要確認", "病名の未コード化", "病名漏れの候補"];

export interface IjiRow {
  patientId: string;
  insurance: InsuranceRecord | null;
  discharge: { day: DayOffset; time: string } | null;
  settled: Settlement | null;
  /** The claim's issues for a person (今月分); null while not computed. */
  review: ClaimIssue[] | null;
  uncoded: Diagnosis[];
  diseaseCandidates: DiseaseCandidate[];
  todo: IjiKind[];
}

export function ijiRows(
  patients: { id: string; dischargedAt?: { day: DayOffset; time: string } }[],
  desk: IjiDesk,
  diagnoses: Record<string, Diagnosis[]>,
  checks: Record<string, ClaimIssue[]> | null,
  candidates: Record<string, DiseaseCandidate[]> = {},
): IjiRow[] {
  const rows = patients.map((p): IjiRow => {
    const insurance = currentRecord(desk.insurance, p.id) ?? null;
    const discharge = p.dischargedAt ? { day: p.dischargedAt.day, time: p.dischargedAt.time } : null;
    const settled = desk.settled[p.id] ?? null;
    const review = checks ? (checks[p.id] ?? null) : null;
    const uncoded = (diagnoses[p.id] ?? []).filter((d) => d.code === UNCODED);
    const diseaseCandidates = candidates[p.id] ?? [];
    const todo: IjiKind[] = [];
    if (!insurance) todo.push("保険の未登録");
    if (discharge && !settled) todo.push("会計がまだ");
    if (review?.length) todo.push("算定の要確認");
    if (uncoded.length) todo.push("病名の未コード化");
    if (diseaseCandidates.length) todo.push("病名漏れの候補");
    return { patientId: p.id, insurance, discharge, settled, review, uncoded, diseaseCandidates, todo };
  });
  // Patients with something to do first (most first); otherwise in the order given.
  return rows.map((r, i) => ({ r, i })).sort((a, b) => b.r.todo.length - a.r.todo.length || a.i - b.i).map((x) => x.r);
}

export function ijiCounts(rows: IjiRow[], visits: { unpaid: number; uninsured: number } = { unpaid: 0, uninsured: 0 }): Record<IjiKind, number> {
  const base = Object.fromEntries(IJI_KINDS.map((k) => [k, rows.filter((r) => r.todo.includes(k)).length])) as Record<IjiKind, number>;
  // The 救急外来・外来 visits (their own sections) count in the chips too, so the chips match what is listed below.
  return { ...base, 病名漏れの候補: rows.reduce((n, r) => n + r.diseaseCandidates.length, 0), 会計がまだ: base.会計がまだ + visits.unpaid, 保険の未登録: base.保険の未登録 + visits.uninsured };
}
/** What the visit sections still have to do: a visit not yet paid (not admitted), and one without insurance. */
export function visitCounts(opd: { status: string; paid: boolean }[], er: { admitted: boolean; paid: boolean; insured: boolean }[], opdInsured: boolean[]): { unpaid: number; uninsured: number } {
  const unpaid = opd.filter((v) => (v.status === "会計待ち" || v.status === "終了") && !v.paid).length + er.filter((v) => !v.admitted && !v.paid).length;
  const uninsured = opdInsured.filter((x) => !x).length + er.filter((v) => !v.insured).length;
  return { unpaid, uninsured };
}
