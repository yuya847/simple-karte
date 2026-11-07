import { expect, it } from "vitest";
import { SCENARIOS } from "./scenarios";
import { ordersOf } from "./record";
import { antibioticsOf } from "./specialist";
import { injectionCell } from "./calendar";
it("河里さんの今日の注射とICTを一致させる", () => {
  const p = SCENARIOS.cases.find(c => c.patient.name.includes("河里"))!.patient;
  const entries = ordersOf(p.history);
  const vcm = entries.find(e => e.order.type === "injection" && e.order.items.some(i => i.drugCode === "INJ-VCM05"))!;
  expect(antibioticsOf(entries).some(a => a.kind.includes("抗MRSA"))).toBe(vcm.status === "有効" && injectionCell(vcm, 0, 720).running);
  if (vcm.order.type !== "injection") throw Error();
  const ongoing = { ...vcm, order: { ...vcm.order, end: undefined, days: undefined } };
  expect(injectionCell(ongoing, 0, 720).running).toBe(true);
  expect(antibioticsOf([ongoing])).toEqual([expect.objectContaining({ kind: "抗MRSA・届出確認" })]);
});
