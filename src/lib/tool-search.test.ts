import { describe, expect, it } from "vitest";
import { groupsFor } from "@/components/ToolRail";
import { REF_TABS, RIGHT_TABS } from "@/components/RightTabs";
import { ROLES } from "./roles";
import { TOOL_READINGS, toolMatches } from "./tool-search";

describe("全ツールの検索", () => {
  it("ひらがなの読みで探せる（「けいかひょう」で経過表、「おんどばん」でも）", () => {
    expect(toolMatches("経過表", "けいかひょう")).toBe(true);
    expect(toolMatches("経過表", "おんどばん")).toBe(true);
    expect(toolMatches("経過表", "けいか")).toBe(true);
    expect(toolMatches("処方", "けいかひょう")).toBe(false);
  });

  it("名前そのもの・カタカナ・全角半角・大文字小文字を問わない。空なら全部", () => {
    expect(toolMatches("インスリン", "いんすりん")).toBe(true);
    expect(toolMatches("シェーマ", "しぇーま")).toBe(true);
    expect(toolMatches("ICU 記録", "icu")).toBe(true);
    expect(toolMatches("TDM", "ｔｄｍ")).toBe(true);
    expect(toolMatches("検体検査", "検体")).toBe(true);
    expect(toolMatches("検体検査", "  ")).toBe(true);
  });

  it("どの職種の道具にも、参照のウインドウ（経過表・カレンダー）にも読みがある", () => {
    const labels = new Set<string>([...ROLES.flatMap((r) => groupsFor(r).flatMap((g) => [...g.main, ...g.more].map((t) => t.label))), "注射カレンダー", ...REF_TABS.map((t) => RIGHT_TABS[t].label)]);
    const missing = [...labels].filter((l) => !TOOL_READINGS[l]?.length);
    expect(missing).toEqual([]);
    for (const readings of Object.values(TOOL_READINGS)) for (const r of readings) expect(r).toMatch(/^[ぁ-ゖー]+$/);
  });
});
