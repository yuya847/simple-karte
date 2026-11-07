import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KisaiChecks } from "./KisaiPanel";
import { checkKisai, type KisaiChart } from "@/lib/billing/kisai";
import { kisaiTarget } from "@/lib/billing/kisai-view";
import type { ClaimResult } from "@/lib/billing/model";

const claim = (lines: [string, string][]): ClaimResult => ({ month: "2026-11", from: 1, to: 7, days: 7, acts: lines.map(([code, name]) => ({ shikibetsu: "90" as const, parts: [{ lines: [{ record: "SI" as const, code, name }], points: 100 }], count: 1, days: { 1: 1 }, basis: "試験" })), totalPoints: 100, meals: { ryoyoYen: 0, futanYen: 0 }, issues: [], sources: [] });
const plan = { days: 7, symptoms: "発熱", treatment: "治療", tests: "採血", surgery: "", other: "", nutritionNeeded: "無" as const, explainedTo: "本人", explainedBy: "医師 試験", explainedAt: { day: -6, time: "12:00" } };
const chart: KisaiChart = { patientId: "p", today: "2026-11-07", admittedOn: -6, evaluation: { patientId: "p", plan }, documents: [], entries: [] };
const c = claim([["190199910", "急性期一般入院料４"], ["190192310", "入退院支援加算１"], ["190171910", "救急医療管理加算１"], ["160000310", "試験の検査"]]);
const checks = checkKisai(c, chart);

describe("記載・書類：点検", () => {
  it("加算ごとに1行：名前・要るもの・状態（ある＝誰・いつ／ない）と、開く・作るの道具", () => {
    const html = renderToStaticMarkup(<KisaiChecks claim={c} checks={checks} onOpen={() => {}} />);
    expect(html).toContain("急性期一般入院料４");
    expect(html).toContain("入院診療計画・文書による説明の記録");
    expect(html).toMatch(/ある<\/span><span[^>]*>医師 試験 11\/1 12:00/);
    expect(html).toContain("開く：書類作成");
    expect(html).toContain("作る：退院支援");
    expect(html).toContain("作る：テンプレート");
    // 「ない」は算定の可否ではない：算定しない・不可とは書かない。
    expect(html).not.toMatch(/算定しない|算定できない|不可/);
  });
  it("根拠の告示・通知の文は行を開いたときだけ", () => {
    const html = renderToStaticMarkup(<KisaiChecks claim={c} checks={checks} />);
    expect(html).not.toContain("入院後7日以内に文書で説明し");
    expect(html).not.toContain("作る：");
  });
  it("点検していない算定項目を隠さない", () => {
    expect(renderToStaticMarkup(<KisaiChecks claim={c} checks={checks} />)).toContain("点検していない算定項目（1件）");
  });
  it("押したときの行き先：ある→記録、ない→作る道具、救急の根拠→テンプレート、入院時の記事→その日", () => {
    const by = (id: string) => kisaiTarget(checks.find((x) => x.id === id)!);
    expect(by("admission-plan")).toEqual({ panel: "docs", key: "evaluation.plan" });
    expect(by("discharge-plan")).toEqual({ panel: "msw-support" });
    const nutrition = checkKisai(c, { ...chart, evaluation: { patientId: "p", plan: { ...plan, nutritionNeeded: "有" } }, documents: [] }).find((x) => x.id === "nutrition-plan")!;
    expect(kisaiTarget(nutrition)).toEqual({ panel: "nutrition" });
    expect(by("emergency-state")).toEqual({ panel: "templates" });
    const withNote = checkKisai(c, { ...chart, entries: [{ kind: "note", id: "n", day: -6, time: "09:00", author: "医師 試験", role: "医師", text: "JCS 30" }] }).find((x) => x.id === "emergency-state")!;
    expect(kisaiTarget(withNote)).toEqual({ panel: "billing", day: -6 });
  });
});
