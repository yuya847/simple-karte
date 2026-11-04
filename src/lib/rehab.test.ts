import { describe, expect, it } from "vitest";
import { BI_ITEMS, BI_MAX, biDrops, biProblems, biTotal, type BiEval } from "./barthel";
import { PATIENTS } from "./patients";
import {
  bookingClashes,
  categoryOf,
  demoRehabOrders,
  earlyAddition,
  holidayUntil,
  initialRehabDesk,
  isRehabHoliday,
  patientDayUnits,
  planProblems,
  planState,
  progressOf,
  rehabPrescriptions,
  standardDays,
  therapistLoad,
  unitsOf,
  type RehabDesk,
  type RehabSession,
} from "./rehab";
import type { OrderEntry, RehabOrder } from "./types";

const today = { y: 2026, m: 11, d: 4 }; // 水曜日
const orders = demoRehabOrders();
const people = PATIENTS.map((p) => ({ patient: p, room: p.room, entries: (orders[p.id] ?? []) as OrderEntry[] }));
const desk = initialRehabDesk();
const session = (over: Partial<RehabSession>): RehabSession => ({ id: `s${Math.random()}`, orderId: "o", patientId: "p", therapist: "理学療法士 木村", discipline: "PT", day: 0, start: "09:00", end: "09:40", place: "訓練室", recordedAt: { day: 0, time: "10:00", by: "x" }, ...over });

describe("Barthel Index（別紙様式7の2・21）", () => {
  it("has the ten items of the form, 100 points at most", () => {
    expect(BI_ITEMS.map((i) => i.label)).toEqual(["食事", "車椅子からベッドへの移動", "整容", "トイレ動作", "入浴", "歩行", "階段昇降", "着替え", "排便コントロール", "排尿コントロール"]);
    expect(BI_ITEMS.map((i) => i.options.map((o) => o.score).join("・"))).toEqual(["10・5・0", "15・10・5・0", "5・0", "10・5・0", "5・0", "15・10・5・0", "10・5・0", "10・5・0", "10・5・0", "10・5・0"]);
    expect(BI_MAX).toBe(100);
  });
  it("adds the scores only when every item is chosen and each score is one of its options", () => {
    const all = Object.fromEntries(BI_ITEMS.map((i) => [i.key, i.options[0].score]));
    expect(biTotal(all)).toBe(100);
    expect(biTotal({ ...all, walk: 7 })).toBeNull();
    expect(biProblems({ ...all, walk: 7 })).toEqual(["歩行の 7点は点数の候補（15・10・5・0）にありません。"]);
    expect(biProblems({})).toHaveLength(10);
  });
  it("points out a fall of 10 or more within a week (the 通知's sign of 急性増悪), for the doctor to judge", () => {
    const e = (day: number, walk: number, transfer: number): BiEval => ({ id: `e${day}`, patientId: "p", day, time: "10:00", by: "x", scores: { eat: 10, transfer, groom: 5, toilet: 10, bath: 5, walk, stairs: 5, dress: 10, bowel: 10, bladder: 10 } });
    expect(biDrops([e(-6, 15, 15), e(0, 10, 10)])).toEqual([expect.objectContaining({ drop: 10 })]);
    expect(biDrops([e(-9, 15, 15), e(0, 10, 10)])).toEqual([]);
    expect(biDrops([e(-2, 15, 15), e(0, 10, 15)])).toEqual([]);
  });
});

describe("単位と上限", () => {
  it("1単位 = 20分以上: 39分は1単位、40分は2単位、19分は0", () => {
    expect(unitsOf("09:00", "09:39")).toEqual({ minutes: 39, units: 1 });
    expect(unitsOf("09:00", "09:40").units).toBe(2);
    expect(unitsOf("09:00", "09:19").units).toBe(0);
    expect(unitsOf(undefined, "09:19").units).toBe(0);
  });
  it("a patient's day is limited to 6 units, 9 when the doctor marked the patient", () => {
    const d: RehabDesk = { ...desk, sessions: [session({ patientId: "p", start: "09:00", end: "10:20" }), session({ patientId: "p", start: "13:00", end: "14:00" })] };
    expect(patientDayUnits(d, "p")).toEqual([{ day: 0, units: 7, limit: 6, over: 1 }]);
    expect(patientDayUnits({ ...d, nine: { p: { day: 0, time: "08:00", by: "医師" } } }, "p")[0]).toMatchObject({ limit: 9, over: 0 });
  });
  it("a therapist: 18 units a day as the standard, 24 at most, 108 a week", () => {
    const full: RehabDesk = { ...desk, sessions: Array.from({ length: 7 }, (_, i) => session({ id: `x${i}`, start: `${String(9 + i).padStart(2, "0")}:00`, end: `${String(9 + i).padStart(2, "0")}:59` })) };
    // 7 × 2単位 = 14、足して 6 → 20単位（標準を超える）
    expect(therapistLoad(full, "理学療法士 木村", 0, today, 6).notes).toEqual(["1日 20単位：標準の18単位を超えています（上限24単位）。"]);
    expect(therapistLoad(full, "理学療法士 木村", 0, today, 12).notes[0]).toContain("上限の24単位を超えます");
  });
});

