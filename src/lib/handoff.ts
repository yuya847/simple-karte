import { vitalsIn } from "./vitals-text";
import { consciousnessText } from "./consciousness";
// 勤務交代の申し送り, in the I-PASS order. Facts (vitals, NEWS2, new orders, what is due in the next
// shift, cultures still out, marks on the patient) are gathered from the chart by code. The person
// handing over says the rest; Claude only places their own sentences into the fields. The severity is
// chosen by the person, and the receiver says back what they heard (Synthesis by receiver).

import { buildWorksheet, orderChanges, shiftWindow, timeLabel, type WorkPatient } from "./worksheet";
import { news2 } from "./news2";
import { flagsFor } from "./patient-flags";
import type { CalendarDate } from "./dates";
import { orderLines } from "./format";
import type { DayOffset } from "./types";

export const IPASS_SOURCE =
  "Starmer AJ, et al. I-PASS, a mnemonic to standardize verbal handoffs. Pediatrics 2012;129:201-4（各文字と重症度の3区分）／Starmer AJ, et al. Changes in Medical Errors after Implementation of a Handoff Program. N Engl J Med 2014;371:1803-12。日本語の訳は公的なものがないので、原語を併記しています";

export const SEVERITIES = [
  { key: "安定", en: "stable", tone: "wakatake" },
  { key: "要注意", en: "watcher", tone: "yamabuki" },
  { key: "不安定", en: "unstable", tone: "shu" },
] as const;
export type Severity = (typeof SEVERITIES)[number]["key"];

export const FIELDS = [
  { letter: "I", label: "重症度", en: "Illness severity" },
  { letter: "P", label: "患者の要約", en: "Patient summary" },
  { letter: "A", label: "やること", en: "Action list" },
  { letter: "S", label: "見通しと「もし〜なら」", en: "Situation awareness and contingency planning" },
  { letter: "S", label: "受けた人の復唱", en: "Synthesis by receiver" },
] as const;

export interface HandoffAction {
  text: string;
  done?: boolean;
}

export interface Handoff {
  id: string;
  patientId: string;
  /** e.g. "日勤→夜勤". */
  shift: string;
  /** Start of the shift it is handed to (minutes from today 00:00): one handoff per patient per shift. */
  shiftLo?: number;
  /** Doctors hand over to doctors, nurses to nurses: one handoff per patient per shift per role. */
  role?: string;
  severity: Severity | null;
  summary: string;
  actions: HandoffAction[];
  contingency: string;
  /** The facts gathered by code at the time it was sent (kept as they were). */
  facts: string[];
  from: string;
  sentAt?: { day: DayOffset; time: string };
  to?: string;
  synthesis?: string;
  receivedAt?: { day: DayOffset; time: string };
}

export type HandoffStatus = "未作成" | "作成中" | "送り済み" | "受け済み";

export const statusOf = (h?: Handoff): HandoffStatus => (!h ? "未作成" : h.receivedAt ? "受け済み" : h.sentAt ? "送り済み" : "作成中");

/** The shift that starts next (or is starting), with its window in minutes from today 00:00. */
export function nextShift(nowAbs: number): { label: string; from: string; lo: number; hi: number } {
  const day = Math.floor(nowAbs / 1440);
  const m = nowAbs - day * 1440;
  // The shifts overlap 08:30–09:00 and 16:30–17:00, which is when the handoff is given: until 09:00 it
  // is still 夜勤→日勤, until 17:00 日勤→夜勤; after 17:00 the next one is tomorrow morning's.
  if (m < 540) return { label: "夜勤→日勤", from: "日勤", ...shiftWindow("day", day) };
  if (m < 1020) return { label: "日勤→夜勤", from: "夜勤", ...shiftWindow("night", day) };
  return { label: "夜勤→日勤", from: "日勤", ...shiftWindow("day", day + 1) };
}

