import { describe, expect, it } from "vitest";
import { analyteChoices, findAnalyte, labDayCell, labMarks } from "./flow-labs";
import { DEFAULT_FLOW_PREFS, parseFlowPrefs } from "./flow-prefs";
import type { LabResult, OrderEntry } from "./types";

const labs: LabResult[] = [
  { day: -2, time: "20:30", values: { WBC: 15200, CRP: 21.3, K: 3.8 } },
  { day: 0, time: "06:00", values: { WBC: 9800, CRP: 12.0, K: 3.5 } },
  { day: 0, time: "14:00", values: { K: 3.9 } },
];
const later: OrderEntry = { kind: "order", id: "l", day: 0, time: "09:00", author: "医師", status: "有効", order: { type: "lab", codes: ["LAB-CBC"], collect: { day: 1, time: "06:00" }, priority: "定時" } };

describe("経過表の検査値", () => {
  it("each value at its draw, H/L by the master's reference range", () => {
    const wbc = findAnalyte("WBC")!;
    const marks = labMarks(wbc, labs, [], [], "男", 600);
    expect(marks.map((m) => m.kind === "value" && [m.value, m.flag])).toEqual([
      [15200, "H"],
      [9800, "H"],
    ]);
    expect(marks[0].title).toContain("共用基準範囲");
    const k = labMarks(findAnalyte("K")!, labs, [], [], "男", 600);
    expect(k.map((m) => m.kind === "value" && m.flag)).toEqual(["", "L", ""]);
  });

  it("draws without a result and draws ahead are marked", () => {
    const wbc = findAnalyte("WBC")!;
    const marks = labMarks(wbc, labs, [{ at: 540, status: "検査中", analytes: ["WBC", "Hb"], tests: "血算", urgent: false }], [later], "男", 600);
    expect(marks.filter((m) => m.kind === "pending").map((m) => m.kind === "pending" && m.status)).toEqual(["検査中", "予定"]);
    // CRP is not in the 血算 draw.
    expect(labMarks(findAnalyte("CRP")!, labs, [{ at: 540, status: "検査中", analytes: ["WBC"], tests: "血算", urgent: false }], [], "男", 600).every((m) => m.kind === "value")).toBe(true);
  });

  it("one cell per day: the last value, +n for more draws that day", () => {
    const k = labMarks(findAnalyte("K")!, labs, [], [], "男", 900);
    const today = labDayCell(k, 0)!;
    expect(today.mark.kind === "value" && today.mark.value).toBe(3.9);
    expect(today.more).toBe(1);
    expect(today.title.split("\n").length).toBeGreaterThan(2);
    expect(labDayCell(k, -1)).toBeNull();
  });

  it("choices: this patient's analytes first", () => {
    const { mine, others } = analyteChoices(labs);
    expect(mine.map((a) => a.code)).toEqual(["WBC", "CRP", "K"]);
    expect(others.some((a) => a.code === "Hb")).toBe(true);
  });

  it("the kept settings fall back to the default when missing or broken", () => {
    expect(parseFlowPrefs(null)).toEqual(DEFAULT_FLOW_PREFS);
    expect(parseFlowPrefs("{")).toEqual(DEFAULT_FLOW_PREFS);
    expect(parseFlowPrefs(JSON.stringify({ analytes: ["Na", 3] })).analytes).toEqual(DEFAULT_FLOW_PREFS.analytes);
    expect(parseFlowPrefs(JSON.stringify({ analytes: ["Na", "K"] })).analytes).toEqual(["Na", "K"]);
  });
});
