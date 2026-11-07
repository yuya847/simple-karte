import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KisaiChecks } from "./KisaiPanel";
import { ShokiPanel } from "./ShokiPanel";
import { RoleProvider } from "../RoleContext";
import { checkKisai, type KisaiChart } from "@/lib/billing/kisai";
import { factChips, kisaiTarget, saveShoki, shokiSeriesOf } from "@/lib/billing/kisai-view";
import { kisaiWorkspace } from "@/lib/billing/kisai-workspace";
import { collectShokiFacts, currentShoki } from "@/lib/billing/shoki";
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

describe("記載・書類：症状詳記", () => {
  const facts = collectShokiFacts({ today: "2026-11-07", month: "2026-11", diagnoses: [], labs: [{ day: -2, time: "06:00", values: { CRP: 12.1 } }, { day: 0, time: "06:00", values: { CRP: 3.4 } }], entries: [{ kind: "note", id: "n1", day: -1, time: "10:00", author: "医師 試験", role: "医師", text: "解熱した\n抗菌薬を継続" }] });
  const target = { code: "160183610", kubun: "D310 3", name: "試験の検査", points: 1700, shikibetsu: "60" as const };
  const required = [{ target, basis: { source: "table" as const, section: "別表Ⅰ 項番366", text: "患者の症状詳記を記載" }, alternative: "摘要欄でも可" as const }];
  const base = { facts, patientId: "p", month: "2026-11", at: "2026-11-07T12:00:00+09:00", newId: () => "x" };
  const render = (role: "医師" | "医事課", props: Partial<Parameters<typeof ShokiPanel>[0]> = {}) => renderToStaticMarkup(<RoleProvider value={role}><ShokiPanel required={[]} saved={kisaiWorkspace()} {...base} {...props} /></RoleProvider>);
  it("要る項目がない月は「この月はありません」と、任意で付ける「詳記を書く」（書くのは医師）", () => {
    expect(render("医師")).toContain("この月はありません");
    expect(render("医師")).toContain("詳記を書く");
    expect(render("医事課")).not.toContain("詳記を書く");
    expect(render("医事課")).toContain("症状詳記の記載と確定は医師が行います");
  });
  it("要る項目を挙げ、確定した版と下書きを出す", () => {
    expect(render("医師", { required })).toContain("試験の検査（D310 3）");
    expect(render("医師", { required })).toContain("まだ");
    let ids = 0;
    const input = { patientId: "p", month: "2026-11", targets: [target], category: "03" as const, body: "第1版", by: "医師 試験", at: base.at, newId: () => `s${++ids}` };
    const v1 = saveShoki(kisaiWorkspace(), input, "確定");
    const html = render("医師", { required, saved: v1 });
    expect(html).toContain("確定 第1版 11/7 医師 試験");
    expect(html).toContain("直す");
  });
  it("確定した版は残り、直すと次の版の下書き。レセプトに載るのは確定した最新の版だけ", () => {
    let ids = 0;
    const input = { patientId: "p", month: "2026-11", targets: [target], category: "03" as const, body: "第1版", by: "医師 試験", at: base.at, newId: () => `s${++ids}` };
    const v1 = saveShoki(saveShoki(kisaiWorkspace(), input, "下書き"), { ...input, series: "s1" }, "確定");
    expect(v1.shoki).toHaveLength(1);
    const d2 = saveShoki(v1, { ...input, series: "s1", body: "第2版" }, "下書き");
    expect(d2.shoki.map((s) => [s.id, s.version, s.status])).toEqual([["s1", 1, "確定"], ["s2", 2, "下書き"]]);
    expect(currentShoki(d2.shoki).map((s) => s.body)).toEqual(["第1版"]);
    const v2 = saveShoki(d2, { ...input, series: "s1", body: "第2版" }, "確定");
    expect(currentShoki(v2.shoki).map((s) => s.body)).toEqual(["第2版"]);
    expect(shokiSeriesOf(v2.shoki, "p", "2026-11")[0].versions.map((s) => s.version)).toEqual([1, 2]);
  });
  it("カルテの事実を並べる：検査は項目ごとに日付順、経過は見出し（文は作らない）", () => {
    const chips = factChips(facts);
    expect(chips.find((c) => c.group === "検査")?.text).toMatch(/12\.1（11\/5）→3\.4（11\/7）$/);
    expect(chips.find((c) => c.group === "経過")?.text).toBe("11/6 解熱した");
  });
});
