import { describe, expect, it } from "vitest";
import { checkKisai, type KisaiChart } from "./kisai";
import type { ClaimResult } from "./model";
import type { DocRecord } from "../documents";

export function testClaim(code: string, name = "試験"): ClaimResult {
  return { month: "2026-11", from: 1, to: 7, days: 7, acts: [{ shikibetsu: "90", parts: [{ lines: [{ record: "SI", code, name }], points: 100 }], count: 1, days: { 7: 1 }, basis: "試験" }], totalPoints: 100, meals: { ryoyoYen: 0, futanYen: 0 }, issues: [], sources: [] };
}
const chart: KisaiChart = { patientId: "p", today: "2026-11-07", admittedOn: -6 };
const doc = (kind: DocRecord["kind"], patientId = "p", day = 0): DocRecord => ({ id: "doc", patientId, kind, values: { goal: "試験" }, at: { day, time: "10:00" }, by: "試験医師" });
const row = (code: string, c: Partial<KisaiChart>, id: string, name?: string) => checkKisai(testClaim(code, name), { ...chart, ...c }).find(r => r.id === id)!;
describe("記載・書類の存在点検", () => {
  it("算定されない加算を並べない", () => expect(checkKisai(testClaim("nothing"), chart)).toEqual([]));
  it("入院診療計画：説明の記録／ない／文書だけは人が確認", () => {
    const plan = { days: 7, symptoms: "発熱", treatment: "治療", tests: "採血", surgery: "", other: "", nutritionNeeded: "無" as const, explainedTo: "本人", explainedBy: "医師", explainedAt: { day: -6, time: "12:00" } };
    const get = (c: Partial<KisaiChart>) => row("190199910", c, "admission-plan", "急性期一般入院料４");
    expect(get({ evaluation: { patientId: "p", plan } }).status).toBe("ある");
    expect(get({ documents: [] }).status).toBe("ない");
    expect(get({ documents: [doc("入院診療計画書")] }).status).toBe("人が確かめる");
    const found = get({ evaluation: { patientId: "p", plan } });
    expect(found.evidence[0]).toMatchObject({ date: "2026-11-01", by: "医師", panel: "docs", data: plan });
  });
  it("退院支援計画：ある／ない／未取得", () => {
    expect(row("190192310", { documents: [doc("退院支援計画書")] }, "discharge-plan").status).toBe("ある");
    expect(row("190192310", { documents: [] }, "discharge-plan").status).toBe("ない");
    expect(row("190192310", {}, "discharge-plan").status).toBe("人が確かめる");
  });
  it("別患者と前の入院の文書を採用しない", () => {
    expect(row("190192310", { documents: [doc("退院支援計画書", "other"), doc("退院支援計画書", "p", -10)] }, "discharge-plan").status).toBe("ない");
  });
  it("せん妄：チェックと対策／ない／対策未記録", () => {
    const delirium = { checked: ["70歳以上"], measures: ["脱水の治療・予防"], by: "看護師", at: { day: -5, time: "10:00" } };
    expect(row("190218510", { evaluation: { patientId: "p", delirium } }, "delirium").status).toBe("ある");
    expect(row("190218510", { evaluation: { patientId: "p" } }, "delirium").status).toBe("ない");
    expect(row("190218510", { evaluation: { patientId: "p", delirium: { ...delirium, measures: [] } } }, "delirium").status).toBe("人が確かめる");
  });
  for (const [code, id, kind] of [["113010810", "pharmacy", "服薬指導"], ["113017610", "nutrition-guidance", "栄養食事指導"]] as const) {
    it(`${kind}：当月算定日の記録／ない／別日の記録`, () => {
      const g = { id: "g", patientId: "p", kind, heard: "本人" as const, minutes: 30, text: "記録", by: "指導者", at: { day: 0, time: "10:00" }, answers: [] };
      expect(row(code, { guidance: [g] }, id).status).toBe("ある");
      expect(row(code, { guidance: [] }, id).status).toBe("ない");
      expect(row(code, { guidance: [{ ...g, at: { day: -1, time: "10:00" } }] }, id).status).toBe("人が確かめる");
    });
  }
  it("救急：記事があっても状態の該当性を認定しない", () => {
    const r = row("190171910", { entries: [{ kind: "note", day: -6, time: "10:00", author: "医師", role: "医師", text: "ショック" }] }, "emergency-state");
    expect(r.status).toBe("人が確かめる");
    expect(r.evidence).toHaveLength(1);
    expect(r.basis.section).toContain("A205");
  });
});

