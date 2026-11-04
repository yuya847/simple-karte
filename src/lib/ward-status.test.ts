import { describe, expect, it } from "vitest";
import { RESCUE } from "./phs";
import {
  PRECAUTIONS,
  RESCUE_KINDS,
  STATUS_RULES,
  STATUS_SOURCES,
  applyToMany,
  changedRows,
  currentShift,
  draftRows,
  inForce,
  lastBefore,
  precautionsFrom,
  shiftBefore,
  shiftKey,
  statusCounts,
  statusIssues,
  type StatusBook,
  type StatusSheet,
} from "./ward-status";

const pts = [
  { id: "a", infections: ["MRSA（血液）"] },
  { id: "b", infections: ["インフルエンザ A 型（飛沫予防策）"], rescue: "担送" as const },
  { id: "c", infections: [] },
];
const sheet = (rows: StatusSheet["rows"], time = "09:00"): StatusSheet => ({ rows, by: "看護師 A", at: { day: 0, time } });

describe("区分と出典", () => {
  it("感染経路別予防策 are the three of the notice; the other categories say they are the hospital's own", () => {
    expect([...PRECAUTIONS]).toEqual(["接触予防策", "飛沫予防策", "空気予防策"]);
    expect(STATUS_SOURCES.precautions.label).toContain("医政地発1219第1号");
    expect(STATUS_SOURCES.precautions.url).toMatch(/^https:\/\/www\.mhlw\.go\.jp\//);
    for (const t of Object.values(STATUS_RULES)) expect(t).toContain("架空の病院の取り決め");
    // The same 救護区分 as the bed information (院内連絡).
    expect(RESCUE_KINDS).toEqual([...RESCUE]);
  });

  it("reads the precaution from the infections as the map does", () => {
    expect(precautionsFrom(["MRSA（血液）"])).toEqual(["接触予防策"]);
    expect(precautionsFrom(["インフルエンザ A 型（飛沫予防策）"])).toEqual(["飛沫予防策"]);
    expect(precautionsFrom([])).toEqual([]);
  });
});

describe("勤務帯", () => {
  it("knows the shift going on now, as the worksheet opens", () => {
    expect(currentShift("07:00")).toEqual({ day: -1, shift: "night" });
    expect(currentShift("08:30")).toEqual({ day: 0, shift: "day" });
    expect(currentShift("16:59")).toEqual({ day: 0, shift: "day" });
    expect(currentShift("17:00")).toEqual({ day: 0, shift: "night" });
  });

  it("knows the shift before", () => {
    expect(shiftBefore(0, "day")).toEqual({ day: -1, shift: "night" });
    expect(shiftBefore(0, "night")).toEqual({ day: 0, shift: "day" });
  });

  it("finds the registration in force and the last one before", () => {
    const book: StatusBook = { [shiftKey(-1, "night")]: [sheet({ a: { severity: "重症", precautions: [] } }, "17:00"), sheet({ a: { severity: "中等症", precautions: [] } }, "18:00")] };
    expect(inForce(book, -1, "night")?.rows.a.severity).toBe("中等症");
    expect(lastBefore(book, 0, "day")?.sheet.rows.a.severity).toBe("中等症");
    expect(lastBefore(book, 0, "night")?.shift).toBe("night");
    expect(lastBefore({}, 0, "day")).toBeUndefined();
  });
});

describe("表の下書き・まとめて入れる・確かめ", () => {
  it("starts from the bed's 救護区分 and the infections, or copies the last registration", () => {
    const rows = draftRows(pts);
    expect(rows.a).toEqual({ rescue: undefined, precautions: ["接触予防策"] });
    expect(rows.b.rescue).toBe("担送");
    const copied = draftRows(pts, sheet({ c: { severity: "軽症", observe: "C", freedom: "4", rescue: "独歩", precautions: [] } }));
    expect(copied.c.severity).toBe("軽症");
    expect(copied.a.precautions).toEqual(["接触予防策"]);
  });

  it("sets a value for the chosen patients only", () => {
    const rows = applyToMany(draftRows(pts), ["a", "c"], { observe: "B", precaution: { kind: "空気予防策", on: true } });
    expect(rows.a.observe).toBe("B");
    expect(rows.a.precautions).toEqual(["接触予防策", "空気予防策"]);
    expect(rows.b.observe).toBeUndefined();
    const off = applyToMany(rows, ["a"], { precaution: { kind: "接触予防策", on: false } });
    expect(off.a.precautions).toEqual(["空気予防策"]);
    // An unset field in the patch leaves the row as it was.
    expect(applyToMany(rows, ["a"], { severity: undefined }).a.observe).toBe("B");
  });

  it("points out empty fields and a precaution the infections show but the row lacks", () => {
    const rows = applyToMany(draftRows(pts), ["a", "b", "c"], { severity: "軽症", observe: "C", freedom: "4", rescue: "独歩" });
    expect(statusIssues(rows, pts)).toEqual([]);
    const off = applyToMany(rows, ["a"], { precaution: { kind: "接触予防策", on: false } });
    expect(statusIssues(off, pts)[0].text).toContain("接触予防策ですが、選ばれていません");
    expect(statusIssues(draftRows(pts), pts)[0].text).toBe("未入力：重症度・観察の程度・生活の自由度・救護区分");
  });

  it("counts a registration and finds what changed", () => {
    const rows = applyToMany(draftRows(pts), ["a", "b"], { severity: "重症", observe: "A", freedom: "1" });
    const c = statusCounts(sheet(rows));
    expect(c.severity.重症).toBe(2);
    expect(c.degree.A1).toBe(2);
    expect(c.precautions.接触予防策).toBe(1);
    expect(c.rescue.担送).toBe(1);
    expect(statusCounts(sheet(rows), ["c"]).total).toBe(1);
    expect(changedRows(rows, sheet(rows))).toEqual([]);
    expect(changedRows(applyToMany(rows, ["c"], { severity: "軽症" }), sheet(rows))).toEqual(["c"]);
  });
});
