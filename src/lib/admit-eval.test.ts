import { describe, expect, it } from "vitest";
import {
  dayOfStay,
  deliriumBillable,
  dischargeSupportMet,
  duesOf,
  initialEvals,
  nutritionChanges,
  nutritionVersions,
  pressurePlanNeeded,
  reviseNutrition,
  revisionProblems,
  suggestions,
  type AdmitEval,
  type NutritionRecord,
} from "./admit-eval";

const at = (day: number) => ({ day, time: "10:00" });
const due = (e: AdmitEval, admittedOn: number, key: string) => duesOf(e, admittedOn).find((d) => d.key === key)!;

describe("admission assessments", () => {
  it("counts the admission day as day 1", () => {
    expect(dayOfStay(-3, 7)).toBe(3);
    expect(dayOfStay(0, 3)).toBe(2);
  });

  it("入院診療計画書 is due by day 7; the nutrition plan follows its answer", () => {
    const e: AdmitEval = { patientId: "p" };
    expect(due(e, -6, "plan")).toMatchObject({ dueOn: 0, state: "今日まで" });
    expect(due(e, -7, "plan").state).toBe("期限切れ");
    const withPlan = (n: "有" | "無", emergency = false): AdmitEval => ({
      patientId: "p",
      emergency,
      plan: { days: 14, symptoms: "s", treatment: "t", tests: "", surgery: "", other: "", nutritionNeeded: n, explainedTo: "本人", explainedBy: "医師", explainedAt: at(-2) },
    });
    expect(due(withPlan("無"), -2, "nutrition").state).toBe("不要");
    expect(due(withPlan("有"), -2, "nutrition")).toMatchObject({ dueOn: -2, state: "期限切れ" });
    expect(due(withPlan("有", true), -2, "nutrition")).toMatchObject({ dueOn: 4, state: "期限内" });
  });

  it("a pressure-ulcer risk needs a care plan before it counts as done", () => {
    const r = { adl: "C2" as const, items: { turn: true }, ulcerNow: false, plan: "", by: "看護師", at: at(0) };
    expect(pressurePlanNeeded(r)).toBe(true);
    expect(due({ patientId: "p", pressure: r }, 0, "pressure").state).not.toBe("済");
    expect(due({ patientId: "p", pressure: { ...r, plan: "2時間ごとの体位変換" } }, 0, "pressure").state).toBe("済");
    expect(pressurePlanNeeded({ ...r, adl: "A1" })).toBe(false);
  });

  it("せん妄: risk factors need measures; the add-on applies when checked within 3 days", () => {
    const e: AdmitEval = { patientId: "p", delirium: { checked: ["70歳以上"], measures: [], by: "看護師", at: at(-1) } };
    expect(due(e, -2, "delirium").state).not.toBe("済");
    expect(deliriumBillable(e, -2)).toBe(false);
    const done: AdmitEval = { ...e, delirium: { ...e.delirium!, measures: ["早期離床の取組"] } };
    expect(deliriumBillable(done, -2)).toBe(true);
    expect(deliriumBillable(done, -5)).toBe(false);
  });

  it("退院支援: extraction by day 3, then talk, plan and conference by day 7", () => {
    const ds = { factors: ["イ"], note: "", extractedBy: "MSW", extractedAt: at(-3), talkedAt: at(-1), planStartedAt: at(-1), conferenceAt: at(0) };
    expect(dischargeSupportMet({ patientId: "p", discharge: ds }, -4)).toBe(true);
    expect(dischargeSupportMet({ patientId: "p", discharge: { ...ds, conferenceAt: at(4) } }, -4)).toBe(false);
    expect(due({ patientId: "p", discharge: { ...ds, factors: [] } }, -4, "talk").state).toBe("不要");
  });

  it("suggests from age, diagnosis and arrival; a person confirms", () => {
    expect(suggestions({ age: 86, admissionDiagnosis: "誤嚥性肺炎" }, true)).toEqual({ delirium: ["70歳以上"], discharge: ["ア", "イ"] });
    expect(suggestions({ age: 64, admissionDiagnosis: "急性腎盂腎炎" }, false)).toEqual({ delirium: [], discharge: [] });
  });

  it("the fictional record leaves some items open", () => {
    const oura = initialEvals().find((e) => e.patientId === "90010244")!;
    expect(due(oura, -1, "fall").state).toBe("期限切れ");
    expect(due(oura, -1, "pressure").state).toBe("今日まで");
    const kita = initialEvals().find((e) => e.patientId === "90010198")!;
    expect(due(kita, -5, "reassess")).toMatchObject({ dueOn: 0, state: "今日まで", who: ["管理栄養士"] });
  });
});

