import { describe, expect, it } from "vitest";
import { WARD_CHART_PATIENTS } from "./ward-charts";
import { HEAD_NURSE, MID_INTERVAL, SUMMARY_RULES, SUMMARY_SOURCES, approve, initialSummaries, lastReturn, midDue, midDueList, resubmit, returnWith, stateOf, submit, type NurseSummary, type Result } from "./nursing-summary";

const v = (by: string, day: number, words = "") => ({ sections: [{ heading: "病名", lines: ["肺炎"] }], words, to: "訪問看護（在宅）" as const, by, at: { day, time: "15:00" } });
const ok = (r: Result): NurseSummary => {
  if (!r.ok) throw new Error(r.error);
  return r.summary;
};

describe("提出・承認・差し戻し", () => {
  it("is waiting for the 看護師長 once handed in", () => {
    const s = submit("s1", "p1", "退院・転院時", v("看護師 佐藤", 0));
    expect(stateOf(s)).toBe("承認待ち");
    expect(s.events).toEqual([{ kind: "提出", by: "看護師 佐藤", at: { day: 0, time: "15:00" } }]);
  });

  it("the writer cannot approve their own summary", () => {
    const s = submit("s1", "p1", "退院・転院時", v(HEAD_NURSE, 0));
    expect(approve(s, HEAD_NURSE, { day: 0, time: "16:00" })).toEqual({ ok: false, error: "書いた本人は承認・差し戻しできません。" });
  });

  it("a return needs a comment; the writer corrects and hands in again; then it is approved, every version kept", () => {
    const s = submit("s1", "p1", "退院・転院時", v("看護師 佐藤", 0, "初版"));
    const noComment = returnWith(s, HEAD_NURSE, { day: 0, time: "16:00" }, "  ");
    expect(noComment.ok).toBe(false);
    const back = ok(returnWith(s, HEAD_NURSE, { day: 0, time: "16:00" }, "ADL の記載を足してください"));
    expect(stateOf(back)).toBe("差し戻し");
    expect(lastReturn(back)?.comment).toBe("ADL の記載を足してください");
    // A returned summary cannot be approved before it is handed in again.
    expect(approve(back, HEAD_NURSE, { day: 0, time: "16:05" }).ok).toBe(false);
    const again = ok(resubmit(back, v("看護師 佐藤", 0, "第2版")));
    expect(stateOf(again)).toBe("承認待ち");
    const done = ok(approve(again, HEAD_NURSE, { day: 0, time: "17:00" }));
    expect(stateOf(done)).toBe("承認済み");
    expect(done.versions.map((x) => x.words)).toEqual(["初版", "第2版"]);
    expect(done.events.map((e) => e.kind)).toEqual(["提出", "差し戻し", "再提出", "承認"]);
    // Nothing more once approved.
    expect(resubmit(done, v("看護師 佐藤", 0)).ok).toBe(false);
    expect(returnWith(done, HEAD_NURSE, { day: 0, time: "17:10" }, "x").ok).toBe(false);
  });

  it("cites the guideline on recording who confirmed when, and labels the hospital's own rules", () => {
    expect(SUMMARY_SOURCES.confirm.label).toContain("確定者");
    expect(SUMMARY_RULES.approve).not.toContain("架空の病院の取り決め");
    expect(SUMMARY_RULES.mid).not.toContain("架空の病院の取り決め");
    expect(HEAD_NURSE).toBe("看護師長 小松");
  });
});

describe("中間サマリの期限", () => {
  it("is due on day 14 of the stay, then 14 days after the last one", () => {
    // Admitted 10 days ago: day 14 is 3 days from now.
    expect(midDue("p", -10, [])).toMatchObject({ dueOn: 3, stayDay: 14, state: "まだ先" });
    expect(midDue("p", -13, []).state).toBe("今日まで");
    expect(midDue("p", -20, []).state).toBe("期限切れ");
    const mid = submit("m", "p", "中間", v("看護師 佐藤", -7));
    expect(midDue("p", -20, [mid])).toMatchObject({ dueOn: -7 + MID_INTERVAL, stayDay: 28, state: "まだ先" });
    // Another kind of summary does not count.
    expect(midDue("p", -20, [submit("x", "p", "転棟時", v("看護師 佐藤", -1))]).state).toBe("期限切れ");
  });

  it("lists the patients due soon or overdue, overdue first", () => {
    const list = midDueList([{ id: "a", admittedOn: -2 }, { id: "b", admittedOn: -20 }, { id: "c", admittedOn: -12 }], []);
    expect(list.map((d) => d.patientId)).toEqual(["b", "c"]);
  });

  it("the fictional 中間サマリ belongs to a 5階東 patient and waits for the 看護師長", () => {
    const [s] = initialSummaries();
    const p = WARD_CHART_PATIENTS.find((x) => x.id === s.patientId)!;
    expect(p.name).toBe("菅原 洋子");
    expect(stateOf(s)).toBe("承認待ち");
    expect(midDue(p.id, p.admittedOn, [s]).state).toBe("まだ先");
  });
});
