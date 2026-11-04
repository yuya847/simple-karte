import { describe, expect, it } from "vitest";
import type { AdminRecord } from "./mar";
import { marKey } from "./mar";
import { PATIENTS } from "./patients";
import type { Order, OrderEntry } from "./types";
import { billingGaps, lateText, undoneRows } from "./undone";

const p = { ...PATIENTS[0], history: [] };
const entry = (id: string, order: Order): OrderEntry => ({ kind: "order", id, day: -1, time: "09:00", author: "山本（専攻医）", status: "有効", order });
const rec = (orderId: string, at: number, status: AdminRecord["status"], over: Partial<AdminRecord> = {}): AdminRecord => ({ key: marKey(orderId, at), orderId, patientId: p.id, at, status, doneAt: "10:00", by: "看護師 佐藤", checked: { patient: true, label: null }, ...over });
const h = (x: number) => x * 60;

const q12 = entry("q12", { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 12 }, start: { day: -1, time: "08:00" } });
const suction = entry("suc", { type: "procedure", code: "PROC-SUCTION", schedule: { kind: "prn" }, start: { day: -1, time: "09:00" } });
const suctionDone = entry("suc2", { type: "procedure", code: "PROC-SUCTION", schedule: { kind: "prn" }, start: { day: -1, time: "09:00" }, done: [{ day: 0, time: "09:30" }] });
const wound = entry("wound", { type: "procedure", code: "PROC-WOUND", site: "右下腿", area: "lt100", schedule: { kind: "per_day", count: 1 }, start: { day: -1, time: "09:00" } });
const people = (...entries: OrderEntry[]) => [{ patient: p, room: "503A", entries }];

describe("未実施の一覧", () => {
  it("lists a timed item past the ward's window with no record, with how late it is", () => {
    const rows = undoneRows(people(q12), {}, h(7), h(10));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orderId: "q12", kind: "注射", at: h(8), lateMin: 120, room: "503A" });
    expect(lateText(120)).toBe("2時間");
    expect(lateText(75)).toBe("1時間15分");
  });

  it("leaves out an item that is recorded (実施 or 未実施), still within the window, or before the session", () => {
    expect(undoneRows(people(q12), { [marKey("q12", h(8))]: rec("q12", h(8), "実施") }, h(7), h(10))).toEqual([]);
    expect(undoneRows(people(q12), { [marKey("q12", h(8))]: rec("q12", h(8), "未実施", { reason: "患者が拒否" }) }, h(7), h(10))).toEqual([]);
    expect(undoneRows(people(q12), {}, h(7), h(8) + 30)).toEqual([]);
    expect(undoneRows(people(q12), {}, h(9), h(10))).toEqual([]);
  });

  it("finds an as-needed procedure done on the ward that the billing calculation does not count", () => {
    const r = rec("suc", h(10), "実施");
    const gaps = billingGaps(people(suction), { [r.key]: r }, h(11));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ kind: "実施したが算定に入らない", main: "喀痰吸引", by: "看護師 佐藤" });
    expect(gaps[0].why).toContain("必要時の処置は、指示に残した実施の時刻から算定を数えます");
  });

  it("does not list a done time the order's record already has", () => {
    const r = rec("suc2", h(9) + 30, "実施");
    expect(billingGaps(people(suctionDone), { [r.key]: r }, h(11))).toEqual([]);
  });

  it("finds a scheduled procedure recorded 未実施 that the calculation still counts", () => {
    const r = rec("wound", h(10), "未実施", { reason: "患者が不在" });
    const gaps = billingGaps(people(wound), { [r.key]: r }, h(11));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ kind: "未実施なのに算定に入る", at: h(10) });
    expect(gaps[0].why).toContain("未実施の理由：患者が不在");
    // Done as scheduled: nothing to check.
    const ok = rec("wound", h(10), "実施");
    expect(billingGaps(people(wound), { [ok.key]: ok }, h(11))).toEqual([]);
  });

  it("does not look at procedures the calculation does not bill per time (酸素・カテーテル・依頼…)", () => {
    const o2 = entry("o2", { type: "procedure", code: "PROC-O2", o2: { device: "鼻カニュラ", lpm: 1 }, schedule: { kind: "continuous" }, start: { day: -1, time: "09:00" } });
    const r = rec("o2", h(10), "実施");
    expect(billingGaps(people(o2), { [r.key]: r }, h(11))).toEqual([]);
  });
});
