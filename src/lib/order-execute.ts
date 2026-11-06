import { slidingUnits } from "./insulin";
// 実施・未実施 from the order itself: the order row of the record (right click, ⋯, or a long press on an iPad)
// and the dose cells of the calendars. Code lists the day's occurrences of the order (the same ones the
// worksheet lists), the person picks one and says what happened, and the record written is the same
// 与薬・実施の記録 the worksheet, the flow sheet and the 実施入力 screen write (here without reading the
// wristband or the label, and the record says so). Nothing here is decided by AI.

import { hm } from "./drip-course";
import { marKey, marState, type AdminRecord, type MarState, type NotDoneReason } from "./mar";
import { canExecuteOn, dayWindow, executeRecord } from "./order-sheet";
import { denyReason, type Role } from "./roles";
import type { OrderEntry, Patient } from "./types";
import { buildWorksheet, type WorkItem } from "./worksheet";

/** What the record says about where it was entered (shown with the record and in the audit log's detail). */
export const MENU_NOTE = "経過・カレンダーのメニューから（リストバンド・ラベルの照合なし）";

/** One occurrence of an order (a dose, a draw, a procedure, an exam): what the worksheet lists. */
export type ExecItem = Pick<WorkItem, "orderId" | "patientId" | "at" | "kind" | "main" | "detail" | "drip" | "sliding" | "insulinUnits">;

/** Who may record 実施・未実施 (the same rule as the worksheet): null when allowed, else why not. */
export const executeDeny = (role: Role): string | null => denyReason(role, "mar");

/**
 * Orders whose occurrences are recorded from the chart. Bookings and requests (外来予約・他科依頼・外出外泊・
 * 移動・指導) and treatments with their own bedside records (透析・輸血・リハビリ) are left to their own screens.
 */
export function canHaveExecution(entry: OrderEntry): boolean {
  const o = entry.order;
  if (o.type === "prescription") return o.category !== "退院時";
  if (o.type === "procedure") return !(o.opd || o.consult || o.leave || o.move || o.guide || o.hd || o.tx || o.rehab);
  return true;
}

/**
 * The occurrences of one order on a day (0 = today): the timed ones in clock order, and the untimed one
 * (必要時・1日N回 without clock times) when the order has such.
 */
export function occurrencesOn(patient: Patient, entry: OrderEntry, day: number, nowAbs: number): { timed: ExecItem[]; untimed: ExecItem | null } {
  if (!canHaveExecution(entry)) return { timed: [], untimed: null };
  const { lo, hi } = dayWindow(day);
  const ws = buildWorksheet([{ patient, room: patient.room, entries: [entry] }], lo, hi, nowAbs);
  return { timed: ws.timed.filter((i) => i.at !== null), untimed: ws.untimed[0] ?? null };
}

/** The occurrence of an order at a given time (a calendar cell), or null when the order has none then. */
export function occurrenceAt(patient: Patient, entry: OrderEntry, at: number, nowAbs: number): ExecItem | null {
  return occurrencesOn(patient, entry, Math.floor(at / 1440), nowAbs).timed.find((i) => i.at === at) ?? null;
}

export interface Occurrence {
  item: ExecItem;
  /** "HH:MM" of the scheduled time. */
  time: string;
  state: MarState;
  record?: AdminRecord;
}

/** Each occurrence with its state: 実施・未実施 (recorded), 記録済み (before this session, fictional), 未入力 (due), 予定. */
export function occurrenceStates(items: ExecItem[], records: Record<string, AdminRecord>, sessionStart: number, nowAbs: number): Occurrence[] {
  return items
    .filter((i) => i.at !== null)
    .map((i) => ({ item: i, time: hm(i.at!), state: marState(i, records, sessionStart, nowAbs), record: records[marKey(i.orderId, i.at!)] }));
}

/** What can be done with one occurrence: record it, take the record back, or nothing (and why). */
export type OccurrenceActions = { kind: "record" } | { kind: "void"; record: AdminRecord } | { kind: "locked"; why: string };

