import { describe, expect, it } from "vitest";
import { dripsOf, labTrend, mainDiagnosis, oxygenOf, paginateRounds, rowHeightMm, roundsRow, ROW_MIN_MM, textWidth, todayPlans, vitalsText, type RoundsRow } from "./rounds-sheet";
import { abs } from "./flowsheet";
import type { Diagnosis } from "./diagnoses";
import type { OrderEntry, Patient } from "./types";

const today = { y: 2026, m: 11, d: 8 };
const now = abs(0, "09:00");

const patient: Patient = {
  id: "rs-1", name: "架空 太郎", kana: "カクウ タロウ", sex: "男", age: 78, ward: "5階東病棟", room: "506", department: "総合診療科", attending: "架空医師",
  admittedOn: -4, admissionDiagnosis: "誤嚥性肺炎", heightCm: 165, weightKg: 55, allergies: [], infections: [], cautions: [], cultures: [], imaging: [],
  vitals: [
    { day: -1, time: "18:00", bt: 38.4, hr: 104, sbp: 98, dbp: 56, spo2: 92, o2: "鼻カニュラ 2L" },
    { day: 0, time: "06:00", bt: 37.1, hr: 86, sbp: 118, dbp: 70, rr: 18, spo2: 95, o2: "鼻カニュラ 1L" },
    { day: 0, time: "12:00", bt: 36.8 },
  ],
  labs: [
    { day: -3, time: "06:00", values: { WBC: 15200, CRP: 12.4, Hb: 11.0, Na: 136 } },
    { day: -1, time: "06:00", values: { WBC: 11800, CRP: 8.1, Hb: 10.2, Na: 136, K: 4.1 } },
    { day: 0, time: "10:00", values: { WBC: 9000 } },
  ],
  daily: [],
  history: [],
};

const order = (id: string, o: OrderEntry["order"], extra: Partial<OrderEntry> = {}): OrderEntry => ({ kind: "order", id, day: -2, time: "09:00", author: "架空医師", status: "有効", order: o, ...extra });
const injection = (id: string, drugCode: string, start: number, extra: Partial<Extract<OrderEntry["order"], { type: "injection" }>> = {}) =>
  order(id, { type: "injection", items: [{ drugCode, amount: 1, unit: "袋" }], route: "点滴静注", schedule: { kind: "per_day", count: 2 }, start: { day: start, time: "10:00" }, ...extra });

describe("検査値の前回からの変化", () => {
  it("今の時刻までの最新の値と、その前の値を比べて ↑↓→ を付ける（値は記録のまま）", () => {
    expect(labTrend(patient.labs, "CRP", now)).toEqual({ code: "CRP", value: 8.1, prev: 12.4, trend: "↓", at: { day: -1, time: "06:00" } });
    expect(labTrend(patient.labs, "Na", now)?.trend).toBe("→");
    expect(labTrend(patient.labs, "K", now)).toMatchObject({ value: 4.1, prev: null, trend: "" });
    expect(labTrend(patient.labs, "Plt", now)).toBeNull();
  });
  it("今より後の結果は読まない", () => {
    expect(labTrend(patient.labs, "WBC", now)?.value).toBe(11800);
    expect(labTrend(patient.labs, "WBC", abs(0, "10:00"))).toMatchObject({ value: 9000, prev: 11800, trend: "↓" });
  });
});

describe("バイタル・酸素", () => {
  it("今までの最新の1回を、その時刻と一緒に", () => {
    expect(vitalsText(patient, now, today)).toEqual({ text: "BT 37.1 HR 86 BP 118/70 RR 18 SpO2 95%", at: "06:00" });
    expect(vitalsText(patient, abs(-1, "20:00"), today)).toEqual({ text: "BT 38.4 HR 104 BP 98/56 SpO2 92%", at: "11/7 18:00" });
    expect(vitalsText({ vitals: [] }, now, today)).toBeNull();
  });
  it("酸素：ICU の設定 → 酸素のオーダ → 最新のバイタルの順。室内気は出さない", () => {
    const o2 = order("o2", { type: "procedure", code: "PROC-O2", o2: { device: "鼻カニュラ", lpm: 2 }, schedule: { kind: "continuous" }, start: { day: -2, time: "10:00" } });
    expect(oxygenOf(patient, [o2], now)).toBe("鼻カニュラ 2L/分");
    expect(oxygenOf(patient, [{ ...o2, status: "中止", stoppedOn: -1, stoppedTime: "12:00" }], now)).toBe("鼻カニュラ 1L");
    expect(oxygenOf({ ...patient, currentOxygen: "NPPV FiO2 0.4" }, [o2], now)).toBe("NPPV FiO2 0.4");
    expect(oxygenOf({ ...patient, currentOxygen: "室内気" }, [], now)).toBe("");
    expect(oxygenOf({ ...patient, vitals: [{ day: 0, time: "06:00", spo2: 97, o2: "室内気" }] }, [], now)).toBe("");
  });
});

describe("点滴・抗菌薬", () => {
  it("持続の点滴は輸液の点滴静注で今流れているもの。1回だけの輸液・抗菌薬・止めたものは入れない", () => {
    const fluid = injection("f1", "INJ-NS500", -2, { rateMlPerH: 40 });
    const once = injection("f2", "INJ-NS500", 0, { schedule: { kind: "once" } });
    const abx = injection("a1", "INJ-CTRX1", -2, { schedule: { kind: "per_day", count: 1 } });
    const stopped = { ...injection("f3", "INJ-NS500", -3), status: "中止" as const, stoppedOn: -1 };
    const drips = dripsOf([fluid, once, abx, stopped], now, today);
    expect(drips).toHaveLength(1);
    expect(drips[0]).toMatch(/40\.0mL\/時$/);
  });
  it("抗菌薬は「略号 ◯日目」（開始日が1日目）", () => {
    const row = roundsRow({ patient, room: "506A", orders: [injection("a1", "INJ-CTRX1", -2, { schedule: { kind: "per_day", count: 1 } })], todos: [], today, now: "09:00" });
    expect(row.antibiotics).toEqual(["CTRX 3日目"]);
  });
});

