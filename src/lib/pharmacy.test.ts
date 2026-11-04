import { describe, expect, it } from "vitest";
import { PATIENTS } from "./patients";
import { alreadyOrdered, auditItems, b008Check, daysOfCount, draftsFromReport, matchOral, nextTiming, ordersFromReport, queryOpen, type BroughtReport, type Query } from "./pharmacy";
import type { OrderEntry } from "./types";

const people = PATIENTS.map((p, i) => ({ patient: p, room: ["512", "515B", "508A", "511"][i], entries: p.history.filter((e): e is OrderEntry => e.kind === "order") }));

describe("処方監査", () => {
  it("lists injection and oral orders given since yesterday, newest first", () => {
    const items = auditItems(people, -1440, 420);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.entry.order.type === "injection" || i.entry.order.type === "prescription")).toBe(true);
  });
  it("finds the same ingredient running twice (持参薬 and 定期)", () => {
    const sakura = people[0];
    const dup: OrderEntry = {
      kind: "order",
      id: "dup",
      day: 0,
      time: "07:00",
      author: "山本",
      status: "有効",
      order: { type: "prescription", category: "定期", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: 1, timing: "朝" } },
    };
    const items = auditItems([{ ...sakura, entries: [...sakura.entries, dup] }], -1440, 430);
    expect(items.find((i) => i.entry.id === "dup")?.checks.some((c) => c.level === "ask" && c.text.includes("アムロジピン"))).toBe(true);
  });
});

describe("疑義照会", () => {
  const q: Query = { id: "q", patientId: "p", orderId: "sakura-cez", question: "?", askedAt: "07:00", by: "薬剤師", status: "変更" };
  it("an answer of 変更 stays open while the old order still runs", () => {
    const e = people[0].entries;
    const running = e.find((x) => x.id === "sakura-cez")!;
    expect(queryOpen(q, [{ ...running, status: "有効" }])).toBe(true);
    expect(queryOpen(q, [{ ...running, status: "中止" }])).toBe(false);
    expect(queryOpen({ ...q, status: "変更なし" }, e)).toBe(false);
  });
});

describe("持参薬鑑別（照合はコード）", () => {
  it.each([
    ["ノルバスク錠", "5mg", "ORAL-AMLO5"],
    ["ラシックス錠", "20mg", "ORAL-FRS20"],
    ["マグミット錠", "330mg", "ORAL-MGO330"],
    ["カロナール錠", "500", "ORAL-APAP500"],
    ["アムロジピン錠", "2.5mg", null],
    ["ワーファリン錠", "1mg", null],
  ])("%s %s → %s", (said, strength, code) => {
    expect(matchOral(said, strength)).toBe(code);
  });

  it("already registered: the same ingredient running", () => {
    expect(alreadyOrdered("ORAL-AMLO5", people[0].entries).length).toBe(1);
  });

  it("starts at the next ward dose time", () => {
    expect(nextTiming(["朝"], "10:00")).toEqual({ day: 1, timing: "朝" });
    expect(nextTiming(["朝", "夕"], "10:00")).toEqual({ day: 0, timing: "夕" });
  });

  it("the doctor's choices become orders; 中止 makes none", () => {
    const r: BroughtReport = {
      id: "r",
      patientId: "p",
      by: "薬剤師",
      at: "07:00",
      status: "医師へ報告",
      rows: [
        { said: "ラシックス錠", strength: "20mg", amount: 1, unit: "錠", timings: ["朝"], daysLeft: 28, prn: null, match: "ORAL-FRS20", checked: true, decision: "持参薬で継続" },
        { said: "マグミット錠", strength: "330mg", amount: 2, unit: "錠", timings: ["朝", "夕"], daysLeft: 28, prn: null, match: "ORAL-MGO330", checked: true, decision: "院内の薬に切替" },
        { said: "カロナール錠", strength: "500", amount: 1, unit: "錠", timings: [], daysLeft: null, prn: "疼痛時", match: "ORAL-APAP500", checked: true, decision: "院内の薬に切替" },
        { said: "ノルバスク錠", strength: "5mg", amount: 1, unit: "錠", timings: ["朝"], daysLeft: 28, prn: null, match: "ORAL-AMLO5", checked: true, decision: "中止" },
      ],
    };
    const o = ordersFromReport(r, "10:00");
    expect(o).toHaveLength(3);
    expect(o[0]).toMatchObject({ category: "持参薬", drugCode: "ORAL-FRS20", days: 28, start: { day: 1, timing: "朝" } });
    expect(o[1]).toMatchObject({ category: "定期", drugCode: "ORAL-MGO330", amount: 2, start: { day: 0, timing: "夕" } });
    expect(o[2]).toMatchObject({ category: "臨時", prn: "疼痛時", timings: [] });
  });

  it("the choices go through the prescription checks as drafts, and keep 持参薬 when confirmed", async () => {
    const { checkPrescription, toPrescriptionOrders } = await import("./rx");
    const r: BroughtReport = {
      id: "r",
      patientId: "p",
      by: "薬剤師",
      at: "07:00",
      status: "医師へ報告",
      rows: [
        { said: "ロキソニン錠", strength: "60mg", amount: 1, unit: "錠", timings: ["朝", "昼", "夕"], daysLeft: 10, prn: null, match: "ORAL-LOX60", checked: true, decision: "持参薬で継続" },
      ],
    };
    let n = 0;
    const [d] = draftsFromReport(r, "10:00", () => `d${++n}`);
    expect(d).toMatchObject({ kind: "prescription", category: "持参薬", days: 10, start: { day: 0, timing: "昼" } });
    const ctx = { activeOrders: [], labOrders: [], drafts: [], nowTime: "10:00", fmtDay: () => "", describe: () => "" };
    // An NSAIDs allergy is asked about, as for any prescription.
    expect(checkPrescription(d, ctx, ["NSAIDs（喘息発作）"]).some((i) => i.title === "アレルギー")).toBe(true);
    expect(toPrescriptionOrders(d, "10:00", "rp")[0]).toMatchObject({ category: "持参薬", drugCode: "ORAL-LOX60", days: 10 });
  });
});

describe("薬剤管理指導料（B008）の回数", () => {
  // day 0 = Tuesday 2026-11-03
  const dow = (d: number) => (2 + d + 7 * 10) % 7;
  const month = (d: number) => (d <= 27 ? "11" : "12");
  it("once a week (Sunday to Saturday)", () => {
    expect(b008Check([-1], 0, dow, month)).toContain("週1回");
    expect(b008Check([-3], 0, dow, month)).toBeNull();
  });
  it("four times a month", () => {
    expect(b008Check([-21, -14, -7, 7], 14, dow, month)).toContain("月4回");
  });
});

describe("持参薬鑑別報告書：実物の残数から日数", () => {
  const row = { counted: 9, amount: 2, timings: ["朝", "夕"] as ("朝" | "夕")[], unit: "錠" };
  it("残数 ÷（1回量 × 回数）, rounded down", () => {
    expect(daysOfCount(row)).toEqual({ days: 2, formula: "9錠 ÷（1回2錠 × 2回）＝ 2日分" });
  });
  it("none for 頓用, or when not counted", () => {
    expect(daysOfCount({ ...row, timings: [] })).toBeNull();
    expect(daysOfCount({ ...row, counted: null })).toBeNull();
    expect(daysOfCount({ ...row, amount: null })).toBeNull();
  });
});
