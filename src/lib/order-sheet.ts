import { patternCourse } from "./day-pattern";
// 指示受け and 実施入力 in the form of the big vendors' ward screens (富士通 HOPE/EGMAIN-GX catalog): a
// date to move through, the kinds of orders to show, a band per patient (ID・氏名・年齢・性別・部屋), and
// one block per order — a heading with the kind and the order's date and time, three pairs of
// 「日時／者」 on the right (指示開始・実施・指示受け), and the order itself as 「項目名：値」 lines.
// Code arranges what the orders say; nurses and doctors decide. Nothing here calls AI.

import { addDays, formatShort, type CalendarDate } from "./dates";
import { consentText, findPhysio, usesContrast } from "./exams";
import { drugName, durationText, imagingMethodText, imagingTitle, labName, oralName, procedureTitle, scheduleTextFor, timingText } from "./format";
import { WARD_RULES } from "./master";
import { marKey, type AdminRecord, type NotDoneReason } from "./mar";
import { CONFIRM_SOURCES } from "./order-confirm";
import type { TakeRow } from "./order-take";
import { ventSettingText } from "./icu/vent-text";
import { AREA_LABEL, DEPTH_LABEL, consultText, findProcDrug, guideText, hdText, leaveText, moveText, procScheduleText, rehabText, txText } from "./procedures";
import type { DayOffset, Order, OrderEntry } from "./types";
import { changeKey, type WorkItem, type WorkKind } from "./worksheet";

/** The catalog the screens follow (its 指示受け and 実施入力 pictures). */
export const SHEET_SOURCES = [CONFIRM_SOURCES[0]];

// ---------------------------------------------------------------------------
// The kinds to tick at the top (架空の病院の取り決め: how this hospital groups its orders)
// ---------------------------------------------------------------------------

export type SheetCategory = "処置・検査" | "注射・輸血" | "処方" | "看護指示" | "食事" | "その他";
export const SHEET_CATEGORIES: SheetCategory[] = ["処置・検査", "注射・輸血", "処方", "看護指示", "食事", "その他"];

/** The category of an order: 注射 and 輸血 together, 内服 as 処方, everything else (処置・検体・画像・生理) as 処置・検査. */
export function categoryOfOrder(o: Order): SheetCategory {
  if (o.type === "injection") return "注射・輸血";
  if (o.type === "procedure" && o.tx) return "注射・輸血";
  if (o.type === "prescription") return "処方";
  return "処置・検査";
}

const TYPE_CATEGORY: Record<string, SheetCategory> = { 注射: "注射・輸血", 内服: "処方", 処置: "処置・検査", 検体検査: "処置・検査", 画像: "処置・検査", "生理・内視鏡": "処置・検査" };

/** The category of a 指示受け row: 指示簿 is 看護指示, 食事 is 食事, 延長 is その他; orders by their type. */
export function categoryOfTake(r: Pick<TakeRow, "kind" | "type">, entry?: OrderEntry): SheetCategory {
  if (r.kind === "指示簿") return "看護指示";
  if (r.kind === "食事") return "食事";
  if (r.kind === "延長") return "その他";
  return entry ? categoryOfOrder(entry.order) : (TYPE_CATEGORY[r.type] ?? "その他");
}

/** The category of a worksheet item (実施入力). */
export const categoryOfWork = (kind: WorkKind): SheetCategory => (kind === "注射" ? "注射・輸血" : kind === "内服" ? "処方" : "処置・検査");

// ---------------------------------------------------------------------------
// The date at the top: today and the days around it (架空の病院の取り決め)
// ---------------------------------------------------------------------------

/** 指示受け: the days the screen moves through (yesterday … tomorrow). */
export const TAKE_DAYS = { min: -1, max: 1 } as const;
/** 実施入力: the same range; 実施 can only be entered for today and yesterday (the rest is looked at). */
export const EXECUTE_DAYS = { min: -1, max: 1 } as const;

export const clampDay = (d: number, range: { min: number; max: number }) => Math.max(range.min, Math.min(range.max, d));

/** When an order starts (指示開始日時) as the order says it: a day, and a time when it has one. "至急" exams start at once. */
export function startOf(o: Order): { day: DayOffset; time?: string; urgent?: boolean } | null {
  if (o.type === "injection" || o.type === "procedure") return { day: o.start.day, time: o.start.time };
  if (o.type === "prescription") return { day: o.start.day, time: o.start.timing ? WARD_RULES.medTimes[o.start.timing] : undefined };
  if (o.type === "lab") return { day: o.collect.day, time: o.collect.time };
  if (o.type === "imaging" || o.type === "physio") return o.when.priority === "至急" ? { day: o.when.day, urgent: true } : { day: o.when.day, time: o.when.time };
  return null;
}

