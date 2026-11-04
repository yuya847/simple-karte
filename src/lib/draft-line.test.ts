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

it("manual markers never become a heading, while actual words and comments remain", async () => {
  const { draftSourceText } = await import("./draft-line");
  for (const text of ["（Rp 入力）", "（マスターから選択）", "（マスターから選択・混注）", ""]) expect(draftSourceText(text)).toBeNull();
  expect(draftSourceText("（Rp 入力）　服用後に確認")).toBe("服用後に確認");
  expect(draftSourceText("（夕食後）に服用")).toBe("（夕食後）に服用");
});

it("内服は1回量・1日の回数と用法・日数・区分の順で1行になる", async () => {
  const { prescriptionUsage } = await import("./draft-line");
  const d: import("./rx").PrescriptionDraft = { id: "rx", kind: "prescription", origin: "manual", sourceText: "（Rp 入力）", comment: null, items: [{ drugCode: "ORAL-APAP500", said: "", daily: 1, perDose: 1 }], timings: ["朝"], days: 7, category: "定期", start: { day: 0, timing: null }, prn: null, maxPerDay: null, acks: [] };
  expect(draftLine(d, ctx, 1)).toContain("内服 Rp1 アセトアミノフェン錠 500mg 1回1錠 1日1回 朝食後 7日分 定期");
  expect(prescriptionUsage(d)).toBe("1日1回 朝食後　7日分");
  expect(prescriptionUsage({ ...d, timings: [], prn: "疼痛時", maxPerDay: 3, days: null })).toBe("頓用 疼痛時（1日3回まで）");
  expect(prescriptionUsage({ ...d, timings: null })).toBe("用法？　7日分");
});
