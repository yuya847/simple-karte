// 口頭指示（verbal orders）: a nurse enters the order the doctor gave by voice (in an emergency or
// when the doctor cannot enter it at once); the doctor checks and signs it afterwards, within the
// hospital's time limit. Counting the limit is code.

import { doctorOf } from "./doctors";
import type { Staff } from "./roles";
import { abs } from "./flowsheet";
import { WARD_RULES } from "./master";
import type { OrderEntry } from "./types";

export const verbalUnsigned = (entries: OrderEntry[]) => entries.filter((e) => e.status !== "中止" && e.verbal && !e.verbal.cancelled && !e.verbal.signedAt);

/** Minutes from today 00:00 by which the doctor signs. */
export const verbalDeadline = (e: OrderEntry) => (e.verbal ? abs(e.verbal.at.day, e.verbal.at.time) + WARD_RULES.verbalSignHours * 60 : Infinity);

export const verbalOverdue = (e: OrderEntry, nowAbs: number) => e.status !== "中止" && !!e.verbal && !e.verbal.cancelled && !e.verbal.signedAt && nowAbs > verbalDeadline(e);

export const VERBAL_RULE = `この架空の病院では、口頭指示は緊急時など医師がすぐに入力できないときに限り、看護師が復唱して代わりに入力し、医師が${WARD_RULES.verbalSignHours}時間以内に内容を確かめて承認します。`;

export interface VerbalConfirmation { doctor: string; readBack: boolean; time: string }
export function verbalConfirmationProblems(v: VerbalConfirmation): string[] {
  return [!v.doctor.trim() && "指示した医師を選ぶか入力してください。", !v.readBack && "復唱したことを確認してください。", !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) && "指示の時刻を入力してください。"].filter((x): x is string => !!x);
}
export function canReviewVerbal(e: OrderEntry, me: Staff): boolean {
  return me.role === "医師" && !!e.verbal && !e.verbal.signedAt && !e.verbal.cancelled && e.status !== "中止" && (me.name === e.verbal.doctor || doctorOf(me.name)?.rank === "指導医");
}
export function reviewVerbal(e: OrderEntry, me: Staff, time: string, reason?: string): OrderEntry {
  if (!canReviewVerbal(e, me) || (reason !== undefined && !reason.trim())) return e;
  const at = { day: 0, time };
  return reason === undefined ? { ...e, verbal: { ...e.verbal!, signedAt: at, signedBy: me.name } } : { ...e, status: "中止", verbal: { ...e.verbal!, cancelled: { by: me.name, at, reason: reason.trim() } } };
}
