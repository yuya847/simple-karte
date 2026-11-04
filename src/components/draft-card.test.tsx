import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DraftCard } from "./DraftCard";
import type { CheckContext, Draft } from "@/lib/drafts";
const ctx: CheckContext = { activeOrders: [], labOrders: [], drafts: [], nowTime: "10:00", fmtDay: () => "今日", describe: () => "" };
const draft: Draft = { id: "u", kind: "unclear", origin: "manual", sourceText: "検査", reason: "名前を確認", comment: null };
it("shows a borderless line; with something to answer the details are open from the start, with nothing to answer they are collapsed", () => {
  const html = renderToStaticMarkup(<DraftCard draft={draft} ctx={ctx} issues={[{ key: "q", level: "ask", title: "詳細だけの理由", message: "確認してください" }]} onApply={() => {}} onRemove={() => {}} />);
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('aria-label="確認 1件・理由を開く"');
  expect(html).toContain('aria-label="この下書きを消す"');
  expect(html).toContain("詳細だけの理由");
  expect(html).not.toContain("border");
  const ok = renderToStaticMarkup(<DraftCard draft={draft} ctx={ctx} issues={[]} onApply={() => {}} onRemove={() => {}} />);
  expect(ok).toContain('aria-expanded="false"');
});

it("内服の仮の見出しを隠し、1回量・回数・日数の後ろに薄く1日量を出す", () => {
  const rx: Draft = { id: "rx", kind: "prescription", origin: "manual", sourceText: "（Rp 入力）", comment: null, items: [{ drugCode: "ORAL-APAP500", said: "", daily: 1, perDose: 1 }], timings: ["朝"], days: 7, category: "定期", start: { day: 0, timing: null }, prn: null, maxPerDay: null, acks: [], onePack: false };
  const html = renderToStaticMarkup(<DraftCard draft={rx} ctx={ctx} rp={1} issues={[{ key: "q", level: "ask", title: "確認", message: "確認" }]} onApply={() => {}} onRemove={() => {}} />);
  expect(html).not.toContain("Rp 入力");
  expect(html).toContain("内服 Rp1 アセトアミノフェン錠 500mg 1回1錠 1日1回 朝食後 7日分 定期");
  expect(html).toContain('text-ink-faint">（1日1錠）');
  expect(html.indexOf('class="ml-2">1日1回 朝食後　7日分')).toBeLessThan(html.indexOf('text-ink-faint">（1日1錠）'));
  expect(html).toContain('id="draft-line-rx"');
});
