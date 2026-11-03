// 口頭指示（verbal orders）: a nurse enters the order the doctor gave by voice (in an emergency or
// when the doctor cannot enter it at once); the doctor checks and signs it afterwards, within the
// hospital's time limit. Counting the limit is code.

import { abs } from "./flowsheet";
import { WARD_RULES } from "./master";
import type { OrderEntry } from "./types";

export const verbalUnsigned = (entries: OrderEntry[]) => entries.filter((e) => e.verbal && !e.verbal.signedAt);

/** Minutes from today 00:00 by which the doctor signs. */
export const verbalDeadline = (e: OrderEntry) => (e.verbal ? abs(e.verbal.at.day, e.verbal.at.time) + WARD_RULES.verbalSignHours * 60 : Infinity);

export const verbalOverdue = (e: OrderEntry, nowAbs: number) => !!e.verbal && !e.verbal.signedAt && nowAbs > verbalDeadline(e);

export const VERBAL_RULE = `この架空の病院では、口頭指示は緊急時など医師がすぐに入力できないときに限り、看護師が復唱して代わりに入力し、医師が${WARD_RULES.verbalSignHours}時間以内に内容を確かめて承認します。`;
