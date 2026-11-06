import { describe, expect, it } from "vitest";
import { readNotebook } from "./notebook";
import { shidoFacts } from "./shido";
import type { BroughtReport } from "./pharmacy";
import { PATIENTS } from "./patients";

 describe("手帳の用法", () => {
  it("食後の記載と頓用の回数分を保持し、実施予定の区分を分ける", () => {
    const rows = readNotebook("2026年10月20日 あおば内科\nRp1　ノルバスク錠5mg　1回1錠　1日1回　朝食後　28日分\nRp2　マグミット錠330mg　1回2錠　1日2回　朝夕食後　28日分\nRp3　カロナール錠500　1回1錠　頓用　疼痛時　10回分");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ timings: ["朝"], usage: "1日1回　朝食後　28日分", amount: 1 });
    expect(rows[1]).toMatchObject({ timings: ["朝", "夕"], amount: 2 });
    expect(rows[1].usage).toContain("朝夕食後");
    expect(rows[2]).toMatchObject({ timings: [], daysLeft: null });
    expect(rows[2].usage).toContain("10回分");
    expect(readNotebook("あおば内科 名前 日付だけ")).toEqual([]);
  });
  it("鑑別報告を服薬指導のカルテ情報に含め、中止した持参薬を除く", () => {
    const p = PATIENTS[0];
    const rows = readNotebook("ノルバスク錠5mg　1回1錠　1日1回　朝食後　28日分").map((r) => ({ ...r, match: "ORAL-AMLO5", checked: true, decision: null }));
    const report: BroughtReport = { id: "report", patientId: p.id, rows, at: "09:00", by: "薬剤師", status: "医師へ報告" };
    expect(shidoFacts(p, [], [report]).drugs[0].text).toContain("朝食後");
    expect(shidoFacts(p, [], [{ ...report, rows: rows.map((r) => ({ ...r, decision: "中止" })) }]).drugs).toHaveLength(0);
  });
});