/** "11/4（水） 14:00", "11/4（水）" or "至急（11/4（水））". */
export function startLabel(o: Order, today: CalendarDate): string {
  const s = startOf(o);
  if (!s) return "";
  const d = formatShort(addDays(today, s.day));
  if (s.urgent) return `至急（${d}）`;
  return s.time ? `${d} ${s.time}` : d;
}

/** "11/4（水） 10:00" for a moment in minutes from today 00:00; without a time, "11/4（水）（時刻なし）". */
export function momentLabel(at: number, today: CalendarDate, timeKnown = true): string {
  const day = Math.floor(at / 1440);
  const m = ((at % 1440) + 1440) % 1440;
  const d = formatShort(addDays(today, day as DayOffset));
  return timeKnown ? `${d} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` : `${d}（時刻なし）`;
}

/** A 指示受け row belongs to a day when the order was given that day, or starts that day (架空の病院の取り決め). */
export function takeRowOnDay(r: Pick<TakeRow, "at">, day: number, entry?: OrderEntry): boolean {
  if (Math.floor(r.at / 1440) === day) return true;
  const s = entry ? startOf(entry.order) : null;
  return !!s && s.day === day;
}

// ---------------------------------------------------------------------------
// The heading and the 「項目名：値」 lines of one order
// ---------------------------------------------------------------------------

/** "入院注射", "入院処方", "看護指示（指示簿）" … the heading of a block. */
export function sheetTitle(r: Pick<TakeRow, "kind" | "type">): string {
  if (r.kind === "指示簿") return "看護指示（指示簿）";
  if (r.kind === "食事") return "入院食事";
  if (r.kind === "延長") return `入院${r.type === "延長" ? "指示" : r.type}の延長`;
  return `入院${r.type}`;
}

/** The heading of a worksheet item (実施入力). */
export const workTitle = (kind: WorkKind): string => `入院${kind === "採血" ? "検体検査" : kind}`;

export interface SheetField {
  label: string;
  value: string;
}

const dayText = (today: CalendarDate, day: DayOffset, time?: string) => `${formatShort(addDays(today, day))}${time ? ` ${time}` : ""}`;

/**
 * The order as 「項目名：値」 lines, only the items the kind of order has (手技・薬品・用法・速度・実施場所 for
 * an injection; 薬品・用法・区分 for a prescription; 検査項目・採取・優先 for a lab; and so on).
 */
