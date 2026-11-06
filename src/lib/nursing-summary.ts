// 看護サマリの提出と師長の承認、中間サマリ: a nurse writes a summary (退院・転院時、転棟時、または入院中の区切りの
// 中間サマリ) and hands it in; the 看護師長 approves it or returns it with a comment; the writer corrects it and
// hands it in again (every version stays). Who did what and when is kept with each step. Code checks only the
// rules below and counts when a 中間サマリ is due; the summary is written and judged by people, not by AI.

import { COSIGN_SOURCES } from "./cosign";
import { WARD_NURSES } from "./roster";
import type { Destination, SummarySection } from "./summary";
import type { DayOffset } from "./types";

export const SUMMARY_SOURCES = {
  confirm: COSIGN_SOURCES.confirm,
};

export const SUMMARY_RULES = {
  approve: "看護サマリは書いた看護師が看護師長に提出し、看護師長が承認するか、コメントをつけて差し戻します。書いた本人は承認できません。",
  mid: "入院が長くなった患者は、入院14日目と、その後は前の中間サマリから14日ごとに中間サマリを書きます。",
  demo: "看護師長の画面です。デモでは看護師で開けます。承認と差し戻しは「看護師長 小松」として記録し、操作した人は監査ログに残ります。",
};

/** Days between 中間サマリ (架空の病院の取り決め). */
export const MID_INTERVAL = 14;

/** The 看護師長 of 5階東 (fictional). */
export const HEAD_NURSE = WARD_NURSES.find((n) => n.head)?.name ?? "看護師長";

export const SUMMARY_KINDS = ["退院・転院時", "転棟時", "中間"] as const;
export type SummaryKind = (typeof SUMMARY_KINDS)[number];

export interface When {
  day: DayOffset;
  time: string;
}

export interface SummaryVersion {
  sections: SummarySection[];
  words: string;
  to?: Destination;
  by: string;
  at: When;
}

export interface SummaryEvent {
  kind: "提出" | "差し戻し" | "承認" | "再提出";
  by: string;
  at: When;
  comment?: string;
}

export interface NurseSummary {
  id: string;
  patientId: string;
  kind: SummaryKind;
  /** Oldest first; the last one is the one in force. */
  versions: SummaryVersion[];
  /** Oldest first. */
  events: SummaryEvent[];
}

export type SummaryState = "承認待ち" | "差し戻し" | "承認済み";

export function stateOf(s: NurseSummary): SummaryState {
  const last = s.events.at(-1)?.kind;
  return last === "承認" ? "承認済み" : last === "差し戻し" ? "差し戻し" : "承認待ち";
}

export const latest = (s: NurseSummary) => s.versions.at(-1)!;
export const writerOf = (s: NurseSummary) => latest(s).by;

/** A new summary, handed in. */
export function submit(id: string, patientId: string, kind: SummaryKind, v: SummaryVersion): NurseSummary {
  return { id, patientId, kind, versions: [v], events: [{ kind: "提出", by: v.by, at: v.at }] };
}

export type Result = { ok: true; summary: NurseSummary } | { ok: false; error: string };

/** The corrected version of a returned summary, handed in again (the earlier versions stay). */
export function resubmit(s: NurseSummary, v: SummaryVersion): Result {
  if (stateOf(s) !== "差し戻し") return { ok: false, error: "差し戻されたサマリだけを出し直せます。" };
  return { ok: true, summary: { ...s, versions: [...s.versions, v], events: [...s.events, { kind: "再提出", by: v.by, at: v.at }] } };
}

const reviewProblem = (s: NurseSummary, by: string): string | null => {
  if (stateOf(s) !== "承認待ち") return `いまは「${stateOf(s)}」です。承認待ちのサマリだけを承認・差し戻しできます。`;
  if (writerOf(s) === by) return "書いた本人は承認・差し戻しできません。";
  return null;
};

export function approve(s: NurseSummary, by: string, at: When): Result {
  const p = reviewProblem(s, by);
  return p ? { ok: false, error: p } : { ok: true, summary: { ...s, events: [...s.events, { kind: "承認", by, at }] } };
}

/** Return with a comment (the comment is required: the writer needs to know what to correct). */
export function returnWith(s: NurseSummary, by: string, at: When, comment: string): Result {
  const p = reviewProblem(s, by);
  if (p) return { ok: false, error: p };
  if (!comment.trim()) return { ok: false, error: "差し戻すときは、直してほしいところを書いてください。" };
  return { ok: true, summary: { ...s, events: [...s.events, { kind: "差し戻し", by, at, comment: comment.trim() }] } };
}

/** The last comment of a return (for the writer). */
export const lastReturn = (s: NurseSummary) => [...s.events].reverse().find((e) => e.kind === "差し戻し");

export interface MidDue {
  patientId: string;
  /** The day the next 中間サマリ is due (offset from today). */
  dueOn: DayOffset;
  /** 入院◯日目 on that day. */
  stayDay: number;
  state: "期限切れ" | "今日まで" | "まだ先";
  /** The last 中間サマリ handed in, if any. */
  last?: NurseSummary;
}

/**
 * When the next 中間サマリ is due: 入院14日目 (the admission day is day 1), then MID_INTERVAL days after the last
 * one was first handed in. A summary returned and not yet handed in again still counts as written.
 */
export function midDue(patientId: string, admittedOn: DayOffset, summaries: NurseSummary[]): MidDue {
  const mids = summaries.filter((s) => s.patientId === patientId && s.kind === "中間").sort((a, b) => a.versions[0].at.day - b.versions[0].at.day);
  const last = mids.at(-1);
  const dueOn = last ? last.versions[0].at.day + MID_INTERVAL : admittedOn + MID_INTERVAL - 1;
  return { patientId, dueOn, stayDay: dueOn - admittedOn + 1, state: dueOn < 0 ? "期限切れ" : dueOn === 0 ? "今日まで" : "まだ先", last };
}

/** Patients whose 中間サマリ is due within `within` days or overdue, overdue first. */
export function midDueList(patients: { id: string; admittedOn: DayOffset }[], summaries: NurseSummary[], within = 3): MidDue[] {
  return patients
    .map((p) => midDue(p.id, p.admittedOn, summaries))
    .filter((d) => d.dueOn <= within)
    .sort((a, b) => a.dueOn - b.dueOn);
}

/** FICTIONAL summaries before this session: one 中間サマリ waiting for the 看護師長. */
export function initialSummaries(): NurseSummary[] {
  return [
    submit("ns-sugawara-mid1", "90035153", "中間", {
      sections: [
        { heading: "病名", lines: ["消化器内科の入院"] },
        { heading: "経過（入院15日目まで）", lines: ["絶食と補液ののち、5日前から食事を再開。腹痛なし。", "病棟内は独歩。夜間の排泄は自立。"] },
        { heading: "看護問題", lines: ["#1 食事の再開に伴う腹部症状の観察（継続）"] },
      ],
      words: "退院に向けて、食事指導の日程を主治医と調整中。",
      by: "看護師 渡辺",
      at: { day: -1, time: "16:20" },
    }),
  ];
}
