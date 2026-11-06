import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RoleProvider } from "./RoleContext";
import { DischargeForm } from "./AdmitEvalView";
import { DocsPanel } from "./panels/DocsPanel";
import { groupsFor } from "./ToolRail";
import { PATIENTS } from "@/lib/patients";
import type { WorkPatient } from "@/lib/worksheet";

it("MSWの最初の道具は退院支援・転院調整・面談・生活制度", () => {
  expect(groupsFor("MSW")[0].main.slice(0, 4).map(t => t.label)).toEqual(["退院支援", "転院・施設の調整", "面談記録", "生活・制度"]);
});
it("済の患者も要因・メモを編集して再評価とカンファレンスを追記できる", () => {
  const patient = PATIENTS[0];
  const html = renderToStaticMarkup(<RoleProvider value="MSW"><DischargeForm w={{ patient } as WorkPatient} ev={{ patientId: patient.id, discharge: { factors: ["ア"], note: "初回", extractedAt: { day: -2, time: "10:00" }, extractedBy: "看護師" } }} nowTime="14:00" today={{ y: 2026, m: 11, d: 7 }} onSave={() => {}} /></RoleProvider>);
  expect(html).toContain("再評価を追記");
  expect(html).toContain("開催記録を追記");
  expect(html).not.toContain("readOnly");
  expect(html).not.toMatch(/type="checkbox" disabled/);
});
it("計画書を直接開くと書類一覧と他の保存書類を表示しない", () => {
  const html = renderToStaticMarkup(<RoleProvider value="MSW"><DocsPanel patient={PATIENTS[0]} auto={() => ({})} saved={[]} today="11/7" initialKind="退院支援計画書" onSave={() => {}} onOpenReferral={() => {}} /></RoleProvider>);
  expect(html).toContain("退院支援計画書を作成");
  expect(html).not.toContain("死亡診断書");
  expect(html).not.toContain("書類を検索");
});
