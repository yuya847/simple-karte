import { describe, expect, it } from "vitest";
import { callState, dutyShiftAt, onDuty, passOn, PASS_ON_SECONDS, type NurseCall } from "./phs";

describe("院内連絡", () => {
  it("knows who is on duty by the clock and the day", () => {
    expect(dutyShiftAt(9 * 60)).toBe("日勤");
    expect(dutyShiftAt(17 * 60)).toBe("夜勤");
    expect(onDuty(10 * 60, false)[0].role).toBe("病棟の医師");
    expect(onDuty(22 * 60, false)[0].role).toBe("当直医");
    expect(onDuty(10 * 60, true)[0].role).toBe("当直医");
    expect(onDuty(22 * 60, false).some((c) => c.role === "管理当直")).toBe(true);
  });
  it("passes an unanswered call on to the leader once, with the reason", () => {
    const c: NurseCall = { id: "c", patientId: "p", room: "512", bed: "", at: "22:00", ms: 0, to: "看護師 伊藤" };
    expect(passOn(c, (PASS_ON_SECONDS - 1) * 1000, "看護師 渡辺", "22:01").passedOn).toBeUndefined();
    const p = passOn(c, PASS_ON_SECONDS * 1000, "看護師 渡辺", "22:01");
    expect(p.passedOn).toMatchObject({ to: "看護師 渡辺" });
    expect(passOn({ ...c, answered: { at: "22:00", by: "看護師 伊藤" } }, 999999, "看護師 渡辺", "22:05").passedOn).toBeUndefined();
    expect(callState(p)).toBe("呼出中");
    // The leader's own patient: to everyone.
    expect(passOn({ ...c, to: "看護師 渡辺" }, PASS_ON_SECONDS * 1000, "看護師 渡辺", "22:01").passedOn?.to).toBe("病棟の看護師全員（一斉）");
    expect(callState({ ...p, arrived: { at: "22:02", by: "x" } })).toBe("訪室");
  });
});
