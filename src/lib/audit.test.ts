import { describe, expect, it } from "vitest";
import { aiSummary, auditLog, auditSnapshot } from "./audit";

describe("監査ログ", () => {
  it("is append-only with a running number, and splits AI from people", () => {
    auditLog({ role: "AI", actor: "Claude", action: "下書きを作った", patient: "佐倉", detail: "3件" });
    auditLog({ role: "医師", actor: "山本", action: "確定", patient: "佐倉", detail: "3件" });
    auditLog({ role: "医師", actor: "山本", action: "下書きを消した", patient: "佐倉" });
    const before = auditSnapshot();
    auditLog({ role: "看護師", actor: "看護師", action: "指示受け" });
    const after = auditSnapshot();
    expect(after).not.toBe(before); // a new array: earlier snapshots stay as they were
    expect(before).toHaveLength(3);
    expect(after.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(aiSummary(after)).toEqual({ drafted: 1, confirmed: 1, removed: 1 });
  });
  it("summary counts", () => {
    const list = [
      { seq: 1, at: "", role: "AI" as const, actor: "", action: "下書きを作った" },
      { seq: 2, at: "", role: "医師" as const, actor: "", action: "確定" },
      { seq: 3, at: "", role: "医師" as const, actor: "", action: "下書きを消した" },
    ];
    expect(aiSummary(list)).toEqual({ drafted: 1, confirmed: 1, removed: 1 });
  });
});
