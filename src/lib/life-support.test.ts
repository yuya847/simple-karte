import { describe, expect, it } from "vitest";
import { appendConference, appendReassessment, currentScreening, lifeLines, supportTags, conferenceText, coordinationText } from "./life-support";
import { summaryFacts, DESTINATIONS } from "./summary";
import { transferSummary } from "./transfer";
import { PATIENTS } from "./patients";
import type { DischargeSupport } from "./admit-eval";

describe("退院支援の追記と引継ぎ", () => {
  it("初回の抽出と着手の日時を保持し、再評価を順に残す", () => {
    const first: DischargeSupport = { factors: ["ア"], note: "初回", extractedAt: { day: -5, time: "10:00" }, extractedBy: "看護師", planStartedAt: { day: -4, time: "11:00" } };
    const second = appendReassessment(first, { date: "2026-11-06", factors: ["ク"], note: "家族と再確認", by: "MSW" });
    const third = appendReassessment(second, { date: "2026-11-07", factors: [], note: "調整済み", by: "MSW" });
    expect(third.extractedAt).toEqual(first.extractedAt);
    expect(third.planStartedAt).toEqual(first.planStartedAt);
    expect(first.reassessments).toBeUndefined();
    expect(third.reassessments).toHaveLength(2);
    expect(currentScreening(third)?.note).toBe("調整済み");
  });
  it("開催記録を追記し、初回の開催日時は上書きしない", () => {
    const first: DischargeSupport = { factors: ["ア"], note: "", extractedBy: "MSW", extractedAt: { day: -4, time: "10:00" } };
    const c = { date: "2026-11-06", time: "14:00", people: ["本人"], agreement: "方針", nextAction: "確認", by: "MSW" };
    const second = appendConference(first, c, { y: 2026, m: 11, d: 7 });
    const third = appendConference(second, { ...c, date: "2026-11-07" }, { y: 2026, m: 11, d: 7 });
    expect(second.conferenceAt).toEqual({ day: -1, time: "14:00", by: "MSW" });
    expect(third.conferenceAt).toEqual(second.conferenceAt);
    expect(third.conferences).toHaveLength(2);
    expect(first.conferences).toBeUndefined();
  });
  it("期限は今日を除外し、退院接近は0〜3日、退院済みは除外する", () => {
    expect(supportTags({ due: "2026-11-06", waiting: true }, "2026-11-07", 3)).toEqual(["返答待ち", "期限切れ", "退院が近い（3日以内）"]);
    expect(supportTags({ due: "2026-11-07" }, "2026-11-07", 4)).toEqual([]);
    expect(supportTags(undefined, "2026-11-07", -1)).toEqual([]);
    expect(supportTags({ waiting: true }, "2026-11-07", 0, true)).toEqual([]);
    expect(supportTags(undefined, "2026-11-07", null, false, true)).toEqual(["返答待ち"]);
  });
  it("生活・制度は連携サマリに反映し、匿名の打診には氏名・住所を移さない", () => {
    const lifeSupport = { careLevel: "要介護2", application: "申請中", housing: "家族と同居", keyPerson: "長女（試験 花子）", careManager: "試験 担当", family: "長女", programs: "難病", nextAction: "訪問看護へ確認" };
    const facts = summaryFacts(PATIENTS[0], [], { y: 2026, m: 11, d: 7 }, { diagnoses: [], evals: { patientId: PATIENTS[0].id, lifeSupport } });
    expect(facts.find(s => s.heading === "生活・制度")?.lines).toEqual(lifeLines(lifeSupport));
    const transfer = transferSummary(PATIENTS[0], [], { restrained: false, lifeSupport }).join("\n");
    expect(transfer).toContain("介護保険：要介護2");
    expect(transfer).toContain("介護保険の申請：申請中");
    expect(transfer).toContain("制度：難病");
    expect(transfer).toContain("キーパーソン（続柄）：長女");
    expect(transfer).not.toContain("試験");
    expect(transferSummary(PATIENTS[0], [], { restrained: false, lifeSupport: { programs: "難病なし" } }).join("\n")).not.toContain("制度：難病");
    expect(DESTINATIONS).toContain("地域連携室（院内）");
  });
  it("開催日時・参加者・合意・次の行動と院内引継ぎを経過へ残せる", () => {
    const c = conferenceText({ date: "2026-11-07", time: "14:30", people: ["本人", "家族", "訪問看護"], agreement: "自宅へ", nextAction: "訪問日確認", by: "MSW" });
    for (const v of ["2026-11-07 14:30", "本人・家族・訪問看護", "自宅へ", "訪問日確認", "MSW"]) expect(c).toContain(v);
    const words = coordinationText({ pending: "空床", owner: "伊藤", due: "2026-11-08", receipt: "受領済み" });
    for (const v of ["空床", "伊藤", "2026-11-08", "受領済み"]) expect(words).toContain(v);
  });
});
