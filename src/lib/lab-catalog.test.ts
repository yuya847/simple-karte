// The order screen's logic: a set covers its single items (no double draw), the day and time choices
// become a draft that the same checks accept or stop (a past time), and a level is timed to a dose.
import { describe, expect, it } from "vitest";
import { checkDraft, toOrder, urgentItemsOf, type CheckContext } from "./drafts";
import { labLines } from "./format";
import { FREQUENT_CODES, LAB_TABS, collectOf, coveredBy, dayOptions, dedupePicks, defaultDraw, drawProblem, drawText, duplicatePicks, isHHMM, isRapid, labDraftOf, labelOf, levelDrugsFrom, pickedSummary, searchKey, searchLabs, tabOf, tabSections, titleOf, togglePick } from "./lab-catalog";
import { LAB_TESTS, anyDrugName, findLab } from "./master";
import type { LabOrder, OrderEntry } from "./types";

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

  it("重複削除 takes out an item another pick reports (WBC next to 血算, the later of PT and PT-INR) and nothing else", () => {
    expect(duplicatePicks(["LAB-WBC", "LAB-CBC", "LAB-CRP"])).toEqual(["LAB-WBC"]);
    expect(dedupePicks(["LAB-WBC", "LAB-CBC", "LAB-CRP"])).toEqual(["LAB-CBC", "LAB-CRP"]);
    expect(dedupePicks(["LAB-PT", "LAB-PTINR"])).toEqual(["LAB-PT"]);
    expect(dedupePicks(["LAB-PTINR", "LAB-PT"])).toEqual(["LAB-PTINR"]);
    expect(dedupePicks(["LAB-CBC", "LAB-CRP", "LAB-K"])).toEqual(["LAB-CBC", "LAB-CRP", "LAB-K"]);
    expect(duplicatePicks(["LAB-CBC", "LAB-CRP"])).toEqual([]);
  });
});

describe("タブと頻用", () => {
  it("頻用 lists the ward's everyday items in its own order: 血算・分画・CRP first, 動脈血ガス last, every one offered", () => {
    const freq = tabSections(LAB_TABS[0], LAB_TESTS);
    expect(LAB_TABS[0].label).toBe("頻用");
    expect(freq).toHaveLength(1);
    expect(freq[0].items.map((t) => t.code)).toEqual([...FREQUENT_CODES]);
    expect(FREQUENT_CODES.slice(0, 3)).toEqual(["LAB-CBC", "LAB-DIFF", "LAB-CRP"]);
    expect(FREQUENT_CODES[FREQUENT_CODES.length - 1]).toBe("LAB-BGA");
    for (const c of ["LAB-TP", "LAB-ALB", "LAB-AST", "LAB-ALT", "LAB-LD", "LAB-ALP", "LAB-GGT", "LAB-TBIL", "LAB-BUN", "LAB-CRE", "LAB-URIC", "LAB-NA", "LAB-K", "LAB-CL", "LAB-CA", "LAB-GLU", "LAB-HBA1C", "LAB-PT", "LAB-APTT", "LAB-DD", "LAB-BNP", "LAB-UA", "LAB-BCX"]) expect(FREQUENT_CODES).toContain(c);
    for (const c of FREQUENT_CODES) expect(findLab(c)?.hidden, c).toBeUndefined();
    expect(new Set(FREQUENT_CODES).size).toBe(FREQUENT_CODES.length);
  });

  it("the tabs follow the order of the manual's screen; special chemistry is 生化学Ⅱ, CRP sits with the routine chemistry, allergy is its own tab", () => {
    expect(LAB_TABS.map((t) => t.label)).toEqual(["頻用", "生化学Ⅰ", "生化学Ⅱ", "血液学・凝固系", "血清学・免疫", "尿・髄液・便", "微生物", "輸血関連", "薬物濃度", "腫瘍マーカー", "内分泌", "感染症（ウイルスを含む）", "アレルギー", "その他"]);
    expect(tabOf(findLab("LAB-CRP")!)).toBe("chem1");
    expect(tabOf(findLab("LAB-TNT")!)).toBe("chem1");
    expect(tabOf(findLab("LAB-VB12")!)).toBe("chem2");
    expect(tabOf(findLab("LAB-FERRITIN")!)).toBe("chem2");
    expect(tabOf(findLab("LAB-PT")!)).toBe("heme");
    expect(tabOf(findLab("LAB-ANA")!)).toBe("sero");
    expect(tabOf(findLab("LAB-SIGE")!)).toBe("allergy");
    expect(tabOf(findLab("LAB-HBSAG")!)).toBe("infect");
    expect(tabOf(findLab("LAB-BGA")!)).toBe("other");
    expect(tabOf(findLab("LAB-CHEM")!)).toBeNull();
    const heme = tabSections(LAB_TABS.find((t) => t.key === "heme")!, LAB_TESTS).map((s) => s.head);
    expect(heme).toEqual(["血算", "血液像", "そのほか", "凝固・線溶"]);
  });

  it("迅速対応 is an item run in house the same day", () => {
    expect(isRapid("LAB-CBC")).toBe(true);
    expect(isRapid("LAB-BGA")).toBe(true);
    expect(isRapid("LAB-TSH")).toBe(false);
    expect(isRapid("LAB-BCX")).toBe(false);
  });

  it("項目検索 finds by abbreviation, name, alias, hiragana and full width; sets are not searched", () => {
    expect(searchKey("だいまー")).toBe("ダイマー");
    expect(searchKey("Ｄダイマー")).toBe(searchKey("dダイマー"));
    expect(searchLabs("だいまー", LAB_TESTS).map((t) => t.code)).toEqual(["LAB-DD"]);
    expect(searchLabs("bnp", LAB_TESTS).map((t) => t.code)).toContain("LAB-BNP");
    expect(searchLabs("肝炎", LAB_TESTS).map((t) => t.code)).toContain("LAB-HBSAG");
    expect(searchLabs("定期採血", LAB_TESTS)).toEqual([]);
    expect(searchLabs("  ", LAB_TESTS)).toEqual([]);
  });
});

