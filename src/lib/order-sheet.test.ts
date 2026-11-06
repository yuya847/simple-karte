// The 「項目名：値」 lines of each kind of order, the categories ticked at the top, the days the screens move
// through, and the 実施 record typed with a time and a name — all by code.
import { describe, expect, it } from "vitest";
import { categoryOfOrder, categoryOfTake, categoryOfWork, clampDay, DONE_BAND_MS, doneBandText, doneStampOf, executeRecord, EXECUTE_DAYS, EXECUTE_NOTE, momentLabel, orderFields, parseHHMM, sheetTitle, splitStamp, startLabel, takeFields, takeRowOnDay, takeStampOf, TAKE_DAYS, timeOfAbs, waitingToday, workTitle } from "./order-sheet";
import type { TakeRow } from "./order-take";
import type { ImagingOrder, InjectionOrder, LabOrder, OrderEntry, PhysioOrder, PrescriptionOrder, ProcedureOrder } from "./types";

const TODAY = { y: 2026, m: 11, d: 4 };
const WARD = "5階東病棟";
const inj: InjectionOrder = { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 12 }, start: { day: 0, time: "14:00" }, minutesPerDose: 30, rateMlPerH: 200, days: 7 };
const rx: PrescriptionOrder = { type: "prescription", category: "定期", drugCode: "ORAL-MET250", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: 1, timing: "朝" } };
const lab: LabOrder = { type: "lab", codes: ["LAB-CBC"], collect: { day: 1, time: "06:00" }, priority: "定時", comment: "朝の定時" };
const img: ImagingOrder = { type: "imaging", modality: "CT", region: "R-CHEST", contrast: "単純", purpose: "肺炎の広がり", when: { day: 0, priority: "至急" }, transport: "車椅子", reading: "当日中" };
const phy: PhysioOrder = { type: "physio", test: "PHY-ECG", purpose: "胸痛", when: { day: 0, time: "15:00", priority: "予約" }, place: "ベッドサイド" };
const proc: ProcedureOrder = { type: "procedure", code: "PROC-O2", o2: { device: "鼻カニュラ", lpm: 2 }, schedule: { kind: "continuous" }, start: { day: -1, time: "11:35" } };
const tx: ProcedureOrder = { type: "procedure", code: "PROC-TX", tx: { product: "RBC", units: 2, abo: "A", rh: "+", reason: "Hb 6.4" }, schedule: { kind: "once" }, start: { day: 0, time: "15:00" } };
const text = (label: string, fields: { label: string; value: string }[]) => fields.filter((f) => f.label === label).map((f) => f.value);

