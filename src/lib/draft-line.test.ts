import { describe, expect, it } from "vitest";
import { draftLine } from "./draft-line";
import type { CheckContext, InjectionDraft, LabDraft } from "./drafts";
const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "10:00", fmtDay: () => "11/5（木）", describe: () => "" };
export const injection: InjectionDraft = { id: "d1", origin: "manual", sourceText: "（マスターから選択）", comment: null, kind: "injection", items: [{ drugCode: null, said: "輸液", amount: 1, unit: "本" }], route: "点滴静注", schedule: { kind: "per_day", count: 1 }, infusionMinutes: 300, infusionScope: "per_dose", rateMlPerH: null, prefer: null, start: { day: 0, time: "10:00" }, days: 1, duplicate: null };
describe("draftLine", () => {
  it("uses current values and shared duration formatting without changing the draft", () => {
    const before = JSON.stringify(injection);
    const line = draftLine(injection, ctx, 2);
    expect(line).toContain("注射 Rp2 輸液（？） 1本");
    expect(line).toContain("1回5時間");
    expect(line).toContain("11/5（木） 10:00から");
    expect(line).not.toContain("マスターから選択");
    expect(line).not.toContain("計算");
    expect(JSON.stringify(injection)).toBe(before);
    expect(draftLine({ ...injection, days: 3 }, ctx)).toContain("3日間");
  });
  it("keeps unresolved lab names and collection questions visible", () => {
    const lab: LabDraft = { id: "l", origin: "manual", sourceText: "", comment: null, kind: "lab", tests: [{ code: null, said: "検査名" }], collect: { day: null, when: null, time: null, beforeDose: null }, priority: null, cultureSets: null, duplicateOk: false };
    expect(draftLine(lab, ctx)).toBe("検体検査 検査名（？） 採取日時？");
  });
  it("normalizes dictated newlines to a single logical line", () => {
    expect(draftLine({ id: "u", kind: "unclear", origin: "ai", sourceText: "あ\nい", reason: "不明", comment: null }, ctx)).toBe("聞き取れず あ い（不明）");
  });
});
