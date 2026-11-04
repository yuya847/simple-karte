import { describe, expect, it } from "vitest";
import { ASSIGN_RULES, ASSIGN_SOURCES, assign, assignIssues, assignKey, copyPlan, crewOn, emptySheet, loads, maxLoad, nurseOfBed, planLines, roomNurses, rosterCode, type Bed } from "./assignments";
import { WARD_NURSES, emptyMonth, monthKey, type RosterBook } from "./roster";

const today = { y: 2026, m: 11, d: 4 };
const nurse = (id: string) => WARD_NURSES.find((n) => n.id === id)!;
/** A roster where 田中・伊藤・井上 work the day of the 4th and 渡辺・佐藤 the night. */
function book(): RosterBook {
  const m = emptyMonth(WARD_NURSES, 2026, 11);
  for (const id of ["n-tanaka", "n-ito", "n-inoue"]) m.shifts[id][4] = "日";
  for (const id of ["n-watanabe", "n-sato"]) m.shifts[id][4] = "夜";
  m.shifts["n-sato"][3] = "夜";
  // The night of 10/31 (index 0) runs into 11/1.
  m.shifts["n-goto"][0] = "夜";
  return { nurses: WARD_NURSES, months: { [monthKey(2026, 11)]: m }, census: {}, ngPairs: [] };
}
const beds: Bed[] = [
  { key: "512", patientId: "p1", name: "佐倉" },
  { key: "515B", patientId: "p2", name: "大浦" },
  { key: "508A", patientId: "p3", name: "北村" },
];
const ctx = { by: "看護師長 小松", at: { day: 0, time: "08:40" }, nameOf: (id: string) => nurse(id).name, beds };

describe("出典と取り決め", () => {
  it("cites the notice and labels the hospital's own rules", () => {
    expect(ASSIGN_SOURCES.plan.label).toContain("受け持ち患者割当");
    expect(ASSIGN_SOURCES.post.label).toContain("掲示");
    for (const t of Object.values(ASSIGN_RULES)) expect(t).toContain("架空の病院の取り決め");
    expect(assignKey("5階東病棟", 0, "day")).toBe("5階東病棟|0|day");
  });
});

describe("勤務表からその勤務帯の看護師", () => {
  it("lists the day and night crews of a date", () => {
    expect(crewOn(book(), today, 0, "day").map((n) => n.id)).toEqual(["n-tanaka", "n-ito", "n-inoue"]);
    expect(crewOn(book(), today, 0, "night").map((n) => n.id)).toEqual(["n-watanabe", "n-sato"]);
    expect(crewOn(book(), today, -1, "night").map((n) => n.id)).toEqual(["n-sato"]);
    // A month not in the book has nobody.
    expect(crewOn(book(), today, 30, "day")).toEqual([]);
  });

  it("reads the last day of the month before from the month's index 0", () => {
    expect(rosterCode(book(), "n-goto", { y: 2026, m: 10, d: 31 })).toBe("夜");
    expect(rosterCode(book(), "n-goto", { y: 2026, m: 10, d: 30 })).toBe("");
  });
});

describe("割り当てと記録", () => {
  it("is a draft until confirmed; after that each change is logged with the reason", () => {
    let s = assign(emptySheet(), ["512", "515B"], "n-tanaka", ctx);
    s = assign(s, ["508A"], "n-ito", ctx);
    expect(s.changes).toEqual([]);
    s = { ...s, confirmed: { by: "看護師長 小松", at: { day: 0, time: "08:45" } } };
    s = assign(s, ["515B"], "n-ito", { ...ctx, at: { day: 0, time: "11:00" }, reason: "田中が急変対応" });
    expect(s.beds["515B"]).toBe("n-ito");
    expect(s.changes).toEqual([{ at: { day: 0, time: "11:00" }, by: "看護師長 小松", bed: "515B", patient: "大浦", from: "看護師 田中", to: "看護師 伊藤", reason: "田中が急変対応" }]);
    // Assigning the same nurse again changes nothing.
    expect(assign(s, ["515B"], "n-ito", ctx).changes.length).toBe(1);
    // Taking a bed off.
    expect(assign(s, ["508A"], null, { ...ctx, reason: "x" }).beds["508A"]).toBeUndefined();
  });

  it("counts each nurse's patients and the most (for the notice to post)", () => {
    const crew = crewOn(book(), today, 0, "day");
    const s = assign(assign(emptySheet(), ["512", "515B"], "n-tanaka", ctx), ["508A"], "n-ito", ctx);
    expect(loads(s, beds, crew).map((l) => [l.nurse.id, l.beds.map((b) => b.key)])).toEqual([
      ["n-tanaka", ["512", "515B"]],
      ["n-ito", ["508A"]],
      ["n-inoue", []],
    ]);
    expect(maxLoad(s, beds, crew)).toBe(2);
    expect(nurseOfBed(s, "512", WARD_NURSES)).toBe("看護師 田中");
    expect(roomNurses(s, "515", ["A", "B", "C", "D"], WARD_NURSES)).toEqual(["看護師 田中"]);
    expect(planLines(s, beds, WARD_NURSES)).toEqual(["看護師 伊藤：508A 北村", "看護師 田中：512 佐倉・515B 大浦"]);
    expect(planLines(undefined, beds, WARD_NURSES)).toEqual([]);
  });

  it("points out beds with nobody, nurses off the roster, and a 准看護師 with no 看護師 to direct", () => {
    const crew = crewOn(book(), today, 0, "day");
    let s = assign(emptySheet(), ["512"], "n-inoue", ctx);
    s = assign(s, ["515B"], "n-watanabe", ctx);
    const kinds = assignIssues(s, beds, crew, WARD_NURSES).map((i) => i.kind);
    expect(kinds).toEqual(["未割当", "勤務外", "指示"]);
    s = { ...s, directs: { "n-inoue": "n-tanaka" } };
    expect(assignIssues(s, beds, crew, WARD_NURSES).map((i) => i.kind)).toEqual(["未割当", "勤務外"]);
  });

  it("copies another shift's plan for the nurses on this shift only", () => {
    const s = { ...assign(assign(emptySheet(), ["512"], "n-tanaka", ctx), ["515B"], "n-watanabe", ctx), directs: { "n-inoue": "n-tanaka" } };
    const c = copyPlan(s, crewOn(book(), today, 0, "day"));
    expect(c.beds).toEqual({ "512": "n-tanaka" });
    expect(c.directs).toEqual({ "n-inoue": "n-tanaka" });
    expect(c.confirmed).toBeUndefined();
  });
});
