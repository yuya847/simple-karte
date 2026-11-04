import { describe, expect, it } from "vitest";
import type { DrawRow } from "./lab-desk";
import { cellOf, copyText, labColumns, labCsv, labRows, pendingDraws, trendOf, type PendingDraw } from "./lab-table";
import { ANALYTES } from "./master";
import type { LabResult } from "./types";

const today = { y: 2026, m: 11, d: 4 };
const labs: LabResult[] = [
  { day: -2, time: "06:00", values: { WBC: 12050, CRP: 16.86, Hb: 12.7 } },
  { day: 0, time: "06:00", values: { WBC: 7500, CRP: 11.14, Hb: 9.3 } },
  { day: -1, time: "06:00", values: { WBC: 11310 } },
];
const wait: PendingDraw = { at: 10 * 60, status: "検査中", analytes: ["CRP", "Na"], tests: "生化学", urgent: true };
const an = (code: string) => ANALYTES.find((a) => a.code === code)!;

describe("検査結果の時系列表", () => {
  it("puts draws in time order, or newest first, and keeps draws without results as their own column", () => {
    expect(labColumns(labs, [wait], "旧→新", null).map((c) => `${c.day} ${c.time} ${c.kind}`)).toEqual(["-2 06:00 result", "-1 06:00 result", "0 06:00 result", "0 10:00 pending"]);
    expect(labColumns(labs, [wait], "新→旧", null).map((c) => `${c.day} ${c.time}`)).toEqual(["0 10:00", "0 06:00", "-1 06:00", "-2 06:00"]);
  });

  it("narrows to the last days (直近3日 = today and the two days before)", () => {
    expect(labColumns(labs, [], "旧→新", -1).map((c) => c.day)).toEqual([-1, 0]);
  });

  it("marks values H/L for the patient's sex, and pending analytes as 検査中", () => {
    const cols = labColumns(labs, [wait], "旧→新", null);
    expect(cellOf(cols[2], an("Hb"), "女")).toEqual({ kind: "value", value: 9.3, flag: "L" });
    expect(cellOf(cols[2], an("Hb"), "男")).toEqual({ kind: "value", value: 9.3, flag: "L" });
    expect(cellOf(cols[0], an("Hb"), "女")).toEqual({ kind: "value", value: 12.7, flag: "" });
    expect(cellOf(cols[3], an("CRP"), "女")).toEqual({ kind: "pending", status: "検査中" });
    expect(cellOf(cols[3], an("WBC"), "女")).toEqual({ kind: "none" });
  });

  it("lists only analytes with something to show; H・L only when asked", () => {
    const cols = labColumns(labs, [wait], "旧→新", null);
    expect(labRows(cols, "女", false).map((a) => a.code)).toEqual(expect.arrayContaining(["WBC", "Hb", "CRP", "Na"]));
    expect(labRows(cols, "女", true).map((a) => a.code)).not.toContain("Na");
  });

  it("copies chosen results as lines for a note, oldest first, without the pending draw", () => {
    const cols = labColumns(labs, [wait], "新→旧", null);
    const rows = labRows(cols, "女", false);
    const text = copyText([cols[0], cols[1], cols[3]], rows, "女", today);
    expect(text.split("\n")).toEqual(["11/2 06:00 WBC 12,050H Hb 12.7 CRP 16.86H", "11/4 06:00 WBC 7,500 Hb 9.3L CRP 11.14H"]);
  });

  it("writes CSV with a BOM, the range, every value and the pending state", () => {
    const cols = labColumns(labs, [wait], "旧→新", null);
    const csv = labCsv(cols, [an("CRP")], "女", today);
    expect(csv.startsWith("﻿")).toBe(true);
    const [head, crp] = csv.slice(1).trim().split("\r\n");
    expect(head).toBe('"項目","単位","基準範囲","11/2 06:00","11/3 06:00","11/4 06:00","11/4 10:00（検査中）"');
    expect(crp).toBe('"CRP","mg/dL","0.14以下","16.86 H","","11.14 H","検査中"');
  });

  it("gives one analyte's points oldest first for the graph", () => {
    expect(trendOf(labs, "WBC").map((p) => p.value)).toEqual([12050, 11310, 7500]);
  });

  it("shows a draw as 検査中 once drawn, 採取待ち only when its time has passed", () => {
    const row = (over: Partial<DrawRow>): DrawRow => ({ code: "x", orderId: "o", patientId: "p1", place: "病棟", room: "501", name: "架空", at: 360, tests: "生化学", codes: ["LAB-CRP"], container: "", urgent: false, status: "未採取", ...over });
    const rows = [row({ status: "採取済み" }), row({ status: "未採取", at: 300 }), row({ status: "未採取", at: 900 }), row({ status: "報告済み" }), row({ status: "採取しなかった" }), row({ patientId: "p2", status: "受付済み" })];
    expect(pendingDraws(rows, "p1", 600).map((d) => `${d.at} ${d.status}`)).toEqual(["360 検査中", "300 採取待ち"]);
  });
});
