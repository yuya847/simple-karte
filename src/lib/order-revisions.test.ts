import { describe, expect, it } from "vitest";
import { replacementBoundaries } from "./order-revisions";
import { currentEntries } from "./record";
import { orderInterval, doseTimes } from "./flowsheet";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";
const old: OrderEntry = { kind: "order", id: "old", day: -1, time: "09:00", author: "医師", status: "有効", order: { type: "injection", items: [{ drugCode: "INJ-NS100", amount: 100, unit: "mL" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 6 }, start: { day: -1, time: "09:00" } } };
const next: OrderEntry = { ...old, id: "next", day: 0, time: "12:00", order: { ...old.order, ...{ type: "injection" as const, replaces: "old", start: { day: 0, time: "12:00" } } } as OrderEntry["order"] };
describe("変更指示の境界", () => {
  it("保存済みの変更も変更時刻から旧指示の予定を止める", () => {
    const entries = currentEntries({ ...PATIENTS[0], history: [old, next] });
    const previous = entries[0] as OrderEntry;
    expect(orderInterval(previous, 1100).to).toBe(720);
    expect(doseTimes(previous, 1100, 0, 1440).every(t => t < 720)).toBe(true);
    expect(previous.stoppedTime).toBe("12:00");
  });
  it("同じ旧指示への2つの変更を拒む", () => {
    expect(() => replacementBoundaries([old, next, { ...next, id: "conflict" }])).toThrow("重なっています");
  });
  it("変更元のない変更を拒む", () => expect(() => replacementBoundaries([next])).toThrow("変更元"));
});

import { newProcedureDraft } from "./drafts";
import { replacementConflict } from "./order-revision-drafts";
import { prescriptionCell } from "./calendar";
it("確定時は同じ変更元への競合を止める", () => {
  const d = { ...newProcedureDraft("PROC-O2", "d1"), duplicate: { action: "replace" as const, orderId: "old" } };
  expect(replacementConflict([d])).toBeNull();
  expect(replacementConflict([d, { ...d, id: "d2" }])).toContain("重なっています");
  expect(replacementConflict([d], [old, next])).toContain("重なっています");
});
it("内服も変更時刻以降は旧版の夕薬が出ない", () => {
  const rx: OrderEntry = { ...old, order: { type: "prescription", category: "定期", drugCode: "ORAL-MGO330", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: -1, timing: "朝" } } };
  const revised: OrderEntry = { ...next, order: { ...rx.order, type: "prescription", replaces: "old", amount: 2, start: { day: 0, timing: "夕" } } as OrderEntry["order"] };
  const previous = currentEntries({ ...PATIENTS[0], history: [rx, revised] })[0] as OrderEntry;
  expect(prescriptionCell(previous, 0, 1300).slots.map(s => s.state)).toEqual(["done", null]);
});
