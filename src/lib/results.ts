// Results the doctor has not yet seen, and panic values the laboratory must phone in.
// Which results are new, which values cross a panic limit and what is still unconfirmed are all
// worked out by code. A person phones, a person reads back, and the doctor marks a result as seen.

import { ANALYTES, rangeFor } from "./master";
import type { CultureResult, DayOffset, LabResult, Patient } from "./types";

export type ResultKind = "検査" | "画像" | "培養";

export interface ResultItem {
  key: string;
  patientId: string;
  kind: ResultKind;
  day: DayOffset;
  time: string;
  title: string;
  /** Short lines: out-of-range values, the first sentence of a report, the organism. */
  detail: string;
  /** Values beyond a panic limit (laboratory results only). */
  panic: PanicHit[];
}

export interface PanicLimit {
  code: string;
  low?: number;
  high?: number;
}

export interface PanicHit {
  code: string;
  name: string;
  value: number;
  unit: string;
  side: "低" | "高";
  limit: number;
}

/** A panic value phoned to the ward (who called, who took it, whether it was read back). */
export interface PanicCall {
  key: string;
  patientId: string;
  hits: PanicHit[];
  by: string;
  to: string;
  readBack: boolean;
  at: { day: DayOffset; time: string };
}

export interface Ack {
  by: string;
  at: { day: DayOffset; time: string };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

export const labKey = (pid: string, l: LabResult) => `lab|${pid}|${l.day}|${l.time}`;

/** Values beyond the panic limits of the fictional hospital. */
export function panicOf(values: Record<string, number>, limits: PanicLimit[]): PanicHit[] {
  const out: PanicHit[] = [];
  for (const lim of limits) {
    const v = values[lim.code];
    if (v === undefined) continue;
    const a = ANALYTES.find((x) => x.code === lim.code);
    const base = { code: lim.code, name: a?.name ?? lim.code, value: v, unit: a?.unit ?? "" };
    if (lim.low !== undefined && v <= lim.low) out.push({ ...base, side: "低", limit: lim.low });
    else if (lim.high !== undefined && v >= lim.high) out.push({ ...base, side: "高", limit: lim.high });
  }
  return out;
}

/** A blood culture that has turned positive is phoned in like a panic value. */
export function bloodCulturePanic(c: CultureResult): PanicHit[] {
  if (c.specimen !== "血液" || c.status !== "中間報告" || !(c.gram || c.organism)) return [];
  return [{ code: "BC", name: `血液培養陽性（${c.gram ?? c.organism}）`, value: NaN, unit: "", side: "高", limit: NaN }];
}

export const hitLine = (h: PanicHit) =>
  Number.isNaN(h.value) ? h.name : `${h.name} ${fmt(h.value)}${h.unit ? ` ${h.unit}` : ""}（${h.side === "低" ? `${fmt(h.limit)}以下` : `${fmt(h.limit)}以上`}）`;

/** Every result of a patient as an item to see, newest first. */
export function resultsOf(p: Patient, limits: PanicLimit[]): ResultItem[] {
  const out: ResultItem[] = [];
  for (const l of p.labs) {
    const abnormal = Object.entries(l.values).flatMap(([code, v]) => {
      const a = ANALYTES.find((x) => x.code === code);
      if (!a) return [];
      const r = rangeFor(a, p.sex);
      if (r.low !== undefined && v < r.low) return [`${a.name} ${fmt(v)}L`];
      if (r.high !== undefined && v > r.high) return [`${a.name} ${fmt(v)}H`];
      return [];
    });
    out.push({
      key: labKey(p.id, l),
      patientId: p.id,
      kind: "検査",
      day: l.day,
      time: l.time,
      title: `検体検査 ${Object.keys(l.values).length}項目`,
      detail: abnormal.length ? `基準範囲の外：${abnormal.join("、")}` : "すべて基準範囲の中",
      panic: panicOf(l.values, limits),
    });
  }
  for (const s of p.imaging) {
    if (s.pending) continue;
    out.push({
      key: `img|${s.id}`,
      patientId: p.id,
      kind: "画像",
      day: s.day,
      time: s.time ?? "",
      title: `${s.modality} ${s.region}（${s.reader}）`,
      detail: s.report.split(/(?<=。)/)[0],
      panic: [],
    });
  }
  for (const c of p.cultures) {
    if (c.status === "培養中") continue;
    out.push({
      key: `cx|${p.id}|${c.collectedOn}|${c.specimen}|${c.status}`,
      patientId: p.id,
      kind: "培養",
      day: c.reportedOn ?? c.collectedOn,
      time: c.reportedTime ?? "",
      title: `${c.specimen}培養 ${c.status}${c.sets ? `（${c.sets}）` : ""}`,
      detail: c.organism ?? c.gram ?? "",
      panic: bloodCulturePanic(c),
    });
  }
  return out.sort((a, b) => b.day - a.day || b.time.localeCompare(a.time));
}

/**
 * Results not yet seen. Results from before today count as seen by the attending (the fictional
 * record has no 既読 for them); from today on, the doctor marks each one.
 */
export function unseen(items: ResultItem[], acks: Record<string, Ack>): ResultItem[] {
  return items.filter((i) => i.day >= 0 && !acks[i.key]);
}

/** Panic values found but not phoned in yet. */
export function uncalled(items: ResultItem[], calls: Record<string, PanicCall>): ResultItem[] {
  return items.filter((i) => i.panic.length > 0 && !calls[i.key]);
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * The fictional event of this demo: 大浦さんの血液培養（昨日 2セット採取）が、セッションを始める少し前に
 * 1セットで陽性になり、グラム染色の中間報告が出た。
 */
export function cultureArrivals(nowAbs: number): Record<string, CultureResult[]> {
  const t = Math.max(0, Math.min(1439, nowAbs - 12));
  return {
    "90010244": [{ collectedOn: -1, specimen: "血液", sets: "2セット中1セット陽性", status: "中間報告", reportedOn: 0, reportedTime: hhmm(t), gram: "グラム陽性球菌（ブドウ状）" }],
  };
}

/** A culture reported later replaces the earlier report of the same specimen. */
export function mergeCultures(base: CultureResult[], later: CultureResult[] = []): CultureResult[] {
  const same = (a: CultureResult, b: CultureResult) => a.collectedOn === b.collectedOn && a.specimen === b.specimen;
  return [...base.filter((c) => !later.some((l) => same(c, l))), ...later];
}

/** Panic limits of the fictional hospital (each hospital sets its own; see the source). */
export const PANIC_LIMITS: PanicLimit[] = [
  { code: "K", low: 2.5, high: 6.0 },
  { code: "Na", low: 120, high: 160 },
  { code: "Glu", low: 50, high: 500 },
  { code: "Hb", low: 5.0 },
  { code: "Plt", low: 3.0 },
];
export const PANIC_SOURCE = "（出典を確認中）";
