import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { contextualHelp } from "@/lib/help";
import { HelpWindow } from "./HelpPanel";

const render = (screen: string, panel?: string, query = "") => renderToStaticMarkup(
  <HelpWindow selected={contextualHelp(screen, panel)} query={query} onQuery={() => {}} onSelect={() => {}} onClose={() => {}} />,
);
describe("共通ヘルプのウインドウ", () => {
  it("ヘルプを開くと現在の画面の節と目次・検索・閉じるが出る", () => {
    const html = render("pharmacy");
    expect(html).toContain('role="dialog" aria-modal="true" aria-label="ヘルプ"');
    expect(html).toContain('aria-label="ヘルプの目次"');
    expect(html).toContain('aria-label="ヘルプを検索"');
    expect(html).toMatch(/<h2[^>]*>薬剤部<\/h2>/);
    expect(html).toContain("疑義照会");
    expect(html).toContain("閉じる");
    expect(html.match(/class="[^\"]*\bhint\b/g) ?? []).toHaveLength(0);
  });
  it("今開いているパネルの節を出す", () => {
    expect(render("chart", "add-lab")).toMatch(/<h2[^>]*>カルテ › 検体検査<\/h2>/);
  });
  it("検索結果だけの目次になり、一致しなければ空の状態を出す", () => {
    const filtered = render("pharmacy", undefined, "キーボード");
    expect(filtered).toMatch(/<h2[^>]*>キーボード<\/h2>/);
    expect(filtered).not.toContain("病棟 › 入院患者一覧");
    expect(render("pharmacy", undefined, "存在しない文字列1234567")).toContain("一致するヘルプはありません");
  });
});
