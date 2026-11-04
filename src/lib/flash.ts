// The short line at the foot of the right pane after something was confirmed (「記事を確定しました。左の経過に
// 入りました。」). Most are a plain string; one may carry a warning shown in 朱 beside it (NEWS2 after vitals).
// Nothing here is decided by AI: the numbers are the nurse's, the score is code.

import { drCallMatches, type StandingOrders } from "./standing";
import { news2 } from "./news2";
import type { VitalSign } from "./types";

export type Flash = string | { text: string; warn?: string; contact?: { score: number; reasons: string[] } };

/** The plain words of a flash (for logs and tests). */
export const flashText = (f: Flash): string => (typeof f === "string" ? f : `${f.text}${f.warn ? `　${f.warn}` : ""}`);

/** NEWS2 at or above this is said in 朱 with the flash: 5 is the score's own medium-risk trigger (news2.ts). */
export const FLASH_NEWS2_FROM = 5;

/**
 * 「記録しました 20:52　BT 37.2 HR 88 BP 128/76 RR 18 SpO2 96%。経過表の行に入りました。」 after vitals were
 * confirmed, with 「NEWS2 7点」 as the warning when the score is 5 or more. `dayLabel` names the day when the
 * measurement was not today's.
 */
export function vitalsFlash(v: VitalSign, dayLabel?: string, standing?: StandingOrders): Exclude<Flash, string> {
  const parts = [
    v.bt !== undefined && `BT ${v.bt}`,
    v.hr !== undefined && `HR ${v.hr}`,
    (v.sbp !== undefined || v.dbp !== undefined) && `BP ${v.sbp ?? "—"}/${v.dbp ?? "—"}`,
    v.rr !== undefined && `RR ${v.rr}`,
    v.spo2 !== undefined && `SpO2 ${v.spo2}%`,
  ].filter((x): x is string => !!x);
  const total = news2(v).total;
  const reasons = [...(total >= 7 ? [`NEWS2 ${total}点（7点以上）`] : []), ...drCallMatches(v, standing)];
  return {
    contact: reasons.length ? { score: total, reasons } : undefined,
    text: `記録しました ${dayLabel ? `${dayLabel} ` : ""}${v.time}　${parts.join(" ")}。経過表の行に入りました。`,
    warn: total >= FLASH_NEWS2_FROM ? `NEWS2 ${total}点` : undefined,
  };
}
