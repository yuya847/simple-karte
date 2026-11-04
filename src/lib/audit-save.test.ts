import { describe, expect, it } from "vitest";
import { AUDIT_KEEP, auditForSave, auditLog, auditRestore, auditSnapshot, type AuditEvent } from "./audit";

const ev = (seq: number, action = "確定（記事）"): AuditEvent => ({ seq, at: "09:00:00", date: "2026-11-04", role: "看護師", actor: "看護師 佐藤", action, patient: "架空 花子" });

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

  it("puts the saved events first and continues the numbers of this page's events, once", () => {
    // Logged before the saved records came back (the role chosen when the page opened).
    auditLog({ role: "医師", actor: "山本（専攻医）", action: "職種を選んで入った（デモではログインの代わり）" });
    auditRestore([ev(2, "確定（オーダ）"), ev(1), { seq: 3, at: "x", role: "誰か", actor: "?", action: "?" }, "壊れた行"]);
    const after = auditSnapshot();
    expect(after.map((e) => [e.seq, e.action])).toEqual([
      [1, "確定（記事）"],
      [2, "確定（オーダ）"],
      [3, "職種を選んで入った（デモではログインの代わり）"],
    ]);
    // New events go on after them.
    auditLog({ role: "医師", actor: "山本（専攻医）", action: "確定（オーダ）" });
    expect(auditSnapshot().at(-1)!.seq).toBe(4);
    // Read back only once: a second call changes nothing.
    auditRestore([ev(9)]);
    expect(auditSnapshot()).toHaveLength(4);
  });
});
