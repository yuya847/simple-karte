import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TemplateFilter } from "./TemplateFilter";
import { templateOptions } from "@/lib/record-filter";
import { BUILTIN_RECORD_TEMPLATES } from "@/lib/record-templates";
import type { NoteEntry } from "@/lib/types";
it("左のテンプレート行は記録にある名前と件数を並べ、選択状態を示す", () => {
  const note: NoteEntry = { kind: "note", day: 0, time: "10:00", role: "医師", author: "医師", text: "【ICU 入室時の記録】\n本文" };
  const html = renderToStaticMarkup(<TemplateFilter options={templateOptions([note], BUILTIN_RECORD_TEMPLATES)} selected={["rec-icu-admit"]} onChange={() => {}} />);
  expect(html).toContain('aria-label="テンプレート"');
  expect(html).toContain("ICU 入室時の記録");
  expect(html).toContain("1件");
  expect(html).toContain('checked=""');
  expect(html).not.toContain("ICの記録");
});
