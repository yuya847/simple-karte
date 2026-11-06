import { describe, expect, it } from "vitest";
import { checkDraft, orderEndDay, toOrder, type CheckContext, type ExtendDraft, type StopDraft } from "./drafts";
import { injectionCell } from "./calendar";
import { currentEntries } from "./record";
import { PATIENTS } from "./patients";
import type { InjectionOrder, OrderEntry } from "./types";

const order: OrderEntry = {
  kind: "order",
  id: "o1",
  day: -2,
  time: "10:00",
  author: "山本（専攻医）",
  status: "有効",
  order: { type: "injection", items: [{ drugCode: "INJ-CEZ1", amount: 2, unit: "g" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 8 }, start: { day: -2 }, days: 5 } as InjectionOrder,
};
const ctx = (drafts: CheckContext["drafts"] = []): CheckContext =>
  ({ activeOrders: [order], labOrders: [], drafts, nowTime: "09:00", fmtDay: (d: number) => `D${d}`, describe: () => "CEZ 2g 8時間ごと", allergies: [], consents: [], patientFacts: null }) as unknown as CheckContext;
const ext = (n: number): ExtendDraft => ({ id: "x", origin: "manual", sourceText: "", comment: null, kind: "extend", targetOrderId: "o1", addDays: n });

describe("延長", () => {
  it("knows the last day of an order with 日数", () => {
    expect(orderEndDay(order.order)).toBe(2);
    expect(orderEndDay({ ...order.order, days: undefined } as InjectionOrder)).toBeNull();
  });

  it("shows the new end and confirms the new 日数", () => {
    const issues = checkDraft(ext(3), ctx());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: "info", formula: "5日間（〜D2） → 8日間（〜D5）" });
    expect(toOrder(ext(3), ctx()).extend).toEqual({ orderId: "o1", days: 8 });
  });

  it("will not extend an order being stopped", () => {
    const stop: StopDraft = { id: "s", origin: "manual", sourceText: "", comment: null, kind: "stop", drugCode: "INJ-CEZ1", said: "CEZ", targetOrderId: "o1" };
    expect(checkDraft(ext(3), ctx([stop]))[0].key).toBe("extend-stop");
  });

  it("the record shows the extended order", () => {
    const p = { ...PATIENTS[0], history: [order] };
    const after = currentEntries(p, { added: [], stopped: [], extended: { o1: 8 } });
    expect((after[0] as OrderEntry).order).toMatchObject({ days: 8 });
  });
});

it("終了日時が明記された点滴も延長し、追加の日に実線の投与予定が出る", () => {
  const original = { ...order, order: { ...order.order, end: { day: 2, time: "23:59" } } } as OrderEntry;
  const p = { ...PATIENTS[0], history: [original] };
  const after = currentEntries(p, { added: [], stopped: [], extended: { o1: 8 } })[0] as OrderEntry;
  expect(after.order).toMatchObject({ days: 8, end: { day: 5, time: "23:59" } });
  expect(injectionCell(after, 4, 0).doses.length).toBeGreaterThan(0);
  expect(original.order).toMatchObject({ days: 5, end: { day: 2, time: "23:59" } });
});

it("中止日と中止時刻を同じ下書きで保持し、それぞれ検証する", () => {
  const stop: StopDraft = { id: "s", origin: "manual", sourceText: "", comment: null, kind: "stop", drugCode: "INJ-CEZ1", said: "CEZ", targetOrderId: "o1", effectiveDay: 1, stopTime: "16:30" };
  expect(checkDraft(stop, ctx()).some(i => i.level === "stop")).toBe(false);
  expect(checkDraft({ ...stop, effectiveDay: 1.5 }, ctx())[0].key).toBe("stop-day");
  expect(checkDraft({ ...stop, stopTime: "25:00" }, ctx())[0].key).toBe("stop-time");
  const p = { ...PATIENTS[0], history: [order] };
  const after = currentEntries(p, { added: [], stopped: ["o1"], stopDays: { o1: 0 }, stopTimes: { o1: stop.stopTime! } });
  expect(after[0]).toMatchObject({ stoppedOn: 0, stoppedTime: "16:30" });
  const future = currentEntries(p, { added: [], stopped: ["o1"], stopDays: { o1: stop.effectiveDay! }, stopTimes: { o1: "09:00" } });
  expect(future[0]).toMatchObject({ stoppedOn: 1, stoppedTime: "00:00" });
});
