import { describe, expect, it } from "vitest";
import { dayHeading, earlierVisitsTitle, stayKindOf, stayTitle, treeDayTag } from "./stay-labels";

describe("入院か受診か（カルテの種類）", () => {
  it("a ward chart is 入院, the chart of a 救急外来・外来 visit is 受診", () => {
    expect(stayKindOf({ id: "90010231" })).toBe("入院");
    expect(stayKindOf({ id: "er:er-3" })).toBe("受診");
    expect(stayKindOf({ id: "opd:opd-1" })).toBe("受診");
    expect(stayKindOf({ id: "er-3" })).toBe("受診");
  });
});

describe("日付ツリーの言葉", () => {
  it("the top says 今回入院 … 〜 for a stay and 今回の受診 (one day) for a visit", () => {
    expect(stayTitle("入院")).toEqual({ title: "今回入院", dateSuffix: "〜" });
    expect(stayTitle("受診")).toEqual({ title: "今回の受診", dateSuffix: "" });
    expect(earlierVisitsTitle("入院")).toBe("入院前の外来");
    expect(earlierVisitsTitle("受診")).toBe("前の受診");
  });
  it("the day tags count hospital days for a stay, and say 今日 for the visit's day", () => {
    expect(treeDayTag("入院", -3, 0)).toBe("今日");
    expect(treeDayTag("入院", -3, -3)).toBe("1日目");
    expect(treeDayTag("入院", -3, -1)).toBe("3日目");
    expect(treeDayTag("受診", 0, 0)).toBe("今日");
    expect(treeDayTag("受診", 0, 2)).toBe("2日後");
  });
});

describe("日の見出しの言葉", () => {
  it("a stay: 入院N日目 with 今日 / 予定, and 入院のN日前 for a visit before the admission", () => {
    expect(dayHeading("入院", -3, 0)).toBe("入院4日目（今日）");
    expect(dayHeading("入院", -3, -3)).toBe("入院1日目");
    expect(dayHeading("入院", -3, 7, { future: true })).toBe("入院11日目（予定）");
    expect(dayHeading("入院", -3, -5, { earlier: true })).toBe("入院の2日前");
  });
  it("a visit: 受診当日（今日）, 受診のN日後（予定）, and N日前の受診 for an earlier visit — never 入院", () => {
    expect(dayHeading("受診", 0, 0)).toBe("受診当日（今日）");
    expect(dayHeading("受診", 0, 1, { future: true })).toBe("受診の1日後（予定）");
    expect(dayHeading("受診", 0, -14, { earlier: true })).toBe("14日前の受診");
    for (const s of [dayHeading("受診", 0, 0), dayHeading("受診", 0, 3, { future: true }), dayHeading("受診", 0, -14, { earlier: true })]) expect(s).not.toContain("入院");
  });
});