describe("今日の予定", () => {
  it("今日の採血・画像・処置・手術・退院・移動を時刻順に。中止したもの・別の日のものは入れない", () => {
    const lab = order("l1", { type: "lab", codes: ["CBC"], collect: { day: 0, time: "06:00" }, priority: "定時" });
    const labTomorrow = order("l2", { type: "lab", codes: ["CBC"], collect: { day: 1, time: "06:00" }, priority: "定時" });
    const leave = order("d1", { type: "procedure", code: "PROC-LEAVE", leave: { kind: "退院", from: { day: 0, time: "11:00" }, destination: "自宅", note: "" }, schedule: { kind: "once" }, start: { day: 0, time: "11:00" } });
    const cancelled = order("m1", { type: "procedure", code: "PROC-MOVE", move: { kind: "転床", to: { room: "510", bed: "A" }, reason: "" }, schedule: { kind: "once" }, start: { day: 0, time: "15:00" } }, { status: "中止", stoppedOn: 0 });
    const plans = todayPlans("rs-1", [lab, labTomorrow, leave, cancelled], [{ id: "s1", patientId: "rs-1", day: 0, start: "13:00", procedure: "腹腔鏡下胆嚢摘出術" }, { id: "s2", patientId: "other", day: 0, start: "09:00", procedure: "別の患者" }], ["10:00 退院"]);
    expect(plans[0]).toMatch(/^06:00 採取 /);
    expect(plans.slice(1)).toEqual(["11:00 退院　自宅", "13:00 手術 腹腔鏡下胆嚢摘出術"]);
  });
  it("病棟の予定の退院は、オーダの退院がないときだけ足す", () => {
    expect(todayPlans("rs-1", [], [], ["10:00 退院"])).toEqual(["10:00 退院"]);
  });
});

describe("1人の枠", () => {
  it("主病名は継続中の主病名、なければ入院時の病名", () => {
    const d = (main: boolean, outcome: Diagnosis["outcome"], name: string): Diagnosis => ({ id: name, code: "x", name, prefixes: [], suffixes: [], main, start: -4, outcome });
    expect(mainDiagnosis(patient, [d(false, "継続", "高血圧症"), d(true, "継続", "肺炎")])).toBe("肺炎");
    expect(mainDiagnosis(patient, [d(true, "治癒", "肺炎")])).toBe("誤嚥性肺炎");
  });
  it("部屋・氏名・年齢性別・入院日数・ToDo・印をそのまま入れる", () => {
    const row = roundsRow({ patient, room: "506A", orders: [], todos: ["家族に病状説明", "明日 CRP 再検"], results: { unseen: 2, panic: 1 }, waiting: 3, today, now: "09:00" });
    expect(row).toMatchObject({ room: "506A", name: "架空 太郎", ageSex: "78歳男性", day: 5, diagnosis: "誤嚥性肺炎", todos: ["家族に病状説明", "明日 CRP 再検"], unseen: 2, panic: 1, waiting: 3, oxygen: "鼻カニュラ 1L" });
    expect(row.labs.map((l) => l.code)).toEqual(["WBC", "Hb", "CRP", "K", "Na"]);
  });
});

describe("ページ分け", () => {
  const box = (todos: number): RoundsRow => ({ id: String(todos), room: "", name: "", kana: "", ageSex: "", day: 1, diagnosis: "", todos: Array.from({ length: todos }, (_, i) => `ToDo ${i}`), today: [], drips: [], antibiotics: [], oxygen: "", vitals: null, labs: [], unseen: 0, panic: 0, waiting: null });
  it("ふつうの高さなら1枚に6人、7人目から次の紙", () => {
    expect(rowHeightMm(box(2))).toBe(ROW_MIN_MM);
    const pages = paginateRounds(Array.from({ length: 13 }, () => box(1)), rowHeightMm);
    expect(pages.map((p) => p.length)).toEqual([6, 6, 1]);
  });
  it("ToDo の長い人は高く数え、その紙に入る人数が減る。並びは変えない", () => {
    const rows = [box(1), box(20), box(1), box(1), box(1), box(1)];
    expect(rowHeightMm(rows[1])).toBeGreaterThan(ROW_MIN_MM * 2);
    const pages = paginateRounds(rows, rowHeightMm);
    expect(pages.flat()).toEqual(rows);
    expect(pages[0].length).toBeLessThan(6);
  });
  it("数字・英字は全角の半分ほどの幅で数える", () => {
    expect(textWidth("06:00 採取")).toBeCloseTo(5);
    const today = (texts: string[]): RoundsRow => ({ ...box(0), today: texts });
    expect(rowHeightMm(today(["06:00 採取 定期採血セット", "09:30 検査 心電図（12誘導）"]))).toBe(ROW_MIN_MM);
  });
  it("1人で1枚を超えても、その人だけの紙にする", () => {
    expect(paginateRounds([box(80), box(1)], rowHeightMm).map((p) => p.length)).toEqual([1, 1]);
    expect(paginateRounds([], rowHeightMm)).toEqual([]);
  });
});
