import { describe, expect, it } from "vitest";
import { activeCount, choicesOf, EMPTY_FILTER, flagKey, matches, type FilterFacts } from "./patient-filter";
import { briefOf, periodNote, rangesText, type DpcBrief } from "./dpc-brief";
import type { DpcMonthView } from "./billing/dpc-claim";

const row = (over: Partial<FilterFacts> = {}): FilterFacts => ({ floor: "5階東", department: "総合診療科", doctor: "山本（専攻医）", nurse: "看護師 佐藤", day: 6, dpc: "Ⅱ", flags: ["未確認の結果", "酸素"], mine: true, discharge: false, ...over });

describe("入院患者一覧の条件", () => {
  it("matches every condition that is set, and everything when none is", () => {
    expect(matches(row(), EMPTY_FILTER)).toBe(true);
    expect(matches(row(), { ...EMPTY_FILTER, floor: "6階東" })).toBe(false);
    expect(matches(row(), { ...EMPTY_FILTER, department: "総合診療科", dpc: "Ⅱ", days: "7" })).toBe(true);
    expect(matches(row({ day: 8 }), { ...EMPTY_FILTER, days: "7" })).toBe(false);
    expect(matches(row({ day: 8 }), { ...EMPTY_FILTER, days: "14" })).toBe(true);
    expect(matches(row({ day: null }), { ...EMPTY_FILTER, days: "31" })).toBe(false);
  });

  it("DPC なし picks the rows without a period", () => {
    expect(matches(row({ dpc: null }), { ...EMPTY_FILTER, dpc: "なし" })).toBe(true);
    expect(matches(row(), { ...EMPTY_FILTER, dpc: "なし" })).toBe(false);
  });

  it("marks, own team and planned discharge", () => {
    expect(matches(row(), { ...EMPTY_FILTER, flag: "酸素" })).toBe(true);
    expect(matches(row(), { ...EMPTY_FILTER, flag: "DNAR" })).toBe(false);
    expect(matches(row({ mine: false }), { ...EMPTY_FILTER, mine: true })).toBe(false);
    expect(matches(row({ discharge: true }), { ...EMPTY_FILTER, discharge: true })).toBe(true);
  });

  it("drops counts from mark labels so they can be chosen as one", () => {
    expect(flagKey("未確認の結果 2")).toBe("未確認の結果");
    expect(flagKey("指示受けがまだ 3")).toBe("指示受けがまだ");
    expect(flagKey("酸素 2L")).toBe("酸素");
    expect(flagKey("NEWS2 7")).toBe("NEWS2");
    expect(flagKey("DNAR")).toBe("DNAR");
    expect(flagKey("身体的拘束中 12時間40分")).toBe("身体的拘束中");
    expect(flagKey("水分制限 1,000mL/日")).toBe("水分制限");
    expect(flagKey("アレルギー NSAIDs（喘息発作）")).toBe("アレルギー NSAIDs（喘息発作）");
  });

  it("offers the values present, and counts the conditions set", () => {
    const c = choicesOf([row(), row({ floor: "6階東", department: "循環器内科", flags: ["DNAR"] })]);
    expect(c.floors).toEqual(["5階東", "6階東"]);
    expect(c.flags).toEqual(["DNAR", "酸素", "未確認の結果"]);
    expect(activeCount({ ...EMPTY_FILTER, floor: "5階東", mine: true })).toBe(2);
  });
});

describe("DPC の入院期間（一覧）", () => {
  const view = (period: "Ⅰ" | "Ⅱ" | "Ⅲ" | "超え", hd: number, by: "doctor" | "default" = "default") =>
    ({
      now: { hospitalDay: hd, period, points: null },
      chosen: { id: "d", label: "x", icd10: "L031", by },
      outcome: { ok: true, d: { code: "0801xx", hokatsu: true, row: { days: [4, 9, 30], points: [1, 2, 3] }, cls: { name: "蜂窩織炎" } } },
    }) as unknown as DpcMonthView;
  const ok = (b: DpcBrief) => {
    if (!b.ok) throw new Error(b.reason);
    return b;
  };

  it("says which period today is in and the days to the next", () => {
    expect(periodNote(ok(briefOf(view("Ⅰ", 2))))).toBe("Ⅱまであと3日");
    expect(periodNote(ok(briefOf(view("Ⅱ", 6))))).toBe("Ⅲまであと4日");
    expect(periodNote(ok(briefOf(view("Ⅲ", 30))))).toBe("期間を超えるまであと1日");
    expect(periodNote(ok(briefOf(view("超え", 31))))).toBe("期間超え（出来高）");
    expect(rangesText([4, 9, 30])).toBe("Ⅰ 1〜4日・Ⅱ 5〜9日・Ⅲ 10〜30日");
  });

  it("is provisional until the doctor chooses the diagnosis", () => {
    expect(ok(briefOf(view("Ⅰ", 2))).provisional).toBe(true);
    expect(ok(briefOf(view("Ⅰ", 2, "doctor"))).provisional).toBe(false);
  });

  it("gives the reason when there is no code", () => {
    expect(briefOf({ outcome: null } as unknown as DpcMonthView)).toEqual({ ok: false, reason: "ICD-10 の付いた病名がない" });
  });
});
