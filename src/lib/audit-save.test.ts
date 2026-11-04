import { describe, expect, it } from "vitest";
import { AUDIT_KEEP, auditForSave, auditLog, auditRestore, auditSnapshot, type AuditEvent } from "./audit";

const ev = (seq: number, action = "確定（記事）"): AuditEvent => ({ seq, at: "09:00:00", date: "2026-01-05", role: "看護師", actor: "看護師 佐藤", action, patient: "架空 花子" });

describe("監査ログの保存", () => {
  it("saves only the newest AUDIT_KEEP events, and the same array when there are fewer", () => {
    const few = [ev(1), ev(2)];
    expect(auditForSave(few)).toBe(few);
    const many = Array.from({ length: AUDIT_KEEP + 5 }, (_, i) => ev(i + 1));
    const kept = auditForSave(many);
    expect(kept).toHaveLength(AUDIT_KEEP);
    expect(kept[0].seq).toBe(6);
    expect(kept.at(-1)!.seq).toBe(AUDIT_KEEP + 5);
  });

  it("merges the saved events with this page's own, in the order they happened, numbered again", () => {
    // Logged before the saved records came back (a chart opened when the page opened).
    auditLog({ role: "医師", actor: "山本（専攻医）", action: "カルテを開いた" });
    const mine = auditSnapshot()[0];
    auditRestore([ev(2, "確定（オーダ）"), ev(1), { seq: 3, at: "x", role: "誰か", actor: "?", action: "?" }, "壊れた行"]);
    const after = auditSnapshot();
    // The saved ones were at 09:00 on an earlier date than this page's event, logged now.
    expect(after.map((e) => [e.seq, e.action])).toEqual([
      [1, "確定（記事）"],
      [2, "確定（オーダ）"],
      [3, "カルテを開いた"],
    ]);
    // New events go on after them.
    auditLog({ role: "医師", actor: "山本（専攻医）", action: "確定（オーダ）" });
    expect(auditSnapshot().at(-1)!.seq).toBe(4);
    // Read again (another tab saved): the same events are not doubled, a new one comes in at its time.
    auditRestore([ev(1), ev(2, "確定（オーダ）"), { ...ev(3, "確定（記事）"), at: "09:30:00", actor: "看護師 田中" }, { ...mine, seq: 4 }]);
    const again = auditSnapshot();
    expect(again).toHaveLength(5);
    expect(again.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(again[2].actor).toBe("看護師 田中");
  });
});
