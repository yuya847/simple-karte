import { describe, expect, it } from "vitest";
import { calculateEmergencyClaim } from "./emergency-claim";
import { calculateOpdClaim, type OpdClaimInput } from "./opd-claim";
import type { OrderEntry } from "../types";

const input: OpdClaimInput = { today: "2026-11-05", nowTime: "23:50", visit: { id: "er:test", name: "架空", age: 76, kind: "初診", department: "救急外来" }, entries: [], rx: [] };
describe("救急の受診の算定", () => {
  it.each([["初診", 1080, 85], ["初診", 1320, 480], ["再診", 1080, 65], ["再診", 1320, 420]] as const)("%s %i分の加算", (kind, arrivedAbs, extra) => {
    const i = { ...input, visit: { ...input.visit, kind } };
    const claim = calculateEmergencyClaim(i, { arrivedAbs });
    expect(claim.totalPoints).toBe(calculateOpdClaim(i).totalPoints + extra);
    expect(claim.issues.some((i) => i.level === "choose" && i.text.includes("入院"))).toBe(true);
    expect(claim.acts.some((a) => a.parts.some((p) => p.lines.some((l) => l.name.includes("救急医療管理"))))).toBe(false);
  });
  it("確定した注射・検体検査・画像を外来と同じ点数で算定する", () => {
    const entry = (order: OrderEntry["order"]): OrderEntry => ({ kind: "order", id: order.type, day: 0, time: "09:00", author: "架空医師", status: "有効", order });
    const i = { ...input, entries: [
      entry({ type: "lab", codes: ["LAB-CRP"], collect: { day: 0, time: "09:10" }, priority: "至急" }),
      entry({ type: "imaging", modality: "X線", region: "R-CHEST", views: ["立位正面（PA）"], purpose: "咳", when: { day: 0, time: "09:30", priority: "至急" }, transport: "独歩" }),
      entry({ type: "injection", items: [{ drugCode: "INJ-NS100", amount: 1, unit: "本" }], route: "点滴静注", start: { day: 0, time: "09:00" }, schedule: { kind: "once" } }),
    ] };
    const claim = calculateEmergencyClaim(i, { arrivedAbs: 600 });
    expect(claim.totalPoints).toBe(calculateOpdClaim(i).totalPoints);
    expect(claim.acts.map((a) => a.shikibetsu)).toEqual(expect.arrayContaining(["33", "60", "70"]));
  });
  it("休日・乳幼児は該当するマスターの点数", () => {
    expect(calculateEmergencyClaim({ ...input, today: "2026-11-08" }, { arrivedAbs: 600 }).totalPoints).toBe(calculateOpdClaim(input).totalPoints + 250);
    const child = { ...input, visit: { ...input.visit, age: 3 } };
    expect(calculateEmergencyClaim(child, { arrivedAbs: 1320 }).totalPoints).toBe(calculateOpdClaim(child).totalPoints + 695);
  });
  it("入院済みの受診はオーダーがあっても外来では0点", () => {
    const claim = calculateEmergencyClaim(input, { arrivedAbs: 1320, admittedAs: "ward1" });
    expect(claim.totalPoints).toBe(0);
    expect(claim.acts).toEqual([]);
  });
});
