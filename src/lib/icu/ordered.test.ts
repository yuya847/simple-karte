import { describe, expect, it } from "vitest";
import { DRUGS } from "../master";
import type { InjectionOrder, OrderEntry } from "../types";
import { rateAt, doseText } from "./gamma";
import { icuOrderEntries, savedIcuRecords, withIcuOrders } from "./ordered";
import { icuFixture, icuPatient } from "./test-fixture";
import { injectionRateDraft } from "../injection-change";

const code = (name: string) => DRUGS.find((d) => d.name.normalize("NFKC").includes(name))!.code;
const drip = (id: string, infusionId: string, rate: number, start: { day: number; time?: string }, extra: Partial<InjectionOrder> = {}): OrderEntry => ({ kind: "order", id, day: start.day, time: start.time ?? "00:00", author: "架空医師", status: "有効", order: { type: "injection", items: [{ drugCode: code("ノルアドレナリン注射液"), amount: 5, unit: "A" }, { drugCode: code("大塚生食注 50mL"), amount: 45, unit: "mL" }], route: "点滴静注", schedule: { kind: "once" }, start, rateMlPerH: rate, continuous: { infusionId }, ...extra } });

describe("持続投与は注射のオーダ（持続）から読む", () => {
  it("右の道具「注射」の持続で出したオーダは、記録がなくても持続投与として γ・mL/h が出る", () => {
    const p = { ...icuPatient, weightKg: 50, history: [drip("o1", "inf-new", 3, { day: 0, time: "08:00" })] };
    const view = withIcuOrders(icuFixture(), icuOrderEntries([p], {}));
    const inf = view.infusions.find((i) => i.id === "inf-new")!;
    expect(inf).toMatchObject({ name: expect.stringContaining("ノルアドレナリン"), amountMg: 5, volumeMl: 50, doseUnit: "γ", weightKg: 50, orderId: "o1" });
    expect(doseText(inf, 600).split("（")[0]).toBe("0.10γ");
    expect(savedIcuRecords(view).infusions.map((i) => i.id)).toEqual(["norad"]);
  });
  it("注射カレンダーの速さの変更（中止と新規）は、記録の速さの履歴に足し、保存はしない", () => {
    const r = icuFixture();
    r.infusions[0].orderId = "o1";
    const first = drip("o1", "norad", 4.9, { day: -2, time: "00:00" });
    const change = injectionRateDraft(first, { time: "09:00", rate: 2.4 }, "d1");
    const second: OrderEntry = { kind: "order", id: "o2", day: 0, time: "09:00", author: "架空医師", status: "有効", order: { ...(first.order as InjectionOrder), replaces: "o1", rateMlPerH: change.rateMlPerH!, start: { day: 0, time: "09:00" }, continuous: change.continuous } };
    const p = { ...icuPatient, history: [first] };
    const view = withIcuOrders(r, icuOrderEntries([p], { [p.id]: { added: [second], stopped: [] } }));
    const inf = view.infusions.find((i) => i.id === "norad")!;
    expect(rateAt(inf, 500)).toBe(4.9);
    expect(rateAt(inf, 600)).toBe(2.4);
    expect(savedIcuRecords(view).infusions[0]).toEqual(r.infusions[0]);
  });
  it("持続のオーダを中止すると、その時刻で持続投与が終わる", () => {
    const p = { ...icuPatient, weightKg: 50, history: [drip("o1", "inf-new", 3, { day: 0, time: "08:00" })] };
    const view = withIcuOrders(icuFixture(), icuOrderEntries([p], { [p.id]: { added: [], stopped: ["o1"], stopTimes: { o1: "10:00" } } }));
    const inf = view.infusions.find((i) => i.id === "inf-new")!;
    expect(rateAt(inf, 590)).toBe(3);
    expect(rateAt(inf, 600)).toBeNull();
  });
  it("オーダのない患者は元の記録のまま", () => {
    const r = icuFixture();
    expect(withIcuOrders(r, icuOrderEntries([icuPatient], {}))).toBe(r);
  });
});
