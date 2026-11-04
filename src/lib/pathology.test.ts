import { describe, expect, it } from "vitest";
import { caseTitle, daysIn, initialPathology, nextNumber, nextStep, pathResultItems, pathStatus, reportProblems, requestProblems, versionOf, type PathCase } from "./pathology";

const base: PathCase = {
  id: "c1",
  patientId: "p1",
  kind: "組織診",
  site: "胃 前庭部",
  method: "内視鏡下生検",
  containers: 2,
  clinical: "胃潰瘍の疑い",
  question: "悪性の有無",
  ordered: { day: 0, time: "09:00", by: "医師" },
  steps: [],
};

describe("病理：依頼", () => {
  it("lists what a request still lacks; 術中迅速 needs the room, time and phone", () => {
    expect(requestProblems(base)).toEqual([]);
    expect(requestProblems({ ...base, site: "", question: " " })).toEqual(["臓器・部位", "知りたいこと"]);
    expect(requestProblems({ ...base, kind: "術中迅速" })).toEqual(["手術室", "予定の時刻", "結果を伝える電話"]);
    expect(requestProblems({ ...base, kind: "術中迅速", frozen: { room: "手術室2", at: { day: 0, time: "13:00" }, phone: "PHS 2101" } })).toEqual([]);
  });
});

describe("病理：受付と工程", () => {
  it("goes 受付 → the steps of the kind → 報告", () => {
    expect(nextStep(base)).toBe("受付");
    expect(pathStatus(base)).toBe("受付待ち");
    const rec = { ...base, received: { day: 0, time: "10:00", by: "技師", number: "S26-0001" } };
    expect(nextStep(rec)).toBe("切り出し");
    expect(pathStatus(rec)).toBe("工程中");
    const steps = ["切り出し", "標本作製", "鏡検"].map((step) => ({ step, day: 0, time: "11:00", by: "技師" }));
    expect(nextStep({ ...rec, steps })).toBe("報告");
    expect(nextStep({ ...rec, kind: "細胞診", steps: steps.slice(1) })).toBe("報告");
    expect(nextStep({ ...rec, kind: "術中迅速", steps: [] })).toBe("凍結切片作製");
  });
  it("numbers cases by kind and year", () => {
    const cases: PathCase[] = [
      { ...base, received: { day: 0, time: "10:00", by: "技師", number: "S26-0012" } },
      { ...base, received: { day: 0, time: "10:00", by: "技師", number: "S25-0400" } },
      { ...base, kind: "細胞診", received: { day: 0, time: "10:00", by: "技師", number: "C26-0003" } },
    ];
    expect(nextNumber(cases, "組織診", 2026)).toBe("S26-0013");
    expect(nextNumber(cases, "細胞診", 2026)).toBe("C26-0004");
    expect(nextNumber(cases, "術中迅速", 2026)).toBe("F26-0001");
  });
  it("counts the days since 受付", () => {
    expect(daysIn(base, 600)).toBeNull();
    expect(daysIn({ ...base, received: { day: -2, time: "10:00", by: "技師", number: "S26-1" } }, 600)).toBe(2);
  });
});

describe("病理：報告と既読", () => {
  const done: PathCase = {
    ...base,
    received: { day: 0, time: "10:00", by: "技師", number: "S26-0001" },
    steps: ["切り出し", "標本作製", "鏡検"].map((step) => ({ step, day: 0, time: "11:00", by: "技師" })),
  };
  it("needs the steps done and a diagnosis; a correction needs a reason", () => {
    expect(reportProblems(base, { diagnosis: "x" })[0]).toContain("受付");
    expect(reportProblems(done, { diagnosis: "" })).toEqual(["病理診断を書いてください。"]);
    expect(reportProblems(done, { diagnosis: "慢性胃炎" })).toEqual([]);
    const reported = { ...done, report: { day: 0, time: "15:00", diagnosis: "慢性胃炎", findings: "", by: "病理医", important: false } };
    expect(reportProblems(reported, { diagnosis: "慢性胃炎、H. pylori 様の菌体あり" })).toEqual(["訂正・追加報告の理由を書いてください。"]);
  });
  it("turns each version of a report into a result to read", () => {
    const r1 = { day: 0, time: "15:00", diagnosis: "慢性胃炎", findings: "", by: "病理医", important: false };
    const one = pathResultItems([{ ...done, report: r1 }]);
    expect(one[0]).toMatchObject({ key: "path|c1|v1", kind: "病理", detail: "慢性胃炎", panic: [] });
    const two = pathResultItems([{ ...done, report: { ...r1, time: "16:00", important: true, reason: "免疫染色の追加" }, earlier: [r1] }]);
    expect(two[0].key).toBe("path|c1|v2");
    expect(two[0].detail).toContain("【重要な所見】");
    expect(two[0].corrected).toContain("免疫染色の追加");
    expect(versionOf({ ...done, report: r1, earlier: [r1] })).toBe(2);
  });
  it("names a case without repeating the site", () => {
    expect(caseTitle(base)).toBe("組織診 胃 前庭部（内視鏡下生検）");
    expect(caseTitle({ kind: "細胞診", site: "喀痰", method: "喀痰" })).toBe("細胞診 喀痰");
    expect(caseTitle({ kind: "細胞診", site: "尿", method: "尿（自然尿）" })).toBe("細胞診 尿（自然尿）");
  });
  it("starts with three fictional cases at different steps", () => {
    const cs = initialPathology(10 * 60);
    expect(cs.map(pathStatus)).toEqual(["報告済み", "工程中", "受付待ち"]);
    expect(pathResultItems(cs)).toHaveLength(1);
  });
});
