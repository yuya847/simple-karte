import { expect, it } from "vitest";
import { injectionRateDraft, stopTimesOf } from "./injection-change";
import { currentEntries } from "./record";
import { toOrder, type CheckContext, type StopDraft } from "./drafts";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";
const entry: OrderEntry = { kind: "order", id: "old", day: -1, time: "09:00", author: "医師", status: "有効", order: { type: "injection", items: [{ drugCode: "INJ-NS500", amount: 500, unit: "mL" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, rateMlPerH: 50, start: { day: -1, time: "09:00" }, days: 4 } };
it("速度変更は新しい版の下書きで、確定後は変更時刻で前の版を止める", () => {
  const before = JSON.stringify(entry);
  const d = injectionRateDraft(entry, { time: "14:30", rate: 25 }, "draft");
  const ctx = { nowTime: "11:00", activeOrders: [entry], drafts: [d] } as unknown as CheckContext;
  const result = toOrder(d, ctx);
  expect(result.order).toMatchObject({ rateMlPerH: 25, replaces: "old", start: { day: 0, time: "14:30" }, days: 3 });
  const patient = { ...PATIENTS[0], history: [entry] };
  const updated = currentEntries(patient, { added: [{ ...entry, id: "new", day: 0, order: result.order! }], stopped: result.stopIds, stopTimes: { old: "11:00" } });
  expect(updated[0]).toMatchObject({ stoppedOn: 0, stoppedTime: "14:30" });
  expect(JSON.stringify(entry)).toBe(before);
  expect(() => injectionRateDraft(entry, { time: "25:00", rate: 25 }, "x")).toThrow();
  expect(() => injectionRateDraft(entry, { time: "14:00", rate: 0 }, "x")).toThrow();
});
it("中止の下書きの指定時刻を確定時刻と区別する", () => {
  const d: StopDraft = { kind: "stop", id: "s", origin: "manual", sourceText: "", comment: null, targetOrderId: "old", drugCode: "INJ-NS500", said: "生食", stopTime: "16:00" };
  expect(stopTimesOf([d], "12:00")).toEqual({ old: "16:00" });
});

it("予定の1回を取り消す下書きと復元：他の回・原本・実施記録は変更しない", async () => {
  const { toggleInjectionDose } = await import("./injection-change");
  const { doseTimes } = await import("./flowsheet");
  const d = toggleInjectionDose(entry, 1980, 660, [], "cancel")!;
  expect(d.omittedDoses).toEqual([{ day: 0, time: "09:00" }]);
  expect(d.start).toEqual({ day: 1, time: "09:00" });
  const result = toOrder(d, { nowTime: "11:00", activeOrders: [entry], drafts: [d] } as unknown as CheckContext);
  const next = { ...entry, order: result.order! };
  expect(doseTimes(next, 660, 660, 5760)).toEqual([3420]);
  expect(toggleInjectionDose(entry, 1980, 660, [d], "restore")).toBeNull();
  expect(() => toggleInjectionDose(entry, 540, 660, [], "past")).toThrow();
  expect(entry.order).not.toHaveProperty("omittedDoses");
});

it("複数の回の取り消しをまとめ、戻した回だけ除き、一定間隔の時刻を保つ", async () => {
  const { toggleInjectionDose } = await import("./injection-change");
  const { doseTimes } = await import("./flowsheet");
  const source: OrderEntry = { ...entry, order: { ...entry.order as import("./types").InjectionOrder, schedule: { kind: "every_hours", hours: 8 } } };
  const before = doseTimes(source, 660, 660, 9000);
  const a = toggleInjectionDose(source, before[0], 660, [], "a")!;
  const b = toggleInjectionDose(source, before[1], 660, [a], "b")!;
  const ctx = { nowTime: "11:00", activeOrders: [source], drafts: [b] } as unknown as CheckContext;
  const confirmed = toOrder(b, ctx).order!;
  expect(doseTimes({ ...entry, order: confirmed }, 660, 660, 9000)).toEqual(before.slice(2));
  const restored = toggleInjectionDose(source, before[0], 660, [b], "c")!;
  expect(restored.omittedDoses).toHaveLength(1);
  expect(toggleInjectionDose(source, before[1], 660, [restored], "d")).toBeNull();
});

it("1回のみの注射を取り消して確定すると予定から除かれる", async () => {
  const { toggleInjectionDose } = await import("./injection-change");
  const { injectionCell } = await import("./calendar");
  const source: OrderEntry = { ...entry, order: { ...entry.order as import("./types").InjectionOrder, schedule: { kind: "once" }, start: { day: 1, time: "14:00" } } };
  const d = toggleInjectionDose(source, 2280, 660, [], "once")!;
  const result = toOrder(d, { nowTime: "11:00", activeOrders: [source], drafts: [d] } as unknown as CheckContext);
  expect(injectionCell({ ...source, order: result.order! }, 1, 660).doses).toEqual([]);
});
