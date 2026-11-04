import { describe, expect, it } from "vitest";
import { clockText, doseStarts, dripAction, dripCourses, dripEndOf, dripInfo, EARLIER_SHIFT, endText, isDripOrder, pastEnd, pastTime, startRecordOf } from "./drip-course";
import { marKey, type AdminRecord } from "./mar";
import { PATIENTS } from "./patients";
import { currentEntries } from "./record";
import type { InjectionOrder, OrderEntry } from "./types";
import { buildWorksheet, shiftWindow } from "./worksheet";

const oura = PATIENTS.find((p) => p.id === "90010244")!;
const entries = currentEntries(oura, undefined).filter((e): e is OrderEntry => e.kind === "order");
const sol = entries.find((e) => e.order.type === "injection" && e.order.items[0].drugCode === "INJ-SOL3A500")!;
const abx = entries.find((e) => e.order.type === "injection" && e.order.items[0].drugCode === "INJ-SBTABPC3")!;

const rec = (x: Partial<AdminRecord> & Pick<AdminRecord, "orderId" | "at">): AdminRecord => ({
  key: marKey(x.orderId, x.at),
  patientId: oura.id,
  status: "実施",
  doneAt: "12:02",
  by: "看護師 高橋",
  checked: { patient: true, label: true },
  ...x,
});

