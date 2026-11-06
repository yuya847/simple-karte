import { describe, expect, it } from "vitest";
import { bookingsOf } from "./bookings";
import { checkDraft, isReady, toOrder, type CheckContext, type Draft } from "./drafts";
import { orderLines } from "./format";
import { OPD_BOOKING_RULES, OPD_CLINICS, bookableDays, newOpdBookingDraft, opdBookingText, opdDoctorsOf } from "./opd-booking";
import type { OrderEntry, ProcedureOrder } from "./types";

const today = { y: 2026, m: 11, d: 4 };
const fmtDay = (d: number) => `D${d}`;
const ctx = (drafts: Draft[] = [], activeOrders: OrderEntry[] = []): CheckContext => ({ activeOrders, labOrders: [], drafts, nowTime: "10:00", fmtDay, describe: (o) => o.id });
const full = (id = "b1") => newOpdBookingDraft(id, { dept: "循環器内科", doctor: "循環器内科 森", day: 14, slot: "午前", purpose: "退院後の初回", purposeNote: "体重と BNP を確かめる" });
const booked = (id: string, day: number, dept = "循環器内科"): OrderEntry => ({ kind: "order", id, day: 0, time: "09:00", author: "山本（専攻医）", status: "有効", order: { type: "procedure", code: "PROC-OPD", opd: { dept, day, slot: "午後", purpose: "再診" }, schedule: { kind: "once" }, start: { day } } });

describe("外来予約の下書き", () => {
  it("the clinics are the fictional hospital's outpatient departments, each with a doctor; the range is tomorrow to 90 days ahead", () => {
    expect(OPD_CLINICS.map((c) => c.name)).toContain("総合診療科");
    expect(opdDoctorsOf("総合診療科")).toContain("山本（専攻医）");
    expect(opdDoctorsOf("循環器内科")).toEqual(["循環器内科 森", "井上（循環器内科）"]);
    expect(bookableDays()[0]).toBe(1);
    expect(bookableDays().at(-1)).toBe(OPD_BOOKING_RULES.maxDays);
    expect(OPD_BOOKING_RULES.note).not.toContain("架空の病院の取り決め");
  });
  it("asks for what is missing (科・日付・時間枠・目的), with choices the doctor picks from", () => {
    const issues = checkDraft(newOpdBookingDraft("b0"), ctx());
    expect(issues.map((i) => i.key)).toEqual(["opd-dept", "opd-day", "opd-slot", "opd-purpose"]);
    expect(issues.every((i) => i.level === "ask")).toBe(true);
    expect(issues[0].choices?.map((c) => c.label)).toContain("循環器内科");
    const withDept = issues[0].choices![0].apply!(newOpdBookingDraft("b0"));
    expect(withDept.kind === "opd-booking" && withDept.dept).toBe("総合診療科");
    expect(isReady(issues)).toBe(false);
  });
  it("stops a day that is today or past, or beyond 90 days, and a clinic that takes no booking", () => {
    expect(checkDraft({ ...full(), day: 0 }, ctx()).find((i) => i.key === "opd-day")?.level).toBe("stop");
    expect(checkDraft({ ...full(), day: -3 }, ctx()).find((i) => i.key === "opd-day")?.message).toContain("過ぎた日");
    expect(checkDraft({ ...full(), day: 91 }, ctx()).find((i) => i.key === "opd-day")?.level).toBe("stop");
    expect(checkDraft({ ...full(), dept: "眼科" }, ctx()).find((i) => i.key === "opd-dept")?.level).toBe("stop");
    expect(checkDraft({ ...full(), slot: "時刻", time: null }, ctx()).find((i) => i.key === "opd-slot")?.level).toBe("ask");
    expect(checkDraft({ ...full(), purpose: "その他", purposeNote: "" }, ctx()).find((i) => i.key === "opd-purpose")?.level).toBe("ask");
  });
  it("a complete draft is ready, with one info line that reads back the booking", () => {
    const issues = checkDraft(full(), ctx());
    expect(isReady(issues)).toBe(true);
    expect(issues[0].message).toBe("循環器内科（循環器内科 森）　D14 午前（9:00〜12:00）　退院後の初回　体重と BNP を確かめる");
  });
  it("a second booking on the same day at the same clinic asks (confirmed order or another draft); 重ねて予約する goes on", () => {
    const dup = checkDraft(full(), ctx([], [booked("o1", 14)])).find((i) => i.key === "opd-dup");
    expect(dup?.level).toBe("ask");
    expect(dup?.message).toContain("確定した予約");
    const ok = dup!.choices!.find((c) => c.label === "重ねて予約する")!.apply!(full());
    expect(isReady(checkDraft(ok, ctx([], [booked("o1", 14)])))).toBe(true);
    expect(checkDraft(full(), ctx([], [booked("o1", 15)])).some((i) => i.key === "opd-dup")).toBe(false);
    expect(checkDraft(full(), ctx([], [booked("o1", 14, "整形外科")])).some((i) => i.key === "opd-dup")).toBe(false);
    const other = full("b2");
    expect(checkDraft(full(), ctx([other, full()])).find((i) => i.key === "opd-dup")?.message).toContain("別の下書き");
  });
  it("confirming makes a PROC-OPD order on the booked day that reads as 外来予約 and is listed among the bookings", () => {
    const r = toOrder(full(), ctx());
    const o = r.order as ProcedureOrder;
    expect(o).toMatchObject({ type: "procedure", code: "PROC-OPD", schedule: { kind: "once" }, start: { day: 14 } });
    expect(o.opd).toEqual({ dept: "循環器内科", doctor: "循環器内科 森", day: 14, slot: "午前", time: undefined, purpose: "退院後の初回　体重と BNP を確かめる", note: undefined });
    expect(orderLines(o, today).main).toBe("外来予約　循環器内科");
    expect(orderLines(o, today).detail).toContain("11/18（水） 午前（9:00〜12:00）");
    expect(opdBookingText({ ...o.opd!, slot: "時刻", time: "10:30" }, fmtDay)).toContain("D14 10:30");
    const list = bookingsOf([{ kind: "order", id: "x", day: 0, time: "10:00", author: "a", status: "有効", order: o }], [], today, 600);
    expect(list).toEqual([{ day: 14, time: null, kind: "外来予約", label: "循環器内科（循環器内科 森）　午前　退院後の初回　体重と BNP を確かめる", done: false }]);
  });
});