describe("項目名：値の行（オーダの種類ごと）", () => {
  it("注射: 手技・薬品・用法・1回の時間・速度・指示開始・日数・実施場所", () => {
    const f = orderFields(inj, TODAY, WARD);
    expect(f.map((x) => x.label)).toEqual(["手技", "薬品", "用法", "1回の時間", "速度", "指示開始", "日数", "実施場所"]);
    expect(text("手技", f)).toEqual(["点滴静注"]);
    expect(text("薬品", f)[0]).toMatch(/セファメジンα注射用1g.*1g/);
    expect(text("用法", f)).toEqual(["12時間ごと"]);
    expect(text("速度", f)).toEqual(["200 mL/時"]);
    expect(text("指示開始", f)).toEqual(["11/4（水） 14:00"]);
    expect(text("日数", f)).toEqual(["7日間"]);
    expect(text("実施場所", f)).toEqual([WARD]);
  });

  it("注射 with two drugs lists 薬品 twice, and a continuous one says 継続", () => {
    const two: InjectionOrder = { ...inj, items: [...inj.items, { drugCode: "INJ-KCL20", amount: 1, unit: "A" }], days: undefined, minutesPerDose: undefined, rateMlPerH: undefined };
    const f = orderFields(two, TODAY, WARD);
    expect(text("薬品", f)).toHaveLength(2);
    expect(text("日数", f)).toEqual(["継続（変更まで）"]);
    expect(f.some((x) => x.label === "速度")).toBe(false);
  });

  it("処方: 薬品・用法・区分・指示開始・日数（no 手技, no 実施場所）", () => {
    const f = orderFields(rx, TODAY, WARD);
    expect(f.map((x) => x.label)).toEqual(["薬品", "用法", "区分", "指示開始", "日数"]);
    expect(text("薬品", f)[0]).toMatch(/メトホルミン.*1回1錠/);
    expect(text("用法", f)[0]).toMatch(/1日2回/);
    expect(text("区分", f)).toEqual(["定期"]);
    expect(text("指示開始", f)).toEqual(["11/5（木） 朝"]);
  });

  it("検体検査: 検査項目・採取・優先・コメント", () => {
    const f = orderFields(lab, TODAY, WARD);
    expect(f.map((x) => x.label)).toEqual(["検査項目", "採取", "優先", "コメント"]);
    expect(text("採取", f)).toEqual(["11/5（木） 06:00"]);
    expect(text("優先", f)).toEqual(["定時"]);
  });

  it("画像・生理: 検査・予定・搬送・目的", () => {
    const f = orderFields(img, TODAY, WARD);
    expect(text("検査", f)[0]).toMatch(/CT.*胸部/);
    expect(text("予定", f)).toEqual(["至急"]);
    expect(text("搬送", f)).toEqual(["車椅子"]);
    expect(text("読影", f)).toEqual(["当日中"]);
    const g = orderFields(phy, TODAY, WARD);
    expect(text("予定", g)).toEqual(["11/4（水） 15:00 予約"]);
    expect(text("場所", g)).toEqual(["ベッドサイド"]);
    expect(text("目的", g)).toEqual(["胸痛"]);
  });

  it("処置: 処置・回数・指示開始・実施場所; 輸血 has its 内容; a continuous one has no 日数", () => {
    const f = orderFields(proc, TODAY, WARD);
    expect(text("処置", f)[0]).toMatch(/酸素吸入.*鼻カニュラ 2L\/分/);
    expect(text("回数", f)).toEqual(["継続"]);
    expect(f.some((x) => x.label === "日数")).toBe(false);
    expect(text("実施場所", f)).toEqual([WARD]);
    const g = orderFields(tx, TODAY, WARD);
    expect(text("内容", g)[0]).toMatch(/赤血球.*2単位/);
  });

  it("a 指示受け row without an order (食事・指示簿・延長) shows its text as 内容／詳細 or 延長／日数", () => {
    expect(takeFields({ kind: "食事", type: "食事", main: "絶食", detail: "明日の朝食から" }, undefined, TODAY, WARD)).toEqual([
      { label: "内容", value: "絶食" },
      { label: "詳細", value: "明日の朝食から" },
    ]);
    const entry: OrderEntry = { kind: "order", id: "a", day: 0, time: "10:00", author: "山本", status: "有効", order: inj };
    expect(takeFields({ kind: "延長", type: "延長", main: "セファゾリン", detail: "10日間に" }, entry, TODAY, WARD)).toEqual([
      { label: "延長", value: "セファゾリン" },
      { label: "日数", value: "10日間に" },
    ]);
    expect(takeFields({ kind: "新規", type: "注射", main: "", detail: "" }, entry, TODAY, WARD)[0]).toEqual({ label: "手技", value: "点滴静注" });
  });

  it("headings: 入院注射・入院処方・看護指示（指示簿）・入院食事, and for the worksheet 入院検体検査", () => {
    expect(sheetTitle({ kind: "新規", type: "注射" })).toBe("入院注射");
    expect(sheetTitle({ kind: "中止", type: "内服" })).toBe("入院内服");
    expect(sheetTitle({ kind: "指示簿", type: "指示簿" })).toBe("看護指示（指示簿）");
    expect(sheetTitle({ kind: "食事", type: "食事" })).toBe("入院食事");
    expect(sheetTitle({ kind: "延長", type: "延長" })).toBe("入院指示の延長");
    expect(workTitle("採血")).toBe("入院検体検査");
    expect(workTitle("注射")).toBe("入院注射");
  });
});

