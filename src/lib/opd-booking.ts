// 外来予約: a visit booked at the outpatient clinic — the first visit after discharge for an inpatient, or the
// next visit for an outpatient. The doctor chooses the clinic, the day, the slot and what the visit is for;
// the code only checks that the choice is complete, in range, and not a second booking on the same day at the
// same clinic. The slots, the clinics with their doctors and the range are the FICTIONAL hospital's rules.

import { DOCTORS } from "./doctors";
import type { CheckContext, Draft, Issue, OpdBookingDraft } from "./drafts";
import { OPD_DEPTS } from "./liaison";
import type { OpdBookingOrder, OrderEntry, ProcedureOrder } from "./types";

/** 架空の病院の取り決め: the slots, how far ahead a visit can be booked, and that the doctor is optional. */
export const OPD_BOOKING_RULES = {
  /** Earliest day (offset from today): tomorrow. Today's visits go through reception, not this order. */
  minDays: 1,
  maxDays: 90,
  slots: { 午前: "9:00〜12:00", 午後: "14:00〜16:30" } as const,
  note: "外来予約は午前 9:00〜12:00・午後 14:00〜16:30、または時刻を指定します。予約できるのは明日から90日先までです。当日の受診は受付で扱います。",
};

export type OpdSlot = OpdBookingOrder["slot"];
export const OPD_SLOTS: OpdSlot[] = ["午前", "午後", "時刻"];

/** What the visit is for (the doctor picks one, or writes it). */
export const OPD_PURPOSES = ["退院後の初回", "再診", "検査の結果説明", "処置", "その他"] as const;

/** The clinics that take a booking (架空), with the doctor who usually sees the patients there. */
export const OPD_CLINICS: { name: string; doctor: string }[] = OPD_DEPTS.map((d) => ({ name: d.name, doctor: d.doctor }));

/** The doctors a visit can be booked with at a clinic: the clinic's doctor, and the doctors whose team is that department. */
export function opdDoctorsOf(dept: string): string[] {
  const names = [...OPD_CLINICS.filter((c) => c.name === dept).map((c) => c.doctor), ...DOCTORS.filter((d) => d.team.startsWith(dept)).map((d) => d.name)];
  return [...new Set(names)];
}

/** Days that can be booked: offsets from today, tomorrow to 90 days ahead. */
export function bookableDays(): number[] {
  const out: number[] = [];
  for (let d = OPD_BOOKING_RULES.minDays; d <= OPD_BOOKING_RULES.maxDays; d++) out.push(d);
  return out;
}

export function opdBookingText(o: OpdBookingOrder, fmtDay: (d: number) => string): string {
  const when = o.slot === "時刻" ? (o.time ?? "時刻？") : `${o.slot}（${OPD_BOOKING_RULES.slots[o.slot]}）`;
  return [`${o.dept}${o.doctor ? `（${o.doctor}）` : ""}`, `${fmtDay(o.day)} ${when}`, o.purpose, o.note].filter(Boolean).join("　");
}

export function newOpdBookingDraft(id: string, init: Partial<OpdBookingDraft> = {}): OpdBookingDraft {
  return { id, origin: "manual", sourceText: "（外来予約の欄から）", comment: null, kind: "opd-booking", dept: null, doctor: null, day: null, slot: null, time: null, purpose: null, purposeNote: "", note: "", duplicateOk: false, ...init };
}

/** The 外来予約 orders of the record still in force (for the duplicate check and the panel's list). */
export const opdBookingsOf = (orders: OrderEntry[]): (OrderEntry & { order: ProcedureOrder & { opd: OpdBookingOrder } })[] =>
  orders.filter((e): e is OrderEntry & { order: ProcedureOrder & { opd: OpdBookingOrder } } => e.status === "有効" && e.order.type === "procedure" && !!e.order.opd);

/** The purpose as it goes on the order: the chosen word, with the free text after it. */
export const opdPurposeOf = (d: OpdBookingDraft): string => [d.purpose === "その他" ? null : d.purpose, d.purposeNote.trim() || null].filter(Boolean).join("　");

