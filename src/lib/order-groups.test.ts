import { describe, expect, it } from "vitest";
import { groupRx } from "./order-groups";
import type { OrderEntry } from "./types";

const rx = (id: string, changes: Partial<OrderEntry> = {}): OrderEntry => ({
  kind: "order", id, day: 0, time: "16:00", author: "山本", status: "有効",
  order: { type: "prescription", drugCode: "test", amount: 1, unit: "錠", category: "定期", timings: [], start: { day: 0 } },
  ...changes,
});
describe("groupRx", () => {
  it("同時の3つを元のentryのまま1組にする", () => {
    const entries = [rx("1"), rx("2"), rx("3")];
    expect(groupRx(entries)).toEqual([entries]);
    expect(groupRx(entries)[0][1]).toBe(entries[1]);
  });
  it("日時・出した人が違えば分ける", () => {
    for (const changes of [{ time: "16:01" }, { day: -1 }, { author: "佐藤" }]) {
      expect(groupRx([rx("1"), rx("2", changes)])).toHaveLength(2);
    }
  });
  it("注射と処方は混ぜず、途中に別種類があれば分ける", () => {
    const inj = rx("inj", { order: { type: "injection", items: [], route: "静注", schedule: { kind: "once" }, start: { day: 0 } } });
    expect(groupRx([rx("1"), inj, rx("2")])).toHaveLength(3);
    expect(groupRx([inj, { ...inj, id: "inj2" }])).toHaveLength(1);
  });
  it("状態や開始日が違っても同じオーダの行をまとめる", () => {
    expect(groupRx([rx("1"), rx("2", { status: "中止" })])).toHaveLength(1);
    expect(groupRx([])).toEqual([]);
  });
});
