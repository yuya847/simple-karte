import { describe, expect, it } from "vitest";
import { insulinDoses, parseInsulinDoses, fixedInsulinUnits, insulinDoseProblems } from "./insulin-doses";
import { doseTimes } from "./flowsheet";
import { buildWorksheet } from "./worksheet";
import { insulinGivenForBilling } from "./insulin-billing";
import { menuRecord } from "./order-execute";
import { defaultSliding } from "./insulin";
import { labelItems } from "./labels";
import { PATIENTS } from "./patients";
import type { InjectionOrder, OrderEntry } from "./types";
const order = (): InjectionOrder => ({ type: "injection", items: [{ drugCode: "DEMO-INS-LISPRO", amount: 1, unit: "単位" }], route: "皮下注", schedule: { kind: "per_day", count: 3 }, insulinDoses: insulinDoses([2, 3, 4, 0]), start: { day: 0, time: "00:00" }, days: 2 });
const entry = (o: InjectionOrder): OrderEntry => ({ kind: "order", id: "ins", day: 0, time: "00:00", author: "医師", status: "有効", order: o });
describe("時刻ごとのインスリン量", () => {
  it.each(["2-2-2-0", "２－２－２－０", "2−2−2−0", "2 2 2 0", "２　２　２　０"])("%s を朝昼夕眠前の量として読む", text => expect(parseInsulinDoses(text)).toEqual([2, 2, 2, 0]));
  it.each(["2-2-0", "2--2-0", "a-2-2-0", "-1-2-2-0", "2-2-2-Infinity", ""])("不正な量 %s を拒否する", text => expect(parseInsulinDoses(text)).toBeNull());
  it("0を予定から除外し、翌日も各時刻の量を保つ", () => {
    const o = order(), e = entry(o);
    expect(doseTimes(e, 0, 0, 1440)).toEqual([450, 690, 1050]);
    expect(fixedInsulinUnits(o, 1440 + 690)).toBe(3);
    const p = { patient: PATIENTS[0], room: "101", entries: [e] };
    const items = buildWorksheet([p], 0, 1440, 0).timed;
    expect(items.map(i => i.insulinUnits)).toEqual([2, 3, 4]);
    expect(items.map(i => i.main)).toEqual(expect.arrayContaining([expect.stringContaining("2U"), expect.stringContaining("3U"), expect.stringContaining("4U")]));
    const labels = labelItems(p, { y: 2026, m: 11, d: 6 }, 0, 1).drugs;
    expect(labels).toHaveLength(3);
    expect(labels[1].main).toContain("3U");
  });
  it("固定量とスケールを合算して実施記録に残す", () => {
    const o = { ...order(), sliding: defaultSliding() };
    const items = buildWorksheet([{ patient: PATIENTS[0], room: "101", entries: [entry(o)] }], 0, 1440, 0).timed;
    expect(items).toHaveLength(4);
    const record = menuRecord(items[1], { status: "実施", day: 0, time: "11:30", by: "看護師", glucose: 210 });
    expect(record?.insulin).toEqual({ units: 5, glucose: 210 });
    expect(menuRecord(items[1], { status: "実施", day: 0, time: "11:30", by: "看護師" })).toBeNull();
  });
  it("重複時刻と不正量を拒否する", () => {
    const doses = insulinDoses([2, NaN, 2, 0]);
    expect(insulinDoseProblems(doses)).not.toEqual([]);
    doses[1] = { ...doses[0], label: "昼" };
    expect(insulinDoseProblems(doses)).not.toEqual([]);
  });
});

it("算定には同じ患者の有効なインスリン実施量だけを渡す", () => {
  const base = { key: "ins|450", orderId: "ins", patientId: "p", at: 450, status: "実施" as const, doneAt: "07:30", by: "看護師", checked: { patient: true, label: true }, insulin: { units: 2 } };
  expect(insulinGivenForBilling({ a: base, b: { ...base, patientId: "other" }, c: { ...base, status: "未実施" }, d: { ...base, cancellation: { by: "看護師", at: "08:00", reason: "訂正" } }, e: { ...base, insulin: { units: NaN } } }, "p")).toEqual([{ key: "ins|450", units: 2 }]);
});
