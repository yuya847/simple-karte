import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { patternCourse, patternDay, patternLastDay, patternText } from "./day-pattern";
import { injectionCell, prescriptionCell } from "./calendar";
import { doseTimes } from "./flowsheet";
import { oralToDispense } from "./oral-dispense";
import { occurrencesOn } from "./order-execute";
import { orderFields } from "./order-sheet";
import { PATIENTS } from "./patients";
import type { DayPattern, InjectionOrder, OrderEntry, PrescriptionOrder } from "./types";
import { generateScenarios } from "./scenarios";

const base = { y: 2026, m: 11, d: 6 }; // 金曜
const mwf: DayPattern = { kind: "weekdays", days: [1, 3, 5] };
const entry = (order: PrescriptionOrder | InjectionOrder): OrderEntry => ({ kind: "order", id: order.type, day: 0, time: "06:00", author: "医師", status: "有効", order });
const rx = (dayPattern?: DayPattern): PrescriptionOrder => ({ type: "prescription", category: "臨時", drugCode: "ORAL-AMLO5", amount: 2, unit: "錠", timings: ["朝"], start: { day: 1, timing: "朝" }, days: 6, dayPattern });
const inj = (dayPattern?: DayPattern): InjectionOrder => ({ type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "静注", schedule: { kind: "per_day", count: 1 }, doseTimes: ["10:00"], start: { day: 1, time: "10:00" }, days: 14, dayPattern });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-06T03:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("投与日パターン", () => {
  it("未指定は毎日、隔日は開始日を基準に月をまたぐ", () => {
    expect(patternDay(undefined, 1, 0, base)).toBe(false);
    expect(patternDay(undefined, 1, 1, base)).toBe(true);
    expect(patternLastDay({ kind: "every", n: 2 }, 24, 3, base)).toBe(28);
    expect(patternCourse({ kind: "every", n: 2 }, 24, 3, true, base)).toBe("隔日・3投与日分（11/30〜12/4）");
  });
  it("開始日が土曜なら月曜から6投与日を数え、週をまたぐ", () => {
    expect(patternLastDay(mwf, 1, 6, base)).toBe(14);
    expect(patternCourse(mwf, 1, 6, true, base)).toBe("月水金・6投与日分（11/9〜11/20）");
    expect(patternLastDay({ kind: "weekdays", days: [3] }, 1, 3, base)).toBe(19);
    expect(patternText({ kind: "weekdays", days: [3] })).toBe("週1回 水");
    expect(patternLastDay({ kind: "weekdays", days: [] }, 1, 3, base)).toBe(0);
  });
  it("処方は6投与日、注射は14暦日。非投与日にカレンダー・実施枠を作らない", () => {
    const oral = entry(rx(mwf)), injection = entry(inj(mwf));
    const oralDays = Array.from({ length: 22 }, (_, d) => d).filter((d) => prescriptionCell(oral, d, 720).slots.some((s) => s.state));
    expect(oralDays).toEqual([3, 5, 7, 10, 12, 14]);
    expect(doseTimes(injection, 720, 0, 22 * 1440).map((t) => Math.floor(t / 1440))).toEqual(oralDays);
    for (const d of [1, 2, 4, 6, 8, 9, 11, 13, 15]) {
      expect(injectionCell(injection, d, 720).running).toBe(false);
      for (const e of [oral, injection]) expect(occurrencesOn(PATIENTS[0], e, d, 720).timed).toEqual([]);
    }
    expect(orderFields(oral.order, base, "病棟").some((f) => f.value.includes("月水金・6投与日分（11/9〜11/20）"))).toBe(true);
  });
  it("調剤は6投与日×1日1回×1回2錠＝12錠、非投与日の包を作らない", () => {
    const people = [{ patient: PATIENTS[0], room: PATIENTS[0].room, entries: [entry(rx(mwf))] }];
    const line = oralToDispense(people, { kind: "臨時" }, 720)[0].rps[0].lines[0];
    expect(line.slots.map((s) => s.day)).toEqual([3, 5, 7, 10, 12, 14]);
    expect(line.total).toBe(12);
  });
  it("隔日の時間間隔注射も休薬日の回数を除き、中止で打ち切る", () => {
    const o = inj({ kind: "every", n: 2 }); o.schedule = { kind: "every_hours", hours: 12 }; o.doseTimes = undefined;
    const e = entry(o);
    expect(doseTimes(e, 720, 1440, 4 * 1440).map((t) => Math.floor(t / 1440))).toEqual([1, 1, 3, 3]);
    expect(doseTimes({ ...e, status: "中止", stoppedOn: 2 }, 720, 1440, 10 * 1440).map((t) => Math.floor(t / 1440))).toEqual([1, 1]);
  });
  it("時間ごとの注射でも指定した暦日数の翌日には投与しない", () => {
    const o = inj({ kind: "every", n: 2 }); o.schedule = { kind: "every_hours", hours: 6 }; o.doseTimes = undefined; o.days = 2;
    expect(doseTimes(entry(o), 720, 0, 10 * 1440).every((t) => Math.floor(t / 1440) < 3)).toBe(true);
  });
  it("月水金の24時は翌日の実施枠として残る", () => {
    const o = inj(mwf); o.doseTimes = ["24:00"];
    expect(injectionCell(entry(o), 4, 720).doses).toEqual([{ time: "00:00", state: "planned" }]);
  });
  it("100人のうち腎機能低下の3人に既存のCEZを隔日で入れる", () => {
    const cases = generateScenarios().cases;
    const patterned = cases.filter((c) => c.patient.history.some((e) => e.kind === "order" && e.order.type === "injection" && e.order.dayPattern?.kind === "every" && e.order.dayPattern.n === 2));
    expect(patterned.length).toBe(3);
    for (const c of patterned) expect(c.patient.labs.some((l) => l.values.Cre >= 2.6)).toBe(true);
  });
});