describe("追加の記録と対象範囲", () => {
  it("栄養計画：必要性が無なら要求せず、未判断なら人が確認", () => {
    const p = { days: 7, symptoms: "", treatment: "治療", tests: "", surgery: "", other: "", nutritionNeeded: "有" as const, explainedTo: "本人", explainedBy: "医師", explainedAt: { day: -6, time: "12:00" } };
    const n = { goal: "栄養管理", energyKcal: 1600, proteinG: 60, route: "経口" as const, counseling: "本人", reassessOn: 7, by: "栄養士", at: { day: -6, time: "14:00" } };
    const get = (c: Partial<KisaiChart>) => row("190199910", c, "nutrition-plan", "急性期一般入院料４");
    expect(get({ evaluation: { patientId: "p", plan: p, nutrition: n } }).status).toBe("ある");
    expect(get({ evaluation: { patientId: "p", plan: p }, documents: [] }).status).toBe("ない");
    expect(get({}).status).toBe("人が確かめる");
    expect(get({ evaluation: { patientId: "p", plan: { ...p, nutritionNeeded: "無" } } })).toBeUndefined();
  });
  it("認知症は看護計画の内容との対応を人が確認する", () => {
    const p = { id: "n", patientId: "p", no: 1, problem: "認知症に伴う不安", goal: "安心して過ごす", op: ["観察"], tp: ["環境調整"], ep: [], plannedOn: -1, plannedAt: "10:00", by: "看護師", evalDue: 1, evaluations: [] };
    expect(row("190193310", { nursingPlans: [p] }, "dementia-plan")).toMatchObject({ status: "人が確かめる", evidence: [{ key: "n" }] });
    expect(row("190193310", { nursingPlans: [] }, "dementia-plan").status).toBe("ない");
  });
  it("TDM：確認済みの血中濃度と計画／ない／報告日の不明な旧保存", () => {
    const t = { id: "t", patientId: "p", drug: "バンコマイシン", regimen: { dose: 1000, tau: 12, tinf: 1 }, levels: { peak: { t: 2, c: 30 }, trough: { before: 0, c: 10 } }, auc24: 400, cmin: 10, proposal: "医師が治療計画を確認", at: "10:00", by: "薬剤師", status: "確認済" as const, reportedDate: "2026-11-07" };
    expect(row("113000410", { tdmReports: [t] }, "tdm").status).toBe("ある");
    expect(row("113000410", { tdmReports: [] }, "tdm").status).toBe("ない");
    expect(row("113000410", { tdmReports: [{ ...t, reportedDate: undefined }] }, "tdm").status).toBe("人が確かめる");
  });
  it("拘束：終了した記録はある、継続中は終了時間を人が確認、未取得は陰性にしない", () => {
    const r = { id: "r", patientId: "p", devices: ["ミトン"], why: "緊急やむを得ない理由", state: "状況", met: { 切迫性: "理由", 非代替性: "理由", 一時性: "理由" }, tried: "代替策", start: { day: -1, time: "10:00" }, doctor: "医師", confirmedBy: "看護師", family: "家族", reviews: [], end: { at: { day: 0, time: "10:00" }, by: "看護師", note: "解除" } };
    const base = (c: Partial<KisaiChart>) => row("190199910", c, "restraint", "急性期一般入院料４");
    expect(base({ restraints: [r] }).status).toBe("ある");
    expect(base({ restraints: [{ ...r, end: undefined }] }).status).toBe("人が確かめる");
    expect(base({}).status).toBe("人が確かめる");
    expect(base({ restraints: [] })).toBeUndefined();
  });
  it("症状詳記と摘要の接続口は原算定の点数・回数を保持し未照合を明示", async () => {
    const { prepareBillingDocumentation } = await import("./documentation");
    const c = testClaim("unknown");
    const result = prepareBillingDocumentation(c, chart, []);
    expect(result.claim.totalPoints).toBe(c.totalPoints);
    expect(result.claim.acts).toEqual(c.acts);
    expect(result.unverified.kisai[0].code).toBe("unknown");
    expect(result.shoki).toEqual([]);
  });
});

it("紹介状：確定した写し／ない／保存を未取得、欠落判定の入力も返す", () => {
  const l = { id: "l", patientId: "p", status: "確定" as const, type: "紹介" as const, to: "架空病院", dept: "内科", doctor: "医師", purpose: "紹介", body: { diagnosis: "架空病名" }, flags: { consent: true }, createdBy: "医師", createdAt: { day: 0, time: "10:00" }, confirmedBy: "医師", confirmedAt: { day: 0, time: "10:00" } };
  const get = (c: Partial<KisaiChart>) => row("180016110", c, "letter-copy", "診療情報提供料（Ⅰ）");
  expect(get({ letters: [l] }).status).toBe("ある");
  expect(get({ letters: [] })).toMatchObject({ status: "ない", examined: { loaded: true, data: [] } });
  expect(get({}).status).toBe("人が確かめる");
  expect(get({ letters: [{ ...l, status: "下書き" }] }).status).toBe("ない");
});
