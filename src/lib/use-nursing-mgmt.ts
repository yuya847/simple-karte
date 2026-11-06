"use client";

// The records of the ward's nursing management (褥瘡の経過・状態の一括登録・業務分担・看護サマリの承認 …), with the
// fictional state they start from. WardApp spreads `states` into useWorkspace so they are saved with the other
// records of the session.

import { useState } from "react";
import type { ChecklistRecord } from "./admit-eval";
import type { AssignBook } from "./assignments";
import { HEAD_NURSE, approve, initialSummaries, resubmit, returnWith, submit, type NurseSummary, type Result, type SummaryKind, type SummaryVersion, type When } from "./nursing-summary";
import { initialUlcers, type PressureUlcer } from "./pressure-course";
import type { StatusBook } from "./ward-status";

export function useNursingMgmt(seed?: { ulcers: PressureUlcer[]; fallReviews: Record<string, ChecklistRecord[]> }) {
  const [ulcers, setUlcers] = useState<PressureUlcer[]>(() => seed?.ulcers ?? initialUlcers());
  /** 状態の一括登録, by floor. */
  const [statusBook, setStatusBook] = useState<Record<string, StatusBook>>({});
  /** 業務分担, by floor and shift. */
  const [assignBook, setAssignBook] = useState<AssignBook>({});
  /** 看護サマリ handed in to the 看護師長. */
  const [summaries, setSummaries] = useState<NurseSummary[]>(initialSummaries);
  /** 転倒・転落の再評価, by patient (the first assessment is 入院時の評価's). */
  const [fallReviews, setFallReviews] = useState<Record<string, ChecklistRecord[]>>(() => seed?.fallReviews ?? {});

  const put = (s: NurseSummary) => setSummaries((all) => (all.some((x) => x.id === s.id) ? all.map((x) => (x.id === s.id ? s : x)) : [...all, s]));
  const apply = (r: Result): string | null => (r.ok ? (put(r.summary), null) : r.error);
  /** Hand a summary in, or a returned one again (its id). Returns why not, or null. */
  const handIn = (id: string, patientId: string, kind: SummaryKind, v: SummaryVersion, resubmitOf?: string): string | null => {
    if (!resubmitOf) return (put(submit(id, patientId, kind, v)), null);
    const s = summaries.find((x) => x.id === resubmitOf);
    return s ? apply(resubmit(s, v)) : "出し直すサマリが見つかりません。";
  };
  /** 承認 or 差し戻し by the 看護師長 (recorded as HEAD_NURSE in this demo). */
  const review = (s: NurseSummary, at: When, comment?: string): string | null => apply(comment === undefined ? approve(s, HEAD_NURSE, at) : returnWith(s, HEAD_NURSE, at, comment));

  return {
    ulcers,
    setUlcers,
    statusBook,
    setStatusBook,
    assignBook,
    setAssignBook,
    summaries,
    handIn,
    review,
    fallReviews,
    addFallReview: (patientId: string, r: ChecklistRecord) => setFallReviews((all) => ({ ...all, [patientId]: [...(all[patientId] ?? []), r] })),
    /** For useWorkspace (the names must stay the same). */
    states: {
      ulcers: [ulcers, setUlcers],
      statusBook: [statusBook, setStatusBook],
      assignBook: [assignBook, setAssignBook],
      nurseSummaries: [summaries, setSummaries],
      fallReviews: [fallReviews, setFallReviews],
    } as Record<string, [unknown, (v: never) => void]>,
  };
}