describe("日数（令和8年の告示 H000〜H003）", () => {
  const rx = (field: RehabOrder["field"], onset: number): RehabOrder => ({ field, therapists: ["PT"], onset, goal: "x", cautions: "" });
  it("標準的算定日数: 廃用症候群は診断から120日、呼吸器は治療開始日から90日", () => {
    expect(standardDays(rx("廃用症候群", -4), desk, "none", -3, 0)).toMatchObject({ from: -4, dayNo: 5, left: 115, over: false });
    // 呼吸器: 治療開始日（初めて実施した日）から
    const d: RehabDesk = { ...desk, sessions: [session({ orderId: "r", day: -2 })] };
    expect(standardDays(rx("呼吸器", -10), d, "r", -3, 0)).toMatchObject({ from: -2, dayNo: 3, left: 87 });
    expect(standardDays(rx("脳血管疾患等", -200), desk, "none", 0, 0).over).toBe(true);
    expect(categoryOf("心大血管疾患").tier).toBeNull();
    expect(categoryOf("廃用症候群").tier).toEqual({ name: "（Ⅲ）", points: 77 });
  });
  it("早期リハビリテーション加算: from the day of admission, 60 points on days 1–3, 25 to day 14, none after", () => {
    expect(earlyAddition(-1, 0)).toMatchObject({ dayNo: 2, points: 60 });
    expect(earlyAddition(-3, 0)).toMatchObject({ dayNo: 4, points: 25 });
    expect(earlyAddition(-13, 0)).toMatchObject({ dayNo: 14, points: 25, until: 0 });
    expect(earlyAddition(-14, 0).points).toBe(0);
    // 転院してきた患者は転院前の最初の入院日から
    expect(earlyAddition(-1, 0, -20).points).toBe(0);
  });
  it("休日リハビリテーション加算: 土日・祝日と年末年始、期間は区分ごと", () => {
    expect(isRehabHoliday({ y: 2026, m: 11, d: 7 })).toBe(true); // 土
    expect(isRehabHoliday({ y: 2026, m: 11, d: 3 })).toBe(true); // 文化の日
    expect(isRehabHoliday({ y: 2026, m: 12, d: 30 })).toBe(true);
    expect(isRehabHoliday(today)).toBe(false);
    expect(holidayUntil(rx("廃用症候群", -4), -3)).toBe(25);
    // 呼吸器: 発症から7日目と治療開始日の早いほうから30日目
    expect(holidayUntil(rx("呼吸器", -10), 0)).toBe(-10 + 6 + 29);
    expect(holidayUntil(rx("呼吸器", -1), 0)).toBe(29);
  });
});

describe("予約・実施計画書・経過", () => {
  it("finds the patients with a リハビリ処方", () => {
    expect(rehabPrescriptions(people).map((r) => `${r.name} ${r.order.field}`)).toEqual(["大浦 トメ 呼吸器", "北村 博 廃用症候群"]);
  });
  it("a booking that overlaps the therapist, the patient or the patient's exam is pointed out", () => {
    const kita = people.find((p) => p.patient.id === "90010198")!;
    const b = { orderId: "o-rehab-demo2", patientId: "90010198", therapist: "理学療法士 木村", discipline: "PT" as const, day: 0, start: "11:20", minutes: 20, place: "訓練室" as const };
    expect(bookingClashes(desk, b, kita.entries)).toEqual(["理学療法士 木村は 11:00 から別の予約があります。"]);
    const ct: OrderEntry = { kind: "order", id: "ct", day: 0, time: "09:00", author: "x", status: "有効", order: { type: "imaging", modality: "CT", region: "R-CHEST", contrast: "単純", purpose: "x", when: { day: 0, time: "15:00", priority: "予約" }, transport: "車椅子" } };
    expect(bookingClashes(desk, { ...b, start: "15:00" }, [ct])).toEqual(["この患者は 15:00 に画像検査の予定があります。"]);
  });
  it("the 実施計画書 is due 7 days after the start (14 at the latest), and is reviewed every 3 months", () => {
    expect(planState(desk, "o-rehab-demo2", -3, 0).state).toBe("作成済み・説明済み");
    expect(planState(desk, "o-rehab-demo1", null, 0).state).toBe("リハビリ開始前");
    expect(planState(desk, "o-rehab-demo1", 0, 5).state).toBe("作成まだ（期限内）");
    expect(planState(desk, "o-rehab-demo1", 0, 7).state).toBe("作成まだ（原則の7日を過ぎた）");
    expect(planState(desk, "o-rehab-demo1", 0, 14).state).toBe("作成まだ（14日を過ぎた）");
    expect(planState(desk, "o-rehab-demo2", -3, 89).state).toBe("見直しの時期（3か月）");
    const p = desk.plans[0];
    expect(planProblems({ ...p, goalMonth: "", content: {} })).toEqual(["目標（今後1か月以内）を書いてください。", "治療内容（理学療法・作業療法・言語聴覚療法のいずれか）を書いてください。"]);
  });
  it("the doctor sees units by day, BI by date and the day counts", () => {
    const kita = rehabPrescriptions(people).find((r) => r.patientId === "90010198")!;
    const pr = progressOf(desk, kita, 0);
    expect(pr.units.map((u) => `${u.day}:${u.units}`)).toEqual(["-3:2", "-2:2", "-1:2"]);
    expect(pr.bi.map((b) => b.total)).toEqual([55, 65]);
    expect(pr.started).toBe(-3);
    expect(pr.early).toMatchObject({ dayNo: 6, points: 25 });
    expect(pr.standard).toMatchObject({ dayNo: 5, left: 115 });
  });
});
