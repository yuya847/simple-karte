import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplateForm } from "./NoteTemplates";
import { TemplateEditor } from "./TemplateEditor";
import type { TemplateFacts } from "@/lib/note-templates";
const facts: TemplateFacts = { today: { y: 2026, m: 11, d: 6 }, patient: { id: "p001", age: 50, sex: "男", heightCm: 170, weightKg: 65, allergies: [], infections: [], admittedOn: -2, labs: [], vitals: [] } };
const body = '<combo label="疼痛">なし|あり</combo> <list label="部位">頭|胸</list> <list multiple label="症状">咳|痰</list> <radio label="意識">清明|傾眠</radio> <check label="説明した"> <date label="発症日" required/> {患者ID}';
it("renders an operable phrase/template form and blocks insertion until required fields are filled", () => {
  const html = renderToStaticMarkup(<TemplateForm t={{ id: "p", name: "定型文", roles: [], body }} facts={facts} onInsert={() => {}} />);
  for (const fragment of ['<datalist', '<select', 'multiple=""', 'role="radiogroup"', 'type="checkbox"', 'type="date"', 'p001', 'disabled=""']) expect(html).toContain(fragment);
  expect(html).not.toContain('&lt;combo');
});
it("renders the authoring screen with syntax chips, scope and a working form preview", () => {
  const html = renderToStaticMarkup(<TemplateEditor start={{ name: "例", seed: body, t: null }} others={[]} facts={facts} onSave={() => {}} />);
  for (const fragment of ["テンプレートの本文", "使うときのプレビュー", "コンボ", "予約語", "公開範囲", "自分だけ", "同じ職種", "この病棟で共有", '<datalist']) expect(html).toContain(fragment);
});