describe("種類のチェック", () => {
  it("注射 and 輸血 are 注射・輸血, 内服 is 処方, the rest 処置・検査; 指示簿・食事・延長 have their own", () => {
    expect(categoryOfOrder(inj)).toBe("注射・輸血");
    expect(categoryOfOrder(tx)).toBe("注射・輸血");
    expect(categoryOfOrder(rx)).toBe("処方");
    expect(categoryOfOrder(lab)).toBe("処置・検査");
    expect(categoryOfOrder(img)).toBe("処置・検査");
    expect(categoryOfOrder(proc)).toBe("処置・検査");
    expect(categoryOfTake({ kind: "指示簿", type: "指示簿" })).toBe("看護指示");
    expect(categoryOfTake({ kind: "食事", type: "食事" })).toBe("食事");
    expect(categoryOfTake({ kind: "延長", type: "注射" })).toBe("その他");
    expect(categoryOfTake({ kind: "新規", type: "内服" })).toBe("処方");
    expect(categoryOfWork("採血")).toBe("処置・検査");
    expect(categoryOfWork("内服")).toBe("処方");
  });
});

describe("日付の移動", () => {
  it("moves through yesterday, today and tomorrow, no further", () => {
    expect(TAKE_DAYS).toEqual({ min: -1, max: 1 });
    expect(EXECUTE_DAYS).toEqual({ min: -1, max: 1 });
    expect(clampDay(5, TAKE_DAYS)).toBe(1);
    expect(clampDay(-3, TAKE_DAYS)).toBe(-1);
    expect(clampDay(0, TAKE_DAYS)).toBe(0);
  });

  it("a 指示受け row is on the day it was given and on the day its order starts", () => {
    const entry: OrderEntry = { kind: "order", id: "a", day: 0, time: "10:00", author: "山本", status: "有効", order: { ...inj, start: { day: 1, time: "08:00" } } };
    expect(takeRowOnDay({ at: 600 }, 0, entry)).toBe(true);
    expect(takeRowOnDay({ at: 600 }, 1, entry)).toBe(true);
    expect(takeRowOnDay({ at: 600 }, -1, entry)).toBe(false);
    expect(takeRowOnDay({ at: -300 }, -1)).toBe(true);
    expect(takeRowOnDay({ at: -300 }, 0)).toBe(false);
  });

  it("labels: the order's moment and its start", () => {
    expect(momentLabel(600, TODAY)).toBe("11/4（水） 10:00");
    expect(momentLabel(-1, TODAY, false)).toBe("11/3（火）（時刻なし）");
    expect(startLabel(inj, TODAY)).toBe("11/4（水） 14:00");
    expect(startLabel(rx, TODAY)).toBe("11/5（木） 08:00");
    expect(startLabel(img, TODAY)).toBe("至急（11/4（水））");
    expect(startLabel({ ...proc, start: { day: 0 } }, TODAY)).toBe("11/4（水）");
  });
});

describe("日時／者の欄", () => {
  it("splits 「11:00 看護師 佐藤」 into when and who; 指示受け before this session is the earlier shift", () => {
    expect(splitStamp("11:00 看護師 佐藤・確認 看護師 田中")).toEqual({ at: "11:00", by: "看護師 佐藤・確認 看護師 田中" });
    expect(splitStamp(undefined)).toEqual({ at: "", by: "" });
    const taken = { "a|新規": "11:00 看護師 佐藤" };
    expect(takeStampOf("a", taken, new Set(["a|新規"]))).toEqual({ at: "11:00", by: "看護師 佐藤" });
    expect(takeStampOf("b", {}, new Set(["b|新規"]))).toEqual({ at: "", by: "" });
    expect(takeStampOf("c", {}, new Set())).toEqual({ at: "", by: "前の勤務帯" });
  });

  it("the latest 実施 of an order fills 実施日時／実施者", () => {
    const rec = (at: number, doneAt: string, status: "実施" | "未実施" = "実施") => ({ key: `a|${at}`, orderId: "a", patientId: "p", at, status, doneAt, by: "看護師 佐藤", checked: { patient: true, label: true } });
    expect(doneStampOf("a", { "a|840": rec(840, "14:05"), "a|1560": rec(1560, "02:10", "未実施") })).toEqual({ at: "02:10（未実施）", by: "看護師 佐藤" });
    expect(doneStampOf("z", {})).toEqual({ at: "", by: "" });
  });
});