const vitalLine = (v: WorkPatient["patient"]["vitals"][number]) => {
  const n = news2(v);
  const parts = [
    consciousnessText(v),
    v.bt !== undefined && `BT ${v.bt}`,
    v.hr !== undefined && `HR ${v.hr}`,
    v.sbp !== undefined && `BP ${v.sbp}/${v.dbp ?? "—"}`,
    v.rr !== undefined && `RR ${v.rr}`,
    v.spo2 !== undefined && `SpO2 ${v.spo2}%${v.o2 ? `（${v.o2}）` : ""}`,
  ].filter(Boolean);
  return `最新のバイタル（${v.day === 0 ? "" : `${v.day}日 `}${v.time}）：${parts.join("　")}　NEWS2 ${n.total}${n.red ? "（3点の項目あり）" : ""}`;
};

/** What the chart says now, for one patient, in short lines. Nothing here is a judgement. */
export function handoffFacts(w: WorkPatient, nowAbs: number, today: CalendarDate, extra: string[] = []): string[] {
  const p = w.patient;
  const out: string[] = [];
  const v = vitalsIn(p.vitals, "latest", nowAbs, null)[0];
  if (v) out.push(vitalLine(v));
  const flags = flagsFor(p, w.entries, nowAbs).map((f) => f.label);
  if (flags.length) out.push(`患者の印：${flags.join("・")}`);
  const changes = orderChanges([w], nowAbs - 720, nowAbs);
  if (changes.length) out.push(`この12時間の指示：${changes.map((c) => `${c.kind === "新規" ? "開始" : "中止"} ${orderLines(c.entry.order, today).main}`).join("／")}`);
  const ns = nextShift(nowAbs);
  const sheet = buildWorksheet([w], ns.lo, ns.hi, nowAbs);
  if (sheet.timed.length) {
    const kinds = new Map<string, number>();
    for (const i of sheet.timed) kinds.set(i.kind, (kinds.get(i.kind) ?? 0) + 1);
    const first = sheet.timed[0];
    out.push(
      `次の${ns.from}（${timeLabel(ns.lo, Math.floor(ns.lo / 1440), today)}〜）の予定：${[...kinds].map(([k, n]) => `${k} ${n}`).join("・")}（最初は ${timeLabel(first.at!, Math.floor(ns.lo / 1440), today)} ${first.main}）`,
    );
  }
  if (sheet.running.length) out.push(`続いているもの：${sheet.running.map((r) => r.main).join("／")}`);
  const pending = p.cultures.filter((c) => c.status !== "最終報告");
  if (pending.length) out.push(`結果待ちの培養：${pending.map((c) => `${c.specimen}（${c.status}）`).join("、")}`);
  return [...out, ...extra];
}

/** What is missing before sending (a person must choose the severity and say the summary). */
export function sendProblems(h: Handoff): string[] {
  const out: string[] = [];
  if (!h.severity) out.push("重症度を選んでください（安定・要注意・不安定）");
  if (!h.summary.trim()) out.push("患者の要約が空です");
  return out;
}

/** Where a handoff is kept: per patient and per shift handed to. */
export const handoffKey = (patientId: string, shiftLo: number, role = "") => `${patientId}@${shiftLo}@${role}`;

/** The latest handoff of an earlier shift for this patient (shown while writing the next one). */
export function previousHandoff(all: Record<string, Handoff>, patientId: string, shiftLo: number, role = ""): Handoff | undefined {
  return Object.values(all)
    .filter((h) => h.patientId === patientId && h.sentAt && (h.shiftLo ?? -Infinity) < shiftLo && (h.role ?? "") === role)
    .sort((a, b) => (b.shiftLo ?? 0) - (a.shiftLo ?? 0))[0];
}

export const emptyHandoff = (id: string, patientId: string, shift: string, from: string): Handoff => ({
  id,
  patientId,
  shift,
  severity: null,
  summary: "",
  actions: [],
  contingency: "",
  facts: [],
  from,
});
