import { describe, expect, it } from "vitest";
import { FALL_RISKS, initialEvals } from "./admit-eval";
import { FALL_INTERVAL, FALL_RULES, FALL_SOURCES, fallChanges, fallDue, fallDueList, fallSteps, fallTriggers } from "./fall-reassess";

const rec = (day: number, time: string, checked: string[] = []) => ({ checked, measures: [], plan: "", by: "看護師 A", at: { day, time } });

describe("出典と取り決め", () => {
  it("cites 提言第9号 提言7 and labels the interval and the surgery rule as the hospital's own", () => {
    expect(FALL_SOURCES.teigen.label).toContain("提言7");
    expect(FALL_SOURCES.teigen.url).toBe("https://www.medsafe.or.jp/teigen/teigen-09.pdf");
    expect(FALL_RULES.interval).not.toContain("架空の病院の取り決め");
    expect(FALL_RULES.surgery).not.toContain("架空の病院の取り決め");
    expect(FALL_RULES.noScore).toContain("許諾");
  });
});

describe("再評価の期限", () => {
  it("is the admission day when never assessed", () => {
    expect(fallDue(-1, undefined, [], [])).toMatchObject({ dueOn: -1, state: "期限切れ" });
    expect(fallDue(0, undefined, [], []).state).toBe("今日まで");
  });

  it("is 7 days after the last assessment, re-assessments included", () => {
    expect(fallDue(-9, rec(-9, "17:00"), [], [])).toMatchObject({ dueOn: -9 + FALL_INTERVAL, state: "期限切れ", reasons: ["前の評価から7日"] });
    expect(fallDue(-9, rec(-9, "17:00"), [rec(-3, "10:00")], []).dueOn).toBe(-3 + FALL_INTERVAL);
  });

  it("is the day of a 転棟・転床 or 手術 after the last assessment (提言7)", () => {
    const d = fallDue(-3, rec(-3, "17:00"), [], [{ at: { day: 0, time: "11:20" }, label: "転床 512→515-C", kind: "転棟・転床" }]);
    expect(d).toMatchObject({ dueOn: 0, state: "今日まで" });
    expect(d.reasons).toEqual(["転棟・転床のあと（転床 512→515-C）"]);
    // A move before the last assessment does not count.
    expect(fallDue(-3, rec(-3, "17:00"), [rec(0, "12:00")], [{ at: { day: 0, time: "11:20" }, label: "x", kind: "転棟・転床" }]).dueOn).toBe(7);
    expect(fallDue(-5, rec(-5, "17:00"), [], [{ at: { day: -2, time: "09:00" }, label: "手術", kind: "手術" }]).state).toBe("期限切れ");
  });

  it("lists the patients, due first; keeps the steps in time order; finds what changed", () => {
    const list = fallDueList([
      { id: "a", admittedOn: -3, first: rec(-3, "17:00"), reviews: [], triggers: [] },
      { id: "b", admittedOn: -9, first: rec(-9, "17:00"), reviews: [], triggers: [] },
    ]);
    expect(list.map((r) => r.patientId)).toEqual(["b", "a"]);
    expect(fallSteps(rec(-3, "17:00"), [rec(-1, "09:00"), rec(-2, "09:00")]).map((s) => [s.kind, s.at.day])).toEqual([
      ["入院時", -3],
      ["再評価", -2],
      ["再評価", -1],
    ]);
    expect(fallChanges(rec(0, "09:00", ["歩行時に介助が必要", "向精神薬の使用"]), { checked: ["歩行時に介助が必要", "頻尿や夜間の排泄行動"] })).toEqual({ added: ["頻尿や夜間の排泄行動"], gone: ["向精神薬の使用"] });
  });

  it("takes today's moves and the operations begun by now as triggers", () => {
    const tr = fallTriggers("p", [{ patientId: "p", label: "転床 512→515-C", time: "11:20" }, { patientId: "q", label: "x", time: "09:00" }], [
      { patientId: "p", day: 0, start: "09:00", procedure: "胃瘻造設" },
      { patientId: "p", day: 0, start: "15:00", procedure: "まだ" },
      { patientId: "p", day: -2, start: "13:00", procedure: "前の手術" },
      { patientId: "p", day: 1, start: "09:00", procedure: "明日" },
    ], "12:00");
    expect(tr.map((x) => [x.kind, x.at.day, x.label])).toEqual([
      ["転棟・転床", 0, "転床 512→515-C"],
      ["手術", 0, "手術 胃瘻造設"],
      ["手術", -2, "手術 前の手術"],
    ]);
  });

  it("the fictional patients' first assessments use the risk items of 入院時の評価", () => {
    for (const e of initialEvals()) for (const c of e.fall?.checked ?? []) expect(FALL_RISKS as readonly string[]).toContain(c);
  });
});
