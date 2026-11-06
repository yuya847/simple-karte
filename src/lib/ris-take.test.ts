import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { demoRisOrders, initialRisDesk, putWork, risRows, type RisDesk } from "./ris";
import {
  callHow,
  confirmPending,
  isTakenRis,
  kindOf,
  mustTakeOne,
  needsRisConfirm,
  nextStep,
  patientMarks,
  portableRound,
  risConfirmItems,
  risStamps,
  risTakeFields,
  risTakeLate,
  risTakeOnDay,
  risTakeTitle,
  risTodo,
  worklist,
  worklistLate,
} from "./ris-take";
import type { OrderEntry } from "./types";

const NOW = 10 * 60; // 10:00
const TODAY = { y: 2026, m: 11, d: 4 };
const orders = demoRisOrders(NOW);
const people = PATIENTS.map((p) => ({ patient: p, room: p.room, entries: (orders[p.id] ?? []) as OrderEntry[] }));
const desk = initialRisDesk(NOW);
const rows = risRows(people, desk);
const rowOf = (d: RisDesk, id: string) => risRows(people, d).find((r) => r.orderId === id)!;
const mori = PATIENTS.find((p) => p.id === "90010260")!; // 造影 CT today
const sakura = PATIENTS.find((p) => p.id === "90010231")!; // MRI tomorrow, ヨード造影剤のアレルギー

describe("放射線部の指示受け：未受付の一覧と種類", () => {
  it("lists the requests nobody took, by the day they were given or booked", () => {
    const untaken = rows.filter((r) => !isTakenRis(r));
    expect(untaken.map((r) => r.orderId).sort()).toEqual(["o-ris-demo2", "o-ris-demo3", "o-ris-demo4"]);
    expect(isTakenRis(rowOf(desk, "o-ris-demo1"))).toBe(true); // 北村さんのポータブル was taken this morning
    const mri = rowOf(desk, "o-ris-demo4");
    expect(risTakeOnDay(mri, 0)).toBe(true); // ordered today
    expect(risTakeOnDay(mri, 1)).toBe(true); // booked tomorrow
    expect(risTakeOnDay(mri, -1)).toBe(false);
  });
  it("ticks the kinds X線・CT・MRI・エコー・ポータブル", () => {
    expect(kindOf("X線")).toBe("X線");
    expect(kindOf("ポータブルX線")).toBe("ポータブル");
    expect(kindOf("CT")).toBe("CT");
    expect(kindOf("MRI")).toBe("MRI");
    expect(kindOf("腹部エコー")).toBe("エコー");
  });
  it("takes 至急・造影・MRI one at a time, the rest in bulk (架空の病院の取り決め)", () => {
    expect(mustTakeOne(rowOf(desk, "o-ris-demo3"))).toEqual(["至急"]);
    expect(mustTakeOne(rowOf(desk, "o-ris-demo2"))).toEqual([expect.stringContaining("造影")]);
    expect(mustTakeOne(rowOf(desk, "o-ris-demo4"))).toEqual([expect.stringContaining("MRI")]);
    expect(mustTakeOne(rowOf(desk, "o-ris-demo1"))).toEqual([]);
  });
  it("marks a request late: 至急 after 15 minutes, others after 60 or when the booked time passed", () => {
    const stat = rowOf(desk, "o-ris-demo3"); // ordered 09:40, 至急
    expect(risTakeLate(stat, 9 * 60 + 50)).toBe(false);
    expect(risTakeLate(stat, 9 * 60 + 56)).toBe(true);
    const ct = rowOf(desk, "o-ris-demo2"); // ordered 09:15, booked 15:00
    expect(risTakeLate(ct, 10 * 60)).toBe(false);
    expect(risTakeLate(ct, 10 * 60 + 20)).toBe(true); // 65 minutes since the order
    const taken = rowOf(putWork(desk, ct, (w) => ({ ...w, arrived: { day: 0, time: "10:00", by: "技師" } })), "o-ris-demo2");
    expect(risTakeLate(taken, 20 * 60)).toBe(false);
  });
});