describe("実施入力の記録", () => {
  const item = { orderId: "a", patientId: "p1", at: 840 };
  it("keeps the scheduled time as the key, takes the typed time and name, and says no barcode was read", () => {
    const r = executeRecord(item, { day: 0, time: "14:05", by: "看護師 佐藤", status: "実施" })!;
    expect(r.key).toBe("a|840");
    expect(r.at).toBe(840);
    expect(r.doneAt).toBe("14:05");
    expect(r.by).toBe("看護師 佐藤");
    expect(r.status).toBe("実施");
    expect(r.checked).toEqual({ patient: false, label: null });
    expect(r.note).toBe(EXECUTE_NOTE);
    expect(r.offBy).toBeUndefined();
  });

  it("counts how far off the schedule a late or early 実施 was (beyond the ward's 60 minutes)", () => {
    expect(executeRecord(item, { day: 0, time: "15:30", by: "n", status: "実施" })!.offBy).toBe(90);
    expect(executeRecord(item, { day: 0, time: "12:00", by: "n", status: "実施" })!.offBy).toBe(-120);
    expect(executeRecord(item, { day: 0, time: "14:50", by: "n", status: "実施" })!.offBy).toBeUndefined();
    // Yesterday's item entered with yesterday's date.
    expect(executeRecord({ ...item, at: -600 }, { day: -1, time: "14:10", by: "n", status: "実施" })!.offBy).toBeUndefined();
  });

  it("未実施 needs a reason; a bad time or a missing reason makes no record", () => {
    expect(executeRecord(item, { day: 0, time: "14:05", by: "n", status: "未実施" })).toBeNull();
    expect(executeRecord(item, { day: 0, time: "14:05", by: "n", status: "未実施", reason: "患者が拒否" })!.reason).toBe("患者が拒否");
    expect(executeRecord(item, { day: 0, time: "25:00", by: "n", status: "実施" })).toBeNull();
    expect(executeRecord(item, { day: 0, time: "", by: "n", status: "実施" })).toBeNull();
  });

  it("a 点滴 is recorded as its 開始 with the bag, like the worksheet", () => {
    const r = executeRecord({ ...item, drip: { volumeMl: 500, mlPerH: 100, minutes: 300 } as never }, { day: 0, time: "14:00", by: "n", status: "実施" })!;
    expect(r.drip).toEqual({ volumeMl: 500, mlPerH: 100, minutes: 300, startAt: 840 });
  });

  it("times: parse and print", () => {
    expect(parseHHMM("9:05")).toBe(545);
    expect(parseHHMM("23:59")).toBe(1439);
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("abc")).toBeNull();
    expect(timeOfAbs(840)).toBe("14:00");
    expect(timeOfAbs(1440 + 125)).toBe("02:05");
    expect(timeOfAbs(-60)).toBe("23:00");
  });
});

describe("今日の未指示受け（タブのバッジと「やること」の数）", () => {
  const row = (key: string, at: number, patientId = "p1"): TakeRow => ({ key, keys: [key], kind: "新規", at, timeKnown: true, patientId, room: "512", name: "佐倉 修", type: "注射", main: "x", detail: "", author: "山本", flags: {}, related: [], mustOne: [] });
  const entry = (id: string, startDay: number): OrderEntry => ({ kind: "order", id, day: -1, time: "17:00", author: "山本", status: "有効", order: { ...inj, start: { day: startDay, time: "14:00" } } });
  const people = [{ patient: { id: "p1" }, entries: [entry("today", 0), entry("yday", -1), entry("tomorrow", 1)] }];
  it("counts the untaken rows given today or starting today — what the 指示受け screen lists on 今日 — and not the rows of other days", () => {
    const rows = [row("today|新規", 600), row("yday|新規", -300), row("tomorrow|新規", -200), row("gone|新規", 630)];
    const taken: Record<string, string> = { "gone|新規": "11:00 看護師 佐藤" };
    const w = waitingToday(rows, people, (r) => r.keys.every((k) => !!taken[k]));
    // yday: given yesterday for an order that started yesterday → 「ほかの日に 1件」, not in the badge.
    expect(w.map((r) => r.key)).toEqual(["today|新規"]);
    // A change given yesterday for an order starting today counts (the screen shows it on 今日).
    expect(waitingToday([row("today|新規", -300)], people, () => false).length).toBe(1);
  });
  it("the band after taking or confirming names what was done, when and by whom, and stays about three seconds", () => {
    expect(doneBandText("take", "12:10", "看護師 佐藤")).toBe("受けました（12:10 看護師 佐藤）");
    expect(doneBandText("confirm", "12:12", "看護師 佐藤")).toBe("確認しました（12:12 看護師 佐藤）");
    expect(DONE_BAND_MS).toBe(3000);
  });
});
