// 業務分担（受け持ちの割り当て）: for each shift, which of the shift's nurses (from the 勤務表) looks after which
// bed of 5階東. The leader or the 看護師長 assigns; code lists the shift's nurses from the roster, counts each one's
// patients (for the notice to post), points out beds with nobody and nurses who are not on the roster that
// shift, and once the plan is confirmed, records every change during the shift with who, when and why.
// Nobody is assigned by AI or by code (there is no "assign for me" button). Data is fictional.

import { addDays, type CalendarDate } from "./dates";
import { monthKey, type RosterBook, type RosterNurse } from "./roster";
import type { DayOffset } from "./types";
import type { ShiftName } from "./ward-status";

const NOTICE = "https://www.mhlw.go.jp/content/12400000/001757361.pdf";

export const ASSIGN_SOURCES = {
  plan: { label: "厚生労働省保険局医療課長通知（令和8年3月5日 保医発0305第7号）別添6 別紙6「入院基本料に係る看護記録」2(2) 看護業務の計画に関する記録（看護要員の勤務計画及び業務分担並びに看護師、准看護師の受け持ち患者割当等について看護チームごとに掲げておく）", url: NOTICE },
  log: { label: "同 別紙6 2(1) 看護業務の管理に関する記録（患者の移動、看護要員の勤務状況並びに勤務交代に際して申し送る必要のある事項等を各勤務帯ごとに記録する）", url: NOTICE },
  post: { label: "同 通知 別添2 第2 4 (5)ア（各勤務帯のそれぞれで、1人の看護要員が実際に受け持っている入院患者の数を各病棟内に掲示する）", url: NOTICE },
  lpn: { label: "同 別添2 第2 4 (6)イ（病状の観察・報告、療養上の世話、与薬・注射などの患者の病状に直接影響のある看護は、看護師又は看護師の指示を受けた准看護師が行う）", url: NOTICE },
};

export const ASSIGN_RULES = {
  who: "分担を決めるのは、その勤務帯のリーダーか看護師長です。",
  change: "分担を確定したあとに変えるときは、理由を書きます。",
  lpn: "准看護師に受け持ちを割り当てるときは、指示を出す看護師を決めます（根拠は別添2 第2 4 (6)イ）。",
};

export interface When {
  day: DayOffset;
  time: string;
}

export interface AssignChange {
  at: When;
  by: string;
  bed: string;
  patient?: string;
  from?: string;
  to?: string;
  reason: string;
}

export interface AssignSheet {
  /** Bed ("515B", "512") → nurse id. */
  beds: Record<string, string>;
  /** 准看護師 id → the 看護師 id who gives the instructions. */
  directs: Record<string, string>;
  confirmed?: { by: string; at: When };
  /** Changes made after the plan was confirmed, oldest first. */
  changes: AssignChange[];
}

/** By floor and shift: "5階東病棟|0|day". */
export type AssignBook = Record<string, AssignSheet>;
export const assignKey = (floor: string, day: DayOffset, shift: ShiftName) => `${floor}|${day}|${shift}`;
export const emptySheet = (): AssignSheet => ({ beds: {}, directs: {}, changes: [] });

/** The roster's code for a nurse on a calendar date (the month's index 0 is the last day of the month before). */
export function rosterCode(book: RosterBook, nurseId: string, date: CalendarDate): string {
  const m = book.months[monthKey(date.y, date.m)];
  if (m) return m.shifts[nurseId]?.[date.d] ?? "";
  // The last day of a month is also index 0 of the next month.
  const next = date.m === 12 ? { y: date.y + 1, m: 1 } : { y: date.y, m: date.m + 1 };
  const n = book.months[monthKey(next.y, next.m)];
  const last = new Date(Date.UTC(date.y, date.m, 0)).getUTCDate();
  return n && date.d === last ? (n.shifts[nurseId]?.[0] ?? "") : "";
}

/** The nurses of a shift by the roster: 日勤 = 「日」 that day, 夜勤 = 「夜」 beginning that day. */
export function crewOn(book: RosterBook, today: CalendarDate, day: DayOffset, shift: ShiftName): RosterNurse[] {
  const date = addDays(today, day);
  const want = shift === "day" ? "日" : "夜";
  return book.nurses.filter((n) => rosterCode(book, n.id, date) === want);
}

export interface Bed {
  key: string;
  patientId: string;
  name: string;
}

/**
 * Assign beds to a nurse (or take them off with null). Before the plan is confirmed it is a draft; after, every
 * changed bed is written to the change log with the reason (which must then be given).
 */