describe("放射線部の指示受け：帯・見出し・本文・3組の欄", () => {
  it("puts the patient's infection, contrast allergy, pregnancy question and metal in the band", () => {
    const sakuraRows = rows.filter((r) => r.patientId === sakura.id);
    const marks = patientMarks(sakura, sakuraRows);
    expect(marks.map((m) => m.text)).toEqual(expect.arrayContaining(["感染症：MRSA（血液）", "アレルギー：ヨード造影剤（蕁麻疹）", "体内金属（MRI）なし（確認済み）"]));
    // A woman of 12–55 with an X線 or CT: the pregnancy question, answered or not.
    const young = { sex: "女" as const, age: 30, allergies: [], infections: [], pregnancy: null };
    const ct = rowOf(desk, "o-ris-demo2");
    expect(patientMarks(young, [ct]).map((m) => m.text)).toContain("妊娠 なし（確認済み）");
    expect(patientMarks(young, [{ order: { ...ct.order, answers: undefined } }]).map((m) => m.text)).toContain("妊娠の可能性を確かめる");
    expect(patientMarks({ ...young, age: 70 }, [ct]).map((m) => m.text)).not.toContain("妊娠の可能性を確かめる");
  });
  it("writes the heading and the 項目名：値 lines from the order", () => {
    const ct = rowOf(desk, "o-ris-demo2");
    expect(risTakeTitle(ct)).toBe("CT　腹部・骨盤　単純＋造影");
    const f = Object.fromEntries(risTakeFields(ct, TODAY).map((x) => [x.label, x.value]));
    expect(f["部位"]).toBe("腹部・骨盤");
    expect(f["造影"]).toBe("単純＋造影");
    expect(f["予定"]).toBe("11/4（水） 15:00 予約");
    expect(f["搬送"]).toBe("車椅子");
    expect(f["同意"]).toBe("同意書の記録なし");
    expect(f["妊娠"]).toBe("なし（確認済み）");
    expect(f["依頼目的"]).toContain("腎膿瘍");
    expect(Object.fromEntries(risTakeFields(ct, TODAY, "同意（11/3（火） 16:00）").map((x) => [x.label, x.value]))["同意"]).toBe("同意（11/3（火） 16:00）");
    const xr = rowOf(desk, "o-ris-demo3");
    expect(Object.fromEntries(risTakeFields(xr, TODAY).map((x) => [x.label, x.value]))).toMatchObject({ 部位: "胸部", "体位・方向": "立位正面（PA）", 予定: `至急（${xr.orderedAt.time} 指示）`, 読影: "当日中" });
  });
  it("fills 指示日時／指示医, 予定日時／撮影室・装置, 指示受け日時／受けた技師", () => {
    const ct = rowOf(desk, "o-ris-demo2");
    expect(risStamps(ct, TODAY)).toEqual({ start: { at: "11/4（水） 09:15", by: "山本（専攻医）" }, done: { at: "11/4（水） 15:00", by: "" }, take: { at: "", by: "" } });
    const taken = rowOf(putWork(desk, ct, (w) => ({ ...w, arrived: { day: 0, time: "10:00", by: "放射線技師 松本" }, room: "CT1", slot: { day: 0, time: "15:30" } })), "o-ris-demo2");
    expect(risStamps(taken, TODAY)).toEqual({ start: { at: "11/4（水） 09:15", by: "山本（専攻医）" }, done: { at: "11/4（水） 15:30", by: "CT室（SK_CT1）" }, take: { at: "10:00", by: "放射線技師 松本" } });
    expect(risStamps(rowOf(desk, "o-ris-demo3"), TODAY).done.at).toBe("至急（09:40 指示）");
  });
});

