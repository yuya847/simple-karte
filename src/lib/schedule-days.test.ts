import { describe, expect, it } from "vitest";
import { executionMarks, isAhead, planDayLabel, planItemsOf, planKindsLabel, planVerb, plannedDaysAhead, plannedItems, plansOn, type PlanItem } from "./schedule-days";
import type { InjectionOrder, OrderEntry, PrescriptionOrder } from "./types";

const e = (id: string, day: number, time: string, order: OrderEntry["order"], status: OrderEntry["status"] = "有効", stop?: { on: number; time?: string }): OrderEntry => ({ kind: "order", id, day, time, author: "x", status, order, stoppedOn: stop?.on, stoppedTime: stop?.time });
const brief = (p: PlanItem) => `${p.day}${p.time ? ` ${p.time}` : ""} ${p.kind} ${p.verb}`;

describe("依頼日と実施日：オーダから日ごとの予定を作る", () => {
  it("a draw is planned on its collection day and time; a cancelled one is not", () => {
    const lab = e("lab", -1, "17:30", { type: "lab", codes: ["LAB-CBC"], collect: { day: 1, time: "06:00" }, priority: "定時" });
    expect(planItemsOf(lab).map(brief)).toEqual(["1 06:00 検体検査 採取"]);
    expect(planItemsOf(lab)[0]).toMatchObject({ orderId: "lab", orderedOn: -1, label: "血算（CBC）" });
    expect(planItemsOf({ ...lab, status: "中止", stoppedOn: 0 })).toEqual([]);
  });
  it("an exam is planned at its slot (the time only when fixed or 至急); 生理検査 is a 予約", () => {
    const mri = e("mri", 0, "09:10", { type: "imaging", modality: "MRI", region: "R-LEG", contrast: "単純", purpose: "x", when: { day: 7, time: "10:00", priority: "予約" }, transport: "車椅子" });
    expect(planItemsOf(mri).map(brief)).toEqual(["7 10:00 画像 撮影"]);
    const xr = e("xr", 0, "09:10", { type: "imaging", modality: "X線", region: "R-CHEST", purpose: "x", when: { day: 1, priority: "予約" }, transport: "車椅子" });
    expect(planItemsOf(xr).map(brief)).toEqual(["1 画像 撮影"]);
    const stat = e("stat", 0, "09:10", { type: "imaging", modality: "X線", region: "R-CHEST", purpose: "x", when: { day: 0, priority: "至急" }, transport: "車椅子" });
    expect(planItemsOf(stat).map(brief)).toEqual(["0 09:10 画像 撮影"]);
    const ecg = e("ecg", 0, "09:10", { type: "physio", test: "PHY-ECG", purpose: "x", when: { day: 2, time: "15:00", priority: "予約" }, place: "検査室" });
    expect(planItemsOf(ecg).map(brief)).toEqual(["2 15:00 予約 検査"]);
  });
  it("an injection course gives its start and its end (the day the course runs out, as the calendar counts it), not every day; a stop replaces the end; a stop before the start leaves the stop alone", () => {
    const inj = { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 2, unit: "g" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 8 }, start: { day: 0, time: "15:30" }, days: 7 } satisfies InjectionOrder;
    expect(planItemsOf(e("inj", 0, "14:35", inj)).map(brief)).toEqual(["0 15:30 注射 開始", "7 注射 終了"]);
    expect(planItemsOf(e("inj", 0, "14:35", inj, "中止", { on: 3, time: "10:00" })).map(brief)).toEqual(["0 15:30 注射 開始", "3 10:00 注射 中止"]);
    expect(planItemsOf(e("inj", 0, "14:35", { ...inj, start: { day: 2, time: "09:00" } }, "中止", { on: 0, time: "16:00" })).map(brief)).toEqual(["0 16:00 注射 中止"]);
    expect(planItemsOf(e("once", 0, "14:35", { ...inj, schedule: { kind: "once" }, days: undefined })).map(brief)).toEqual(["0 15:30 注射 実施"]);
    expect(planItemsOf(e("cont", 0, "14:35", { ...inj, days: undefined })).map(brief)).toEqual(["0 15:30 注射 開始"]);
  });
  it("a prescription gives 服用開始 (at the ward's time of that timing) and 最終日; 頓用 only its start", () => {
    const rx = { type: "prescription", category: "定期", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: 1, timing: "朝" }, days: 14 } satisfies PrescriptionOrder;
    expect(planItemsOf(e("rx", 0, "10:00", rx)).map(brief)).toEqual(["1 08:00 内服 服用開始", "14 内服 最終日"]);
    expect(planItemsOf(e("prn", 0, "10:00", { ...rx, timings: [], prn: "疼痛時", start: { day: 0 }, days: undefined })).map(brief)).toEqual(["0 内服 頓用の開始"]);
  });
  it("a 退院時処方 is taken at home: nothing is planned on the ward's days (no 服用開始, no 最終日, no mark on its card)", () => {
    const home = e("home", 0, "10:00", { type: "prescription", category: "退院時", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: 2, timing: "朝" }, days: 14 } satisfies PrescriptionOrder);
    expect(planItemsOf(home)).toEqual([]);
    expect(executionMarks(home, 600)).toEqual([]);
    expect(plannedDaysAhead(plannedItems([home]))).toEqual([]);
  });
  it("the kinds of a day, each once, for the heading of the folded days ahead", () => {
    const p = (kind: PlanItem["kind"]): PlanItem => ({ kind, day: 1, verb: "x", label: "x", orderId: kind, orderedOn: 0 });
    expect(planKindsLabel([p("検体検査")])).toBe("検体検査");
    expect(planKindsLabel([p("検体検査"), p("画像"), p("検体検査")])).toBe("検体検査・画像");
  });
  it("外来予約, 退院・外泊 (with the return), 移動 and 透析 are planned on their day", () => {
    expect(planItemsOf(e("opd", 0, "10:00", { type: "procedure", code: "PROC-OPD", opd: { dept: "総合診療科", doctor: "山本", day: 14, slot: "午前", purpose: "再診" }, schedule: { kind: "once" }, start: { day: 14 } })).map(brief)).toEqual(["14 外来予約 受診"]);
    expect(planItemsOf(e("opdt", 0, "10:00", { type: "procedure", code: "PROC-OPD", opd: { dept: "総合診療科", day: 14, slot: "時刻", time: "10:30", purpose: "再診" }, schedule: { kind: "once" }, start: { day: 14 } })).map(brief)).toEqual(["14 10:30 外来予約 受診"]);
    expect(planItemsOf(e("dc", 0, "10:00", { type: "procedure", code: "PROC-LEAVE", leave: { kind: "退院", from: { day: 3, time: "10:00" }, destination: "自宅", note: "" }, schedule: { kind: "once" }, start: { day: 3, time: "10:00" } })).map(brief)).toEqual(["3 10:00 退院 退院"]);
    expect(planItemsOf(e("out", 0, "10:00", { type: "procedure", code: "PROC-LEAVE", leave: { kind: "外泊", from: { day: 2, time: "10:00" }, back: { day: 3, time: "17:00" }, destination: "自宅", note: "" }, schedule: { kind: "once" }, start: { day: 2, time: "10:00" } })).map(brief)).toEqual(["2 10:00 移動 外泊", "3 17:00 移動 帰院"]);
    expect(planItemsOf(e("mv", 0, "10:00", { type: "procedure", code: "PROC-MOVE", move: { kind: "転棟", to: { room: "402", bed: "A" }, reason: "x" }, schedule: { kind: "once" }, start: { day: 1, time: "14:00" } })).map(brief)).toEqual(["1 14:00 移動 転棟"]);
    expect(planItemsOf(e("hd", 0, "10:00", { type: "procedure", code: "PROC-HD", hd: { purpose: "維持", method: "HD", minutes: 240, qb: 200, membrane: 1.5, anticoag: { drug: "なし", initial: null, hourly: null }, uf: 1, dw: null, access: "AVF（シャント）" } as never, schedule: { kind: "once" }, start: { day: 2, time: "13:00" } })).map(brief)).toEqual(["2 13:00 予約 透析"]);
  });
  it("a ward procedure: once → 実施; a course → 開始 and 終了; 継続 → its start only", () => {
    expect(planItemsOf(e("p1", 0, "10:00", { type: "procedure", code: "PROC-WOUND", schedule: { kind: "once" }, start: { day: 1, time: "09:00" } })).map(brief)).toEqual(["1 09:00 処置 実施"]);
    expect(planItemsOf(e("p2", 0, "10:00", { type: "procedure", code: "PROC-WOUND", schedule: { kind: "per_day", count: 1 }, start: { day: 0 }, days: 5 })).map(brief)).toEqual(["0 処置 開始", "5 処置 終了"]);
    expect(planItemsOf(e("o2", 0, "10:00", { type: "procedure", code: "PROC-O2", schedule: { kind: "continuous" }, start: { day: 0, time: "10:00" } })).map(brief)).toEqual(["0 10:00 処置 開始"]);
  });
});

