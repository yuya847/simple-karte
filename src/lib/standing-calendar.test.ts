import { describe, expect, it } from "vitest";
import { dragEnd, effectiveEnd, lineEffective, periodText, standingStopDraft } from "./standing-calendar";
import { barCell, calendarRows, lineChanges, linesFromFields, stopLine, type StandingLine } from "./standing-lines";
import { emptyStanding, standingEffective } from "./standing";
import { worksheetPrnLines } from "./standing-form";
import type { WorkPatient } from "./worksheet";

const l: StandingLine = { id: "a", cat: "頓用", text: "医師へ連絡", start: { day: -2 }, end: { day: 2 }, at: { day: 0, time: "09:00" }, by: "架空 医師" };
const person = { patient: { id: "p", name: "架空 花子" }, room: "501", entries: [] } as unknown as WorkPatient;
describe("指示の期間と一括中止", () => {
  it("開始日と終了日を含み、期間外を除外する", () => {
    expect(lineEffective(l, -3)).toBe(false);
    expect(lineEffective(l, -2, "00:00")).toBe(true);
    expect(lineEffective(l, 2, "23:59")).toBe(true);
    expect(lineEffective(l, 3)).toBe(false);
    expect(periodText(l, String)).toBe("有効：-2 〜 2");
    expect(periodText({ ...l, end: undefined }, String)).toContain("変えるまで続く");
  });
  it("中止は予定の終了日を延ばさず、中止時刻から読まれない", () => {
    const stopped = { ...l, stop: { day: 1, time: "10:00", by: "架空 医師" } };
    expect(effectiveEnd(stopped)).toBe(1);
    expect(effectiveEnd({ ...stopped, end: { day: 0 } })).toBe(0);
    expect(lineEffective(stopped, 1, "09:59")).toBe(true);
    expect(lineEffective(stopped, 1, "10:00")).toBe(false);
    expect(worksheetPrnLines([stopped], person, 600, {}, new Set())).toHaveLength(1);
  });
  it("分類順に並べ、今日を横切る帯と終了なしの継続を作る", () => {
    expect(calendarRows([l, { ...l, id: "b", cat: "安静" }]).map((g) => g.cat)).toEqual(["安静", "頓用"]);
    expect(barCell(l, 0, 3).on).toBe(true);
    expect(barCell(l, 3, 3).on).toBe(false);
    expect(barCell({ ...l, end: undefined }, 3, 3).continues).toBe(true);
  });
  it("選択の重複・終了済み・中止済み・項目由来・開始前を下書きから外す", () => {
    const lines = [l, { ...l, id: "old", end: { day: -1 } }, { ...l, id: "field", fromFields: true as const }, { ...l, id: "future", start: { day: 1 } }, { ...l, id: "stopped", stop: { day: 0, time: "10:00", by: "医師" } }];
    const draft = standingStopDraft(lines, [...lines.map((x) => x.id), "a", "unknown"], 0, " 理由 ");
    expect(draft).toEqual({ ids: ["a"], day: 0, reason: "理由" });
    expect(lines[0].stop).toBeUndefined();
    const stopped = draft.ids.reduce((all, id) => stopLine(all, id, { day: draft.day, time: "10:00", by: "架空 医師", reason: draft.reason }), lines);
    const changes = lineChanges([person], { p: stopped }, new Set(lines.map((x) => x.id)), 0, 600, String);
    expect(changes.find((c) => c.key === "a|中止")?.text.main).toContain("中止");
    expect(stopped[0].stop?.reason).toBe("理由");
  });
  it("項目指示の期限を帯に反映し、後の変更で延長しない", () => {
    const s = { ...emptyStanding("架空 医師", { day: -3, time: "09:00" }), rest: "病棟内" as const, until: -1 };
    expect(standingEffective(s)).toBeUndefined();
    expect(standingEffective(s, -1)).toBe(s);
    const rows = linesFromFields([s, { ...s, at: { day: 0, time: "09:00" }, rest: null }]);
    expect(rows[0].end?.day).toBe(-1);
  });
  it("予定・期限切れの新規を指示受けに出さず、中止通知は残す", () => {
    expect(lineChanges([person], { p: [{ ...l, start: { day: 1 } }] }, new Set(), 0, 600, String)).toEqual([]);
    expect(lineChanges([person], { p: [{ ...l, end: { day: -1 } }] }, new Set(), 0, 600, String)).toEqual([]);
    expect(worksheetPrnLines([l], person, 3 * 1440, {}, new Set())).toEqual([]);
  });
});

describe("帯の終了日ドラッグ", () => {
  it("延長・短縮・同日を分け、元の指示は変えない", () => {
    expect(dragEnd(l, 3, 0)).toEqual({ kind: "extend", end: 3 });
    expect(dragEnd(l, 1, 0)).toEqual({ kind: "shorten", end: 1 });
    expect(dragEnd(l, 2, 0)).toEqual({ kind: "none", end: 2 });
    expect(l.end).toEqual({ day: 2 });
  });
  it("今日と開始日より前には縮めない", () => {
    expect(dragEnd(l, -4, 0).end).toBe(0);
    expect(dragEnd({ ...l, start: { day: 2 } }, -1, 0).end).toBe(2);
    expect(dragEnd(l, 0, 1).end).toBe(1);
  });
  it("終了なしの帯にも終了日を置き、今日より右なら延長とする", () => {
    expect(dragEnd({ ...l, end: undefined }, 3, 0)).toEqual({ kind: "extend", end: 3 });
    expect(dragEnd({ ...l, end: undefined }, -3, 0)).toEqual({ kind: "shorten", end: 0 });
  });
  it("項目由来と履歴、不正な日付は変えない", () => {
    for (const line of [{ ...l, fromFields: true as const }, { ...l, stop: { day: 0, time: "10:00", by: "医師" } }, { ...l, changed: { day: 0, time: "10:00", by: "医師", toId: "b" } }]) expect(dragEnd(line, 3, 0)).toMatchObject({ kind: "none", problem: expect.any(String) });
    expect(dragEnd(l, NaN, 0).problem).toBeTruthy();
  });
});