describe("放射線部の指示確認（造影・MRI）", () => {
  const ct = rowOf(desk, "o-ris-demo2");
  const moriEntries = orders[mori.id];
  it("is asked for contrast and MRI studies after taking, not for a plain X線", () => {
    expect(needsRisConfirm(ct.order)).toBe(true);
    expect(needsRisConfirm(rowOf(desk, "o-ris-demo4").order)).toBe(true);
    expect(needsRisConfirm(rowOf(desk, "o-ris-demo3").order)).toBe(false);
    expect(confirmPending(ct)).toBe(false); // not taken yet
    const taken = rowOf(putWork(desk, ct, (w) => ({ ...w, arrived: { day: 0, time: "10:00", by: "技師" } })), "o-ris-demo2");
    expect(confirmPending(taken)).toBe(true);
    const confirmed = rowOf(putWork(desk, ct, (w) => ({ ...w, arrived: { day: 0, time: "10:00", by: "技師" }, confirmed: { day: 0, time: "10:02", by: "技師", items: [] } })), "o-ris-demo2");
    expect(confirmPending(confirmed)).toBe(false);
  });
  it("lists 同意・腎機能（Cre/eGFR）・ヨードのアレルギー・メトホルミン for a contrast CT, from the record", () => {
    const items = risConfirmItems(ct, mori, moriEntries, undefined, TODAY);
    const by = Object.fromEntries(items.map((i) => [i.label, i]));
    expect(by["同意"]).toMatchObject({ tone: "ask" });
    expect(by["腎機能"].value).toMatch(/^Cre [\d.]+ mg\/dL（.*）・eGFR [\d.]+/);
    expect(by["ヨードのアレルギー"]).toMatchObject({ value: "記録なし", tone: "ok" });
    expect(by["メトホルミン（ビグアナイド系）"]).toMatchObject({ value: "内服なし", tone: "ok" });
    // With the consent form signed, and a running metformin without the doctor's 休薬 ack.
    const consents = [{ orderId: ct.orderId, status: "同意" as const, explainedAt: { day: -1, time: "16:00" } }];
    const met: OrderEntry = { kind: "order", id: "rx-met", day: -2, time: "10:00", author: "山本（専攻医）", status: "有効", order: { type: "prescription", drugCode: "ORAL-MET250", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: -2 }, category: "定期" } as never };
    const items2 = Object.fromEntries(risConfirmItems(ct, mori, [...moriEntries, met], consents, TODAY).map((i) => [i.label, i]));
    expect(items2["同意"]).toMatchObject({ value: "同意（11/3（火） 16:00）", tone: "ok" });
    expect(items2["メトホルミン（ビグアナイド系）"]).toMatchObject({ tone: "ask" });
    expect(items2["メトホルミン（ビグアナイド系）"].value).toContain("メトホルミン");
    expect(items2["メトホルミン（ビグアナイド系）"].value).toContain("休薬の指示を医師に確かめる");
  });
  it("flags the iodine allergy and the low eGFR as things to weigh", () => {
    const items = Object.fromEntries(risConfirmItems({ orderId: "x", order: ct.order }, { ...sakura, labs: [{ day: -1, time: "07:00", values: { Cre: 3.2 } }] }, [], undefined, TODAY).map((i) => [i.label, i]));
    expect(items["ヨードのアレルギー"]).toMatchObject({ value: "ヨード造影剤（蕁麻疹）", tone: "warn" });
    expect(items["腎機能"].tone).toBe("warn");
    expect(items["腎機能"].value).toContain("eGFR 30未満");
  });
  it("lists 体内金属・ペースメーカー・閉所 for an MRI", () => {
    const mri = rowOf(desk, "o-ris-demo4");
    const items = Object.fromEntries(risConfirmItems(mri, sakura, orders[sakura.id], undefined, TODAY).map((i) => [i.label, i]));
    expect(items["体内金属"]).toMatchObject({ value: "なし（確認済み）", tone: "ok" });
    expect(items["ペースメーカー・人工内耳"].tone).toBe("ask");
    expect(items["閉所"].tone).toBe("ask");
    expect(items["同意"]).toBeUndefined(); // 単純 MRI: no contrast items
    const withPm = Object.fromEntries(risConfirmItems(mri, { ...sakura, cautions: ["ペースメーカー植込み"] }, [], undefined, TODAY).map((i) => [i.label, i]));
    expect(withPm["ペースメーカー・人工内耳"]).toMatchObject({ value: "ペースメーカー植込み", tone: "warn" });
  });
});

