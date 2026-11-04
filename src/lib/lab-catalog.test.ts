// The order screen's logic: a set covers its single items (no double draw), the day and time choices
// become a draft that the same checks accept or stop (a past time), and a level is timed to a dose.
import { describe, expect, it } from "vitest";
import { checkDraft, type CheckContext } from "./drafts";
import { collectOf, coveredBy, dayOptions, defaultDraw, drawProblem, drawText, isHHMM, labDraftOf, labelOf, levelDrugsFrom, pickedSummary, titleOf, togglePick } from "./lab-catalog";
import { anyDrugName } from "./master";
import type { OrderEntry } from "./types";

const today = { y: 2026, m: 11, d: 4 };
const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({ activeOrders: [], labOrders: [], drafts: [], nowTime: "08:30", fmtDay: (d) => `D${d}`, describe: (o) => o.id, ...over });

describe("セットと単項目の重なり", () => {
  it("a picked 血算 covers WBC and Hb; the single item does not cover the set", () => {
    expect(coveredBy("LAB-WBC", ["LAB-CBC"])).toBe("LAB-CBC");
    expect(coveredBy("LAB-HB", ["SET-ROUTINE"])).toBe("SET-ROUTINE");
    expect(coveredBy("LAB-CBC", ["LAB-WBC"])).toBeNull();
    expect(coveredBy("LAB-TP", ["LAB-CHEM"])).toBe("LAB-CHEM");
    expect(coveredBy("LAB-CRP", ["SET-ROUTINE"])).toBe("SET-ROUTINE");
    expect(coveredBy("LAB-TNT", ["LAB-TNI"])).toBeNull();
    expect(coveredBy("LAB-MG", ["LAB-CHEM"])).toBeNull();
  });

  it("PT and PT-INR report the same value, so only one of them can be picked", () => {
    expect(coveredBy("LAB-PTINR", ["LAB-PT"])).toBe("LAB-PT");
    expect(coveredBy("LAB-PT", ["LAB-PTINR"])).toBe("LAB-PTINR");
  });

  it("picking a set drops the single items it covers; a covered item cannot be added", () => {
    expect(togglePick(["LAB-WBC", "LAB-HB", "LAB-CRP"], "LAB-CBC")).toEqual(["LAB-CRP", "LAB-CBC"]);
    expect(togglePick(["LAB-CBC"], "LAB-WBC")).toEqual(["LAB-CBC"]);
    expect(togglePick(["LAB-CBC"], "LAB-CBC")).toEqual([]);
    expect(togglePick(["LAB-CBC", "LAB-CRP"], "SET-ROUTINE")).toEqual(["SET-ROUTINE"]);
  });

  it("the summary opens sets up to containers and notes", () => {
    const s = pickedSummary(["SET-ROUTINE", "LAB-BGA", "LAB-VBG"]);
    expect(s.labCodes).toEqual(["LAB-CBC", "LAB-CHEM", "LAB-CRP", "LAB-BGA", "LAB-VBG"]);
    expect(s.containers).toContain("PK2");
    expect(s.containers).toContain("血ガス用シリンジ");
    expect(s.notes.some((n) => n.startsWith("動脈血ガス："))).toBe(true);
    expect(labelOf("SET-ADMIT")).toBe("入院時採血セット");
    expect(titleOf("LAB-APTT")).toContain("活性化部分トロンボプラスチン時間");
  });
});

describe("採取の日時", () => {
  it("offers today and 7 more days, each with its weekday", () => {
    const days = dayOptions(today);
    expect(days).toHaveLength(8);
    expect(days[0]).toEqual({ day: 0, label: "今日 11/4（水）" });
    expect(days[1]).toEqual({ day: 1, label: "明日 11/5（木）" });
    expect(days[7]).toEqual({ day: 7, label: "11/11（水）" });
  });

  it("checks HH:MM and names what is missing", () => {
    expect(isHHMM("09:30")).toBe(true);
    expect(isHHMM("9:30")).toBe(false);
    expect(isHHMM("24:00")).toBe(false);
    expect(drawProblem({ ...defaultDraw(), mode: "time", time: "9" })).toContain("HH:MM");
    expect(drawProblem({ ...defaultDraw(), mode: "before_dose" })).toContain("何回目");
    expect(drawProblem(defaultDraw())).toBeNull();
  });

  it("becomes the draft's collect in the existing shape, and the checks accept it", () => {
    const routine = labDraftOf("l1", ["LAB-CBC", "LAB-CRP"], defaultDraw());
    expect(routine.collect).toEqual({ day: 1, when: "morning_routine", time: null, beforeDose: null });
    expect(routine.priority).toBe("定時");
    expect(routine.tests).toEqual([
      { code: "LAB-CBC", said: "血算" },
      { code: "LAB-CRP", said: "CRP" },
    ]);
    const issues = checkDraft(routine, ctx());
    expect(issues.filter((i) => i.level === "stop")).toEqual([]);
    expect(issues.filter((i) => i.level === "ask")).toEqual([]);

    const now = collectOf({ ...defaultDraw(), mode: "now" });
    expect(now).toEqual({ collect: { day: 0, when: "now", time: null, beforeDose: null }, priority: "至急" });

    const timed = labDraftOf("l2", ["LAB-K"], { mode: "time", day: 3, time: "14:00", priority: "至急", beforeDose: null });
    expect(timed.collect).toEqual({ day: 3, when: "specific_time", time: "14:00", beforeDose: null });
    expect(timed.priority).toBe("至急");
    expect(checkDraft(timed, ctx()).filter((i) => i.level === "stop")).toEqual([]);
  });

  it("a time already past today is stopped by the same check", () => {
    const past = labDraftOf("l3", ["LAB-K"], { mode: "time", day: 0, time: "07:00", priority: "定時", beforeDose: null });
    const stop = checkDraft(past, ctx({ nowTime: "08:30" })).find((i) => i.key === "collect-past");
    expect(stop?.level).toBe("stop");
    expect(stop?.message).toContain("07:00");
  });

  it("a level before the N-th dose is timed from the running injection", () => {
    const vcm: OrderEntry = {
      kind: "order",
      id: "o1",
      day: 0,
      time: "08:00",
      author: "医師",
      status: "有効",
      order: { type: "injection", items: [{ drugCode: "INJ-VCM05", amount: 1, unit: "g" }], route: "点滴静注", schedule: { kind: "every_hours", hours: 12 }, start: { day: 0, time: "10:00" } },
    };
    const drugs = levelDrugsFrom([vcm], anyDrugName);
    expect(drugs).toHaveLength(1);
    expect(drugs[0].code).toBe("INJ-VCM05");
    const level = labDraftOf("l4", ["LAB-VCM"], { mode: "before_dose", day: 0, time: "", priority: "定時", beforeDose: { n: 3, drugCode: "INJ-VCM05" } });
    expect(level.collect).toEqual({ day: null, when: "before_dose", time: null, beforeDose: { n: 3, drugCode: "INJ-VCM05" } });
    const issues = checkDraft(level, ctx({ activeOrders: [vcm] }));
    expect(issues.filter((i) => i.level === "stop")).toEqual([]);
    // 3rd dose at D1 10:00 → drawn 30 minutes before.
    expect(issues.find((i) => i.key === "collect")?.message).toContain("D1 09:30");
    expect(drawText({ mode: "before_dose", day: 0, time: "", priority: "定時", beforeDose: { n: 3, drugCode: "INJ-VCM05" } }, today)).toBe("3回目の投与の30分前（定時）");
    expect(drawText(defaultDraw(), today)).toBe("11/5（木） 定時採血 06:00（定時）");
  });
});