describe("栄養の再評価と栄養管理計画書の版", () => {
  const plan = (n: "有" | "無") => ({ days: 14, symptoms: "s", treatment: "t", tests: "", surgery: "", other: "", nutritionNeeded: n, explainedTo: "本人", explainedBy: "医師", explainedAt: at(-5) });
  const first: NutritionRecord = { goal: "体重を戻す", energyKcal: 1600, proteinG: 60, route: "経口", counseling: "", reassessOn: -1, by: "管理栄養士 高橋", at: { day: -5, time: "17:50" } };
  it("the reassessment is due on the day the plan set; not needed without a plan", () => {
    expect(due({ patientId: "p", plan: plan("有"), nutrition: first }, -5, "reassess")).toMatchObject({ dueOn: -1, state: "期限切れ" });
    expect(due({ patientId: "p", plan: plan("有"), nutrition: { ...first, reassessOn: 3 } }, -5, "reassess").state).toBe("期限内");
    expect(due({ patientId: "p", plan: plan("有") }, -5, "reassess")).toMatchObject({ state: "不要", note: "栄養管理計画書を作ると、計画書で決めた再評価の日がここに出ます" });
    expect(due({ patientId: "p", plan: plan("無") }, -5, "reassess").state).toBe("不要");
  });
  it("a revision keeps every earlier version with who and when", () => {
    const next = reviseNutrition(first, { ...first, energyKcal: 1400, reassessOn: 7 }, "管理栄養士 佐々木", { day: 0, time: "11:00" }, { kind: "再評価", reason: " 食事量が5割。量を減らす " });
    expect(nutritionVersions(next).map((v) => `${v.at.day} ${v.by} ${v.revision?.kind ?? "作成"}`)).toEqual(["-5 管理栄養士 高橋 作成", "0 管理栄養士 佐々木 再評価"]);
    expect(next.revision).toEqual({ kind: "再評価", reason: "食事量が5割。量を減らす" });
    expect(next.energyKcal).toBe(1400);
    const third = reviseNutrition(next, { ...next, goal: "体重を目標まで戻す" }, "管理栄養士 高橋", { day: 0, time: "12:00" }, { kind: "訂正", reason: "目標の書き間違い" });
    expect(nutritionVersions(third)).toHaveLength(3);
    expect(nutritionVersions(third)[1]).not.toHaveProperty("earlier");
    expect(nutritionChanges(nutritionVersions(third)[0], nutritionVersions(third)[1])).toEqual(["エネルギー：1600kcal → 1400kcal", "再評価の日：昨日 → 7日後"]);
  });
  it("the reassessment moves the next due day; the plan still counts as made on its first day", () => {
    const ev: AdmitEval = { patientId: "p", plan: plan("有"), nutrition: reviseNutrition(first, { ...first, reassessOn: 7 }, "管理栄養士 高橋", { day: 0, time: "11:00" }, { kind: "再評価", reason: "" }) };
    expect(due(ev, -5, "reassess")).toMatchObject({ dueOn: 7, state: "期限内", note: "前回の再評価：今日 11:00 管理栄養士 高橋" });
    expect(due(ev, -5, "nutrition")).toMatchObject({ doneOn: -5, state: "済" });
  });
  it("what must be filled before a revision is saved", () => {
    expect(revisionProblems({ ...first, reassessOn: 0 }, { kind: "再評価", reason: "" })).toEqual(["再評価したので、次の再評価の日（1日後より先）を決めてください。"]);
    expect(revisionProblems(first, { kind: "訂正", reason: " " })).toEqual(["訂正の理由を書いてください。"]);
    expect(revisionProblems({ ...first, reassessOn: 7 }, { kind: "再評価", reason: "" })).toEqual([]);
  });
});
