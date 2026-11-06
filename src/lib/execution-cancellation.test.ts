import { describe, expect, it } from "vitest";
import { cancelAdministration, cancelExecution, marKey, marState, prnToday, standingPrnState, type AdminRecord } from "./mar";
import { actionsFor, occurrenceStates } from "./order-execute";
import { examRecordOf, type RisWork } from "./ris";
import { hdFee, HD_PATIENTS } from "./dialysis";
import { can } from "./roles";

const record: AdminRecord = { key: marKey("o", 480), orderId: "o", patientId: "p", at: 480, status: "実施", by: "看護師 佐藤", doneAt: "08:00", checked: { patient: true, label: true } };
const at = "2026-11-04T01:00:00.000Z";
describe("実施の取り消し", () => {
  it("過去の回も未実施で保持し、頓用の回数・間隔から外して再記録できる", () => {
    const cancelled = cancelAdministration(record, "医師", at, " 誤って押した ");
    const records = { [record.key]: cancelled };
    expect(marState({ orderId: "o", at: 480 }, records, 600, 700)).toBe("未実施");
    expect(cancelled.cancellation).toEqual({ by: "医師", at, reason: "誤って押した" });
    expect(record.status).toBe("実施");
    expect(prnToday("o", records, 1).given).toBe(0);
    expect(standingPrnState("o", records, { intervalH: 6, maxPerDay: 1 }, 500)).toMatchObject({ given: 0, over: false, wait: undefined });
    const occurrence = occurrenceStates([{ orderId: "o", patientId: "p", at: 480, kind: "注射", main: "薬", detail: "" }], records, 600, 700)[0];
    expect(actionsFor(occurrence).kind).toBe("record");
  });
  it("理由なしでも戻せ、点滴の終了も元の記録に残る", () => {
    const original = { ...record, end: { at: 600, recordedAt: "10:00", by: "看護師", full: true, leftMl: 0, givenMl: 100 } };
    expect(cancelAdministration(original, "医師", at).cancellation?.reason).toBe("");
    expect(original.end.givenMl).toBe(100);
  });
  it("部門の有効な値だけを戻し、取り消しを追記する（入力を変更しない）", () => {
    const original: RisWork = { orderId: "o", patientId: "p", label: "CT", done: { day: 0, time: "08:00", by: "技師", via: "手入力" } };
    const next = cancelExecution(original, ["done"], "技師", at, "中止になった");
    expect(examRecordOf(next)).toEqual({});
    expect(next.cancellations[0]).toMatchObject({ by: "技師", at, reason: "中止になった", record: { done: original.done } });
    const again = cancelExecution({ ...next, done: original.done }, ["done"], "技師2", at);
    expect(again.cancellations).toHaveLength(2);
    expect(original.done).toBeDefined();
    expect(next.orderId).toBe("o");
  });
  it("透析の実施を戻すと算定を数えない", () => {
    const s = { start: "08:00", end: "12:00", drugsGiven: [] };
    expect(hdFee(HD_PATIENTS[0], s, false).total).toBeGreaterThan(0);
    expect(hdFee(HD_PATIENTS[0], cancelExecution(s, ["start", "end"], "看護師", at), false).total).toBe(0);
  });
  it("元の実施と同じ職種の権限を使う", () => {
    expect(can("看護師", "mar")).toBe(true);
    expect(can("医師", "mar")).toBe(true);
    expect(can("薬剤師", "mar")).toBe(false);
    expect(can("診療放射線技師", "ris.exam")).toBe(true);
    expect(can("看護師", "ris.exam")).toBe(false);
  });
});

import { cancelReception, EMPTY_DESK } from "./lab-desk";
it("検体の受付を戻すとき、別の検体を保ち、元の受付を履歴に残す", () => {
  const reception = { code: "a", orderId: "o", patientId: "p", at: 480, by: "技師", day: 0, time: "08:00", collected: true };
  const desk = { ...EMPTY_DESK, received: { a: reception, b: { ...reception, code: "b", orderId: "o2" } } };
  const next = cancelReception(desk, "a", "p", "技師2", at, "誤って押した");
  expect(next.received.a).toBeUndefined();
  expect(next.received.b).toEqual(desk.received.b);
  expect(desk.received.a).toEqual(reception);
  expect(next.cancellations?.[0].record.reception).toEqual(reception);
  expect(cancelReception(next, "a", "p", "技師2", at)).toBe(next);
});

import { transfusionIoIds, type IoEntry } from "./io-balance";
it("輸血の取り消しに対応する水分出納だけを選ぶ", () => {
  const entry: IoEntry = { id: "a", patientId: "p", side: "IN", kind: "輸血", ml: 100, at: 600, by: "看護師", recordedAt: "10:00", note: "製造番号 LOT-A" };
  expect(transfusionIoIds([entry, { ...entry, id: "b", patientId: "q" }, { ...entry, id: "c", note: "製造番号 LOT-B" }, { ...entry, id: "d", voided: { by: "看護師", at, reason: "" } }], "p", "LOT-A")).toEqual(["a"]);
});
