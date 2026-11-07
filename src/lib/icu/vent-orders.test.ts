import { describe, expect, it } from "vitest";
import { checkDraft, toOrder, type CheckContext } from "../drafts";
import { currentEntries } from "../record";
import { currentOxygen } from "./current-oxygen";
import { ventAt } from "./abg";
import { icuOrderEntries, savedIcuRecords, withIcuOrders } from "./ordered";
import { icuFixture, icuPatient } from "./test-fixture";
import { runningVentOrder, ventOrderDraft } from "./vent-orders";
import type { OrderEntry } from "../types";

const vent = { mode: "A/C-PC" as const, airway: "経口挿管" as const, fio2: 0.35, peep: 6, pc: 10, rr: 14 };
const entry = (id: string, v: typeof vent, time: string, extra: Partial<OrderEntry> = {}): OrderEntry => ({ kind: "order", id, day: 0, time, author: "架空医師", status: "有効", order: { type: "procedure", code: "PROC-VENT", vent: v, schedule: { kind: "continuous" }, start: { day: 0 } }, ...extra });

describe("呼吸器の設定はオーダ（人工呼吸の設定 PROC-VENT）", () => {
  it("下書きは継続、確定すると設定の入った処置のオーダ。動いている設定は置き換える", () => {
    const d = ventOrderDraft(vent, "d1");
    expect(d).toMatchObject({ kind: "procedure", code: "PROC-VENT", vent, schedule: { kind: "continuous" }, duplicate: null });
    const running = entry("o1", vent, "08:00");
    expect(runningVentOrder([running, { ...running, id: "o0", status: "中止" }])?.id).toBe("o1");
    expect(ventOrderDraft(vent, "d2", running).duplicate).toEqual({ action: "replace", orderId: "o1" });
  });
  it("確認では設定をそのまま出し、設定のない下書きは止める", () => {
    const ctx = { activeOrders: [], drafts: [], nowTime: "10:00", fmtDay: () => "今日", describe: () => "" } as unknown as CheckContext;
    expect(checkDraft(ventOrderDraft(vent, "d1"), ctx).find((i) => i.key === "vent")).toMatchObject({ level: "info", message: "A/C-PC FiO2 0.35 PEEP 6 PC 10 RR 14" });
    expect(checkDraft({ ...ventOrderDraft(vent, "d1"), vent: null }, ctx).find((i) => i.key === "vent")?.level).toBe("stop");
    const r = toOrder(ventOrderDraft(vent, "d1"), ctx);
    expect("order" in r && r.order).toMatchObject({ type: "procedure", code: "PROC-VENT", vent, schedule: { kind: "continuous" } });
  });
  it("いまの設定は確定した最新のオーダから。前の記録は読み替えの前の分として残り、読み替えた行は保存しない", () => {
    const r = icuFixture();
    const p = { ...icuPatient, history: [entry("o1", vent, "09:00")] };
    const view = withIcuOrders(r, icuOrderEntries([p], {}));
    expect(currentOxygen(view, p.id, 600)).toBe("A/C-PC FiO2 0.35 PEEP 6");
    expect(currentOxygen(view, p.id, 500)).toBe("A/C-PC FiO2 0.4 PEEP 8");
    expect(savedIcuRecords(view).vents).toEqual(r.vents);
    // 置き換え：前のオーダは新しいオーダの開始で止まる。
    const next = entry("o2", { ...vent, fio2: 0.3 }, "10:30", { order: { type: "procedure", code: "PROC-VENT", replaces: "o1", vent: { ...vent, fio2: 0.3 }, schedule: { kind: "continuous" }, start: { day: 0 } } });
    const v2 = withIcuOrders(r, icuOrderEntries([p], { [p.id]: { added: [next], stopped: [] } }));
    expect(currentOxygen(v2, p.id, 640)).toBe("A/C-PC FiO2 0.3 PEEP 6");
    expect(currentOxygen(v2, p.id, 620)).toBe("A/C-PC FiO2 0.35 PEEP 6");
    // 置き換えのない中止：その時刻から設定なし。
    const stopped = withIcuOrders(r, { [p.id]: currentEntries(p, { added: [], stopped: ["o1"], stopTimes: { o1: "11:00" } }) as OrderEntry[] });
    expect(ventAt(stopped.vents, p.id, 650)?.fio2).toBe(0.35);
    expect(ventAt(stopped.vents, p.id, 670)).toBeNull();
  });
  it("実測の行は設定を繰り返すだけで、いまの設定を決めない", () => {
    const r = icuFixture();
    r.vents.push({ ...r.vents[0], id: "m", at: { day: 0, time: "09:00" }, fio2: 0.9, measured: { ppeak: 20 } });
    expect(ventAt(r.vents, icuPatient.id, 600)?.fio2).toBe(0.4);
  });
});
