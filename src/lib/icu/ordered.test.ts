import { describe, expect, it } from "vitest";
import { DRUGS } from "../master";
import type { HdOrder, InjectionOrder, OrderEntry } from "../types";
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

describe("CRRT は透析のオーダ（持続）から読む", () => {
  const hd = { purpose: "緊急" as const, method: "CHDF" as HdOrder["method"], minutes: 0, qb: 100, membrane: 1.0, anticoag: { drug: "ナファモスタット" as const, initial: null, hourly: 20 }, uf: 0, dw: null, access: "透析用カテーテル（右大腿静脈）", qd: 500, qf: 300, removalMlPerH: 50 };
  const order = (id: string, over: Partial<typeof hd> = {}, start = { day: -2, time: "00:00" }, extra: Partial<OrderEntry> = {}): OrderEntry => ({ kind: "order", id, day: start.day, time: start.time, author: "架空医師", status: "有効", order: { type: "procedure", code: "PROC-HD", schedule: { kind: "continuous" }, start, hd: { ...hd, ...over } }, ...extra });
  it("有効な持続の透析のオーダが CRRT の条件になり、一覧の札・出納の除水に使われ、保存はしない", () => {
    const p = { ...icuPatient, history: [order("hd1")] };
    const r = icuFixture();
    const view = withIcuOrders(r, icuOrderEntries([p], {}));
    expect(view.crrt).toEqual([expect.objectContaining({ mode: "CHDF", qb: 100, qd: 500, qf: 300, removalMlPerH: 50, anticoag: { drug: "ナファモスタット", ratePerH: 20, unit: "mg/h" }, access: "透析用カテーテル（右大腿静脈）", fromOrder: "hd1" })]);
    expect(savedIcuRecords(view).crrt).toEqual([]);
  });
  it("中止でその時刻に終わり、前の CRRT の記録はオーダの開始で終わる（二重に数えない）", () => {
    const p = { ...icuPatient, history: [order("hd1", {}, { day: 0, time: "08:00" })] };
    const r = icuFixture();
    r.crrt = [{ id: "old", patientId: p.id, at: { day: -2, time: "00:00" }, by: "架空医師", mode: "CHDF", qb: 80, qd: 400, qf: 300, removalMlPerH: 30, anticoag: { drug: "なし", ratePerH: 0, unit: "mg/h" }, access: "右大腿" }];
    const view = withIcuOrders(r, icuOrderEntries([p], { [p.id]: { added: [], stopped: ["hd1"], stopTimes: { hd1: "10:00" } } }));
    expect(view.crrt.find((c) => c.id === "old")?.end).toEqual({ day: 0, time: "08:00" });
    expect(view.crrt.find((c) => c.fromOrder)?.end).toEqual({ day: 0, time: "10:00" });
    expect(savedIcuRecords(view).crrt).toEqual(r.crrt);
  });
  it("維持透析（HD）のオーダは CRRT にしない", () => {
    const p = { ...icuPatient, history: [order("hd1", { method: "HD", minutes: 240 })] };
    expect(withIcuOrders(icuFixture(), icuOrderEntries([p], {})).crrt).toEqual([]);
  });
});