describe("点滴かどうか・1本の量と時間", () => {
  it("点滴静注 with a volume in mL is a drip; 静注 is one record", () => {
    const o = (x: Partial<InjectionOrder>): InjectionOrder => ({ type: "injection", items: [{ drugCode: "INJ-NS100", amount: 100, unit: "mL" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 8 }, start: { day: 0 }, ...x });
    expect(isDripOrder(o({}))).toBe(true);
    expect(isDripOrder(o({ route: "静注", items: [{ drugCode: "INJ-FRS20", amount: 20, unit: "mg" }] }))).toBe(false);
  });
  it("ソルデム3A 500mL at 42mL/時 takes 714 minutes; the antibiotic 100mL in 30 minutes", () => {
    expect(dripInfo(sol.order as InjectionOrder)).toEqual({ volumeMl: 500, mlPerH: 42, minutes: 714 });
    expect(dripInfo(abx.order as InjectionOrder)).toMatchObject({ volumeMl: 100, minutes: 30 });
  });
  it("bags of a continuous fluid every 24h ÷ 2 from the start, numbered", () => {
    expect(doseStarts(sol, -1440, 1440, 600)).toEqual([
      { at: -720, bag: 1 },
      { at: 0, bag: 2 },
      { at: 720, bag: 3 },
    ]);
  });
  it("the worksheet's drip items carry the bag", () => {
    const ws = buildWorksheet([{ patient: oura, room: "511", entries }], shiftWindow("day", 0).lo, shiftWindow("day", 0).hi, 600);
    const bag = ws.timed.find((i) => i.orderId === sol.id)!;
    expect(bag.drip).toMatchObject({ volumeMl: 500, minutes: 714 });
    expect(ws.timed.find((i) => i.orderId === abx.id)!.drip?.volumeMl).toBe(100);
  });
});

describe("開始と終了の記録から、点滴ごとの経過", () => {
  // The session began today 10:00; now is 15:00.
  const session = 600;
  const now = 900;
  it("before the session: the earlier shift (fictional) gave the whole bag; one still going stays running", () => {
    const cs = dripCourses(oura.id, [sol], {}, session, now, -1440);
    const first = cs.find((c) => c.at === -720)!;
    expect(first).toMatchObject({ source: "前の勤務", startBy: EARLIER_SHIFT, end: { at: -6, givenMl: 500, full: true } });
    const second = cs.find((c) => c.at === 0)!;
    expect(second.end).toBeUndefined();
    expect(second.expectedEnd).toBe(714);
    expect(pastEnd(second, now)).toBe(186);
    // The bag due at 12:00 (after the session began) is not started until a nurse records it.
    expect(cs.some((c) => c.at === 720)).toBe(false);
  });
  it("開始 then 終了 with 残量: what went in is the bag − 残量, at the end", () => {
    const start = rec({ orderId: sol.id, at: 720, drip: { volumeMl: 500, mlPerH: 42, minutes: 714, startAt: 722 } });
    let c = dripCourses(oura.id, [sol], { [start.key]: start }, session, now, 0).find((x) => x.at === 720)!;
    expect(c).toMatchObject({ source: "記録", start: 722, expectedEnd: 1436, bag: 3 });
    expect(c.end).toBeUndefined();
    const end = { ...start, end: { at: 880, recordedAt: "14:45", by: "看護師 高橋", full: false, leftMl: 380, givenMl: 120, reason: "漏れ" as const } };
    c = dripCourses(oura.id, [sol], { [end.key]: end }, session, now, 0).find((x) => x.at === 720)!;
    expect(c.end).toMatchObject({ at: 880, givenMl: 120, formula: "500mL − 残量 380mL = 120mL" });
    expect(endText(end)).toBe("終了 14:40 残量 380mL → 入った量 120mL（漏れ）");
  });
  it("a record written in one step before 2回実施 counts as the whole bag at its expected end", () => {
    const old = rec({ orderId: abx.id, at: 720, doneAt: "12:05" });
    const c = dripCourses(oura.id, [abx], { [old.key]: old }, session, now, 0).find((x) => x.at === 720)!;
    expect(c).toMatchObject({ source: "1回の記録", end: { at: 755, givenMl: 100, full: true } });
  });
  it("ending a bag the earlier shift began makes its start record (marked as fictional)", () => {
    const c = dripCourses(oura.id, [sol], {}, session, now, -1440).find((x) => x.at === 0)!;
    const r = startRecordOf(c);
    expect(r).toMatchObject({ key: marKey(sol.id, 0), by: EARLIER_SHIFT, doneAt: "00:00", drip: { startAt: 0, volumeMl: 500 } });
    expect(dripAction({ ...r, end: { at: 714, recordedAt: "15:00", by: "看護師 高橋", full: true, leftMl: 0, givenMl: 500 } }, undefined)).toBe("確定（点滴の終了）");
    expect(dripAction(r, undefined)).toBe("確定（点滴の開始）");
    expect(dripAction(r, { ...r, end: { at: 714, recordedAt: "15:00", by: "x", full: true, leftMl: 0, givenMl: 500 } })).toBe("点滴の終了の記録を取り消した");
  });
});

describe("終了の入力の確かめ", () => {
  const base = { at: 900, start: 720, nowAbs: 900 };
  it("全量 is the whole bag", () => {
    expect(dripEndOf(500, { ...base, full: true })).toMatchObject({ ok: true, givenMl: 500, formula: "全量 500mL" });
  });
  it("残量 needs a reason, and must be 0 … the bag", () => {
    expect(dripEndOf(500, { ...base, full: false, leftMl: 50 })).toMatchObject({ ok: false });
    expect(dripEndOf(500, { ...base, full: false, leftMl: 50, reason: "中止の指示" })).toMatchObject({ ok: true, givenMl: 450, leftMl: 50 });
    expect(dripEndOf(500, { ...base, full: false, leftMl: 600, reason: "その他" })).toMatchObject({ ok: false });
    expect(dripEndOf(500, { ...base, full: false, leftMl: 0 })).toMatchObject({ ok: true, full: true, givenMl: 500 });
  });
  it("the end is between the start and now", () => {
    expect(dripEndOf(500, { ...base, full: true, at: 700 })).toMatchObject({ ok: false });
    expect(dripEndOf(500, { ...base, full: true, at: 901 })).toMatchObject({ ok: false });
  });
});

describe("時刻", () => {
  it("a typed time is the latest one up to now", () => {
    expect(pastTime("08:00", 600)).toBe(480);
    expect(pastTime("23:30", 600)).toBe(-30);
    expect(pastTime("00:30", 1500)).toBe(1470);
    expect(pastTime("24:30", 1500)).toBe(1470);
    expect(pastTime("25:30", 1500)).toBeNull();
    expect(pastTime("8時", 600)).toBeNull();
  });
  it("labels other days", () => {
    expect(clockText(900)).toBe("15:00");
    expect(clockText(1440 + 180)).toBe("翌03:00");
    expect(clockText(-180)).toBe("昨日 21:00");
  });
});
