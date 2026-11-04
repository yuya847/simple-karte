import { describe, expect, it } from "vitest";
import { INITIAL_CARE_ORDERS } from "./care-orders";
import {
  EVAL_INTERVAL_DAYS,
  INITIAL_PLANS,
  PLAN_TEMPLATES,
  addProblem,
  defaultEvalDue,
  dueEvaluations,
  evalProblems,
  evalStatus,
  evaluateProblem,
  nextNo,
  openProblems,
  ordersOf,
  planProblems,
  problemTitle,
  summaryLines,
  type PlanBody,
} from "./nursing-plan";

const body: PlanBody = { problem: "ひとりで動こうとして転ぶおそれがある", goal: "入院中に転ばない", op: ["ふらつき"], tp: ["ナースコールを手元に"], ep: [] };
const now = { day: 0, time: "10:00" };

describe("看護計画：立案", () => {
  it("numbers problems per patient, never reusing a number", () => {
    let all = addProblem([], "p1", body, 7, "a", "看護師 佐藤", now);
    all = addProblem(all, "p1", body, 7, "b", "看護師 佐藤", now);
    all = addProblem(all, "p2", body, 7, "c", "看護師 佐藤", now);
    expect(all.map((p) => `${p.patientId}#${p.no}`)).toEqual(["p1#1", "p1#2", "p2#1"]);
    // #1 is solved; the next one is still #3.
    all = evaluateProblem(all, "a", { result: "解決", note: "転ばずに退院の準備ができた" }, "看護師 佐藤", now);
    expect(nextNo(all, "p1")).toBe(3);
    expect(openProblems(all, "p1").map((p) => p.no)).toEqual([2]);
  });

  it("needs a problem, a goal, at least one 具体策, and an evaluation day after today", () => {
    expect(planProblems({ problem: "", goal: "", op: [" "], tp: [], ep: [] }, 0, 0)).toEqual(["看護問題", "目標", "具体策（観察・ケア・指導のどれか1つ以上）", "評価予定日（明日以降）"]);
    expect(planProblems(body, defaultEvalDue(0), 0)).toEqual([]);
    expect(defaultEvalDue(-1)).toBe(-1 + EVAL_INTERVAL_DAYS);
  });

  it("drops empty lines of the 具体策", () => {
    const [p] = addProblem([], "p1", { ...body, op: ["ふらつき", "  ", ""] }, 7, "a", "看護師 佐藤", now);
    expect(p.op).toEqual(["ふらつき"]);
    expect(problemTitle(p)).toBe("#1 ひとりで動こうとして転ぶおそれがある");
  });
});

describe("看護計画：評価", () => {
  const base = addProblem([], "p1", body, 0, "a", "看護師 佐藤", { day: -7, time: "10:00" });

  it("says when the evaluation is due or late", () => {
    expect(evalStatus(base[0], 0)).toEqual({ due: true, late: false, text: "評価予定日は今日です" });
    expect(evalStatus({ ...base[0], evalDue: -2 }, 0)).toMatchObject({ late: true, text: "評価予定日を2日過ぎています" });
    expect(evalStatus({ ...base[0], evalDue: 3 }, 0)?.text).toBe("評価予定日まであと3日");
    expect(dueEvaluations(base, ["p1"]).map((p) => p.id)).toEqual(["a"]);
    expect(dueEvaluations(base, ["other"])).toEqual([]);
  });

  it("継続 sets the next day; 修正 keeps the plan as it was; 解決 closes it", () => {
    const c = evaluateProblem(base, "a", { result: "継続", note: "転倒なし", nextDue: 7 }, "看護師 佐藤", now)[0];
    expect(c.evalDue).toBe(7);
    expect(evalStatus(c, 0)?.due).toBe(false);
    const m = evaluateProblem(base, "a", { result: "修正", note: "夜のトイレでふらつく", nextDue: 3, revised: { ...body, tp: [...body.tp, "夜はポータブルトイレ"] } }, "看護師 佐藤", now)[0];
    expect(m.tp).toEqual(["ナースコールを手元に", "夜はポータブルトイレ"]);
    expect(m.evaluations[0].before?.tp).toEqual(["ナースコールを手元に"]);
    const s = evaluateProblem(base, "a", { result: "解決", note: "自分で呼べるようになった" }, "看護師 佐藤", now)[0];
    expect(s.closed).toEqual({ day: 0, time: "10:00", by: "看護師 佐藤" });
    expect(evalStatus(s, 0)).toBeNull();
    // A closed problem takes no more evaluations.
    expect(evaluateProblem([s], "a", { result: "継続", note: "x", nextDue: 9 }, "看護師 佐藤", now)[0].evaluations).toHaveLength(1);
  });

  it("checks the evaluation", () => {
    expect(evalProblems(body, { result: "継続", note: "", nextDue: 0 }, 0)).toEqual(["評価の内容（目標に対してどうか）", "次の評価予定日（明日以降）"]);
    expect(evalProblems(body, { result: "修正", note: "x", nextDue: 3, revised: body }, 0)).toEqual(["計画が変わっていません（変えないときは「継続」）"]);
    expect(evalProblems(body, { result: "解決", note: "x" }, 0)).toEqual([]);
  });
});

describe("看護計画：架空のデータ・サマリ", () => {
  it("the 誤嚥性肺炎 patient has #1 due today, with 口腔ケア and 体位変換 under its ケア計画", () => {
    const due = dueEvaluations(INITIAL_PLANS, ["90010244"]);
    expect(due.map((p) => p.no)).toEqual([1]);
    expect(ordersOf(INITIAL_CARE_ORDERS, "np-244-1", "TP").map((o) => o.item)).toEqual(expect.arrayContaining(["口腔ケア", "体位変換"]));
  });

  it("every linked care order points at a problem of the same patient", () => {
    for (const o of INITIAL_CARE_ORDERS.filter((x) => x.plan)) {
      expect(INITIAL_PLANS.find((p) => p.id === o.plan!.problemId)?.patientId).toBe(o.patientId);
    }
  });

  it("templates are complete plans", () => {
    for (const t of PLAN_TEMPLATES) expect(planProblems(t.body, 7, 0)).toEqual([]);
  });

  it("lists the open problems for the nursing summary", () => {
    expect(summaryLines(INITIAL_PLANS, "90010198", (d) => `day${d}`)).toEqual(["#1 心臓の負担がふえ、息苦しさやむくみが強くなるおそれがある（目標：息苦しさなく病棟内を歩け、体重が入院前の体重に近づく。評価予定日 day5）"]);
  });
});
