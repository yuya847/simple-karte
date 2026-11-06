import { describe, expect, it } from "vitest";
import { expiryFlags, expiryKey, rxExpiries, visibleExpiryStickies } from "./rx-expiry";
import { currentEntries, ordersOf } from "./record";
import { PATIENTS } from "./patients";
import type { OrderEntry, PrescriptionOrder } from "./types";
import { SCENARIOS } from "./scenarios";
const base = { y: 2026, m: 11, d: 6 }; // 金曜
const p = { ward: "5階東" };
const rx = (patch: Partial<PrescriptionOrder> = {}, id = "rx"): OrderEntry => ({ kind: "order", id, day: -2, time: "09:00", author: "医師", status: "有効", order: { type: "prescription", category: "定期", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: -2 }, days: 4, ...patch } });
describe("処方切れ", () => {
  it("曜日指定と隔日の最終投与日を数える", () => {
    expect(rxExpiries(p, [rx({ dayPattern: { kind: "weekdays", days: [1, 3, 5] }, days: 2 })], base)[0].lastDay).toBe(0);
    expect(rxExpiries(p, [rx({ dayPattern: { kind: "every", n: 2 }, days: 3 })], base)[0].lastDay).toBe(2);
  });
  it("中止・頓用・退院時・1回だけを除く", () => {
    expect(rxExpiries(p, [{ ...rx(), status: "中止" }, rx({ prn: "発熱" }), rx({ category: "退院時" }), rx({ once: { day: 1, time: "09:00" } })], base)).toEqual([]);
    expect(rxExpiries(p, [rx({ days: 1, start: { day: 0 } })], base)).toHaveLength(1);
  });
  it("退院予定日より後と、新版で継続する薬を除く", () => {
    const leave: OrderEntry = { ...rx(), id: "leave", order: { type: "procedure", code: "LEAVE", schedule: { kind: "once" }, start: { day: 0 }, leave: { kind: "退院", from: { day: 0, time: "10:00" }, destination: "自宅", note: "" } } };
    expect(rxExpiries(p, [rx(), leave], base)).toEqual([]);
    expect(rxExpiries(p, [rx(), rx({ replaces: "rx", start: { day: 2 }, days: 14 }, "new")], base)).toEqual([]);
  });
  it("注射は期間内の最後の投与日で判定し、単回を除く", () => {
    const injection: OrderEntry = { ...rx(), order: { type: "injection", items: [{ drugCode: "INJ-CTRX1", amount: 2, unit: "g" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, start: { day: -2 }, days: 4, dayPattern: { kind: "weekdays", days: [1, 3, 5] } } };
    expect(rxExpiries(p, [injection], base)[0].lastDay).toBe(0);
    expect(rxExpiries(p, [{ ...injection, order: { ...injection.order, type: "injection", schedule: { kind: "once" } } } as OrderEntry], base)).toEqual([]);
  });
  it("同じ薬の退院時・頓用処方は継続とみなさない", () => {
    expect(rxExpiries(p, [rx(), rx({ category: "退院時", start: { day: 2 }, days: 7 }, "home"), rx({ prn: "痛み", timings: [], start: { day: 0 }, days: 7 }, "prn")], base)).toHaveLength(1);
  });
  it("退院予定の当日までは含め、病棟予定と次の定期処方日を反映する", () => {
    expect(rxExpiries({ ...p, name: "堀 誠", room: "505A" }, [rx({ days: 5 })], base)).toEqual([]);
    expect(rxExpiries({ ...p, name: "堀 誠", room: "505A" }, [rx()], base)).toHaveLength(1);
    expect(rxExpiries(p, [rx({ start: { day: 0 }, days: 5 })], base)[0].lastDay).toBe(4);
    expect(rxExpiries(p, [rx({ start: { day: 0 }, days: 6 })], base)).toEqual([]);
  });
  it("保存した延長を反映し、伝達を閉じる", () => {
    const patient = { ...PATIENTS[0], history: [rx()] };
    const rows = rxExpiries(p, [rx()], base);
    const sticky = { id: expiryKey(rows[0]) };
    expect(visibleExpiryStickies([sticky], rows)).toEqual([sticky]);
    expect(visibleExpiryStickies([sticky, { id: `${sticky.id}:done` }], rows)).toEqual([]);
    const extended = rxExpiries(p, ordersOf(currentEntries(patient, { added: [], stopped: [], extended: { rx: 14 } })), base);
    expect(extended).toEqual([]);
    expect(visibleExpiryStickies([sticky], extended)).toEqual([]);
  });
  it("色と次回定期処方までの印、および100人の例", () => {
    const rows = rxExpiries(p, [rx()], base);
    expect(rows[0].beforeRegular).toBe(true);
    expect(expiryFlags(rows)[0]).toMatchObject({ label: "処方切れ 明日", tone: "yamabuki" });
    const examples = SCENARIOS.patients.flatMap(p => rxExpiries(p, ordersOf(p.history), base));
    expect(examples.some(r => r.lastDay === 0 && r.entry.order.type === "prescription")).toBe(true);
    expect(examples.some(r => r.lastDay === 1 && r.entry.order.type === "injection")).toBe(true);
  });
});
