import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import type { HistoryEntry, Patient } from "./types";
import { ROOMS, WARD_NAME, WARD_PLANS, type BedAssignment } from "./ward";
import { BEDS_WITH_CHARTS, WARD_CHART_PATIENTS } from "./ward-charts";
import { admissionPlans, bedsAsOf, DAYS_AHEAD, dayRange, dischargePlans, markText, type AsOfInput } from "./ward-asof";

const all = [...PATIENTS, ...WARD_CHART_PATIENTS];
const lookup = (ps: Patient[]) => (id: string) => ps.find((p) => p.id === id);
const at = <T extends { room: string; bed: string }>(beds: T[], room: string, bed: string): T | undefined => beds.find((b) => b.room === room && b.bed === bed);
const total = ROOMS.reduce((n, r) => n + r.beds.length, 0);

const input = (over: Partial<AsOfInput> = {}): AsOfInput => ({
  beds: BEDS_WITH_CHARTS,
  rooms: ROOMS,
  floors: [WARD_NAME],
  patient: lookup(all),
  admissions: admissionPlans(WARD_PLANS),
  discharges: dischargePlans(BEDS_WITH_CHARTS, lookup(all), () => []),
  ...over,
});

describe("bedsAsOf：今日", () => {
  it("today is the ward as it stands, plus the bed an admission is planned into today（入院予定・空床のうち）", () => {
    const w = bedsAsOf(0, input());
    const real = w.beds.filter((b) => !b.mark);
    expect(real).toEqual(BEDS_WITH_CHARTS);
    const c = at(w.beds, "513", "C")!;
    expect(c.mark).toEqual({ kind: "入院予定", day: 0, time: "14:00" });
    expect(c.expected?.name).toBe("小川 節子");
    expect(w.counts.occupied).toBe(BEDS_WITH_CHARTS.length);
    expect(w.counts.empty).toBe(total - BEDS_WITH_CHARTS.length);
    expect(w.counts.reserved).toBe(1);
    // Today's admissions: the planned one and those admitted today in the record.
    expect(w.counts.admit).toBe(1 + all.filter((p) => p.admittedOn === 0 && BEDS_WITH_CHARTS.some((b) => b.patientId === p.id)).length);
    expect(w.counts.discharge).toBe(0);
    expect(w.known).toBe(true);
  });
});

describe("bedsAsOf：先の日（予定から計算）", () => {
  it("tomorrow: those leaving tomorrow are still there, marked; the bed for tomorrow's arrival is reserved; today's arrival has arrived", () => {
    const w = bedsAsOf(1, input());
    expect(at(w.beds, "505", "A")?.mark).toEqual({ kind: "退院予定", day: 1, time: "10:00" });
    expect(at(w.beds, "508", "C")?.mark).toEqual({ kind: "退院予定", day: 1, time: "11:00" });
    expect(at(w.beds, "507", "B")?.mark).toEqual({ kind: "入院予定", day: 1, time: "10:30" });
    expect(at(w.beds, "513", "C")?.mark).toEqual({ kind: "入院予定", day: 0, time: "14:00" });
    // 明日の朝の空床 ＝ いまの空床 ＋ 今日の退院 − 今日の入院 (the same sum as ベッドコントロール).
    const today = bedsAsOf(0, input());
    expect(w.counts.empty).toBe(today.counts.empty! + 0 - 1);
    expect(w.counts.occupied).toBe(BEDS_WITH_CHARTS.length + 1);
    expect(w.counts.reserved).toBe(1);
    expect(w.counts.admit).toBe(1);
    expect(w.counts.discharge).toBe(2);
  });

  it("the day after: the beds of those who left are 空く予定, and the arrivals are in", () => {
    const w = bedsAsOf(2, input());
    expect(at(w.beds, "505", "A")).toMatchObject({ mark: { kind: "空く予定", day: 1, time: "10:00" } });
    expect(at(w.beds, "505", "A")?.patientId).toBeUndefined();
    expect(at(w.beds, "507", "B")?.mark?.kind).toBe("入院予定");
    expect(w.counts.occupied).toBe(BEDS_WITH_CHARTS.length - 2 + 2);
    expect(w.counts.empty).toBe(total - w.counts.occupied);
    expect(w.counts.reserved).toBe(0);
    expect(w.counts.admit).toBe(0);
  });

  it("a 退院 order in the chart counts as a discharge plan; a planned bed that is taken gets no mark", () => {
    const leave: HistoryEntry = { kind: "order", id: "o1", day: 0, time: "09:00", author: "医師", status: "有効", order: { type: "procedure", code: "PROC-LEAVE", leave: { kind: "退院", from: { day: 1, time: "13:00" }, destination: "自宅", note: "" }, schedule: { kind: "prn" }, start: { day: 1, time: "13:00" } } };
    const p = PATIENTS[0];
    const bed = BEDS_WITH_CHARTS.find((b) => b.patientId === p.id)!;
    const discharges = dischargePlans(BEDS_WITH_CHARTS, lookup(all), (x) => (x.id === p.id ? [leave] : []));
    expect(discharges).toContainEqual({ day: 1, time: "13:00", room: bed.room, bed: bed.bed });
    const w = bedsAsOf(1, input({ discharges }));
    expect(at(w.beds, bed.room, bed.bed)?.mark).toEqual({ kind: "退院予定", day: 1, time: "13:00" });
    expect(bedsAsOf(2, input({ discharges })).beds.some((b) => b.patientId === p.id)).toBe(false);
    // An admission planned into an occupied bed is counted but not drawn there.
    const taken = admissionPlans([{ kind: "入院", day: 1, time: "09:00", name: "試 験", sex: "男", age: 50, department: "外科", room: bed.room, bed: bed.bed }]);
    const w2 = bedsAsOf(1, input({ admissions: taken }));
    expect(at(w2.beds, bed.room, bed.bed)?.patientId).toBe(p.id);
    expect(w2.counts.admit).toBe(1);
  });

  it("an 入院申込 without a bed counts for its floor only", () => {
    const req = { id: "r", from: { kind: "er" as const, id: "er-1" }, name: "宮本 タケ", kana: "", sex: "女" as const, age: 82, diagnosis: "尿路感染症の疑い", department: "総合診療科", attending: "山本", urgency: "緊急" as const, when: { day: 1, time: null }, ward: "5階南病棟", roomWish: "どちらでも" as const, isolation: "なし" as const, rest: "車いす" as const, purpose: "治療", heightCm: 148, weightKg: 42, allergies: [], note: "", status: "申込" as const, by: "山本", at: { day: 0, time: "09:30" } };
    const admissions = admissionPlans([], [req]);
    expect(admissions[0]).toMatchObject({ day: 1, room: "", floor: "5階南病棟" });
    expect(bedsAsOf(1, input({ admissions })).counts.admit).toBe(0);
    expect(bedsAsOf(1, input({ admissions, floors: ["5階南病棟"] })).counts.admit).toBe(1);
  });
});

