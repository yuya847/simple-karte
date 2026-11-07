import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { AREAS, WARD_TABS } from "../nav";
import { contextualHelp, foregroundHelp, inlineHelpSection, helpSections, searchHelp } from ".";
import { HELP_EVENT, openHelp } from "./events";

describe("画面別ヘルプ", () => {
  it("現在の画面と患者のパネルを選ぶ", () => {
    expect(contextualHelp("pharmacy")).toBe("screen:pharmacy");
    expect(contextualHelp("roster")).toBe("screen:roster");
    expect(contextualHelp("chart", "add-lab")).toBe("panel:add-lab");
    expect(contextualHelp("visit", "add-imaging")).toBe("panel:add-imaging");
    expect(contextualHelp("lab", "add-imaging")).toBe("screen:lab");
    expect(contextualHelp("chart")).toBe("screen:chart");
  });
  it("記事の下の内服・注射も該当する節を選ぶ", () => {
    expect(inlineHelpSection("内服：患者さん")).toBe("panel:add-rx");
    expect(inlineHelpSection("注射：患者さん")).toBe("panel:add-injection");
    expect(foregroundHelp([{ id: "panel:note", z: 0, visible: true }, { id: "panel:add-rx", z: 0, visible: true }])).toBe("panel:add-rx");
  });
  it("各場所・病棟タブ・キーボードに節がある", () => {
    const ids = helpSections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of AREAS.filter((a) => a.key !== "ward")) expect(ids).toContain(`screen:${a.key}`);
    for (const t of WARD_TABS) expect(ids).toContain(`screen:${t.key}`);
    expect(helpSections.find(s => s.id === "screen:icu")?.bullets.join(" ")).toContain("0時");
    expect(helpSections.find((s) => s.id === "keyboard")?.bullets.join(" ")).toContain("⌘B");
  });
  it("各節に操作説明か関連する節があり、重複文を持たない", () => {
    expect(helpSections.filter((s) => s.bullets.length === 0 && !s.related?.length).map((s) => s.id)).toEqual([]);
    const bullets = helpSections.flatMap((s) => s.bullets.map((b) => b.replace(/[。\s]+$/g, "")));
    expect(new Set(bullets).size).toBe(bullets.length);
  });
  it("最前面のウインドウを選び、最小化したものを除く", () => {
    expect(foregroundHelp([
      { id: "panel:add-rx", z: 42, visible: true },
      { id: "panel:injcal", z: 43, visible: true },
      { id: "panel:dietcal", z: 44, visible: false },
    ])).toBe("panel:injcal");
  });
  it("見出しと本文を文字・複数語で絞る", () => {
    expect(searchHelp("薬剤部").map((s) => s.id)).toContain("screen:pharmacy");
    expect(searchHelp("検査 報告").length).toBeGreaterThan(0);
    expect(searchHelp("存在しない文字列1234567")).toEqual([]);
    expect(searchHelp("   ")).toHaveLength(helpSections.length);
    expect(searchHelp("ｔａｂ").map((s) => s.id)).toContain("keyboard");
  });
  it("上段・部門ボタンは共通のヘルプを開くイベントを出す", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const onOpen = vi.fn();
    target.addEventListener(HELP_EVENT, onOpen);
    try {
      openHelp();
      openHelp("screen:pharmacy");
      expect(onOpen).toHaveBeenCalledTimes(2);
      expect((onOpen.mock.calls[1][0] as CustomEvent).detail).toBe("screen:pharmacy");
    } finally { vi.unstubAllGlobals(); }
  });
  it("並行作業中のファイル以外では hint の JSX が0件", () => {
    function files(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((f) => f.isDirectory() ? files(join(dir, f.name)) : [join(dir, f.name)]);
    }
    // ICU 記録は依頼仕様により hint を保持。通常は hidden、式だけ明示操作で表示。
    const deferred = /\/(AddPanels|Calendars|InsulinAdjustment|SlidingScaleEditor|IcuPanel)\.tsx$/;
    const remaining: string[] = [];
    for (const file of files("src/components").filter((f) => f.endsWith(".tsx") && !f.includes(".test.") && !deferred.test(f))) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(n: ts.Node) {
        if (ts.isJsxAttribute(n) && n.name.getText(source) === "className" && n.initializer && /\bhint\b/.test(n.initializer.getText(source))) remaining.push(file);
        ts.forEachChild(n, visit);
      }
      visit(source);
    }
    expect(remaining).toEqual([]);
  });
});
