import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftCard } from "./DraftCard";
import { checkDraft, type CheckContext } from "@/lib/drafts";
import { emptyConsent, emptyImaging } from "@/lib/exams";

describe("画像検査の下書き内の入力", () => {
  it("不足した目的と同意の記録をカード内で編集できる", () => {
    const d = { ...emptyImaging("d", "CT"), region: "R-CHEST", contrast: "造影" as const, consent: emptyConsent("取得済み") };
    const ctx = { activeOrders: [], labOrders: [], drafts: [], nowTime: "12:00", fmtDay: String, describe: () => "" } as CheckContext;
    const html = renderToStaticMarkup(<DraftCard draft={d} ctx={ctx} issues={checkDraft(d, ctx)} onApply={() => {}} onRemove={() => {}} />);
    expect(html).toContain('aria-label="下書きの目的"');
    expect(html).toContain('aria-label="下書きの取得日時"');
    expect(html).toContain('aria-label="説明した医師を選ぶ"');
    expect(html).toContain("指導医 高橋");
    expect(html).not.toContain("右のツールで入れ直してください");
  });
});
