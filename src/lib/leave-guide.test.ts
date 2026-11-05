import { describe, expect, it } from "vitest";
import { checkDraft, isReady, newProcedureDraft, type CheckContext, type ProcedureDraft } from "./drafts";
import { draftLine } from "./draft-line";
import type { LeaveOrder } from "./types";

const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "08:30", fmtDay: (d) => `D${d}`, describe: (o) => o.id };
const leave = (l: LeaveOrder): ProcedureDraft => ({ ...newProcedureDraft("PROC-LEAVE", "l"), leave: l, schedule: { kind: "once" }, start: { day: l.from.day, time: l.from.time } });

describe("退院・外泊・外出と指導の依頼", () => {
  it("needs a time to come back for 外泊, and it must be after leaving", () => {
    expect(checkDraft(leave({ kind: "外泊", from: { day: 1, time: "10:00" }, destination: "自宅", note: "" }), ctx).find((i) => i.key === "leave")!.level).toBe("stop");
    expect(checkDraft(leave({ kind: "外泊", from: { day: 1, time: "10:00" }, back: { day: 1, time: "09:00" }, destination: "自宅", note: "" }), ctx).find((i) => i.key === "leave")!.message).toContain("前です");
    expect(isReady(checkDraft(leave({ kind: "外泊", from: { day: 1, time: "10:00" }, back: { day: 2, time: "17:00" }, destination: "自宅", note: "" }), ctx))).toBe(true);
    expect(isReady(checkDraft(leave({ kind: "退院", from: { day: 1, time: "10:00" }, destination: "自宅", note: "" }), ctx))).toBe(true);
  });
  it("sends guidance to the right profession", () => {
    const d: ProcedureDraft = { ...newProcedureDraft("PROC-GUIDE", "g"), guide: { kind: "栄養食事指導", note: "減塩" }, schedule: { kind: "once" }, start: { day: 0, time: null } };
    expect(checkDraft(d, ctx).find((i) => i.key === "guide")!.message).toContain("管理栄養士");
  });
});

it.each(["退院", "外泊", "外出"] as const)("%sの行は種類を一度だけ表示し申し送りは詳細に残す", (kind) => {
  const d = leave({ kind, from: { day: 1, time: "10:00" }, destination: "自宅", note: "介護タクシー", ...(kind !== "退院" ? { back: { day: 2, time: "17:00" } } : {}) });
  const line = draftLine(d, ctx);
  expect(line).toBe(`${kind} D1 10:00${kind !== "退院" ? "〜D2 17:00" : ""} 自宅`);
  expect(d.leave?.note).toBe("介護タクシー");
});
