import { describe, expect, it } from "vitest";
import { diffOrders, offHoursAt, takeRows } from "./order-take";
import type { OrderEntry } from "./types";
import type { OrderChange, OtherChange } from "./worksheet";

const today = { y: 2026, m: 11, d: 4 };
const inj = (id: string, x: Partial<{ amount: number; rate: number; drug: string; time: string; verbal: boolean }> = {}): OrderEntry => ({
  kind: "order",
  id,
  day: 0,
  time: x.time ?? "10:00",
  author: "山本（専攻医）",
  status: "有効",
  ...(x.verbal ? { verbal: { takenBy: "看護師 佐藤", doctor: "山本（専攻医）", at: { day: 0, time: "10:00" } } } : {}),
  order: { type: "injection", items: [{ drugCode: x.drug ?? "INJ-NS500", amount: x.amount ?? 500, unit: "mL" }], route: "点滴静注", schedule: { kind: "per_day", count: 2 }, start: { day: 0, time: "14:00" }, ...(x.rate ? { rateMlPerH: x.rate } : {}) },
});
const ch = (kind: "新規" | "中止", e: OrderEntry, at: number): OrderChange => ({ kind, at, entry: e, patientId: "p", room: "512", name: "佐倉 修", key: `${e.id}|${kind}`, timeKnown: true });
const people = [{ patient: { id: "p" } as never, room: "512", entries: [] as OrderEntry[] }];

describe("指示受け", () => {
  it("shows a 修正 (stop + new of the same drug together) as one 変更 row with what changed", () => {
    const rows = takeRows([ch("中止", inj("a", { rate: 80 }), 600), ch("新規", inj("b", { rate: 42 }), 600)], people, today);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "変更", keys: ["a|中止", "b|新規"] });
    expect(rows[0].diff).toEqual([{ label: "速さ", before: "80mL/時", after: "42mL/時" }]);
    expect(rows[0].mustOne).toContain("変更（前と後を確かめる）");
  });
  it("marks high-risk drugs, verbal and urgent orders as one-at-a-time, and off-hours orders", () => {
    const [k] = takeRows([ch("新規", inj("k", { drug: "INJ-KCL20", amount: 20 }), 600)], people, today);
    expect(k.flags.highRisk).toContain("カリウム");
    const [v] = takeRows([ch("新規", inj("v", { verbal: true }), 600)], people, today);
    expect(v.flags.verbal).toContain("口頭指示");
    const [u] = takeRows([ch("新規", inj("u"), 13 * 60 + 30)], people, today); // starts 14:00, 30 min after
    expect(u.flags.urgent).toContain("60分以内");
    const [n] = takeRows([ch("新規", inj("n"), 600)], people, today);
    expect(n.mustOne).toEqual([]);
    expect(offHoursAt(22 * 60)).toBe(true);
    expect(offHoursAt(10 * 60)).toBe(false);
  });
  it("puts the glucose-lowering drugs in effect next to a meal stop (医療安全情報 No.215)", () => {
    const met: OrderEntry = { kind: "order", id: "m", day: -2, time: "10:00", author: "医師", status: "有効", order: { type: "prescription", category: "定期", drugCode: "ORAL-MET250", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: -2 } } };
    const diet: OtherChange = { kind: "食事", at: 660, text: { type: "食事", main: "絶食（検査）", detail: "明日の朝食から", author: "医師" }, patientId: "p", room: "512", name: "佐倉 修", key: "d|食事", timeKnown: true };
    const [r] = takeRows([diet], [{ ...people[0], entries: [met] }], today);
    expect(r.related[0]).toContain("メトホルミン");
    expect(r.mustOne.length).toBe(1);
  });
  it("compares prescriptions field by field", () => {
    const a = { type: "prescription" as const, category: "定期" as const, drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝" as const], start: { day: 0 }, days: 7 };
    expect(diffOrders(a, { ...a, amount: 2 }, today)).toEqual([{ label: "1回量", before: "1錠", after: "2錠" }]);
  });
});
