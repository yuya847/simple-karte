import { describe, expect, it } from "vitest";
import { INITIAL_RESTRAINTS, activeOf, durationText, emptyRestraint, minutesOf, reviewDue, startProblems } from "./restraint";

const at = (h: number, m = 0) => h * 60 + m; // today, minutes

describe("身体的拘束", () => {
  it("asks for everything the rules want recorded, and the three conditions", () => {
    expect(startProblems(emptyRestraint("山本（専攻医）"))).toEqual(["用具", "緊急やむを得ない理由", "患者の心身の状況", "切迫性", "非代替性", "一時性", "試した代わりの方法", "一緒に確かめた人"]);
  });

  it("counts the time and says when the shift review is due", () => {
    const r = INITIAL_RESTRAINTS[0]; // 昨日 22:00 から、今日 06:00 に見直し
    expect(durationText(minutesOf(r, at(10)))).toBe("12時間");
    expect(reviewDue(r, at(10))).toMatchObject({ late: false, text: "次の見直しまで4時間" });
    expect(reviewDue(r, at(14, 30))).toMatchObject({ late: true, text: "見直しの時間を30分過ぎています" });
  });

  it("is no longer active once ended", () => {
    const ended = { ...INITIAL_RESTRAINTS[0], end: { at: { day: 0, time: "08:00" }, by: "看護師 渡辺", note: "落ち着いている" } };
    expect(activeOf([ended], "90010244")).toBeUndefined();
    expect(minutesOf(ended, at(12))).toBe(600);
    expect(reviewDue(ended, at(12))).toBeNull();
  });
});
