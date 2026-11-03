import { describe, expect, it } from "vitest";
import {
  INITIAL_INCIDENTS,
  LEVELS,
  STATUSES,
  applyStatus,
  countByStatus,
  emptyDraft,
  filterReports,
  levelNotes,
  missingOf,
  nextStatus,
  timeProblems,
  toReport,
  type IncidentDraft,
} from "./incident";

const full: IncidentDraft = {
  ...emptyDraft(),
  occurredDay: -1,
  occurredTime: "22:30",
  foundDay: 0,
  foundTime: "06:00",
  place: "病棟",
  kind: "注射・点滴",
  level: "1",
  what: "点滴の速度の設定が指示と違っていた。",
  response: "主治医に報告し、指示どおりに直した。",
};

describe("incident report", () => {
  it("has the eight levels of the 影響度分類 in order, worded as in the source", () => {
    expect(LEVELS.map((l) => l.level)).toEqual(["0", "1", "2", "3a", "3b", "4a", "4b", "5"]);
    expect(LEVELS.find((l) => l.level === "3b")!.text).toContain("濃厚な処置や治療を要した");
    expect(LEVELS.find((l) => l.level === "5")!.text).toBe("死亡（原疾患の自然経過によるものを除く）");
  });

  it("lists the required fields that are still empty; nothing is chosen at the start", () => {
    expect(missingOf(emptyDraft())).toEqual(["発生日時", "発見日時", "場所", "種類", "影響度レベル", "何が起きたか", "その後の対応"]);
    expect(missingOf(full)).toEqual([]);
    expect(missingOf({ ...full, occurredTime: "25:00" })).toEqual(["発生日時"]);
    expect(missingOf({ ...full, place: "その他" })).toEqual(["場所（その他の内容）"]);
    expect(missingOf({ ...full, kind: "その他", kindNote: "掲示物" })).toEqual([]);
    // 要因 and 再発防止の案 can be written later.
    expect(missingOf({ ...full, factors: [], prevention: "" })).toEqual([]);
  });

  it("catches times that cannot be right", () => {
    expect(timeProblems(full, "09:00")).toEqual([]);
    expect(timeProblems({ ...full, foundDay: -1, foundTime: "22:00" }, "09:00")).toEqual(["発見日時が発生日時より前になっています"]);
    expect(timeProblems({ ...full, occurredDay: 0, occurredTime: "10:00", foundTime: "10:30" }, "09:00")).toEqual(["発生日時がいまより後になっています", "発見日時がいまより後になっています"]);
  });

  it("says what to do next by level (架空の病院の取り決め), and the law only at level 5", () => {
    const urgent = (l: Parameters<typeof levelNotes>[0]) => levelNotes(l).filter((n) => n.urgent);
    expect(urgent("3a")).toEqual([]);
    expect(urgent("3b")[0].text).toMatch(/すぐに医療安全管理者へ口頭でも連絡/);
    expect(urgent("4b")).toHaveLength(1);
    const five = levelNotes("5");
    const law = five.find((n) => n.rule === "医療法")!;
    expect(law.text).toMatch(/医療事故調査・支援センター/);
    expect(law.text).toMatch(/決めるのは管理者/);
    expect(law.source).toMatch(/第6条の10/);
    expect(levelNotes("4b").some((n) => n.rule === "医療法")).toBe(false);
    expect(levelNotes("0").every((n) => n.rule === "架空の病院の取り決め")).toBe(true);
  });

  it("builds a report, then moves it 報告済 → 確認中 → 対策済, keeping every step", () => {
    const r = toReport({ ...full, factors: ["仕組み", "確認不足"] }, { id: "x", reporter: { role: "看護師", name: "看護師 佐藤" }, now: { day: 0, time: "09:00" } });
    expect(r.status).toBe("報告済");
    expect(r.factors).toEqual(["確認不足", "仕組み"]);
    expect(nextStatus("報告済")).toBe("医療安全管理室で確認中");
    expect(nextStatus("対策済")).toBeNull();
    const list = applyStatus([r], "x", { status: "医療安全管理室で確認中", by: "医療安全管理者", at: { day: 0, time: "10:00" } });
    expect(list[0].status).toBe("医療安全管理室で確認中");
    expect(list[0].log.map((l) => l.status)).toEqual(["報告済", "医療安全管理室で確認中"]);
    expect(r.log).toHaveLength(1);
  });

  it("filters by kind, level and status, newest first", () => {
    const all = filterReports(INITIAL_INCIDENTS, { kind: null, level: null, status: null });
    expect(all.map((r) => r.id)).toEqual(["inc-0002", "inc-0003", "inc-0001"]);
    expect(filterReports(INITIAL_INCIDENTS, { kind: "転倒・転落", level: null, status: null }).map((r) => r.id)).toEqual(["inc-0001"]);
    expect(filterReports(INITIAL_INCIDENTS, { kind: null, level: "0", status: "報告済" }).map((r) => r.id)).toEqual(["inc-0003"]);
    expect(countByStatus(INITIAL_INCIDENTS)).toEqual({ 報告済: 1, 医療安全管理室で確認中: 1, 対策済: 1 });
    for (const r of INITIAL_INCIDENTS) {
      expect(r.log[0].status).toBe("報告済");
      expect(r.log.at(-1)!.status).toBe(r.status);
      expect(STATUSES).toContain(r.status);
    }
  });
});
