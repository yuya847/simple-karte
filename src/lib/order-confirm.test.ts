import { describe, expect, it } from "vitest";
import { confirmPlan, elapsedLabel, groupByPatient, orderTakeBadge, slipLines, sortTakeList, takeBadge, takeLate, takenInSession, takenTimeOf, unconfirmed, urgencyRank } from "./order-confirm";
import { takeRows } from "./order-take";
import type { OrderEntry } from "./types";
import type { OrderChange, WorkPatient } from "./worksheet";

const today = { y: 2026, m: 11, d: 4 };
const inj = (id: string, x: Partial<{ hours: number; drug: string; status: "有効" | "中止"; stoppedTime: string; time: string }> = {}): OrderEntry => ({
  kind: "order",
  id,
  day: 0,
  time: x.time ?? "10:00",
  author: "山本（専攻医）",
  status: x.status ?? "有効",
  ...(x.status === "中止" ? { stoppedOn: 0, stoppedTime: x.stoppedTime ?? "10:00" } : {}),
  order: { type: "injection", items: [{ drugCode: x.drug ?? "INJ-CEZ1", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "every_hours", hours: x.hours ?? 12 }, start: { day: 0, time: "14:00" }, minutesPerDose: 30 },
});
const rx = (id: string): OrderEntry => ({ kind: "order", id, day: 0, time: "10:00", author: "山本（専攻医）", status: "有効", order: { type: "prescription", category: "定期", drugCode: "ORAL-MET250", amount: 1, unit: "錠", timings: ["朝", "夕"], start: { day: 0, timing: "夕" } } });
const person = (id: string, room: string, name: string, entries: OrderEntry[]): WorkPatient => ({ patient: { id, name } as never, room, entries });
const ch = (kind: "新規" | "中止", e: OrderEntry, at: number, p: WorkPatient): OrderChange => ({ kind, at, entry: e, patientId: p.patient.id, room: p.room, name: p.patient.name, key: `${e.id}|${kind}`, timeKnown: true });
const notTaken = () => false;

describe("指示確認", () => {
  it("expands a new injection to its doses for today and tomorrow, as the worksheet lists them", () => {
    const e = inj("a");
    const p = person("p1", "512", "佐倉 修", [e]);
    const [row] = takeRows([ch("新規", e, 600, p)], [p], today);
    const plan = confirmPlan(row, [p], today, 630);
    expect(plan.entry?.id).toBe("a");
    expect(plan.days.map((d) => d.label)).toEqual(["今日 11/4（水）", "明日 11/5（木）"]);
    expect(plan.days[0].items.map((i) => i.at)).toEqual([14 * 60]); // 14:00 today
    expect(plan.days[1].items.map((i) => i.at)).toEqual([1440 + 2 * 60, 1440 + 14 * 60]); // 02:00 and 14:00 tomorrow
    expect(plan.days[0].items[0].main).toContain("セファゾリン");
    expect(plan.note).toContain("予定 3件");
  });

  it("expands a prescription to the ward's dose times from its start timing", () => {
    const e = rx("r");
    const p = person("p1", "512", "佐倉 修", [e]);
    const [row] = takeRows([ch("新規", e, 600, p)], [p], today);
    const plan = confirmPlan(row, [p], today, 630);
    expect(plan.days[0].items.map((i) => i.at)).toEqual([18 * 60]); // starts at 夕 today
    expect(plan.days[1].items.map((i) => i.at)).toEqual([1440 + 8 * 60, 1440 + 18 * 60]);
  });

  it("for a stop, lists the doses after the stop that will no longer be given", () => {
    const e = inj("s", { status: "中止", stoppedTime: "15:00" });
    const p = person("p1", "512", "佐倉 修", [e]);
    const [row] = takeRows([ch("中止", e, 15 * 60, p)], [p], today);
    const plan = confirmPlan(row, [p], today, 15 * 60 + 10);
    expect(plan.days[0].items).toHaveLength(0); // 14:00 was before the stop
    expect(plan.days[1].items.map((i) => i.at)).toEqual([1440 + 2 * 60, 1440 + 14 * 60]);
    expect(plan.note).toContain("実施しません");
  });

  it("text changes (指示簿・食事) make no schedule and say so", () => {
    const p = person("p1", "512", "佐倉 修", []);
    const rows = takeRows([{ kind: "指示簿", at: 600, text: { type: "指示簿", main: "安静度：病棟内フリー", detail: "11/4から", author: "山本（専攻医）" }, patientId: "p1", room: "512", name: "佐倉 修", key: "L1|新規", timeKnown: true }], [p], today);
    const plan = confirmPlan(rows[0], [p], today, 630);
    expect(plan.entry).toBeNull();
    expect(plan.days).toEqual([]);
    expect(plan.note).toContain("指示簿");
  });

  it("gives each change one status: 未指示受け → 受け → 確認済み, or 医師に確認中 while held", () => {
    const e = inj("a");
    const p = person("p1", "512", "佐倉 修", [e]);
    const [row] = takeRows([ch("新規", e, 600, p)], [p], today);
    const base = { taken: {}, holds: {}, confirms: {} };
    expect(takeBadge(row, { ...base, isTaken: notTaken }).state).toBe("未指示受け");
    expect(takeBadge(row, { ...base, holds: { "a|新規": { by: "看護師 佐藤", at: "10:05", reason: "量・単位がわからない", note: "" } }, isTaken: notTaken })).toMatchObject({ state: "医師に確認中", text: "医師に確認中（看護師 佐藤）" });
    const taken = { "a|新規": "10:30 看護師 佐藤" };
    expect(takeBadge(row, { ...base, taken, isTaken: () => true })).toMatchObject({ state: "受け", text: "受け 10:30 看護師 佐藤", tone: "ai" });
    expect(takeBadge(row, { ...base, taken, confirms: { "a|新規": "10:35 看護師 佐藤" }, isTaken: () => true })).toMatchObject({ state: "確認済み", text: "確認済み 10:35 看護師 佐藤" });
    // The record shows the latest change of an order; an order without a change this session has none.
    expect(orderTakeBadge("a", [row], { ...base, isTaken: notTaken })?.state).toBe("未指示受け");
    expect(orderTakeBadge("zz", [row], { ...base, isTaken: notTaken })).toBeNull();
    // Taken but not confirmed is what the worksheet marks.
    expect(unconfirmed([row], { ...base, taken, isTaken: () => true })).toHaveLength(1);
    expect(unconfirmed([row], { ...base, taken, confirms: { "a|新規": "x" }, isTaken: () => true })).toHaveLength(0);
  });

  it("sorts the ward list by time or by urgency, groups by patient in that order, and tells the elapsed time", () => {
    const p1 = person("p1", "512", "佐倉 修", []);
    const p2 = person("p2", "503A", "大浦 トメ", []);
    const plain = inj("n");
    const kcl = inj("k", { drug: "INJ-KCL20", time: "11:00" });
    const rows = takeRows([ch("新規", plain, 600, p1), ch("新規", kcl, 660, p2)], [p1, p2], today);
    expect(sortTakeList(rows, "time").map((r) => r.key)).toEqual(["n|新規", "k|新規"]);
    expect(sortTakeList(rows, "urgency").map((r) => r.key)).toEqual(["k|新規", "n|新規"]);
    expect(urgencyRank(rows.find((r) => r.key === "k|新規")!)).toBe(1);
    const groups = groupByPatient(sortTakeList(rows, "urgency"));
    expect(groups.map((g) => g.name)).toEqual(["大浦 トメ", "佐倉 修"]);
    expect(elapsedLabel(0)).toBe("いま");
    expect(elapsedLabel(25)).toBe("25分");
    expect(elapsedLabel(125)).toBe("2時間5分");
    expect(elapsedLabel(27 * 60)).toBe("1日3時間");
    // Late: 至急 after 15 minutes, the rest after an hour (架空の病院の取り決め).
    expect(takeLate(rows[0], 600 + 59)).toBe(false);
    expect(takeLate(rows[0], 600 + 60)).toBe(true);
  });

  it("lists what was taken this session newest first, and builds the day's 指示票 lines with 指示受け and 指示確認", () => {
    const p = person("p1", "512", "佐倉 修", []);
    const a = inj("a");
    const b = inj("b", { time: "11:00" });
    const rows = takeRows([ch("新規", a, 600, p), ch("新規", b, 660, p)], [p], today);
    const taken = { "a|新規": "10:40 看護師 佐藤", "b|新規": "10:20 看護師 田中・確認 看護師 佐藤" };
    expect(takenInSession(rows, taken).map((r) => r.key)).toEqual(["a|新規", "b|新規"]);
    expect(takenTimeOf(rows[1], taken)).toBe("10:20");
    expect(takenInSession(rows, { "a|新規": "10:40 看護師 佐藤" }).map((r) => r.key)).toEqual(["a|新規"]);
    const lines = slipLines(rows, "p1", 0, { taken, isTaken: () => true, holds: {}, confirms: { "a|新規": "10:45 看護師 佐藤" } });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ kind: "新規", take: "10:40 看護師 佐藤", confirm: "10:45 看護師 佐藤" });
    expect(lines[1]).toMatchObject({ take: "10:20 看護師 田中・確認 看護師 佐藤", confirm: "" });
    expect(slipLines(rows, "p1", 1, { taken, isTaken: () => true, holds: {}, confirms: {} })).toEqual([]);
  });
});