export function assign(sheet: AssignSheet, keys: string[], nurseId: string | null, ctx: { by: string; at: When; reason?: string; nameOf: (nurseId: string) => string; beds: Bed[] }): AssignSheet {
  const beds = { ...sheet.beds };
  const changes = [...sheet.changes];
  for (const k of keys) {
    const before = beds[k];
    if ((before ?? null) === nurseId) continue;
    if (nurseId) beds[k] = nurseId;
    else delete beds[k];
    if (sheet.confirmed) changes.push({ at: ctx.at, by: ctx.by, bed: k, patient: ctx.beds.find((b) => b.key === k)?.name, from: before ? ctx.nameOf(before) : undefined, to: nurseId ? ctx.nameOf(nurseId) : undefined, reason: (ctx.reason ?? "").trim() });
  }
  return { ...sheet, beds, changes };
}

/** A change after the plan is confirmed needs a reason. */
export const needsReason = (sheet: AssignSheet) => !!sheet.confirmed;

/** Copy another shift's plan, for the nurses who are on this shift (others' beds stay empty). Directions too. */
export function copyPlan(from: AssignSheet, crew: RosterNurse[]): AssignSheet {
  const ids = new Set(crew.map((n) => n.id));
  return {
    beds: Object.fromEntries(Object.entries(from.beds).filter(([, n]) => ids.has(n))),
    directs: Object.fromEntries(Object.entries(from.directs).filter(([a, b]) => ids.has(a) && ids.has(b))),
    changes: [],
  };
}

export interface NurseLoad {
  nurse: RosterNurse;
  beds: Bed[];
}

/** Each nurse of the shift with the beds they look after, in room order. */
export function loads(sheet: AssignSheet, beds: Bed[], crew: RosterNurse[]): NurseLoad[] {
  return crew.map((nurse) => ({ nurse, beds: beds.filter((b) => sheet.beds[b.key] === nurse.id).sort((a, b) => a.key.localeCompare(b.key)) }));
}

/** 1人の看護要員が実際に受け持っている入院患者の数 (the most of any nurse of the shift who has patients). */
export function maxLoad(sheet: AssignSheet, beds: Bed[], crew: RosterNurse[]): number {
  return Math.max(0, ...loads(sheet, beds, crew).map((l) => l.beds.length));
}

export interface AssignIssue {
  kind: "未割当" | "勤務外" | "指示";
  text: string;
  bed?: string;
}

/** Beds with a patient and nobody, nurses assigned who are not on the roster that shift, and 准看護師 without a 看護師. */
export function assignIssues(sheet: AssignSheet, beds: Bed[], crew: RosterNurse[], nurses: RosterNurse[]): AssignIssue[] {
  const out: AssignIssue[] = [];
  const on = new Set(crew.map((n) => n.id));
  const name = (id: string) => nurses.find((n) => n.id === id)?.name ?? id;
  for (const b of beds) if (!sheet.beds[b.key]) out.push({ kind: "未割当", bed: b.key, text: `${b.key} ${b.name}：受け持ちがまだ決まっていません。` });
  for (const id of new Set(Object.values(sheet.beds))) if (!on.has(id)) out.push({ kind: "勤務外", text: `${name(id)}は、勤務表ではこの勤務帯に入っていません。` });
  for (const n of crew) {
    if (n.kind !== "准看護師" || !Object.values(sheet.beds).includes(n.id)) continue;
    const d = sheet.directs[n.id];
    if (!d || !on.has(d) || nurses.find((x) => x.id === d)?.kind !== "看護師") out.push({ kind: "指示", text: `${n.name}に指示を出す看護師（この勤務帯の看護師）が決まっていません。` });
  }
  return out;
}

/** The nurse of a bed in a plan (for the map and the worksheet), by name. */
export function nurseOfBed(sheet: AssignSheet | undefined, bed: string, nurses: RosterNurse[]): string | undefined {
  const id = sheet?.beds[bed];
  return id ? nurses.find((n) => n.id === id)?.name : undefined;
}

/** "看護師 田中：512 佐倉・515B 大浦" per nurse with beds among these (the worksheet's line), in room order. */
export function planLines(sheet: AssignSheet | undefined, beds: Bed[], nurses: RosterNurse[]): string[] {
  if (!sheet) return [];
  const by = new Map<string, Bed[]>();
  for (const b of [...beds].sort((x, y) => x.key.localeCompare(y.key))) {
    const id = sheet.beds[b.key];
    if (id) by.set(id, [...(by.get(id) ?? []), b]);
  }
  return [...by.entries()].map(([id, bs]) => `${nurses.find((n) => n.id === id)?.name ?? id}：${bs.map((b) => `${b.key} ${b.name}`).join("・")}`);
}

/** "田中・伊藤" for a room's beds (the map's room header). */
export function roomNurses(sheet: AssignSheet | undefined, room: string, bedLetters: string[], nurses: RosterNurse[]): string[] {
  return [...new Set(bedLetters.map((b) => nurseOfBed(sheet, `${room}${b}`, nurses)).filter((x): x is string => !!x))];
}