export function actionsFor(occ: Occurrence): OccurrenceActions {
  if (occ.record && !occ.record.cancellation) return { kind: "void", record: occ.record };
  const day = Math.floor(occ.item.at! / 1440);
  if (day > 0) return { kind: "locked", why: "明日以降の分は、その日になってから記録します。" };
  if (!canExecuteOn(day)) return { kind: "locked", why: "記録を入れられるのは今日と昨日の分だけです。" };
  if (occ.state === "記録済み") return { kind: "locked", why: "この画面を開く前の時刻の分は、前の勤務帯が記録したものとして扱います。" };
  return { kind: "record" };
}

/**
 * The record written from the menu: 実施 at a time (now, or chosen) or 未実施 with a reason, by the person
 * using the chart. An untimed (必要時) item is recorded at the time given. Null when the time is not a time
 * or 未実施 has no reason.
 */
export function menuRecord(item: ExecItem, x: { status: "実施" | "未実施"; day: number; time: string; by: string; reason?: NotDoneReason; glucose?: number }): AdminRecord | null {
  const units = item.sliding ? (slidingUnits(item.sliding.rows, x.glucose ?? NaN) === null ? null : (item.insulinUnits ?? 0) + slidingUnits(item.sliding.rows, x.glucose ?? NaN)!) : item.insulinUnits;
  if (x.status === "実施" && item.sliding && units == null) return null;
  const r = executeRecord(item, x);
  return r ? { ...r, ...(x.status === "実施" && units != null ? {insulin:{units,...(x.glucose != null ? {glucose:x.glucose} : {})}} : {}), note: MENU_NOTE } : null;
}

/** "実施 08:05 看護師 佐藤" / "未実施（患者が拒否） 08:10 看護師 佐藤". */
export const recordText = (r: AdminRecord) => `${r.cancellation ? `取り消し ${r.cancellation.at} ${r.cancellation.by}（${r.cancellation.reason || "理由なし"}）・` : ""}${r.status}${r.reason ? `（${r.reason}）` : ""} ${r.doneAt} ${r.by}`;

export interface ExecBadge {
  text: string;
  tone: "done" | "not" | "late" | "plan";
  title: string;
}

/**
 * The small mark on the order row for today: what is overdue (未入力 08:00), what was recorded
 * (実施 08:05・未実施（患者が拒否）), and the next planned time (予定 14:00). Null when nothing is due today.
 */
export function executionBadge(patient: Patient, entry: OrderEntry, records: Record<string, AdminRecord>, sessionStart: number, nowAbs: number): ExecBadge | null {
  if (entry.order.type === "imaging" && entry.order.when.priority === "至急") return { text: `至急（${entry.time} 指示）`, tone: "plan", title: "画像検査の指示時刻" };
  const { timed, untimed } = occurrencesOn(patient, entry, 0, nowAbs);
  const occs = occurrenceStates(timed, records, sessionStart, nowAbs);
  const prn = untimed ? Object.values(records).filter((r) => r.orderId === entry.id && r.at >= 0 && r.at < 1440).sort((a, b) => a.at - b.at) : [];
  const recorded = [...occs.flatMap((o) => (o.record ? [o.record] : [])), ...prn];
  const late = occs.filter((o) => o.state === "未入力");
  const planned = occs.filter((o) => o.state === "予定");
  const parts: { text: string; tone: ExecBadge["tone"] }[] = [];
  if (late.length) parts.push({ text: `実施の記録なし ${late.map((o) => o.time).join("・")}`, tone: "late" });
  if (recorded.length === 1) parts.push({ text: `${recorded[0].status}${recorded[0].reason ? `（${recorded[0].reason}）` : ""} ${recorded[0].doneAt}`, tone: recorded[0].status === "実施" ? "done" : "not" });
  else if (recorded.length > 1) {
    const done = recorded.filter((r) => r.status === "実施").length;
    const not = recorded.length - done;
    parts.push({ text: [done ? `実施 ${done}回` : "", not ? `未実施 ${not}回` : ""].filter(Boolean).join("・"), tone: not && !done ? "not" : "done" });
  }
  if (planned.length) parts.push({ text: `次は ${planned[0].time}`, tone: "plan" });
  if (!parts.length) return null;
  const title = [
    ...occs.map((o) => `${o.time} ${o.record ? recordText(o.record) : o.state === "記録済み" ? "実施（前の勤務帯）" : o.state}`),
    ...prn.map((r) => `必要時 ${recordText(r)}`),
  ].join("／");
  return { text: parts.map((p) => p.text).join("・"), tone: parts[0].tone, title: `今日の実施：${title}` };
}
