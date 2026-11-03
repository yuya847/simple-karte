import { describe, expect, it } from "vitest";
import { dayOfStay, deliriumBillable, dischargeSupportMet, duesOf, initialEvals, pressurePlanNeeded, suggestions, type AdmitEval } from "./admit-eval";

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
  });
});
