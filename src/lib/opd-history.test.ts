import { describe, expect, it } from "vitest";
import { OPD_PATIENTS } from "./opd";
import { OPD_VISITS, daySections, placeLabel, visitsFromOpd, visitsOf } from "./opd-history";
import { PATIENTS } from "./patients";
import type { PlanItem } from "./schedule-days";
import type { HistoryEntry } from "./types";

const note = (day: number, time: string, text: string): HistoryEntry => ({ kind: "note", day, time, author: "山本（専攻医）", role: "医師", text });

describe("外来の受診歴", () => {
  it("the fictional visits are before each patient's admission, with a clinic and a doctor; visitsOf gives them newest first", () => {
    for (const v of OPD_VISITS) {
      const p = PATIENTS.find((x) => x.id === v.patientId)!;
      expect(v.day).toBeLessThan(p.admittedOn);
      expect(v.dept).toBeTruthy();
      expect(v.entries.every((e) => e.day === v.day)).toBe(true);
    }
    const sakura = visitsOf("90010231", -3);
    expect(sakura.map((v) => v.day)).toEqual([-5, -45]);
    expect(visitsOf("90010231", -50)).toEqual([]);
    expect(placeLabel(sakura[0])).toBe("外来・総合診療科 山本（専攻医）");
  });
  it("an outpatient's past visits become visits of their clinic, each with the doctor's note", () => {
    const op = OPD_PATIENTS.find((p) => p.id === "opd-1")!;
    const vs = visitsFromOpd(op);
    expect(vs.map((v) => v.day)).toEqual([-28, -56]);
    expect(vs[0].dept).toBe("総合診療科");
    expect(vs[0].entries[0]).toMatchObject({ kind: "note", day: -28, role: "医師", text: "体重60.5kg、下腿浮腫なし。処方継続。" });
  });
  it("the day sections run today → the admission day, then the visits before it (newest first); empty days are left out, today stays", () => {
    const entries = [note(0, "09:00", "今日"), note(-2, "10:00", "一昨日"), note(-3, "14:00", "入院日")];
    const visits = [
      { id: "a", patientId: "x", day: -40, dept: "循環器内科", doctor: "森", entries: [note(-40, "10:00", "外来 1")] },
      { id: "b", patientId: "x", day: -6, dept: "総合診療科", doctor: "山本", entries: [note(-6, "10:00", "外来 2")] },
    ];
    const plan = (day: number, time: string, kind: PlanItem["kind"], label: string, orderedOn: number): PlanItem => ({ kind, day, time, verb: "採取", label, orderId: label, orderedOn });
    const planned: PlanItem[] = [plan(0, "10:30", "画像", "CT 胸部", -1), plan(0, "15:00", "検体検査", "CRP", 0), plan(2, "06:00", "検体検査", "CBC", 0), plan(9, "10:00", "外来予約", "再診", 0), plan(-2, "06:00", "検体検査", "朝の採血", -3)];
    const s = daySections(-3, entries, visits, planned);
    // The days ahead come first, farthest first; then today … the admission day; then the visits.
    expect(s.map((x) => `${x.day}${x.place ? ` ${x.place.dept}` : ""}${x.future ? " 予定" : ""}`)).toEqual(["9 予定", "2 予定", "0", "-2", "-3", "-6 総合診療科", "-40 循環器内科"]);
    // Today's plans leave out what was ordered today (its card is in the section); a past day carries its plans too.
    expect(s[2].plans.map((p) => p.label)).toEqual(["CT 胸部"]);
    expect(s[3].plans.map((p) => p.label)).toEqual(["朝の採血"]);
    expect(s[0].plans.map((p) => p.label)).toEqual(["再診"]);
    expect(s.slice(4).every((x) => x.plans.length === 0)).toBe(true);
    // The record's filters apply to the plans: only the kinds kept are listed, and a day ahead with nothing left goes.
    const only = daySections(-3, entries, visits, planned, true, (p) => p.kind === "検体検査");
    expect(only.filter((x) => x.future).map((x) => x.day)).toEqual([2]);
    expect(only.find((x) => x.day === 0)!.plans).toEqual([]);
    // Today with nothing written still has its section (the place for the day's records).
    expect(daySections(-1, [], [], []).map((x) => x.day)).toEqual([0]);
  });
  it("a visit on or after the admission day is not a 'visit before'; a visit emptied by the filters is left out only while filtering", () => {
    const v = { id: "a", patientId: "x", day: -10, dept: "整形外科", doctor: "長谷川", entries: [] as HistoryEntry[] };
    expect(daySections(-3, [], [{ ...v, day: -3 }], []).some((x) => x.place)).toBe(false);
    expect(daySections(-3, [], [v], [], false).some((x) => x.place)).toBe(true);
    expect(daySections(-3, [], [v], [], true).some((x) => x.place)).toBe(false);
  });
});
