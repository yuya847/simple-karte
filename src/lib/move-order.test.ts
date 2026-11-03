import { describe, expect, it } from "vitest";
import { checkDraft, isReady, newProcedureDraft, toOrder, type CheckContext, type ProcedureDraft } from "./drafts";
import { moveText } from "./procedures";

const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "08:30", fmtDay: (d) => `D${d}`, describe: (o) => o.id };

describe("移動オーダ（転床・転棟・転科）", () => {
  it("books a move for a day and keeps it on the order", () => {
    const d: ProcedureDraft = { ...newProcedureDraft("PROC-MOVE", "m"), move: { kind: "転棟", to: { room: "605", bed: "D" }, reason: "整形外科の病棟へ" }, schedule: { kind: "once" }, start: { day: 2, time: "10:00" } };
    const issues = checkDraft(d, ctx);
    expect(issues.find((i) => i.key === "move")!.message).toContain("D2 10:00 に予約");
    expect(isReady(issues)).toBe(true);
    expect(toOrder(d, ctx).order).toMatchObject({ code: "PROC-MOVE", move: { kind: "転棟", to: { room: "605", bed: "D" } } });
  });
  it("writes a transfer to another department with the new doctor", () => {
    expect(moveText({ kind: "転科", toDept: "循環器内科", toDoctor: "中川（循環器内科）", reason: "心不全" })).toBe("転科 → 循環器内科（主治医 中川（循環器内科））　心不全");
  });
  it("cannot be drafted without the destination", () => {
    expect(isReady(checkDraft({ ...newProcedureDraft("PROC-MOVE", "x"), schedule: { kind: "once" } }, ctx))).toBe(false);
  });
});
