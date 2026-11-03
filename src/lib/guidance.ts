// 指導の記録: the 栄養食事指導・服薬指導・退院時の生活指導 actually given — to whom, for how long, what was
// said — which closes the doctor's 指導の依頼 and goes into the chart as that person's note. Time limits are
// the ones the fee schedule names; code compares the minutes, people write the content.

import type { GuideOrder, OrderEntry } from "./types";

export const GUIDANCE_SOURCE = {
  label: "厚生労働省告示第57号（令和6年）別表第一 医科診療報酬点数表 B001 10 入院栄養食事指導料（週1回。入院中2回に限り算定）",
  url: "https://www.mhlw.go.jp/content/12404000/001251499.pdf",
};
export const GUIDANCE_TIME_SOURCE = {
  label: "厚生労働省保険局医療課長通知 保医発0305第4号（令和6年3月5日）別添1 B001 10 (1)（初回は概ね30分以上、2回目は概ね20分以上）",
  url: "https://www.mhlw.go.jp/content/12404000/001293312.pdf",
};

/** The minutes the notice names for 入院栄養食事指導料 (初回 30・2回目 20), compared with what was entered. */
export function nutritionTimeNote(minutes: number | null, earlier: number): string | null {
  if (minutes === null || earlier >= 2) return null;
  const need = earlier === 0 ? 30 : 20;
  return minutes < need ? `${earlier === 0 ? "初回" : "2回目"}は概ね${need}分以上が算定の要件です（入力 ${minutes}分）。` : null;
}

export type GuideKind = GuideOrder["kind"];
export const WHO_HEARD = ["本人", "家族", "本人と家族"] as const;

export interface GuidanceRecord {
  id: string;
  patientId: string;
  kind: GuideKind;
  heard: (typeof WHO_HEARD)[number];
  minutes: number | null;
  text: string;
  by: string;
  at: { day: number; time: string };
  /** The 指導の依頼 orders this record answered. */
  answers: string[];
  /** 栄養食事指導: who the fee schedule covers (the notice's (1)), chosen by the person; 対象外 = not billed. */
  eligible?: (typeof NUTRITION_ELIGIBLE)[number];
  /** It went to the claim (入院栄養食事指導料): only these count toward 初回・2回目 and 週1回. */
  billed?: boolean;
}

/** 入院栄養食事指導料 covers 特別食 patients and those in the notice's (1) ア〜ウ. */
export const NUTRITION_ELIGIBLE = ["特別食", "がん患者", "摂食・嚥下機能の低下", "低栄養状態", "対象外（算定しない）"] as const;

/** 指導の依頼 for this patient and kind that are still open. */
export function openRequests(entries: OrderEntry[], kind: GuideKind, done: GuidanceRecord[]): OrderEntry[] {
  const closed = new Set(done.flatMap((r) => r.answers));
  return entries.filter((e) => e.status === "有効" && e.order.type === "procedure" && e.order.guide?.kind === kind && !closed.has(e.id));
}

/** What is missing before the record can be kept. */
export function guidanceProblems(r: Pick<GuidanceRecord, "text" | "minutes">): string[] {
  const out: string[] = [];
  if (!r.text.trim()) out.push("内容");
  if (r.minutes === null || r.minutes <= 0) out.push("時間（分）");
  return out;
}

/**
 * 栄養食事指導 and the fee schedule's limits (週1回, 入院中2回): `earlier` are the days of the ones already
 * recorded, `dow` gives the weekday (0 = Sunday) of a day offset. Not a judgement on the content.
 */
export function nutritionCountNote(earlier: number[], day: number, dow: (d: number) => number): string | null {
  if (earlier.length >= 2) return "入院栄養食事指導料は入院中2回までです（これは3回目以降のため算定の対象外）。";
  const weekStart = day - dow(day);
  if (earlier.some((d) => d >= weekStart && d <= day)) return "入院栄養食事指導料は週1回までです（同じ週にもう記録があります）。";
  return null;
}

export const guidanceNoteText = (r: GuidanceRecord) => `【${r.kind}】相手：${r.heard}${r.minutes ? `　${r.minutes}分` : ""}\n${r.text.trim()}`;