describe("項目ごとの至急・採血場所・目的", () => {
  it("some items 至急: the draft keeps it per item, the checks name them, the order carries urgentCodes, site and purpose", () => {
    const d = labDraftOf("l5", ["LAB-CBC", "LAB-K", "LAB-NA"], defaultDraw(), { urgent: ["LAB-K", "LAB-NA"], site: "病棟採血", comment: "ヘパリンロックから採取", purpose: "低K の経過" });
    expect(d.tests).toEqual([
      { code: "LAB-CBC", said: "血算" },
      { code: "LAB-K", said: "K", urgent: true },
      { code: "LAB-NA", said: "Na", urgent: true },
    ]);
    expect(d.priority).toBe("定時");
    expect(d.site).toBe("病棟採血");
    expect(d.comment).toBe("ヘパリンロックから採取");
    expect(urgentItemsOf(d)).toEqual(["LAB-K", "LAB-NA"]);
    const issues = checkDraft(d, ctx());
    expect(issues.filter((i) => i.level === "stop" || i.level === "ask")).toEqual([]);
    expect(issues.find((i) => i.key === "urgent-items")?.message).toBe("K・Na（ほかの項目は定時）");
    expect(issues.find((i) => i.key === "lab-extras")?.message).toBe("採血場所：病棟採血　検査目的：低K の経過");
    const { order } = toOrder(d, ctx());
    expect(order).toMatchObject({ type: "lab", codes: ["LAB-CBC", "LAB-K", "LAB-NA"], priority: "定時", urgentCodes: ["LAB-K", "LAB-NA"], site: "病棟採血", purpose: "低K の経過", comment: "ヘパリンロックから採取" });
    const lines = labLines(order as LabOrder, today);
    expect(lines.main).toContain("カリウム");
    expect(lines.main).toMatch(/カリウム[^、]*（至急）/);
    expect(lines.main).not.toMatch(/血算[^、]*（至急）/);
    expect(lines.detail).toContain("定時");
    expect(lines.detail).toContain("病棟採血");
    expect(lines.detail).toContain("目的：低K の経過");
  });

  it("every item 至急 is the whole order 至急, with no urgentCodes", () => {
    const d = labDraftOf("l6", ["LAB-K", "LAB-NA"], defaultDraw(), { urgent: ["LAB-NA", "LAB-K"] });
    expect(d.priority).toBe("至急");
    expect(urgentItemsOf(d)).toEqual([]);
    const { order } = toOrder(d, ctx());
    expect(order).toMatchObject({ type: "lab", priority: "至急" });
    expect((order as LabOrder).urgentCodes).toBeUndefined();
    // Marked per item after the fact (an AI draft the doctor edited): the resolved priority follows.
    const edited = { ...labDraftOf("l7", ["LAB-K"], defaultDraw()), tests: [{ code: "LAB-K", said: "K", urgent: true }] };
    expect(checkDraft(edited, ctx()).find((i) => i.key === "collect")?.message).toContain("至急");
  });

  it("without the extras the draft is as before: no site, no purpose, no urgent marks", () => {
    const d = labDraftOf("l8", ["LAB-CBC"], defaultDraw());
    expect(d.tests).toEqual([{ code: "LAB-CBC", said: "血算" }]);
    expect(d.site).toBeNull();
    expect(d.purpose).toBeNull();
    expect(d.comment).toBeNull();
    const { order } = toOrder(d, ctx()) as { order: LabOrder };
    expect(order.urgentCodes).toBeUndefined();
    expect(order.site).toBeUndefined();
    expect(order.purpose).toBeUndefined();
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
