import { describe, expect, it } from "vitest";
import { checkDraft, isReady, newProcedureDraft, toOrder, type CheckContext, type ProcedureDraft } from "./drafts";
import { procedureLines } from "./format";

const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "08:30", fmtDay: (d) => `D${d}`, describe: (o) => o.id };
const today = { y: 2026, m: 11, d: 3 };

describe("リハビリ処方・他科依頼", () => {
  it("needs the panel's items, then counts the days from the onset", () => {
    const empty = { ...newProcedureDraft("PROC-REHAB", "r"), schedule: { kind: "per_day" as const, count: 1 } };
    expect(isReady(checkDraft(empty, ctx))).toBe(false);
    const d: ProcedureDraft = { ...empty, rehab: { field: "廃用症候群", therapists: ["PT"], onset: -3, goal: "病棟内歩行の自立", cautions: "" }, start: { day: 1, time: null } };
    const issues = checkDraft(d, ctx);
    expect(issues.find((i) => i.key === "rehab")!.message).toContain("今日で4日目");
    expect(isReady(issues)).toBe(true);
    expect(procedureLines(toOrder(d, ctx).order as never, today).main).toBe("リハビリ処方");
  });

  it("sends a consult with its question", () => {
    const d: ProcedureDraft = { ...newProcedureDraft("PROC-CONSULT", "c"), consult: { dept: "循環器内科", urgency: "通常", question: "心房細動の抗凝固療法" }, schedule: { kind: "once" }, start: { day: 0, time: null } };
    expect(isReady(checkDraft(d, ctx))).toBe(true);
    expect(procedureLines(toOrder(d, ctx).order as never, today).detail).toContain("循環器内科へ（通常）：心房細動の抗凝固療法");
  });
});
