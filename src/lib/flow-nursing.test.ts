import { describe, expect, it } from "vitest";
import { jcsText, gcsText } from "./consciousness";
import { glucoseMark, observationOrder } from "./flow-observation";
import { recordProblems } from "./care-orders";
import { decodeWorkspace, encodeWorkspace } from "./workspace-codec";
import { ioLines, ioTotal, withIoUrine, type IoEntry } from "./io-balance";
import { glucosePoints } from "./flow-meds";
import { vitalLine } from "./vitals-text";
import { vitalsPasteText } from "./lab-paste";
import { insulinEntry } from "./flow-insulin";
import { defaultSliding } from "./insulin";
import { news2 } from "./news2";
import type { VitalSign } from "./types";

describe("経過表の看護入力", () => {
  it("JCS 0・付記と GCS の部分評価を保ち、NEWS2 に換算しない", () => {
    const v: VitalSign = { day: 0, time: "10:00", jcs: { score: "0" }, gcs: { e: 4, v: 5, m: 6 } };
    expect(jcsText(v)).toBe("0");
    expect(jcsText({ jcs: { score: "II-20", modifiers: ["R", "A"] } })).toBe("II-20（R/A）");
    expect(gcsText(v)).toBe("E4V5M6=15");
    expect(gcsText({ gcs: { e: 2 } })).toBe("E2V—M—");
    expect(news2(v)).toEqual(news2({}));
    expect(vitalLine(v, { y: 2026, m: 11, d: 6 })).toContain("JCS 0 GCS E4V5M6=15");
    expect(vitalsPasteText({ vitals: [v] }, { y: 2026, m: 11, d: 6 })).toContain("JCS 0 GCS E4V5M6=15");
  });
  it("表示の閾値は境界を含まず、人が変えられる", () => {
    expect([69, 70, 300, 301].map(v => glucoseMark(v))).toEqual(["L", "", "", "H"]);
    expect(glucoseMark(250, { low: 80, high: 200 })).toBe("H");
  });
  it("観察の形と時刻を workspace に保存し、不正な数値を受け付けない", () => {
    const o = observationOrder({ item: "腹囲", inputKind: "number", unit: "cm", schedule: { kind: "times", times: ["06:00"] }, patientId: "P1", by: "看護師", time: "10:00", id: "obs1" });
    const data = { careOrders: [o] };
    expect(decodeWorkspace(encodeWorkspace(data, { careOrders: [] }), { careOrders: [] })).toEqual(data);
    expect(recordProblems(o, { status: "実施", value: "不明", doneAt: "10:00" }, "10:00")).toContain("数値を入れてください");
    expect(recordProblems(o, { status: "実施", value: "82.5", doneAt: "10:00" }, "10:00")).toEqual([]);
    const glucoseOrder = { ...o, item: "血糖測定", unit: "mg/dL" };
    expect(glucosePoints([glucoseOrder], [{ key: "obs1|450", orderId: "obs1", patientId: "P1", at: 450, measuredAt: 460, status: "実施", value: "182", doneAt: "07:40", writtenAt: "10:00", by: "看護師" }], [])).toMatchObject([{ at: 460, value: 182 }]);
  });
  it("同じ水分出納記録から食事・便・尿を投影し、食事を水分量に数えない", () => {
    const base = { patientId: "P1", by: "看護師", recordedAt: "10:00" };
    const typed: IoEntry[] = [
      { ...base, id: "u", side: "OUT", kind: "尿", ml: 300, count: 1, catheter: true, at: 550 },
      { ...base, id: "s", side: "OUT", kind: "便", ml: 0, count: 2, bristol: 4, at: 560 },
      { ...base, id: "m", side: "IN", kind: "食事", ml: 0, meal: { slot: 0, staple: 8, side: 6 }, at: 570 },
      { ...base, id: "w", side: "IN", kind: "経口", ml: 200, at: 580 },
    ];
    const daily = withIoUrine([], typed);
    expect(daily).toEqual([{ day: 0, urineMl: 300, stools: 2, meals: [8, null, null], mealSides: [6, null, null] }]);
    const lines = ioLines({ patientId: "P1", entries: [], typed, records: {}, sessionStart: 0, nowAbs: 600, from: 0 });
    expect(lines).toHaveLength(4);
    const total = ioTotal(lines, { lo: 540, hi: 600 });
    expect([total.in, total.out, total.balance, total.inCount, total.outCount]).toEqual([200, 300, -100, 1, 1]);
    const voided = typed.map(e => ({ ...e, voided: { by: "看護師", at: "10:00", reason: "誤記" } }));
    expect(withIoUrine([], voided)).toEqual([]);
  });
  it("指示の固定量とスケールを初期値にし、人の修正と過去日の測定を保つ", () => {
    expect(insulinEntry({ at: 450 }, "", "", "07:30", 600).units).toBeUndefined();
    const item = { insulinUnits: 3, sliding: defaultSliding(), at: 450 };
    expect(insulinEntry(item, "220", "", "07:30", 600)).toMatchObject({ calculated: 5, units: 5, valid: true });
    expect(insulinEntry(item, "220", "4.5", "07:30", 600)).toMatchObject({ units: 4.5, valid: true });
    expect(insulinEntry(item, "", "4", "07:30", 600).valid).toBe(false);
    expect(insulinEntry({ insulinUnits: 2, at: -120 }, "180", "", "22:00", 600)).toMatchObject({ measuredAt: -120, valid: true });
    expect(insulinEntry(item, "220", "-1", "07:30", 600).valid).toBe(false);
    expect(insulinEntry(item, "220", "", "11:00", 600).valid).toBe(false);
  });
  it("インスリン実施の血糖を測定時刻で表示し、取消で消す", () => {
    const r = { key: "i|480", orderId: "i", patientId: "P1", at: 480, status: "実施" as const, doneAt: "08:10", by: "看護師", checked: { patient: true, label: true }, insulin: { units: 4, glucose: 182, measuredAt: 490 } };
    expect(glucosePoints([], [], [], [r])).toMatchObject([{ at: 490, value: 182 }]);
    expect(glucosePoints([], [], [], [{ ...r, cancellation: { by: "看護師", at: "08:20", reason: "誤記" } }])).toEqual([]);
  });
});
