import { describe, expect, it, vi } from "vitest";
import { standingLineActions } from "./standing-actions";
import type { StandingLine } from "./standing-lines";

const line: StandingLine = { id: "a", cat: "安静", text: "ベッド上", start: { day: -1 }, at: { day: -1, time: "10:00" }, by: "架空 医師" };
function setup(blocked = false) {
  let state: Record<string, StandingLine[]> = { p: [line] };
  const chartNote = vi.fn();
  const actions = standingLineActions({ lines: state, setLines: (next) => { state = typeof next === "function" ? next(state) : next; }, me: { name: "架空 医師", role: "医師" }, nowTime: "13:20", fmtDay: (d) => `11/${5 + d}`, patientName: () => "架空 花子", chartNote, draftNote: vi.fn(), blocked });
  return { ...actions, chartNote, state: () => state };
}
describe("指示の確定と経過への記録", () => {
  it("変更の確定で前後と理由を記事に残し、中止にしない", () => {
    const app = setup();
    app.addStandingLine("p", { ...line, id: "draft", text: "車いす", start: { day: 0, time: "13:20" }, at: { day: 0, time: "13:20" }, changedFrom: "a", changeReason: "離床" });
    expect(app.state().p).toHaveLength(2);
    expect(app.state().p[0].stop).toBeUndefined();
    expect(app.state().p[1].id).not.toBe("draft");
    expect(app.chartNote).toHaveBeenCalledWith("p", expect.stringContaining("指示を変更：安静：ベッド上 → 車いす（理由：離床）"), "指示簿");
  });
  it("終了日を変えて確定でき、無効な日付では記事を作らない", () => {
    const app = setup();
    app.stopStandingLine("p", "a", "完了", 1, "終了");
    expect(app.state().p[0].stop).toMatchObject({ day: 1, kind: "終了", reason: "完了" });
    expect(app.chartNote).toHaveBeenCalledWith("p", expect.stringContaining("終了：安静：ベッド上 11/6 13:20"), "指示簿");
    const bad = setup();
    bad.stopStandingLine("p", "a", "", -2, "終了");
    expect(bad.chartNote).not.toHaveBeenCalled();
  });
  it("一括終了は同じ経路に入り、権限がなければ記録しない", () => {
    const app = setup();
    app.bulkStopStandingLines("p", { ids: ["a", "a", "missing"], day: 0, reason: "完了", kind: "終了" });
    expect(app.state().p[0].stop?.kind).toBe("終了");
    expect(app.chartNote).toHaveBeenCalledTimes(1);
    const denied = setup(true);
    denied.stopStandingLine("p", "a", "", 0, "終了");
    denied.bulkStopStandingLines("p", { ids: ["a"], day: 0, reason: "" });
    denied.addStandingLine("p", line);
    expect(denied.state().p).toEqual([line]);
    expect(denied.chartNote).not.toHaveBeenCalled();
  });
});

it("終了日変更も経過に変更前後の日付と理由を記録する", () => {
  const app = setup();
  app.addStandingLine("p", { ...line, start: { day: 0, time: "13:20" }, at: { day: 0, time: "13:20" }, end: { day: 3 }, changedFrom: line.id, changeReason: "予定を変更" });
  expect(app.state().p[1].end).toEqual({ day: 3 });
  expect(app.chartNote).toHaveBeenCalledWith("p", expect.stringContaining("終了日：変えるまで → 11/8"), "指示簿");
  expect(app.chartNote).toHaveBeenCalledWith("p", expect.stringContaining("理由：予定を変更"), "指示簿");
});
