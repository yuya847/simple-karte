// 患者モニター（模擬）: the bedside monitor and the central monitor of the fictional ward. No device is
// connected: the numbers start from the patient's latest recorded vital signs and wobble a little, the
// waveforms are drawn from textbook shapes (P-QRS-T, the pulse wave, the breath), the alarm limits are the
// fictional hospital's rule. Everything here is plain code and deterministic: the random numbers come from a
// seed (the patient's id), so the same patient shows the same sequence every time. No AI anywhere.

import { onOxygen } from "./news2";
import type { DayOffset, VitalSign } from "./types";

// ---------------------------------------------------------------------------
// Alarm limits（架空の病院の取り決め）
// ---------------------------------------------------------------------------

export type MonitorKey = "hr" | "spo2" | "rr" | "sbp";

export interface Limit {
  key: MonitorKey;
  label: string;
  unit: string;
  /** Alarm below this (inclusive of the gap: value < low). */
  low?: number;
  /** Alarm above this (value > high). */
  high?: number;
}

/** The limits the fictional ward sets on every monitor by default. Not a standard: 架空の病院の取り決め. */
export const MONITOR_LIMITS: Limit[] = [
  { key: "hr", label: "心拍数", unit: "/分", low: 50, high: 120 },
  { key: "spo2", label: "SpO2", unit: "%", low: 90 },
  { key: "rr", label: "呼吸数", unit: "/分", low: 8, high: 25 },
  { key: "sbp", label: "収縮期血圧", unit: "mmHg", low: 90, high: 180 },
];

export const MONITOR_NOTES = {
  simulated: "波形と数値は模擬です（実際の装置につないでいません）。数値は経過表の最新のバイタルを基に、コードで小さく揺らしています。",
  limits: "アラームの上下限（心拍数 50〜120、SpO2 90 未満、呼吸数 8〜25、収縮期血圧 90〜180）はこの架空の病院の取り決めです。実際の病院では患者ごとに医師と看護師が決めます。",
  silent: "音は鳴りません。",
  shapes: "波形の形は教科書的な一般の形（心電図の P-QRS-T、脈波、呼吸）で、特定の装置の表示をまねたものではありません。",
} as const;

export interface Alarm {
  key: MonitorKey;
  label: string;
  value: number;
  /** "低" or "高" and the limit crossed. */
  text: string;
}

export type MonitorValues = Partial<Record<MonitorKey, number>>;

