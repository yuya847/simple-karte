import { describe, expect, it } from "vitest";
import { emptySections, type DischargeDraft } from "./discharge";
import { PAST_SUMMARIES, approve, approveDeny, confirmSummary, dueDay, lastMonthRate, sendBack, summaryRows, summaryState } from "./summary-approval";

const draft = (over: Partial<DischargeDraft> = {}): DischargeDraft => ({ patientId: "p1", dischargeDay: 0, destination: "自宅", outcome: "1", route: "1", sections: { ...emptySections(), course: "軽快" }, status: "作成中", letter: { to: "", dept: "", doctor: "", purpose: "" }, ...over });
const at = { day: 0, time: "10:00" };
const yam = "山本（専攻医）";

describe("退院時サマリーの承認", () => {
  it("works out the state from the record", () => {
    expect(summaryState(undefined)).toBe("未作成");
    expect(summaryState(draft())).toBe("作成中");
    expect(summaryState(confirmSummary(draft(), yam, at))).toBe("承認待ち");
    expect(summaryState(approve(confirmSummary(draft(), yam, at), "指導医 高橋", at))).toBe("承認済");
    expect(summaryState(sendBack(confirmSummary(draft(), yam, at), "指導医 高橋", at, "経過を足す"))).toBe("差し戻し");
  });

  it("lets the team's 指導医 approve, never the writer (架空の病院の取り決め)", () => {
    const d = confirmSummary(draft(), yam, at);
    expect(approveDeny("指導医 高橋", d, yam)).toBeNull();
    expect(approveDeny(yam, d, yam)).toBe("自分が書いたサマリーは承認できません。");
    expect(approveDeny("研修医 田中", d, yam)).toBe("承認するのは同じチームの指導医です。");
    expect(approveDeny("木下（総合診療科 B）", d, yam)).toBe("承認するのは主治医のチームの指導医です。");
    expect(approveDeny("指導医 高橋", draft(), yam)).toBe("まだ確定されていません。");
  });

  it("lets the 上級医 approve a 研修医's summary too", () => {
    const d = confirmSummary(draft(), "研修医 田中", at);
    expect(approveDeny(yam, d, yam)).toBeNull();
    expect(approveDeny("指導医 高橋", d, yam)).toBeNull();
  });

  it("approves a 指導医's own summary when it is confirmed", () => {
    const d = confirmSummary(draft(), "指導医 高橋", at);
    expect(summaryState(d)).toBe("承認済");
    expect(approveDeny(yam, d, yam)).toBe("承認済みです。");
  });

  it("sends back as 作成中 with the comment, and confirming again clears it", () => {
    const back = sendBack(confirmSummary(draft(), yam, at), "指導医 高橋", at, "退院後の方針を書き足す");
    expect(back.status).toBe("作成中");
    expect(back.returned?.comment).toBe("退院後の方針を書き足す");
    const again = confirmSummary(back, yam, { day: 0, time: "11:00" });
    expect(again.returned).toBeUndefined();
    expect(summaryState(again)).toBe("承認待ち");
  });

  it("counts the deadline from the day after discharge (14 days, 施設基準)", () => {
    expect(dueDay(-3)).toBe(11);
    const rows = summaryRows([{ id: "p1", name: "佐倉 修", department: "総合診療科", attending: yam, dischargedAt: { day: -15 } }], {}, []);
    expect(rows[0]).toMatchObject({ state: "未作成", due: -1, left: -1, late: true, chart: true });
    const inTime = summaryRows([{ id: "p1", name: "佐倉 修", department: "総合診療科", attending: yam, dischargedAt: { day: -14 } }], {}, []);
    expect(inTime[0]).toMatchObject({ due: 0, left: 0, late: false });
  });

  it("lists patients discharged and those with a confirmed summary before discharge, late ones first", () => {
    const people = [
      { id: "a", name: "A", department: "総合診療科", attending: yam },
      { id: "b", name: "B", department: "総合診療科", attending: yam },
      { id: "c", name: "C", department: "総合診療科", attending: yam, dischargedAt: { day: 0 } },
    ];
    const rows = summaryRows(people, { a: draft({ patientId: "a" }), b: confirmSummary(draft({ patientId: "b", dischargeDay: 1 }), yam, at) }, [{ id: "x", name: "X", department: "総合診療科", attending: yam, dischargeDay: -20 }]);
    expect(rows.map((r) => r.id)).toEqual(["x", "c", "b"]);
    expect(rows.find((r) => r.id === "x")).toMatchObject({ chart: false, late: true });
  });

  it("counts last month's discharges submitted within 14 days, as the 施設基準 counts them", () => {
    const today = { y: 2026, m: 11, d: 4 };
    // 10月: offsets −34 (10/1) … −4 (10/31).
    const rows = summaryRows([], {}, [
      { id: "1", name: "", department: "", attending: yam, dischargeDay: -30, record: { status: "確定", confirmedBy: yam, approval: { by: "指導医 高橋", at: { day: -20, time: "10:00" } } } },
      { id: "2", name: "", department: "", attending: yam, dischargeDay: -30, record: { status: "確定", confirmedBy: yam, approval: { by: "指導医 高橋", at: { day: -10, time: "10:00" } } } },
      { id: "3", name: "", department: "", attending: yam, dischargeDay: -5 },
      { id: "4", name: "", department: "", attending: yam, dischargeDay: -2 },
    ]);
    expect(lastMonthRate(rows, today)).toEqual({ label: "2026年10月", discharges: 3, onTime: 1, late: 1, open: 1, percent: 33.3 });
    expect(lastMonthRate([], today).percent).toBeNull();
  });

  it("has a fictional past record with every state", () => {
    const states = new Set(summaryRows([], {}, PAST_SUMMARIES).map((r) => r.state));
    expect([...states].sort()).toEqual(["作成中", "差し戻し", "承認待ち", "承認済", "未作成"].sort());
  });
});