describe("日ごとの予定と、これから予定のある日", () => {
  const entries: OrderEntry[] = [
    e("lab-today", -1, "17:30", { type: "lab", codes: ["LAB-CBC"], collect: { day: 0, time: "06:00" }, priority: "定時" }),
    e("lab-same", 0, "09:00", { type: "lab", codes: ["LAB-CRP"], collect: { day: 0, time: "15:00" }, priority: "至急" }),
    e("mri", 0, "09:10", { type: "imaging", modality: "MRI", region: "R-LEG", contrast: "単純", purpose: "x", when: { day: 7, time: "10:00", priority: "予約" }, transport: "車椅子" }),
    e("opd", 0, "10:00", { type: "procedure", code: "PROC-OPD", opd: { dept: "総合診療科", day: 14, slot: "午前", purpose: "再診" }, schedule: { kind: "once" }, start: { day: 14 } }),
    e("inj", -2, "14:35", { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 2, unit: "g" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 8 }, start: { day: -2, time: "15:30" }, days: 7 }),
    e("far", 0, "10:00", { type: "procedure", code: "PROC-OPD", opd: { dept: "総合診療科", day: 120, slot: "午前", purpose: "再診" }, schedule: { kind: "once" }, start: { day: 120 } }),
  ];
  const items = plannedItems(entries, [{ id: "or-1", day: 7, start: "09:00", procedure: "デブリードマン" }]);
  it("everything is sorted by day and time; an operation is a 予約 without an order", () => {
    expect(items.map(brief)).toEqual(["-2 15:30 注射 開始", "0 06:00 検体検査 採取", "0 15:00 検体検査 採取", "5 注射 終了", "7 09:00 予約 手術", "7 10:00 画像 撮影", "14 外来予約 受診", "120 外来予約 受診"]);
    expect(items.find((p) => p.verb === "手術")).toMatchObject({ orderId: "sx:or-1", orderedOn: null });
  });
  it("a day's plans leave out the orders written that day (their card is already there) and respect the filter", () => {
    expect(plansOn(items, 0).map((p) => p.orderId)).toEqual(["lab-today"]);
    expect(plansOn(items, 7).map((p) => p.orderId)).toEqual(["sx:or-1", "mri"]);
    expect(plansOn(items, 7, (p) => p.kind === "画像").map((p) => p.orderId)).toEqual(["mri"]);
    expect(plansOn(items, -2)).toEqual([]);
  });
  it("the days ahead with plans, nearest first, within 90 days, filtered the same way; with the tree's label", () => {
    const ahead = plannedDaysAhead(items);
    expect(ahead.map((d) => `${d.day}:${planDayLabel(d.items)}`)).toEqual(["5:注射", "7:予定 2", "14:外来予約"]);
    expect(plannedDaysAhead(items, (p) => p.kind === "外来予約").map((d) => d.day)).toEqual([14]);
  });
  it("ahead or past: by the clock when the time is fixed, by the day otherwise; the verb gets 予定 while ahead", () => {
    const now = 10 * 60; // today 10:00
    const at = (day: number, time?: string): PlanItem => ({ kind: "検体検査", day, time, verb: "採取", label: "", orderId: "x", orderedOn: -1 });
    expect(isAhead(at(0, "06:00"), now)).toBe(false);
    expect(isAhead(at(0, "15:00"), now)).toBe(true);
    expect(isAhead(at(0), now)).toBe(true);
    expect(isAhead(at(-1), now)).toBe(false);
    expect(isAhead(at(1, "06:00"), null)).toBe(true);
    expect(isAhead(at(-1, "06:00"), null)).toBe(false);
    expect(planVerb(at(0, "15:00"), now)).toBe("採取予定");
    expect(planVerb(at(0, "06:00"), now)).toBe("採取");
  });
  it("the marks of an order's heading: items on another day, or still ahead; none for an order done the day it was written", () => {
    const now = 10 * 60;
    expect(executionMarks(entries[0], now).map(brief)).toEqual(["0 06:00 検体検査 採取"]);
    expect(executionMarks(entries[1], now).map(brief)).toEqual(["0 15:00 検体検査 採取"]);
    expect(executionMarks(entries[1], 16 * 60)).toEqual([]);
    expect(executionMarks(entries[4], now).map(brief)).toEqual(["5 注射 終了"]);
    expect(executionMarks(entries[2], now).map(brief)).toEqual(["7 10:00 画像 撮影"]);
  });
});