describe("当日の予定（ワークリスト）とポータブル回り", () => {
  it("puts the taken studies of the day in their room's lane in time order; the rest apart", () => {
    const ct = rowOf(desk, "o-ris-demo2");
    const xr = rowOf(desk, "o-ris-demo3");
    let d = putWork(desk, ct, (w) => ({ ...w, arrived: { day: 0, time: "10:00", by: "技師" }, room: "CT1", slot: { day: 0, time: "15:00" } }));
    d = putWork(d, xr, (w) => ({ ...w, arrived: { day: 0, time: "10:01", by: "技師" } }));
    const { lanes, unassigned } = worklist(risRows(people, d), 0);
    expect(lanes.map((l) => l.room.key)).toEqual(["XR1", "PORT", "CT1", "MR1"]);
    expect(lanes.find((l) => l.room.key === "CT1")!.rows.map((r) => r.orderId)).toEqual(["o-ris-demo2"]);
    expect(lanes.find((l) => l.room.key === "PORT")!.rows.map((r) => r.orderId)).toEqual(["o-ris-demo1"]);
    expect(unassigned.map((r) => r.orderId)).toEqual(["o-ris-demo3"]);
    expect(worklist(risRows(people, d), 1).lanes.every((l) => l.rows.length === 0)).toBe(true); // the MRI tomorrow is not taken
  });
  it("walks 呼出 → 来室 → 撮影開始 → 撮影終了 → 画像送信; a portable starts at the room", () => {
    const ct = rowOf(desk, "o-ris-demo2");
    const w0 = { orderId: ct.orderId, patientId: ct.patientId, label: ct.label, arrived: { day: 0, time: "10:00", by: "技師" } };
    expect(nextStep({ order: ct.order, work: w0 })).toBe("呼出");
    expect(nextStep({ order: ct.order, work: { ...w0, called: { day: 0, time: "14:40", by: "技師", how: "病棟へ搬送依頼" } } })).toBe("来室");
    expect(nextStep({ order: ct.order, work: { ...w0, inRoom: { day: 0, time: "14:55", by: "技師" } } })).toBe("撮影開始");
    expect(nextStep({ order: ct.order, work: { ...w0, started: { day: 0, time: "15:00", by: "技師", via: "手入力" } } })).toBe("撮影終了");
    expect(nextStep({ order: ct.order, work: { ...w0, done: { day: 0, time: "15:10", by: "技師", via: "手入力" } } })).toBe("画像送信");
    expect(nextStep(rowOf(desk, "o-ris-demo1"))).toBe("済");
    expect(nextStep({ order: rowOf(desk, "o-ris-demo1").order, work: w0 })).toBe("来室");
    expect(callHow("512")).toBe("病棟へ搬送依頼");
    expect(callHow("外来")).toBe("待合の表示");
  });
  it("marks a study late 15 minutes after its time when not started", () => {
    const ct = rowOf(putWork(desk, rowOf(desk, "o-ris-demo2"), (w) => ({ ...w, arrived: { day: 0, time: "10:00", by: "技師" }, room: "CT1", slot: { day: 0, time: "15:00" } })), "o-ris-demo2");
    expect(worklistLate(ct, 15 * 60 + 10)).toBe(false);
    expect(worklistLate(ct, 15 * 60 + 15)).toBe(true);
    expect(worklistLate({ ...ct, work: { ...ct.work!, started: { day: 0, time: "15:20", by: "技師", via: "手入力" } } }, 15 * 60 + 30)).toBe(false);
  });
  it("orders the portable round by room number", () => {
    const base = rowOf(desk, "o-ris-demo1");
    const mk = (id: string, room: string, taken: boolean) => ({ ...base, orderId: id, room, work: taken ? { orderId: id, patientId: base.patientId, label: base.label, arrived: { day: 0, time: "08:00", by: "技師" } } : undefined });
    const round = portableRound([mk("c", "512", true), mk("a", "503A", true), mk("b", "505", false), mk("d", "503B", true), base]);
    expect(round.map((r) => r.orderId)).toEqual(["a", "d", "c"]); // 505 not taken, the finished one left out
  });
  it("counts what waits for the technologist: untaken, unconfirmed, today's not done", () => {
    expect(risTodo(rows)).toEqual({ untaken: 3, unconfirmed: 0, notDoneToday: 2 }); // today: the 至急 X線 and the CT (the portable is done, the MRI is tomorrow)
    const d = putWork(desk, rowOf(desk, "o-ris-demo2"), (w) => ({ ...w, arrived: { day: 0, time: "10:00", by: "技師" } }));
    expect(risTodo(risRows(people, d))).toEqual({ untaken: 2, unconfirmed: 1, notDoneToday: 2 });
  });
});
