import { describe, expect, it } from "vitest";
import { AREAS, areasFor } from "./nav";
import { placeLabel, placeMenuRows, WARD_MENU_LABEL, WARD_MENU_OPTION, WARD_SCREENS_PLUS } from "./place-menu";

describe("病棟のメニューへ戻る道", () => {
  it("the place pulldown's first row is 病棟のメニュー（画面を選ぶ）; the other places keep their names", () => {
    const { depts, shared } = placeMenuRows(areasFor("看護師"));
    expect(depts[0].key).toBe("ward");
    expect(placeLabel(depts[0])).toBe(WARD_MENU_LABEL);
    expect(placeLabel(AREAS.find((a) => a.key === "er")!)).toBe("救急外来");
    // Tools (監査ログ・データ抽出) are not places; チャット is.
    expect([...depts, ...shared].some((a) => a.key === "audit")).toBe(false);
    expect(shared.some((a) => a.key === "chat")).toBe(true);
    expect(placeMenuRows(areasFor("薬剤師")).depts.map((a) => a.key)).toContain("pharmacy");
  });
  it("the ⌄ of a ward tab ends with 画面を選ぶ（メニュー）…, and the ＋ says it opens the menu in a new tab", () => {
    expect(WARD_MENU_OPTION).toEqual({ key: "menu", label: "画面を選ぶ（メニュー）…", group: "病棟のメニュー" });
    expect(WARD_SCREENS_PLUS.title).toBe("画面を選ぶ（メニューを新しいタブで）");
  });
});