export function orderFields(o: Order, today: CalendarDate, place: string): SheetField[] {
  const f: SheetField[] = [];
  const put = (label: string, value: string | undefined | null | false) => {
    if (value) f.push({ label, value });
  };
  if (o.type === "injection") {
    put("手技", o.route);
    for (const it of o.items) put("薬品", `${drugName(it.drugCode)}　${it.amount}${it.unit}`);
    put("用法", scheduleTextFor(o));
    put("1回の時間", o.minutesPerDose ? durationText(o.minutesPerDose) : undefined);
    put("速度", o.rateMlPerH ? `${o.rateMlPerH?.toFixed(1)} mL/時` : undefined);
    put("指示開始", dayText(today, o.start.day, o.start.time));
    put("日数", o.schedule.kind === "once" ? undefined : o.dayPattern ? patternCourse(o.dayPattern, o.start.day, o.days, false, today) : o.days ? `${o.days}日間` : "継続（変更まで）");
    put("実施場所", place);
    put("コメント", o.comment);
  } else if (o.type === "prescription") {
    put("薬品", `${oralName(o.drugCode)}　1回${o.amount}${o.unit}${o.dailyAmount ? `（1日${o.dailyAmount}${o.unit}）` : ""}`);
    put("用法", timingText(o));
    put("区分", o.category);
    put("指示開始", dayText(today, o.start.day, o.start.timing));
    put("日数", o.dayPattern ? patternCourse(o.dayPattern, o.start.day, o.days, true, today) : o.days ? `${o.days}日分` : "継続（変更まで）");
    put("コメント", o.comment);
  } else if (o.type === "lab") {
    put("検査項目", o.codes.map(labName).join("、"));
    put("採取", dayText(today, o.collect.day, o.collect.time));
    put("優先", o.priority);
    put("コメント", o.comment);
  } else if (o.type === "imaging") {
    put("検査", imagingTitle(o));
    put("左右", o.side);
    put("撮影", imagingMethodText({ ...o, position: undefined, note: undefined }));
    put("体位", o.position ? (o.modality === "ポータブルX線" ? `病室で${o.position}` : o.position) : undefined);
    put("条件の備考", o.note);
    put("同意", usesContrast(o) ? consentText(o.consent) || "同意：未取得" : undefined);
    put("読影", o.reading);
    put("予定", o.when.priority === "至急" ? "至急" : `${dayText(today, o.when.day, o.when.time)} 予約`);
    put("搬送", o.transport);
    put("目的", o.purpose);
    put("体内金属", o.answers?.metal);
    put("コメント", o.comment);
  } else if (o.type === "physio") {
    put("検査", findPhysio(o.test)?.name ?? o.test);
    put("予定", o.when.priority === "至急" ? "至急" : `${dayText(today, o.when.day, o.when.time)} 予約`);
    put("場所", o.place);
    put("搬送", o.transport);
    put("目的", o.purpose);
    put("コメント", o.comment);
  } else {
    put("処置", procedureTitle(o));
    put("内容", o.hd ? hdText(o.hd) : o.vent ? ventSettingText(o.vent) : o.tx ? txText(o.tx) : o.rehab ? rehabText(o.rehab) : o.consult ? consultText(o.consult) : o.leave ? leaveText(o.leave, (d) => formatShort(addDays(today, d as DayOffset))) : o.guide ? guideText(o.guide) : o.move ? moveText(o.move) : undefined);
    put("深さ", o.depth ? DEPTH_LABEL[o.depth].split(" ")[0] : undefined);
    put("範囲", o.area ? AREA_LABEL[o.area] : undefined);
    put("回数", procScheduleText(o.schedule));
    put("薬品", o.drug ? `${findProcDrug(o.drug.code)?.name ?? o.drug.code} ${o.drug.amount}${findProcDrug(o.drug.code)?.unit ?? ""}` : undefined);
    put("指示開始", dayText(today, o.start.day, o.start.time));
    put("日数", o.schedule.kind === "continuous" || o.schedule.kind === "once" ? undefined : o.days ? `${o.days}日間` : "継続（変更まで）");
    put("実施場所", place);
    put("コメント", o.comment);
  }
  return f;
}

/** The lines of a 指示受け row: the order's items when the order is in the record, else the text of the change (食事・指示簿・延長). */
export function takeFields(r: Pick<TakeRow, "kind" | "type" | "main" | "detail">, entry: OrderEntry | undefined, today: CalendarDate, place: string): SheetField[] {
  if (entry && r.kind !== "延長") return orderFields(entry.order, today, place);
  const f: SheetField[] = [{ label: r.kind === "延長" ? "延長" : "内容", value: r.main }];
  if (r.detail) f.push({ label: r.kind === "延長" ? "日数" : "詳細", value: r.detail });
  return f;
}

/** The order a 指示受け row is about (the new or replacing order; for a stop, the stopped one), from the people's entries. */
export function entryOfRow(r: Pick<TakeRow, "keys" | "patientId">, people: { patient: { id: string }; entries: OrderEntry[] }[]): OrderEntry | undefined {
  const id = r.keys.at(-1)!.split("|")[0];
  return people.find((x) => x.patient.id === r.patientId)?.entries.find((e) => e.id === id);
}

/**
 * 今日の未指示受け: the rows not yet taken that the 指示受け screen lists on its 今日 page (given today or starting
 * today). The tab's badge and 「やること」 count these — the rows of other days are only 「ほかの日に N件」.
 */
export function waitingToday(rows: TakeRow[], people: { patient: { id: string }; entries: OrderEntry[] }[], isTaken: (r: TakeRow) => boolean): TakeRow[] {
  return rows.filter((r) => !isTaken(r) && takeRowOnDay(r, 0, entryOfRow(r, people)));
}

/** The short green band under a row just acted on: 「受けました（12:10 看護師 佐藤）」／「確認しました（…）」. */
export const DONE_BAND_MS = 3000;
export function doneBandText(what: "take" | "confirm", at: string, by: string): string {
  return `${what === "take" ? "受けました" : "確認しました"}（${at} ${by}）`;
}

// ---------------------------------------------------------------------------
// The three 「日時／者」 pairs on the right
// ---------------------------------------------------------------------------

