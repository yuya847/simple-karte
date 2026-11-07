import { expect, it } from "vitest";
import { SCENARIOS } from "../scenarios";
import { infusionDraft, infusionOrderEntry, infusionRateChangeDraft, infusionStopDraft } from "./infusion-orders";
import { toOrder, type CheckContext } from "../drafts";
import { buildWorksheet, orderChanges, sessionChangeKeys } from "../worksheet";
import { takeRows } from "../order-take";
import { findDrug } from "../master";
import { injectionCell } from "../calendar";
const inf = SCENARIOS.icu.infusions.find(i => i.patientId === "99000101")!;
it("持続投与を静注・変更までの注射にし、確定しても紐付けと速さを保つ", () => {
  const d = infusionDraft(inf, "医師", "draft");
  expect(d).toMatchObject({ route: "静注", schedule: { kind: "once" }, continuous: { infusionId: inf.id }, rateMlPerH: 4.896, days: null });
  const r = toOrder(d, { drafts: [], activeOrders: [] } as unknown as CheckContext);
  expect(r.order).toMatchObject({ continuous: d.continuous, rateMlPerH: 4.896 });
});
it("速度変更を元オーダの置き換えにしてコメントも変える（0も記録可能）", () => {
  const entry = infusionOrderEntry(inf, "医師");
  for (const rate of [2, 0]) {
    const d = infusionRateChangeDraft(entry, inf, rate, { day: 0, time: "10:00" }, "医師", "changed");
    expect(d).toMatchObject({ duplicate: { action: "replace", orderId: entry.id }, continuous: { infusionId: inf.id }, rateMlPerH: rate });
    expect(toOrder(d, { drafts: [], activeOrders: [] } as unknown as CheckContext).order).toMatchObject({ replaces: entry.id, continuous: { infusionId: inf.id } });
    expect(d.comment).not.toBe(infusionDraft(inf, "医師", "old").comment);
  }
});
it("終了を既存のstop下書きにする", () => {
  const e = infusionOrderEntry(inf, "医師");
  expect(infusionStopDraft(e, { day: -1, time: "12:34" }, "医師", "stop")).toMatchObject({ kind: "stop", targetOrderId: e.id, effectiveDay: -1, stopTime: "12:34" });
});
it("カレンダーは継続の帯、ワークシートは持続中、確定した変更は指示受けになる", () => {
  const e = infusionOrderEntry(inf, "医師");
  expect(injectionCell(e, 0, 600).running).toBe(true);
  const patient = SCENARIOS.patients.find(p => p.id === inf.patientId)!;
  const people = [{ patient, room: patient.room, entries: [e] }];
  expect(buildWorksheet(people, 0, 1440, 600)).toMatchObject({ timed: [], running: [{ orderId: e.id }] });
  const changed = { ...e, id: "new", day: 0, time: "10:00", order: toOrder(infusionRateChangeDraft(e, inf, 2, { day: 0, time: "10:00" }, "医師", "d"), { drafts: [], activeOrders: [] } as unknown as CheckContext).order! };
  const stopped = { ...e, status: "中止" as const, stoppedOn: 0, stoppedTime: "10:00" };
  const keys = sessionChangeKeys({ [patient.id]: { added: [changed], stopped: [e.id] } });
  const currentPeople = [{ ...people[0], entries: [stopped, changed] }];
  expect(buildWorksheet(currentPeople, 0, 1440, 600)).toMatchObject({ timed: [], running: [{ orderId: changed.id }] });
  const changes = orderChanges(currentPeople, 590, 600).filter(c => keys.has(c.key));
  expect(takeRows(changes, currentPeople, { y: 2026, m: 11, d: 7 })).toMatchObject([{ kind: "変更" }]);
});

it("単位/hとマスターにmgの無い薬の単位を合わせる", () => {
  for (const infusion of SCENARIOS.icu.infusions) {
    const d = infusionDraft(infusion, "医師", "d");
    const units = findDrug(infusion.drugCode)!.units;
    const preferred = infusion.doseUnit === "単位/h" ? "単位" : "mg";
    expect(d.items[0]).toMatchObject({ amount: infusion.amountMg, unit: units.includes(preferred) ? preferred : units[0] });
  }
});
