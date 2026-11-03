import { describe, expect, it } from "vitest";
import { ALL_NURSES, callCounts, callState, callTarget, dutyShiftAt, evacuation, onDuty, PASS_ON_SECONDS, slide, teamOf, type NurseCall } from "./phs";

describe("院内連絡", () => {
  it("knows who is on duty by the clock and the day", () => {
    expect(dutyShiftAt(9 * 60)).toBe("日勤");
    expect(dutyShiftAt(17 * 60)).toBe("夜勤");
    expect(onDuty(10 * 60, false)[0].role).toBe("病棟の医師");
    expect(onDuty(22 * 60, false)[0].role).toBe("当直医");
    expect(onDuty(10 * 60, true)[0].role).toBe("当直医");
    expect(onDuty(22 * 60, false).some((c) => c.role === "管理当直")).toBe(true);
  });
  it("slides an unanswered call: team, leader, everyone — one step each 60 seconds", () => {
    const c: NurseCall = { id: "c", kind: "通常", patientId: "p", room: "512", bed: "", at: "22:00", ms: 0, to: "看護師 伊藤", slides: [] };
    const team = "B チームの看護師";
    expect(slide(c, (PASS_ON_SECONDS - 1) * 1000, team, "看護師 渡辺", "22:00").slides).toHaveLength(0);
    const one = slide(c, PASS_ON_SECONDS * 1000, team, "看護師 渡辺", "22:01");
    expect(one.slides.map((x) => x.to)).toEqual([team]);
    expect(callTarget(one)).toBe(team);
    const three = slide(one, PASS_ON_SECONDS * 3000 + 5, team, "看護師 渡辺", "22:03");
    expect(three.slides.map((x) => x.to)).toEqual([team, "看護師 渡辺", ALL_NURSES]);
    // Each step names who did not answer before it, also when several steps come at once.
    const late = slide(c, PASS_ON_SECONDS * 3000 + 5, team, "看護師 渡辺", "22:03");
    expect(late.slides.map((x) => x.why.split("が")[0])).toEqual(["看護師 伊藤", team, "看護師 渡辺"]);
    expect(slide({ ...c, answered: { at: "22:00", by: "x" } }, 999999, team, "看護師 渡辺", "22:05").slides).toHaveLength(0);
    // The leader's own patient skips the leader.
    expect(slide({ ...c, to: "看護師 渡辺" }, PASS_ON_SECONDS * 3000, team, "看護師 渡辺", "22:03").slides.map((x) => x.to)).toEqual([team, ALL_NURSES]);
    expect(callState(one)).toBe("呼出中");
  });
  it("counts calls by kind and fire evacuation by 救護区分", () => {
    const base: NurseCall = { id: "a", kind: "トイレ", patientId: "p", room: "512", bed: "", at: "22:00", ms: 0, to: "x", slides: [] };
    expect(callCounts([base, { ...base, id: "b", answered: { at: "22:02", by: "x" } }, { ...base, id: "c", kind: "離床センサー" }])).toEqual([
      { kind: "トイレ", n: 2, avgAnswerMin: 2 },
      { kind: "離床センサー", n: 1, avgAnswerMin: null },
    ]);
    const ev = evacuation([{ id: "1", name: "a", room: "501" }, { id: "2", name: "b", room: "502" }, { id: "3", name: "c", room: "503" }], { "1": { rescue: "担送", sensors: [] }, "2": { rescue: "独歩", sensors: [] } });
    expect([ev.carry.length, ev.escort.length, ev.unknown.length]).toEqual([1, 0, 1]);
    expect(teamOf("515B")).toBe("B");
  });
});