export interface Stamp {
  at: string;
  by: string;
}
export const EMPTY_STAMP: Stamp = { at: "", by: "" };

/** "11:00 看護師 佐藤・確認 看護師 田中" → { at: "11:00", by: "看護師 佐藤・確認 看護師 田中" }. */
export function splitStamp(s: string | undefined): Stamp {
  if (!s) return EMPTY_STAMP;
  const m = s.match(/^(\d{2}:\d{2})\s*(.*)$/);
  return m ? { at: m[1], by: m[2] } : { at: "", by: s };
}

/** 指示受け of an order (by its id) for the 実施入力 rows: who took the latest change, or 「前の勤務帯」 when it was taken before this session. */
export function takeStampOf(orderId: string, taken: Record<string, string>, sessionKeys: Set<string>): Stamp {
  for (const kind of ["中止", "新規"] as const) {
    const k = changeKey(orderId, kind);
    if (taken[k]) return splitStamp(taken[k]);
    if (!sessionKeys.has(k) && kind === "新規") return EMPTY_STAMP;
  }
  return EMPTY_STAMP;
}

/** The latest 実施・未実施 of an order (any dose), for the 指示受け rows. */
export function doneStampOf(orderId: string, records: Record<string, AdminRecord>): Stamp {
  const mine = Object.values(records)
    .filter((r) => r.orderId === orderId)
    .sort((a, b) => b.at - a.at);
  const r = mine[0];
  return r ? { at: `${r.cancellation ? "" : r.doneAt}${r.status === "未実施" ? "（未実施）" : ""}`, by: r.by } : EMPTY_STAMP;
}

// ---------------------------------------------------------------------------
// 実施入力: the record a nurse enters with a time and her name (no barcode here)
// ---------------------------------------------------------------------------

export const EXECUTE_NOTE = "実施入力の画面から（リストバンド・ラベルの照合なし）";

/** "9:5" → 545, "09:05" → 545; null when not a time. */
export function parseHHMM(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * The 与薬・実施の記録 of one timed item entered on the 実施入力 screen: the scheduled time stays the key,
 * the time typed is when it was done, and how far off the schedule it was (beyond the ward's window) is
 * counted by code. A 点滴 is recorded as its 開始 (the 終了 comes later, as on the worksheet).
 */
export function executeRecord(item: Pick<WorkItem, "orderId" | "patientId" | "at" | "drip">, x: { day: number; time: string; by: string; status: "実施" | "未実施"; reason?: NotDoneReason }): AdminRecord | null {
  const min = parseHHMM(x.time);
  if (min === null) return null;
  if (x.status === "未実施" && !x.reason) return null;
  const doneAbs = x.day * 1440 + min;
  const at = item.at ?? doneAbs;
  const off = doneAbs - at;
  const offBy = x.status === "実施" && Math.abs(off) > WARD_RULES.marWindowMin ? off : undefined;
  return {
    key: marKey(item.orderId, at),
    orderId: item.orderId,
    patientId: item.patientId,
    at,
    status: x.status,
    doneAt: hhmm(min),
    by: x.by,
    reason: x.status === "未実施" ? x.reason : undefined,
    checked: { patient: false, label: null },
    offBy,
    note: EXECUTE_NOTE,
    ...(x.status === "実施" && item.drip ? { drip: { volumeMl: item.drip.volumeMl, mlPerH: item.drip.mlPerH, minutes: item.drip.minutes, startAt: doneAbs } } : {}),
  };
}

/** Minutes from today 00:00 → "HH:MM" of that day (for the default of the time field). */
export const timeOfAbs = (at: number) => hhmm(((at % 1440) + 1440) % 1440);

/** The 実施入力 rows of a day: everything with a clock time that day, in time order (the worksheet's items for 00:00〜24:00). */
export const dayWindow = (day: number) => ({ lo: day * 1440, hi: (day + 1) * 1440 });

/** The 実施 can be typed for today and yesterday; days ahead are only looked at (架空の病院の取り決め). */
export const canExecuteOn = (day: number) => day <= 0 && day >= EXECUTE_DAYS.min;

export const executeState = (item: Pick<WorkItem, "orderId" | "at">, records: Record<string, AdminRecord>, sessionStart: number) => (item.at === null ? "予定" : records[marKey(item.orderId, item.at)] ? records[marKey(item.orderId, item.at)].status : item.at < sessionStart ? "記録済み" : "未入力");