const set =
  (patch: Partial<OpdBookingDraft>) =>
  (x: Draft): Draft => ({ ...(x as OpdBookingDraft), ...patch });

export function checkOpdBooking(d: OpdBookingDraft, ctx: CheckContext): Issue[] {
  const issues: Issue[] = [];
  if (!d.dept) issues.push({ key: "opd-dept", level: "ask", title: "診療科", message: "予約する科が抜けています。", choices: OPD_CLINICS.map((c) => ({ label: c.name, apply: set({ dept: c.name }) })) });
  else if (!OPD_CLINICS.some((c) => c.name === d.dept)) issues.push({ key: "opd-dept", level: "stop", title: "診療科", message: `${d.dept} は外来予約を受けていません。` });
  if (d.day === null) issues.push({ key: "opd-day", level: "ask", title: "日付", message: "受診する日が抜けています。", choices: [7, 14, 28, 56].map((n) => ({ label: `${n / 7}週間後（${ctx.fmtDay(n)}）`, apply: set({ day: n }) })) });
  else if (d.day < OPD_BOOKING_RULES.minDays) issues.push({ key: "opd-day", level: "stop", title: "日付", message: d.day === 0 ? "今日の受診は予約でなく受付で扱います。明日以降の日を選んでください。" : "過ぎた日です。明日以降の日を選んでください。" });
  else if (d.day > OPD_BOOKING_RULES.maxDays) issues.push({ key: "opd-day", level: "stop", title: "日付", message: `予約できるのは ${OPD_BOOKING_RULES.maxDays} 日先までです。` });
  if (!d.slot) issues.push({ key: "opd-slot", level: "ask", title: "時間枠", message: "午前・午後か、時刻が抜けています。", choices: (["午前", "午後"] as const).map((s) => ({ label: `${s}（${OPD_BOOKING_RULES.slots[s]}）`, apply: set({ slot: s }) })) });
  else if (d.slot === "時刻" && !d.time) issues.push({ key: "opd-slot", level: "ask", title: "時間枠", message: "時刻が抜けています（外来予約の欄で入れてください）。" });
  if (!opdPurposeOf(d)) issues.push({ key: "opd-purpose", level: "ask", title: "目的", message: "何のための受診かが抜けています。", choices: OPD_PURPOSES.filter((p) => p !== "その他").map((p) => ({ label: p, apply: set({ purpose: p }) })) });
  // A second booking on the same day at the same clinic: confirmed earlier, or another draft on screen.
  if (d.dept && d.day !== null && !d.duplicateOk) {
    const same = opdBookingsOf(ctx.activeOrders).filter((e) => e.order.opd.dept === d.dept && e.order.opd.day === d.day);
    const drafts = ctx.drafts.filter((x): x is OpdBookingDraft => x.kind === "opd-booking" && x.id !== d.id && x.dept === d.dept && x.day === d.day);
    if (same.length || drafts.length)
      issues.push({
        key: "opd-dup",
        level: "ask",
        title: "重複",
        message: `${ctx.fmtDay(d.day)} の ${d.dept} に、${same.length ? `確定した予約（${same.map((e) => ctx.describe(e)).join("、")}）` : ""}${same.length && drafts.length ? "と" : ""}${drafts.length ? "別の下書き" : ""}があります。`,
        choices: [
          { label: "重ねて予約する", apply: set({ duplicateOk: true }) },
          { label: "この下書きを消す", remove: true },
        ],
      });
  }
  if (issues.length === 0) issues.push({ key: "opd-ok", level: "info", title: "外来予約", message: opdBookingText(toOpdBookingOrder(d), ctx.fmtDay) });
  return issues;
}

/** Only call when the checks pass (every field is there). */
export function toOpdBookingOrder(d: OpdBookingDraft): OpdBookingOrder {
  return {
    dept: d.dept!,
    doctor: d.doctor ?? undefined,
    day: d.day!,
    slot: d.slot!,
    time: d.slot === "時刻" ? (d.time ?? undefined) : undefined,
    purpose: opdPurposeOf(d),
    note: d.note.trim() || undefined,
  };
}