/** Which of the values are outside the limits (plain comparison). */
export function alarmsOf(values: MonitorValues, limits: Limit[] = MONITOR_LIMITS): Alarm[] {
  const out: Alarm[] = [];
  for (const l of limits) {
    const v = values[l.key];
    if (v === undefined || !Number.isFinite(v)) continue;
    if (l.low !== undefined && v < l.low) out.push({ key: l.key, label: l.label, value: v, text: `${l.label} ${v}${l.unit}：下限 ${l.low} を下回っています` });
    else if (l.high !== undefined && v > l.high) out.push({ key: l.key, label: l.label, value: v, text: `${l.label} ${v}${l.unit}：上限 ${l.high} を上回っています` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Seeded random numbers (reproducible per patient)
// ---------------------------------------------------------------------------

/** A 32-bit seed from a string (FNV-1a). The same string gives the same seed. */
export function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small generator that gives the same sequence for the same seed. Returns [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `base` moved by at most ±amp (rounded to `digits`), never outside [min, max]. */
export function wobble(base: number, amp: number, r: number, opts: { min?: number; max?: number; digits?: number } = {}): number {
  const digits = opts.digits ?? 0;
  const k = 10 ** digits;
  let v = Math.round((base + (r * 2 - 1) * amp) * k) / k;
  if (opts.min !== undefined) v = Math.max(opts.min, v);
  if (opts.max !== undefined) v = Math.min(opts.max, v);
  return v;
}

/** What the monitor shows this second: the latest recorded values with a small wobble, from a seed and a tick. */
export interface LiveNumbers {
  hr?: number;
  spo2?: number;
  rr?: number;
}

/** Defaults when the record has no value yet (an adult at rest; the chart shows "—" for missing records, this is only for the waveform). */
export const RESTING = { hr: 72, spo2: 97, rr: 16 } as const;

/**
 * The numbers for one tick (a second). The same patient id and tick give the same numbers. The wobble is small:
 * ±3/分 for the heart rate, ±1% for SpO2 (not above 100), ±1/分 for the breathing. A recorded fast heart or low
 * SpO2 stays fast or low: the wobble is around the record, not toward normal.
 */
export function liveNumbers(latest: Pick<VitalSign, "hr" | "spo2" | "rr"> | undefined, seed: string, tick: number): LiveNumbers {
  const r = rng((seedOf(seed) + Math.floor(tick)) >>> 0);
  const out: LiveNumbers = {};
  if (latest?.hr !== undefined) out.hr = wobble(latest.hr, 3, r(), { min: 20, max: 250 });
  if (latest?.spo2 !== undefined) out.spo2 = wobble(latest.spo2, 1, r(), { min: 50, max: 100 });
  if (latest?.rr !== undefined) out.rr = wobble(latest.rr, 1, r(), { min: 4, max: 60 });
  return out;
}

/** A simulated NIBP (non-invasive blood pressure) reading: the last recorded pressure with a ±6 mmHg wobble. */
export function simulatedNibp(latest: Pick<VitalSign, "sbp" | "dbp"> | undefined, seed: string, tick: number): { sbp: number; dbp: number } {
  const r = rng((seedOf(`${seed}:nibp`) + Math.floor(tick)) >>> 0);
  const sbp = wobble(latest?.sbp ?? 120, 6, r(), { min: 50, max: 260 });
  const dbp = Math.min(sbp - 10, wobble(latest?.dbp ?? 70, 4, r(), { min: 30, max: 160 }));
  return { sbp, dbp };
}

/** How long the simulated cuff takes, in seconds (架空: a real cuff takes about 30〜60 秒). */
export const NIBP_SECONDS = 20;

// ---------------------------------------------------------------------------
// Waveforms (textbook shapes, phase 0..1 of one cycle)
// ---------------------------------------------------------------------------

/** One beat in milliseconds for a heart rate. */
export const beatMs = (hr: number): number => 60000 / Math.max(20, Math.min(250, hr));

/** One breath in milliseconds for a breathing rate. */
export const breathMs = (rr: number): number => 60000 / Math.max(4, Math.min(60, rr));

const gauss = (x: number, c: number, w: number) => Math.exp(-((x - c) ** 2) / (2 * w * w));

/**
 * A lead II shaped beat: P wave, then the QRS complex (small Q, tall R, small S), then the T wave; a flat line
 * otherwise. Phase 0..1 → roughly −0.3..1.0 (R = 1). Generic textbook shape, not a recording.
 */
export function ecgSample(phase: number): number {
  const x = phase - Math.floor(phase);
  const p = 0.15 * gauss(x, 0.12, 0.025);
  const q = -0.1 * gauss(x, 0.235, 0.008);
  const r = 1.0 * gauss(x, 0.25, 0.009);
  const s = -0.25 * gauss(x, 0.268, 0.009);
  const t = 0.3 * gauss(x, 0.45, 0.045);
  return p + q + r + s + t;
}

/** A pulse wave: a quick rise, a slower fall with a dicrotic notch. Phase 0..1 → 0..1. */
export function plethSample(phase: number): number {
  const x = phase - Math.floor(phase);
  const up = x < 0.15 ? Math.sin((x / 0.15) * (Math.PI / 2)) : Math.exp(-(x - 0.15) * 4.5);
  const notch = 0.18 * gauss(x, 0.42, 0.04);
  return Math.max(0, Math.min(1, up + notch));
}

/** Breathing: a rounded wave (inspiration quicker than expiration). Phase 0..1 → 0..1. */
export function respSample(phase: number): number {
  const x = phase - Math.floor(phase);
  // Inspiration takes the first 40%, expiration the rest.
  return x < 0.4 ? (1 - Math.cos((x / 0.4) * Math.PI)) / 2 : (1 + Math.cos(((x - 0.4) / 0.6) * Math.PI)) / 2;
}

export type TraceKind = "ecg" | "pleth" | "resp";

/** The sample of a trace at a phase (cycles). The pulse wave lags the QRS by a fifth of a beat. */
export function sampleOf(kind: TraceKind, phase: number): number {
  if (kind === "ecg") return ecgSample(phase);
  if (kind === "pleth") return plethSample(phase - 0.2);
  return respSample(phase);
}

/** How long one cycle of a trace lasts (ms) at a rate (/分): a beat for the ECG and the pulse wave, a breath for the breathing. */
export const cycleMs = (kind: TraceKind, rate: number): number => (kind === "resp" ? breathMs(rate) : beatMs(rate));

/** The range a trace is drawn in (the lane's bottom and top values). */
export const TRACE_RANGE: Record<TraceKind, [number, number]> = { ecg: [-0.4, 1.1], pleth: [-0.05, 1.05], resp: [-0.05, 1.05] };

/** The sample of a trace at a moment (ms), from the rate (/分). */
export function traceAt(kind: TraceKind, atMs: number, rate: number): number {
  return sampleOf(kind, atMs / cycleMs(kind, rate));
}

/** `n` samples of a trace from 0 ms, `stepMs` apart: the same inputs give the same list (for tests and the still picture). */
export function traceSeries(kind: TraceKind, rate: number, n: number, stepMs: number): number[] {
  return Array.from({ length: n }, (_, i) => traceAt(kind, i * stepMs, rate));
}

// ---------------------------------------------------------------------------
// Who is on a monitor（架空の病院の取り決め）
// ---------------------------------------------------------------------------

export interface MonitorCandidate {
  id: string;
  name: string;
  room: string;
  admittedOn: DayOffset;
  latest?: VitalSign;
}

/** How the nurses changed the automatic choice: put on by hand, or taken off by hand. */
export interface MonitorManual {
  on: string[];
  off: string[];
}

export const EMPTY_MANUAL: MonitorManual = { on: [], off: [] };

export type MonitorReason = "酸素投与中" | "心拍数 100 以上" | "SpO2 95 未満" | "入院 2 日以内" | "手で装着";

export const MONITOR_RULE = "モニターを付ける患者（受け持ちのうち、酸素投与中・心拍数 100 以上・SpO2 95 未満・入院 2 日以内）はこの架空の病院の取り決めです。看護師が手で付け外しできます。";

/** Why the rule puts a patient on a monitor (empty: it does not). From the latest recorded vital signs. */
export function autoReasons(p: MonitorCandidate): MonitorReason[] {
  const out: MonitorReason[] = [];
  const v = p.latest;
  if (v && onOxygen(v.o2)) out.push("酸素投与中");
  if (v?.hr !== undefined && v.hr >= 100) out.push("心拍数 100 以上");
  if (v?.spo2 !== undefined && v.spo2 < 95) out.push("SpO2 95 未満");
  if (p.admittedOn >= -2) out.push("入院 2 日以内");
  return out;
}

export interface Monitored<T extends MonitorCandidate = MonitorCandidate> {
  patient: T;
  reasons: MonitorReason[];
}

/** The patients on a monitor: the rule's choice plus those put on by hand, minus those taken off by hand. In room order. */
export function monitored<T extends MonitorCandidate>(candidates: T[], manual: MonitorManual = EMPTY_MANUAL): Monitored<T>[] {
  const out: Monitored<T>[] = [];
  for (const p of candidates) {
    if (manual.off.includes(p.id)) continue;
    const reasons = autoReasons(p);
    if (manual.on.includes(p.id)) reasons.push("手で装着");
    if (reasons.length > 0) out.push({ patient: p, reasons });
  }
  return out.sort((a, b) => a.patient.room.localeCompare(b.patient.room, "ja"));
}

/** Put a patient on (or take one off) by hand, so the rule's choice no longer applies to them. */
export function toggleMonitor(manual: MonitorManual, id: string, on: boolean): MonitorManual {
  const without = { on: manual.on.filter((x) => x !== id), off: manual.off.filter((x) => x !== id) };
  return on ? { ...without, on: [...without.on, id] } : { ...without, off: [...without.off, id] };
}
