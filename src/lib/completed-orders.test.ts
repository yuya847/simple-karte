import { expect, it } from "vitest";
import { recordsForCompletedOrders } from "./completed-orders";
import { PATIENTS } from "./patients";
import type { OrderEntry } from "./types";
it("複数回の注射も確定時に最も近い一回だけをMARに記録する", () => {
  const entry: OrderEntry = { kind: "order", id: "inj", day: 0, time: "10:15", author: "山本", status: "有効", order: { type: "injection", items: [{ drugCode: "INJ-CTRX1", amount: 1, unit: "g" }], route: "静注", schedule: { kind: "per_day", count: 2 }, start: { day: 0, time: "10:00" }, days: 3, doseTimes: ["10:00", "22:00"] } };
  const records = recordsForCompletedOrders([entry], PATIENTS[0], "10:15", "山本");
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ key: "inj|600", at: 600, doneAt: "10:15", by: "山本", status: "実施", checked: { patient: false, label: null } });
});
