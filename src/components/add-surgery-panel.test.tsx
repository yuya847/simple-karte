import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { STAFF } from "@/lib/roles";
import { initialSurgeries } from "@/lib/surgery";
import { MeProvider, RoleProvider } from "./RoleContext";
import { AddSurgeryPanel } from "./panels/AddSurgeryPanel";
it("患者を引用して各室の空きを表示し、必要事項のない申込は保存できない", () => {
  const p = PATIENTS[0];
  const html = renderToStaticMarkup(<RoleProvider value="医師"><MeProvider value={STAFF.医師}><AddSurgeryPanel patient={p} today={{ y: 2026, m: 11, d: 6 }} nowTime="10:00" surgeries={initialSurgeries(0)} onSave={() => {}} /></MeProvider></RoleProvider>);
  for (const text of [p.name, p.department, "手術室1", "手術室2", "手術室3", "硬膜外麻酔", "伝達麻酔", "抗凝固薬の中止", "特記"]) expect(html).toContain(text);
  expect(html).toContain('type="date"');
  expect(html).toMatch(/<button type="submit" disabled=""/);
});