describe("bedsAsOf：過去の日（記録から）", () => {
  const p = PATIENTS[0]; // admitted 3 days ago
  const bed = BEDS_WITH_CHARTS.find((b) => b.patientId === p.id)!;

  it("before the admission the patient is not there (the bed is unknown); from the admission day on they are", () => {
    expect(p.admittedOn).toBe(-3);
    const before = bedsAsOf(-4, input());
    expect(before.beds.some((b) => b.patientId === p.id)).toBe(false);
    expect(at(before.beds, bed.room, bed.bed)).toMatchObject({ unknown: true });
    expect(before.counts.empty).toBeNull();
    const on = bedsAsOf(-3, input());
    expect(at(on.beds, bed.room, bed.bed)?.patientId).toBe(p.id);
    expect(on.counts.admit).toBeGreaterThanOrEqual(1);
  });

  it("after the discharge the patient is not there; before it they are; today they are gone too", () => {
    const left: Patient = { ...p, dischargedAt: { day: -1, time: "10:00", by: "看護師 佐藤" } };
    const i = input({ patient: lookup([left, ...all.filter((x) => x.id !== p.id)]) });
    expect(bedsAsOf(-2, i).beds.some((b) => b.patientId === p.id)).toBe(true);
    expect(bedsAsOf(-1, i).beds.some((b) => b.patientId === p.id)).toBe(false);
    expect(bedsAsOf(-1, i).counts.discharge).toBe(1);
    expect(bedsAsOf(0, i).beds.some((b) => b.patientId === p.id)).toBe(false);
    expect(bedsAsOf(0, i).counts.occupied).toBe(BEDS_WITH_CHARTS.length - 1);
  });

  it("a day before the earliest admission in the record is not known", () => {
    const first = Math.min(...all.filter((x) => BEDS_WITH_CHARTS.some((b) => b.patientId === x.id)).map((x) => x.admittedOn));
    const w = bedsAsOf(first - 1, input());
    expect(w.known).toBe(false);
    expect(w.firstKnown).toBe(first);
    expect(w.beds.every((b) => b.unknown)).toBe(true);
    expect(bedsAsOf(first, input()).known).toBe(true);
    expect(dayRange(w)).toEqual({ min: first, max: DAYS_AHEAD });
  });

  it("a bed with no chart is unknown in the past", () => {
    const beds: BedAssignment[] = [{ room: "501", bed: "", other: { name: "誰 か", sex: "男", age: 70, department: "外科" } }];
    const w = bedsAsOf(-1, input({ beds, patient: () => undefined }));
    expect(w.known).toBe(false);
    expect(bedsAsOf(0, input({ beds, patient: () => undefined })).beds[0]).toEqual(beds[0]);
  });
});

describe("markText", () => {
  const fmt = (d: number) => `11/${5 + d}`;
  it("says the time on the day itself and the date on another day", () => {
    expect(markText({ kind: "入院予定", day: 1, time: "10:30" }, 1, fmt)).toBe("入院予定 10:30");
    expect(markText({ kind: "入院予定", day: 0, time: "14:00" }, 1, fmt)).toBe("入院予定（11/5 14:00）");
    expect(markText({ kind: "入院予定", day: 1, time: null }, 1, fmt)).toBe("入院予定");
    expect(markText({ kind: "退院予定", day: 1, time: "10:00" }, 1, fmt)).toBe("退院予定 10:00");
    expect(markText({ kind: "空く予定", day: 1, time: "10:00" }, 2, fmt)).toBe("空く予定（11/6 10:00 退院）");
  });
});
