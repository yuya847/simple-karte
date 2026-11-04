import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DraftCard } from "./DraftCard";
import type { CheckContext, Draft } from "@/lib/drafts";
const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "10:00", fmtDay: () => "今日", describe: () => "" };
const draft: Draft = { id: "u", kind: "unclear", origin: "manual", sourceText: "検査", reason: "名前を確認", comment: null };
it("shows a borderless line with collapsed details and an accessible reason button", () => {
  const html = renderToStaticMarkup(<DraftCard draft={draft} ctx={ctx} issues={[{ key: "q", level: "ask", title: "詳細だけの理由", message: "確認してください" }]} onApply={() => {}} onRemove={() => {}} />);
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-label="確認 1件・理由を開く"');
  expect(html).toContain('aria-label="この下書きを消す"');
  expect(html).not.toContain("詳細だけの理由");
  expect(html).not.toContain("border");
});
