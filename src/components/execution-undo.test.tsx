import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { cancelAdministration, type AdminRecord } from "@/lib/mar";
import { STAFF, type Role } from "@/lib/roles";
import { MeProvider, RoleProvider } from "./RoleContext";
import { InjectionDoseToggle } from "./InjectionDoseToggle";
import { ExecutionUndo } from "./ExecutionUndo";
const r: AdminRecord = { key: "o|480", orderId: "o", patientId: "p", at: 480, status: "実施", doneAt: "08:00", by: "看護師", checked: { patient: true, label: true } };
const as = (role: Role, child: React.ReactElement) => renderToStaticMarkup(<RoleProvider value={role}><MeProvider value={STAFF[role]}>{child}</MeProvider></RoleProvider>);
const dose = (record: AdminRecord) => <InjectionDoseToggle patientId="p" orderId="o" at={480} time="08:00" record={record} execute={{ records: { [r.key]: record }, sessionStart: 500, nowTime: "10:00", onRecord: () => {}, onVoid: () => {} }} />;
it("看護師は注射の共通メニューを開ける。取り消し後は記録なしの薄い✓に戻る", () => {
  expect(as("看護師", dose(r))).toContain('data-dose-menu="true"');
  const html = as("看護師", dose(cancelAdministration(r, "看護師", "2026-11-04T01:00:00Z", "誤って押した")));
  expect(html).toContain("✓ 08:00");
  expect(html).toContain("text-wakatake/70");
  expect(html).toContain("記録のない過去の回");
});
it("実施できない職種には注射を戻すボタンを出さない", () => {
  expect(as("薬剤師", dose(r))).not.toContain("<button");
});
it("部門ごとの実施権限で取り消しを出す", () => {
  const control = <ExecutionUndo action="ris.exam" patient="架空の患者" detail="CT" onUndo={() => {}} />;
  expect(as("診療放射線技師", control)).toContain("未実施に戻す");
  expect(as("看護師", control)).toBe("");
});
