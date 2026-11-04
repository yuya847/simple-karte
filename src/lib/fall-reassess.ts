// 転倒・転落の再評価: when the risk items of 入院時の評価 (admit-eval.ts FALL_RISKS) must be looked at again, and
// the list of patients due. There is no score: we found no fall-risk score sheet published with permission to use
// (日本医師会's manual shows a 「転倒転落アセスメントスコアシート（例）」 adapted from two hospitals' manuals, under
// "All rights reserved"; 日本看護協会 publishes none we could find), so the nurse checks the same risk items again.
// The 提言 says to re-assess after a change of ward or a change of condition by treatment; how often to re-assess
// otherwise is this fictional hospital's rule. Code counts the days; the nurse assesses.

import type { ChecklistRecord } from "./admit-eval";
import type { DayOffset } from "./types";

export const FALL_SOURCES = {
  teigen: {
    label: "日本医療安全調査機構（医療事故調査・支援センター）「医療事故の再発防止に向けた提言 第9号 入院中に発生した転倒・転落による頭部外傷に係る死亡事例の分析」（2019年6月、2020年2月一部修正）提言7：入院や転棟による環境の変化、治療による患者の状態の変化時は転倒・転落の危険が高まる。病棟移動した際には転倒・転落リスクを再評価する",
    url: "https://www.medsafe.or.jp/teigen/teigen-09.pdf",
  },
};

export const FALL_RULES = {
  interval: "前の評価から7日ごとに再評価します（架空の病院の取り決め。提言に間隔の定めはありません）。",
  surgery: "手術のあとは、治療による状態の変化として再評価します（架空の病院の取り決め。提言7 の「治療による患者の状態の変化」をこの病院は手術と決めています）。",
  noScore: "点数の票は使いません。使用の許諾が示された公開のスコア票を見つけられなかったため、入院時の評価と同じ危険因子を確かめ直します。",
};

/** Days between re-assessments (架空の病院の取り決め). */
export const FALL_INTERVAL = 7;

export interface When {
  day: DayOffset;
  time: string;
}

/** Something after which the risk is looked at again (転棟・転床, 手術). */
export interface FallTrigger {
  at: When;
  label: string;
  kind: "転棟・転床" | "手術";
}

/** A patient's triggers from today's 転棟・転床 (moveLog) and the operations that have begun by now. */
export function fallTriggers(patientId: string, moves: { patientId: string; label: string; time: string }[], surgeries: { patientId?: string; day: number; start: string | null; procedure: string }[], nowTime: string): FallTrigger[] {
  return [
    ...moves.filter((m) => m.patientId === patientId).map((m) => ({ at: { day: 0, time: m.time }, label: m.label, kind: "転棟・転床" as const })),
    ...surgeries.filter((s) => s.patientId === patientId && s.start && (s.day < 0 || (s.day === 0 && s.start <= nowTime))).map((s) => ({ at: { day: s.day, time: s.start! }, label: `手術 ${s.procedure}`, kind: "手術" as const })),
  ];
}

export interface FallStep extends ChecklistRecord {
  kind: "入院時" | "再評価";
}

const t = (w: When) => w.day * 1440 + Number(w.time.slice(0, 2)) * 60 + Number(w.time.slice(3, 5));

/** Every assessment, oldest first: the one of 入院時の評価, then the re-assessments. */
export function fallSteps(first: ChecklistRecord | undefined, reviews: ChecklistRecord[]): FallStep[] {
  return [...(first ? [{ ...first, kind: "入院時" as const }] : []), ...reviews.map((r) => ({ ...r, kind: "再評価" as const }))].sort((a, b) => t(a.at) - t(b.at));
}

export interface FallDue {
  /** The day it is due (offset from today). */
  dueOn: DayOffset;
  state: "期限切れ" | "今日まで" | "期限内";
  /** Why it is due then, in words. */
  reasons: string[];
  last?: FallStep;
}

/**
 * When the next assessment is due: on the admission day if never assessed; else FALL_INTERVAL days after the last
 * one, or on the day of a 転棟・転床 or 手術 after it, whichever comes first.
 */
export function fallDue(admittedOn: DayOffset, first: ChecklistRecord | undefined, reviews: ChecklistRecord[], triggers: FallTrigger[]): FallDue {
  const steps = fallSteps(first, reviews);
  const last = steps.at(-1);
  const state = (d: DayOffset): FallDue["state"] => (d < 0 ? "期限切れ" : d === 0 ? "今日まで" : "期限内");
  if (!last) return { dueOn: admittedOn, state: state(admittedOn), reasons: ["入院時の評価がまだです（入院日：架空の病院の取り決め）"] };
  const after = triggers.filter((x) => t(x.at) > t(last.at)).sort((a, b) => t(a.at) - t(b.at));
  const periodic = last.at.day + FALL_INTERVAL;
  const firstTrigger = after[0];
  const dueOn = firstTrigger ? Math.min(periodic, firstTrigger.at.day) : periodic;
  const reasons = [
    ...after.map((x) => `${x.kind}のあと（${x.label}）`),
    ...(dueOn === periodic ? [`前の評価から${FALL_INTERVAL}日`] : []),
  ];
  return { dueOn, state: state(dueOn), reasons, last };
}

export interface FallRow extends FallDue {
  patientId: string;
}

/** Patients with their next assessment, those due first. */
export function fallDueList(patients: { id: string; admittedOn: DayOffset; first?: ChecklistRecord; reviews: ChecklistRecord[]; triggers: FallTrigger[] }[]): FallRow[] {
  return patients.map((p) => ({ patientId: p.id, ...fallDue(p.admittedOn, p.first, p.reviews, p.triggers) })).sort((a, b) => a.dueOn - b.dueOn);
}

/** What changed from the last assessment: risk items added and gone. */
export function fallChanges(before: ChecklistRecord | undefined, after: Pick<ChecklistRecord, "checked">): { added: string[]; gone: string[] } {
  const b = before?.checked ?? [];
  return { added: after.checked.filter((x) => !b.includes(x)), gone: b.filter((x) => !after.checked.includes(x)) };
}
