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
    // After midnight (the clock runs on past 1440) a dose at 24:30 counts for the new day.
    expect(prnToday("p", { k: { ...r, at: 1470 } }, 1, 1500)).toEqual({ given: 1, over: true });
    expect(prnToday("p", { k: { ...r, at: 600 } }, 1, 1500)).toEqual({ given: 0, over: false });
  });
});

describe("指示簿の頓用", () => {
  it("counts today's doses and the interval since the last one", async () => {
    const { standingPrnState } = await import("./mar");
    const rec = (at: number) => ({ key: `s|${at}`, orderId: "s", patientId: "p", at, status: "実施" as const, doneAt: "", by: "", checked: { patient: true, label: null } });
    const rule = { intervalH: 6, maxPerDay: 3 };
    expect(standingPrnState("s", {}, rule, 600)).toMatchObject({ given: 0, over: false, wait: undefined });
    const one = { a: rec(480) }; // 08:00
    expect(standingPrnState("s", one, rule, 600).wait).toContain("前回 08:00 に使っています。6時間あける");
    expect(standingPrnState("s", one, rule, 480 + 360).wait).toBeUndefined();
    expect(standingPrnState("s", { a: rec(100), b: rec(500), c: rec(900) }, rule, 1300)).toMatchObject({ given: 3, over: true });
  });
});

describe("同じ薬の頓用は合わせて数える", () => {
  it("uses the other rule's dose for the interval and the insert's daily maximum", async () => {
    const { standingPrnState } = await import("./mar");
    const rec = (id: string, at: number) => ({ key: `${id}|${at}`, orderId: id, patientId: "p", at, status: "実施" as const, doneAt: "", by: "", checked: { patient: true, label: null } });
    const rule = { intervalH: 6, maxPerDay: 3 };
    const same = { ids: ["pain"], doseMg: 500, maxDailyMg: { mg: 1500, source: "試験" } };
    // 発熱時 never used, but 疼痛時 (same drug) at 08:00: wait.
    expect(standingPrnState("fever", { a: rec("pain", 480) }, rule, 600, same).wait).toContain("同じ薬をほかの頓用で 08:00");
    // Three doses of the same drug today (1,500mg): one more would pass 1,500mg.
    const st = standingPrnState("fever", { a: rec("pain", 0), b: rec("pain", 400), c: rec("fever", 800) }, rule, 1300, same);
    expect(st).toMatchObject({ over: true, sameToday: 3 });
    expect(st.limit).toContain("2000mg");
  });
});
