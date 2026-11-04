import { describe, expect, it } from "vitest";
import { ANAMNESIS_SECTIONS, anamnesisChanges, anamnesisProblems, anamnesisSummary, anamnesisVersions, answered, careToProfile, emptyAnamnesis, evalHints, saveAnamnesis, type AnamnesisFields } from "./anamnesis";
import { DELIRIUM_RISKS, DISCHARGE_FACTORS, FALL_RISKS } from "./admit-eval";
import { PATIENTS } from "./patients";
import { summaryFacts } from "./summary";

const oura: AnamnesisFields = {
  ...emptyAnamnesis(),
  reason: "3日前から咳と熱。食事でむせる",
  pastHistory: "高血圧、脳梗塞（5年前）",
  living: "独居",
  family: "長女が隣町に住む",
  keyPerson: "長女",
  adlRank: "B1",
  care: { 移動: "歩行器", 食事: "一部介助", 排泄: "一部介助", 入浴: "全介助" },
  fallHistory: "あり",
  nightToilet: "あり",
  cognition: "認知症と言われている",
  deliriumHistory: "あり",
  sleep: "睡眠薬を使っている",
  careInsurance: "なし（申請していない）",
  admissionsYear: "2回以上",
  hope: "家に帰りたい",
  goHome: "自宅",
};

describe("the form", () => {
  it("every one-of-many answer offered exists, and empty counts as not answered", () => {
    expect(answered(emptyAnamnesis()).done).toBe(0);
    expect(answered(oura).done).toBeGreaterThan(10);
    const keys = ANAMNESIS_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("versions", () => {
  it("the first save needs an answer; an update needs a change and a reason, and keeps the earlier version", () => {
    expect(anamnesisProblems(undefined, emptyAnamnesis(), "")).toEqual(["まだ何も聞き取っていません。"]);
    const v1 = saveAnamnesis(undefined, "90010244", oura, "看護師 佐藤", { day: -1, time: "20:00" }, "");
    expect(anamnesisProblems(v1, oura, "")).toEqual(["直したところがまだありません。", "更新の理由を書いてください。"]);
    const next = { ...oura, keyPerson: "長男", care: { ...oura.care, 移動: "車椅子" } };
    expect(anamnesisChanges(oura, next)).toEqual(["介助：移動 歩行器・食事 一部介助・排泄 一部介助・入浴 全介助 → 移動 車椅子・食事 一部介助・排泄 一部介助・入浴 全介助", "キーパーソン（続柄・名前）：長女 → 長男"]);
    const v2 = saveAnamnesis(v1, "90010244", next, "看護師 佐藤", { day: 0, time: "10:00" }, "長女から聞き直した");
    expect(anamnesisVersions(v2).map((v) => v.reason ?? "")).toEqual(["", "長女から聞き直した"]);
    expect(v2.earlier?.[0].fields.keyPerson).toBe("長女");
  });
});

describe("what flows on", () => {
  it("candidates for 入院時の評価 are items of those forms, each with the answer it came from", () => {
    const h = evalHints(oura);
    expect(h.adl).toBe("B1");
    expect(h.fall).toEqual(["転倒・転落歴", "歩行時に介助が必要", "頻尿や夜間の排泄行動", "認知機能低下・せん妄など", "向精神薬の使用"]);
    expect(h.delirium).toEqual(["認知症", "せん妄の既往"]);
    expect(h.discharge).toEqual(["ア", "ウ", "ケ", "コ", "シ"]);
    for (const x of h.fall) expect(FALL_RISKS).toContain(x);
    for (const x of h.delirium) expect(DELIRIUM_RISKS).toContain(x);
    for (const x of h.discharge) expect(DISCHARGE_FACTORS.map((f) => f.key)).toContain(x);
    expect(h.why["歩行時に介助が必要"]).toBe("情報収集：移動 歩行器");
    expect(evalHints(emptyAnamnesis())).toEqual({ fall: [], delirium: [], discharge: [], why: {} });
  });

  it("help needed goes into the profile only where it differs", () => {
    expect(careToProfile(oura, { 移動: { value: "歩行器" } }).map((c) => c.kind === "care" && c.key)).toEqual(["食事", "排泄", "入浴"]);
    expect(careToProfile(oura, { 移動: { value: "歩行器" } })[0]).toMatchObject({ kind: "care", key: "食事", value: "一部介助", reason: "入院時の情報収集から" });
  });

  it("the nursing summary gets the life before admission", () => {
    expect(anamnesisSummary(oura)).toContain("入院前の ADL：自立度 B1・移動 歩行器・食事 一部介助・排泄 一部介助・入浴 全介助");
    expect(anamnesisSummary(oura)).toContain("退院後の希望：本人「家に帰りたい」、過ごしたい場所 自宅");
    const p = PATIENTS.find((x) => x.id === "90010244")!;
    const s = summaryFacts(p, [], { y: 2026, m: 11, d: 4 }, { diagnoses: [], anamnesis: oura });
    expect(s.find((x) => x.heading === "入院前の生活（入院時の情報収集）")?.lines[0]).toBe("既往歴：高血圧、脳梗塞（5年前）");
    expect(summaryFacts(p, [], { y: 2026, m: 11, d: 4 }, { diagnoses: [] }).some((x) => x.heading.startsWith("入院前の生活"))).toBe(false);
  });
});
