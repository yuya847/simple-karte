import { describe, expect, it } from "vitest";
import { checkScan, labelFor, marKey, marState, overdue, prnToday, type AdminRecord } from "./mar";

const item = { orderId: "ord-abc123", patientId: "90010231", kind: "注射" as const, at: 600, name: "佐倉 修" };

describe("与薬の照合（患者・薬・時刻）", () => {
  it("right wristband and label at the right time → ok", () => {
    const r = checkScan(item, "90010231", labelFor(item.orderId, 600), 610);
    expect(r).toMatchObject({ patient: "ok", label: "ok", ok: true });
    expect(r.messages).toEqual([]);
  });
  it("another patient's wristband → stop", () => {
    const r = checkScan(item, "90010244", labelFor(item.orderId, 600), 610);
    expect(r.ok).toBe(false);
    expect(r.messages[0]).toContain("佐倉 修さんではありません");
  });
  it("the label of another dose of the same order → says which one", () => {
    const r = checkScan(item, "90010231", labelFor(item.orderId, 1320), 610);
    expect(r.label).toBe("mismatch");
    expect(r.messages[0]).toContain("同じオーダの別の回");
  });
  it("more than 60 minutes late → a note, still recordable", () => {
    const r = checkScan(item, "90010231", labelFor(item.orderId, 600), 700);
    expect(r).toMatchObject({ ok: true, offBy: 100 });
  });
  it("処置 needs only the wristband", () => {
    expect(checkScan({ ...item, kind: "処置" }, "90010231", "", 600)).toMatchObject({ label: "not-needed", ok: true });
  });
});

describe("実施の状態", () => {
  const rec: AdminRecord = { key: marKey(item.orderId, 600), orderId: item.orderId, patientId: item.patientId, at: 600, status: "実施", doneAt: "10:05", by: "x", checked: { patient: true, label: true } };
  it("before the session → 記録済み; due → 未入力; recorded → 実施; ahead → 予定", () => {
    expect(marState(item, {}, 700, 800)).toBe("記録済み");
    expect(marState(item, {}, 500, 650)).toBe("未入力");
    expect(marState(item, { [rec.key]: rec }, 500, 650)).toBe("実施");
    expect(marState(item, {}, 500, 550)).toBe("予定");
  });
  it("overdue only after the window", () => {
    expect(overdue(item, {}, 500, 650)).toBe(false);
    expect(overdue(item, {}, 500, 661)).toBe(true);
  });
  it("頓用: count today against the day's limit", () => {
    const r = { ...rec, key: "p|300", orderId: "p", at: 300 };
    expect(prnToday("p", { [r.key]: r }, 1)).toEqual({ given: 1, over: true });
    expect(prnToday("p", {}, 2)).toEqual({ given: 0, over: false });
  });
});
